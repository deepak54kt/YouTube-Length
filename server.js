const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const basePort = Number(process.env.PORT) || 3000;

// Use the right binary name for the current OS so downloadFromGithub
// fetches (and we look for) the correct file. On Windows this is
// yt-dlp.exe; on Mac/Linux it's just yt-dlp.
const ytDlpBinaryName = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpBinaryPath = path.join(__dirname, ytDlpBinaryName);
let ytDlpInstancePromise;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return {
    hours,
    minutes,
    seconds: remainingSeconds,
    text: `${hours}h ${minutes}m ${remainingSeconds}s`,
    digital: [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':'),
  };
}

function parseDurationString(durationText) {
  const parts = String(durationText).split(':').map((value) => Number(value));
  if (!parts.every((value) => Number.isFinite(value))) {
    return 0;
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return 0;
}

function parseDurationSeconds(item) {
  if (typeof item.duration === 'number' && Number.isFinite(item.duration)) {
    return item.duration;
  }

  if (typeof item.durationSec === 'number' && Number.isFinite(item.durationSec)) {
    return item.durationSec;
  }

  if (typeof item.duration_string === 'string') {
    return parseDurationString(item.duration_string);
  }

  if (typeof item.duration === 'string') {
    return parseDurationString(item.duration);
  }

  return 0;
}

async function getYtDlp() {
  if (!ytDlpInstancePromise) {
    ytDlpInstancePromise = (async () => {
      if (!fs.existsSync(ytDlpBinaryPath)) {
        console.log(`Downloading yt-dlp binary to ${ytDlpBinaryPath}...`);
        await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);

        // On Mac/Linux the downloaded file needs the execute bit set.
        if (os.platform() !== 'win32') {
          fs.chmodSync(ytDlpBinaryPath, 0o755);
        }
      }

      return new YTDlpWrap(ytDlpBinaryPath);
    })();
  }

  return ytDlpInstancePromise;
}

app.post('/api/analyze', async (req, res) => {
  const playlistUrl = String(req.body?.playlistUrl || '').trim();

  if (!playlistUrl) {
    return res.status(400).json({ error: 'Paste a YouTube playlist URL.' });
  }

  try {
    const ytDlp = await getYtDlp();

    // IMPORTANT: do NOT use --flat-playlist here. Flat mode returns
    // only ids/titles with no duration, which is why totals were
    // coming back as 00:00:00. --dump-single-json without that flag
    // makes yt-dlp fetch full metadata (including duration) for
    // every video in the playlist.
    const raw = await ytDlp.execPromise([
      playlistUrl,
      '--dump-single-json',
      '--no-warnings',
      '--ignore-errors',
    ]);

    const playlist = JSON.parse(raw);
    const playlistEntries = Array.isArray(playlist.entries)
      ? playlist.entries.filter(Boolean)
      : [];

    if (playlistEntries.length > 0) {
      console.log('Sample entry:', JSON.stringify(playlistEntries[0], null, 2));
    } else {
      console.log('No entries returned for', playlistUrl);
    }

    const totalSeconds = playlistEntries.reduce((sum, item) => sum + parseDurationSeconds(item), 0);
    const duration = formatDuration(totalSeconds);

    return res.json({
      title: playlist.title,
      itemCount: playlistEntries.length,
      totalSeconds,
      duration,
      url: playlistUrl,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return res.status(400).json({
      error: 'Could not read that playlist. Make sure it is public and the URL is correct.',
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    console.log(`Playlist calculator running on http://localhost:${activePort}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < basePort + 25) {
      startServer(port + 1);
      return;
    }

    throw error;
  });

  return server;
}

startServer(basePort);
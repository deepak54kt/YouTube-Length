const fs = require('fs');
const path = require('path');
const os = require('os');
const YTDlpWrap = require('yt-dlp-wrap').default;

const ytDlpBinaryName = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpBinaryPath = path.join(__dirname, ytDlpBinaryName);
let ytDlpInstancePromise;
let cachedResults = new Map();

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

function calculatePlaylistStats(entries, title) {
  const playlistEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const totalSeconds = playlistEntries.reduce((sum, item) => sum + parseDurationSeconds(item), 0);
  const averageSeconds = playlistEntries.length > 0 ? totalSeconds / playlistEntries.length : 0;

  return {
    title: title || 'Untitled playlist',
    itemCount: playlistEntries.length,
    totalSeconds,
    averageSeconds,
    duration: formatDuration(totalSeconds),
    averageDuration: formatDuration(averageSeconds),
  };
}

function parseYtDlpDurationOutput(rawOutput) {
  return rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== 'NA' && line !== 'N/A')
    .map((line) => Number(line))
    .filter((value) => Number.isFinite(value));
}

function extractPlaylistEntriesFromJson(rawOutput) {
  const parsed = JSON.parse(rawOutput);

  return {
    title: parsed.title || 'Untitled playlist',
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(Boolean) : [],
  };
}

async function analyzePlaylistWithJson(playlistUrl, ytDlp) {
  const raw = await ytDlp.execPromise([
    playlistUrl,
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--ignore-errors',
  ]);

  const { title, entries } = extractPlaylistEntriesFromJson(raw);
  if (entries.length === 0) {
    throw new Error('No playlist entries returned.');
  }

  return calculatePlaylistStats(entries, title);
}

async function analyzePlaylistWithDurations(playlistUrl, ytDlp) {
  const raw = await ytDlp.execPromise([
    playlistUrl,
    '--skip-download',
    '--print',
    '%(duration)s',
    '--no-warnings',
    '--ignore-errors',
  ]);

  const durations = parseYtDlpDurationOutput(raw);
  if (durations.length === 0) {
    throw new Error('No playlist durations returned.');
  }

  return calculatePlaylistStats(durations.map((value) => ({ duration: value })), 'Untitled playlist');
}

async function getYtDlp() {
  if (!ytDlpInstancePromise) {
    ytDlpInstancePromise = (async () => {
      if (!fs.existsSync(ytDlpBinaryPath)) {
        console.log(`Downloading yt-dlp binary to ${ytDlpBinaryPath}...`);
        await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);

        if (os.platform() !== 'win32') {
          fs.chmodSync(ytDlpBinaryPath, 0o755);
        }
      }

      return new YTDlpWrap(ytDlpBinaryPath);
    })();
  }

  return ytDlpInstancePromise;
}

async function analyzePlaylist(playlistUrl) {
  const cacheKey = playlistUrl.trim().toLowerCase();
  const cached = cachedResults.get(cacheKey);
  if (cached) {
    return cached;
  }

  const ytDlp = await getYtDlp();

  let stats;
  try {
    stats = await analyzePlaylistWithJson(playlistUrl, ytDlp);
  } catch (jsonError) {
    console.warn('JSON playlist analysis failed, falling back to duration print:', jsonError.message || jsonError);
    stats = await analyzePlaylistWithDurations(playlistUrl, ytDlp);
  }

  cachedResults.set(cacheKey, stats);
  return stats;
}

module.exports = {
  analyzePlaylist,
  calculatePlaylistStats,
  extractPlaylistEntriesFromJson,
  analyzePlaylistWithJson,
  analyzePlaylistWithDurations,
  parseYtDlpDurationOutput,
};

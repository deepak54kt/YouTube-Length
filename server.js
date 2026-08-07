const express = require('express');
const path = require('path');
const { analyzePlaylist } = require('./playlist-stats');

const app = express();
const basePort = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/analyze', async (req, res) => {
  const playlistUrl = String(req.body?.playlistUrl || '').trim();

  if (!playlistUrl) {
    return res.status(400).json({ error: 'Paste a YouTube playlist URL.' });
  }

  try {
    const stats = await analyzePlaylist(playlistUrl);

    return res.json({
      title: stats.title,
      itemCount: stats.itemCount,
      totalSeconds: stats.totalSeconds,
      averageSeconds: stats.averageSeconds,
      duration: stats.duration,
      averageDuration: stats.averageDuration,
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
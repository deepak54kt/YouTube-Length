const form = document.getElementById('playlist-form');
const input = document.getElementById('playlist-url');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const durationTextEl = document.getElementById('duration-text');
const durationDigitalEl = document.getElementById('duration-digital');
const playlistTitleEl = document.getElementById('playlist-title');
const playlistCountEl = document.getElementById('playlist-count');
const averageDurationEl = document.getElementById('average-duration');
const button = form.querySelector('button');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#52607a';
}

function setLoading(loading) {
  button.disabled = loading;
  button.textContent = loading ? 'Calculating...' : 'Calculate length';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const playlistUrl = input.value.trim();
  if (!playlistUrl) {
    setStatus('Paste a playlist URL first.', true);
    return;
  }

  setLoading(true);
  setStatus('Reading playlist...');
  resultEl.classList.add('hidden');

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playlistUrl }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    durationTextEl.textContent = data.duration.text;
    durationDigitalEl.textContent = data.duration.digital;
    playlistTitleEl.textContent = data.title || 'Untitled playlist';
    playlistCountEl.textContent = String(data.itemCount);
    averageDurationEl.textContent = data.averageDuration?.text || '0h 0m 0s';
    resultEl.classList.remove('hidden');
    setStatus('Done.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});
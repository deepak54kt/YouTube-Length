const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePlaylistStats, parseYtDlpDurationOutput } = require('./playlist-stats');

test('calculatePlaylistStats sums durations and computes average', () => {
  const stats = calculatePlaylistStats([
    { duration: 120 },
    { duration: 240 },
    { duration: 60 },
  ], 'Demo playlist');

  assert.equal(stats.itemCount, 3);
  assert.equal(stats.totalSeconds, 420);
  assert.equal(stats.averageSeconds, 140);
  assert.equal(stats.duration.text, '0h 7m 0s');
  assert.equal(stats.averageDuration.text, '0h 2m 20s');
  assert.equal(stats.title, 'Demo playlist');
});

test('parseYtDlpDurationOutput ignores blank and invalid lines', () => {
  const durations = parseYtDlpDurationOutput('120\n\nN/A\n240\n');

  assert.deepEqual(durations, [120, 240]);
});

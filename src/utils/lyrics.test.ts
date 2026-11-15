import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UI_SETTINGS,
  PREVIEW_LRC,
  UI_PRESETS,
  buildSearchQueries,
  clampSettingValue,
  cleanTitle,
  computeLyricVisualStyle,
  computeTrackProgressMs,
  detectActivePreset,
  encodeBasicAuth,
  findActiveLyricIndex,
  formatSyncOffsetLabel,
  parseLRC,
  parsePastedCredentials,
  parsePlainLyrics,
  selectBestLyricsFromCandidates,
  stepSyncOffset,
} from './lyrics';

test('cleanTitle strips feat tags and remaster/live suffixes', () => {
  assert.equal(cleanTitle('Love Wins All (feat. IU)'), 'Love Wins All');
  assert.equal(cleanTitle('Ditto [feat. NewJeans] - Radio Edit Version'), 'Ditto');
  assert.equal(cleanTitle('Bohemian Rhapsody - 2011 Remaster'), 'Bohemian Rhapsody');
});

test('parseLRC parses varying millisecond digits, skips blank lines, and sorts chronologically', () => {
  const raw = `[00:05.5] Second line
[00:01.25] First line
[00:03.000]   
[00:10] Third line`;
  const parsed = parseLRC(raw);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], { time: 1250, text: 'First line' });
  assert.deepEqual(parsed[1], { time: 5500, text: 'Second line' });
  assert.deepEqual(parsed[2], { time: 10000, text: 'Third line' });
});

test('PREVIEW_LRC parses into expected synced lines with unslop copy rules', () => {
  const parsed = parseLRC(PREVIEW_LRC);
  assert.equal(parsed.length, 15);
  assert.equal(parsed[0].time, 0);
  assert.equal(parsed[14].time, 35000);
  for (const item of parsed) {
    assert.equal(item.text.includes('!'), false);
    assert.equal(item.text.endsWith('.'), false);
  }
});

test('parsePlainLyrics trims lines and ignores empty lines', () => {
  const plain = parsePlainLyrics('  첫 번째 줄  \n\n  두 번째 줄 \r\n ');
  assert.deepEqual(plain, [
    { time: 0, text: '첫 번째 줄' },
    { time: 0, text: '두 번째 줄' },
  ]);
});

test('buildSearchQueries deduplicates cleaned and artist combinations', () => {
  const { firstArtist, queries } = buildSearchQueries('Super Shy (feat. Demo)', 'NewJeans, Another');
  assert.equal(firstArtist, 'NewJeans');
  assert.deepEqual(queries, [
    'Super Shy (feat. Demo) NewJeans',
    'Super Shy NewJeans',
    'Super Shy (feat. Demo)',
    'Super Shy',
  ]);
});

test('selectBestLyricsFromCandidates prefers syncedLyrics over plainLyrics and filters mismatched artists', () => {
  const candidates = [
    { artistName: 'Unrelated Cover Band', duration: 300, syncedLyrics: '[00:01.00] Wrong' },
    { artistName: 'IU (아이유)', duration: 212, plainLyrics: 'Plain text only' },
    { artistName: '아이유', duration: 214, syncedLyrics: '[00:01.00] Correct synced' },
  ];
  const result = selectBestLyricsFromCandidates(candidates, '밤편지', '아이유', 213);
  assert.deepEqual(result, { type: 'synced', text: '[00:01.00] Correct synced' });
});

test('findActiveLyricIndex locates current active line including sync offset adjustments', () => {
  const lines = [
    { time: 1000, text: 'One' },
    { time: 3000, text: 'Two' },
    { time: 6000, text: 'Three' },
  ];
  assert.equal(findActiveLyricIndex(lines, 500), -1);
  assert.equal(findActiveLyricIndex(lines, 1000), 0);
  assert.equal(findActiveLyricIndex(lines, 4500), 1);
  assert.equal(findActiveLyricIndex(lines, 9000), 2);
});

test('computeLyricVisualStyle applies Apple Music distance blur and clears blur during drag/scroll', () => {
  const active = computeLyricVisualStyle(2, 2, {
    isPlainLyrics: false,
    forceClearBlur: false,
    blurIntensity: 8,
  });
  assert.deepEqual(active, { blurPx: 0, opacity: 1, isActive: true });

  const neighbor = computeLyricVisualStyle(3, 2, {
    isPlainLyrics: false,
    forceClearBlur: false,
    blurIntensity: 8,
  });
  assert.deepEqual(neighbor, { blurPx: 2, opacity: 0.6, isActive: false });

  const cleared = computeLyricVisualStyle(5, 2, {
    isPlainLyrics: false,
    forceClearBlur: true,
    blurIntensity: 8,
  });
  assert.deepEqual(cleared, { blurPx: 0, opacity: 0.6, isActive: false });
});

test('clampSettingValue clamps out-of-range numbers and handles NaN safely', () => {
  assert.equal(clampSettingValue(120, 16, 64, 24), 64);
  assert.equal(clampSettingValue(8, 16, 64, 24), 16);
  assert.equal(clampSettingValue(Number.NaN, 16, 64, 24), 24);
});

test('detectActivePreset identifies matching UI presets and returns null when customized', () => {
  assert.equal(detectActivePreset(DEFAULT_UI_SETTINGS), 'standard');

  const standApplied = { ...DEFAULT_UI_SETTINGS, ...UI_PRESETS[1].patch };
  assert.equal(detectActivePreset(standApplied), 'stand');

  const customized = { ...standApplied, fontSize: 45 };
  assert.equal(detectActivePreset(customized), null);
});

test('stepSyncOffset and formatSyncOffsetLabel clamp and describe timing clearly', () => {
  assert.equal(stepSyncOffset(0, -100), -100);
  assert.equal(stepSyncOffset(-4900, -500), -5000);
  assert.equal(stepSyncOffset(4800, 500), 5000);

  assert.equal(formatSyncOffsetLabel(0), '0ms · 정각');
  assert.equal(formatSyncOffsetLabel(200), '+200ms · 0.2초 빠르게');
  assert.equal(formatSyncOffsetLabel(-150), '-150ms · 0.15초 느리게');
});

test('computeTrackProgressMs wraps cleanly modulo 45000ms in preview mode without drift', () => {
  assert.equal(computeTrackProgressMs(0, 1000, 51000, true, true), 5000);
  assert.equal(computeTrackProgressMs(5000, 2000, 99999, false, true), 5000);
  assert.equal(computeTrackProgressMs(42000, 0, 50000, true, false), 92000);
});

test('encodeBasicAuth encodes ASCII credentials accurately and never throws on non-ASCII text', () => {
  assert.equal(encodeBasicAuth('abc123', 'sec456'), Buffer.from('abc123:sec456').toString('base64'));
  const nonAscii = encodeBasicAuth('한글오타', '시크릿');
  assert.equal(typeof nonAscii, 'string');
});

test('parsePastedCredentials extracts credentials from JSON, .env key=value, and 3-line blocks', () => {
  const fromJson = parsePastedCredentials(
    JSON.stringify({
      client_id: 'cid_json',
      client_secret: 'csec_json',
      refresh_token: 'rtok_json',
    })
  );
  assert.deepEqual(fromJson, {
    clientId: 'cid_json',
    clientSecret: 'csec_json',
    refreshToken: 'rtok_json',
  });

  const fromEnv = parsePastedCredentials(`
    SPOTIFY_CLIENT_ID="cid_env"
    SPOTIFY_CLIENT_SECRET=csec_env
    REFRESH_TOKEN='rtok_env'
  `);
  assert.deepEqual(fromEnv, {
    clientId: 'cid_env',
    clientSecret: 'csec_env',
    refreshToken: 'rtok_env',
  });

  const fromThreeLines = parsePastedCredentials('id_line1\nsec_line2\ntok_line3');
  assert.deepEqual(fromThreeLines, {
    clientId: 'id_line1',
    clientSecret: 'sec_line2',
    refreshToken: 'tok_line3',
  });

  assert.equal(parsePastedCredentials('single_token_string_only'), null);
});

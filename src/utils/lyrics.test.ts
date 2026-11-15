import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AMBIENT_RGB,
  DEFAULT_UI_SETTINGS,
  PREVIEW_LRC,
  UI_PRESETS,
  buildSearchQueries,
  clampSettingValue,
  cleanTitle,
  computeInterludeState,
  computeLyricVisualStyle,
  computeTrackProgressMs,
  deriveSecondaryAmbientColor,
  detectActivePreset,
  encodeBasicAuth,
  extractDominantColorFromPixels,
  findActiveLyricIndex,
  formatDurationMs,
  formatSyncOffsetLabel,
  normalizeLrcLibCandidates,
  parseLRC,
  parsePastedCredentials,
  parsePlainLyrics,
  resetSingleSetting,
  selectBestLyricsFromCandidates,
  stepSyncOffset,
} from './lyrics';
import {
  base64UrlEncode,
  buildSpotifyAuthorizeUrl,
  computeCodeChallengeS256,
  getSpotifyRedirectUri,
} from './pkce';

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
  assert.equal(parsed[14].time, 36000);
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
    { id: 10, artistName: 'Unrelated Cover Band', duration: 300, syncedLyrics: '[00:01.00] Wrong' },
    { id: 20, artistName: 'IU (아이유)', duration: 212, plainLyrics: 'Plain text only' },
    { id: 30, artistName: '아이유', duration: 214, syncedLyrics: '[00:01.00] Correct synced' },
  ];
  const result = selectBestLyricsFromCandidates(candidates, '밤편지', '아이유', 213);
  assert.deepEqual(result, {
    type: 'synced',
    text: '[00:01.00] Correct synced',
    selectedId: 'lrclib-30',
  });
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

test('resetSingleSetting restores only the targeted setting key to its default value', () => {
  assert.equal(DEFAULT_UI_SETTINGS.ambientLight, true);
  assert.equal(DEFAULT_UI_SETTINGS.splitLayout, true);
  assert.equal(DEFAULT_UI_SETTINGS.autoHideHud, true);

  const modified = {
    ...DEFAULT_UI_SETTINGS,
    fontSize: 44,
    blurAmount: 14,
    ambientLight: false,
    syncOffset: -300,
  };

  const afterFontReset = resetSingleSetting(modified, 'fontSize');
  assert.equal(afterFontReset.fontSize, DEFAULT_UI_SETTINGS.fontSize);
  assert.equal(afterFontReset.blurAmount, 14);
  assert.equal(afterFontReset.ambientLight, false);
  assert.equal(afterFontReset.syncOffset, -300);

  const afterAmbientReset = resetSingleSetting(afterFontReset, 'ambientLight');
  assert.equal(afterAmbientReset.ambientLight, true);
  assert.equal(afterAmbientReset.blurAmount, 14);
});

test('extractDominantColorFromPixels weights saturated album hues over black borders and handles empty data', () => {
  assert.deepEqual(extractDominantColorFromPixels([]), DEFAULT_AMBIENT_RGB);

  // 3 black border pixels + 2 saturated cobalt-blue pixels
  const pixels = [
    10, 10, 12, 255,
    8, 8, 8, 255,
    12, 12, 14, 255,
    30, 110, 210, 255,
    36, 118, 216, 255,
  ];
  const dominant = extractDominantColorFromPixels(pixels);
  assert.equal(dominant.b > dominant.g, true);
  assert.equal(dominant.g > dominant.r, true);
  assert.equal(dominant.b >= 175 && dominant.b <= 245, true);

  const secondary = deriveSecondaryAmbientColor(dominant);
  assert.equal(secondary.r >= 0 && secondary.r <= 255, true);
  assert.equal(secondary.g >= 0 && secondary.g <= 255, true);
  assert.equal(secondary.b >= 0 && secondary.b <= 255, true);
});

test('formatDurationMs formats millisecond durations as zero-padded MM:SS', () => {
  assert.equal(formatDurationMs(0), '00:00');
  assert.equal(formatDurationMs(45000), '00:45');
  assert.equal(formatDurationMs(213900), '03:33');
  assert.equal(formatDurationMs(-500), '00:00');
  assert.equal(formatDurationMs(Number.NaN), '00:00');
});

test('computeInterludeState repeats wave cycles every 1800ms even on 20s+ interludes and exits 500ms early', () => {
  const longGapLyrics = [
    { time: 6000, text: 'Intro ends' },
    { time: 10000, text: 'Before 20s break' },
    { time: 30000, text: 'After 20s break' },
  ];

  // Intro active at 2500ms, and exits cleanly 500ms before 6000ms (at 5600ms -> inactive)
  const introMid = computeInterludeState(longGapLyrics, -1, 2500, false);
  assert.equal(introMid.active, true);
  assert.equal(introMid.afterLineIndex, -1);
  assert.equal(computeInterludeState(longGapLyrics, -1, 5600, false).active, false);

  // Immediately after Line 1 vocal starts (10500ms < 10000 + 1600ms hold): not active yet
  assert.equal(computeInterludeState(longGapLyrics, 1, 10500, false).active, false);

  // Inside 20s interlude: cycle repeats every 1800ms instead of stretching over 20s
  const cycleA = computeInterludeState(longGapLyrics, 1, 12200, false);
  const cycleB = computeInterludeState(longGapLyrics, 1, 12200 + 1800, false);
  const cycleC = computeInterludeState(longGapLyrics, 1, 12200 + 1800 * 6, false);
  assert.equal(cycleA.active, true);
  assert.equal(cycleB.active, true);
  assert.equal(cycleC.active, true);
  assert.equal(cycleA.cyclePhase, cycleB.cyclePhase);
  assert.equal(cycleA.cyclePhase, cycleC.cyclePhase);
  assert.deepEqual(cycleA.dotOpacities, cycleB.dotOpacities);

  // Smooth exit lead-out 500ms before 30000ms (at 29600ms -> inactive)
  assert.equal(computeInterludeState(longGapLyrics, 1, 29600, false).active, false);

  // Plain lyrics never trigger interlude dots
  assert.equal(computeInterludeState(longGapLyrics, 1, 18000, true).active, false);
});

test('normalizeLrcLibCandidates filters empty entries, deduplicates IDs, and sorts synced ahead of plain', () => {
  const normalized = normalizeLrcLibCandidates([
    { id: 1, trackName: 'Empty Song', artistName: 'A' },
    { id: 2, trackName: 'Plain Only', artistName: 'A', duration: 200.4, plainLyrics: 'Hello' },
    { id: 3, trackName: 'Synced Ver', artistName: 'A', duration: 201, syncedLyrics: '[00:01.00] Hi' },
    { id: 3, trackName: 'Duplicate Synced', artistName: 'A', syncedLyrics: '[00:01.00] Hi' },
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'lrclib-3');
  assert.equal(normalized[0].hasSynced, true);
  assert.equal(normalized[1].id, 'lrclib-2');
  assert.equal(normalized[1].hasPlain, true);
  assert.equal(normalized[1].durationSec, 200);
});

test('resetSingleSetting supports new autoHideHud and splitLayout boolean keys (default ON)', () => {
  const custom = {
    ...DEFAULT_UI_SETTINGS,
    autoHideHud: false,
    splitLayout: false,
  };
  const resetHud = resetSingleSetting(custom, 'autoHideHud');
  assert.equal(resetHud.autoHideHud, true);
  assert.equal(resetHud.splitLayout, false);

  const resetSplit = resetSingleSetting(resetHud, 'splitLayout');
  assert.equal(resetSplit.splitLayout, true);
});

test('PKCE helpers match RFC 7636 S256 test vector and resolve Redirect URIs for root and GitHub Pages subpaths', async () => {
  // RFC 7636 Appendix B test vector
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = await computeCodeChallengeS256(verifier);
  assert.equal(challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');

  assert.equal(base64UrlEncode(new Uint8Array([251, 255, 254])), '-__-');

  assert.equal(
    getSpotifyRedirectUri({
      origin: 'https://ais-dev-example.run.app',
      pathname: '/',
    }),
    'https://ais-dev-example.run.app/callback.html'
  );

  assert.equal(
    getSpotifyRedirectUri({
      origin: 'https://user.github.io',
      pathname: '/lyrictify/index.html',
    }),
    'https://user.github.io/lyrictify/callback.html'
  );

  const authUrl = buildSpotifyAuthorizeUrl({
    clientId: 'demo_cid',
    redirectUri: 'https://ais-dev-example.run.app/callback.html',
    codeChallenge: challenge,
    state: 'state123',
  });
  assert.equal(authUrl.startsWith('https://accounts.spotify.com/authorize?'), true);
  assert.equal(authUrl.includes('code_challenge_method=S256'), true);
  assert.equal(authUrl.includes('client_id=demo_cid'), true);
});



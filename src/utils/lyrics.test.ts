import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackAmbientPalette,
  computeAmbientMeshPixels,
  computeLobePositionsAtPhase,
  createFineDitherTilePixels,
  extractAlbumPaletteFromGrid,
  interleavedGradientNoise,
} from './ambientMesh';
import {
  DEFAULT_AMBIENT_RGB,
  DEFAULT_UI_SETTINGS,
  INTERLUDE_HOLD_AFTER_VOCAL_MS,
  INTERLUDE_MIN_GAP_MS,
  PREVIEW_LRC,
  UI_PRESETS,
  LYRIC_WAVE_ROW_DELAY_MS,
  LYRIC_WAVE_SPATIAL_FREQ_RAD,
  buildSearchQueries,
  buildWordEntranceSpec,
  buildWordWaveSpec,
  clampSettingValue,
  cleanTitle,
  computeInterludeState,
  computeLyricVisualStyle,
  computeMarqueeMetrics,
  computeTrackProgressMs,
  computeWordVisualPositions,
  deriveSecondaryAmbientColor,
  detectActivePreset,
  encodeBasicAuth,
  extractDominantColorFromPixels,
  findActiveLyricIndex,
  formatCompactTimeMs,
  formatDurationMs,
  formatRemainingTimeMs,
  formatSyncOffsetLabel,
  normalizeLrcLibCandidates,
  parseLRC,
  parsePastedCredentials,
  parsePlainLyrics,
  parseTitleAndVersion,
  resetSingleSetting,
  selectBestLyricsFromCandidates,
  shouldResyncPlaybackClock,
  stepSyncOffset,
  tokenizeLyricWords,
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

test('PREVIEW_LRC parses into expected synced lines with a >=10s interlude sample and unslop copy rules', () => {
  const parsed = parseLRC(PREVIEW_LRC);
  assert.equal(parsed.length, 15);
  assert.equal(parsed[0].time, 0);
  assert.equal(parsed[5].time, 14500);
  assert.equal(parsed[6].time, 26500);
  assert.equal(parsed[6].time - parsed[5].time >= INTERLUDE_MIN_GAP_MS, true);
  assert.equal(parsed[14].time, 40500);
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

test('selectBestLyricsFromCandidates prioritizes Title -> Artist -> Version -> Exact MM:SS Duration', () => {
  const candidates = [
    {
      id: 10,
      trackName: '밤편지',
      artistName: 'Unrelated Cover Band',
      duration: 253,
      syncedLyrics: '[00:01.00] Wrong artist',
    },
    {
      id: 15,
      trackName: '밤편지 (Instrumental)',
      artistName: '아이유',
      duration: 253,
      syncedLyrics: '[00:01.00] Inst',
    },
    {
      id: 20,
      trackName: '밤편지 (Live)',
      artistName: '아이유',
      duration: 253,
      syncedLyrics: '[00:01.00] Live ver',
    },
    {
      id: 25,
      trackName: '밤편지',
      artistName: '아이유',
      duration: 290,
      syncedLyrics: '[00:01.00] MV long duration',
    },
    {
      id: 30,
      trackName: '밤편지',
      artistName: '아이유',
      duration: 253,
      syncedLyrics: '[00:01.00] Exact studio match',
    },
  ];

  // Studio original (04:13 = 253s) picks id 30 (matching Title + Artist + Studio Version + Exact MM:SS)
  const studioPick = selectBestLyricsFromCandidates(candidates, '밤편지 아이유', '아이유', 253.3, '밤편지');
  assert.deepEqual(studioPick, {
    type: 'synced',
    text: '[00:01.00] Exact studio match',
    selectedId: 'lrclib-30',
  });

  // Live version track ('밤편지 (Live)') picks id 20 (Live version match over Studio version)
  const livePick = selectBestLyricsFromCandidates(
    candidates,
    '밤편지 (Live) 아이유',
    '아이유',
    253,
    '밤편지 (Live)'
  );
  assert.deepEqual(livePick, {
    type: 'synced',
    text: '[00:01.00] Live ver',
    selectedId: 'lrclib-20',
  });

  // Non-version parenthetical subtitles are preserved in baseTitle while version tags are extracted
  const subtitleParsed = parseTitleAndVersion('Good Day (좋은 날)');
  assert.deepEqual(subtitleParsed.versionTags, []);
  assert.equal(subtitleParsed.baseTitleNorm, 'goodday좋은날');

  const remasterParsed = parseTitleAndVersion('Bohemian Rhapsody - 2011 Remaster');
  assert.deepEqual(remasterParsed.versionTags, ['remaster']);
  assert.equal(remasterParsed.baseTitleNorm, 'bohemianrhapsody');
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
  assert.equal(DEFAULT_UI_SETTINGS.vertPos, 50);
  for (const preset of UI_PRESETS) {
    assert.equal(preset.patch.vertPos, 50);
  }
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

test('formatDurationMs, formatCompactTimeMs, and formatRemainingTimeMs format elapsed and remaining playback times accurately', () => {
  assert.equal(formatDurationMs(0), '00:00');
  assert.equal(formatDurationMs(45000), '00:45');
  assert.equal(formatDurationMs(213900), '03:33');
  assert.equal(formatDurationMs(-500), '00:00');
  assert.equal(formatDurationMs(Number.NaN), '00:00');

  assert.equal(formatCompactTimeMs(11000), '0:11');
  assert.equal(formatCompactTimeMs(213900), '3:33');
  assert.equal(formatCompactTimeMs(-10), '0:00');

  assert.equal(formatRemainingTimeMs(11000, 165000), '-2:34');
  assert.equal(formatRemainingTimeMs(45000, 45000), '-0:00');
  assert.equal(formatRemainingTimeMs(50000, 45000), '-0:00');
});

test('computeInterludeState requires >=10s gaps, waits 5s before appearing, repeats 1800ms cycles, and exits 500ms early', () => {
  assert.equal(INTERLUDE_MIN_GAP_MS, 10000);
  assert.equal(INTERLUDE_HOLD_AFTER_VOCAL_MS, 5000);

  const balladLyrics = [
    { time: 12000, text: '12s intro ends' },
    { time: 20000, text: '8s ballad line (must NOT show interlude)' },
    { time: 28000, text: 'Before 20s instrumental break' },
    { time: 48000, text: 'After 20s instrumental break' },
  ];

  // 12s intro: hidden before 5000ms, active after 5000ms, exits 500ms before 12000ms (at 11600ms -> inactive)
  assert.equal(computeInterludeState(balladLyrics, -1, 4900, false).active, false);
  const introMid = computeInterludeState(balladLyrics, -1, 5200, false);
  assert.equal(introMid.active, true);
  assert.equal(introMid.afterLineIndex, -1);
  assert.equal(computeInterludeState(balladLyrics, -1, 11600, false).active, false);

  // 8s ballad gap (12000 -> 20000 = 8000ms < 10000ms): never activates even after 5s
  assert.equal(computeInterludeState(balladLyrics, 0, 17500, false).active, false);

  // 20s interlude (28000 -> 48000): stays inactive for first 5s (up to 32999ms), activates at 33000ms
  assert.equal(computeInterludeState(balladLyrics, 2, 32900, false).active, false);

  // Inside 20s interlude: cycle repeats every 1800ms instead of stretching over 20s
  const cycleA = computeInterludeState(balladLyrics, 2, 33600, false);
  const cycleB = computeInterludeState(balladLyrics, 2, 33600 + 1800, false);
  const cycleC = computeInterludeState(balladLyrics, 2, 33600 + 1800 * 6, false);
  assert.equal(cycleA.active, true);
  assert.equal(cycleB.active, true);
  assert.equal(cycleC.active, true);
  assert.equal(cycleA.cyclePhase, cycleB.cyclePhase);
  assert.equal(cycleA.cyclePhase, cycleC.cyclePhase);
  assert.deepEqual(cycleA.dotOpacities, cycleB.dotOpacities);

  // Smooth exit lead-out 500ms before 48000ms (at 47600ms -> inactive)
  assert.equal(computeInterludeState(balladLyrics, 2, 47600, false).active, false);

  // Plain lyrics never trigger interlude dots
  assert.equal(computeInterludeState(balladLyrics, 2, 38000, true).active, false);
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

test('shouldResyncPlaybackClock suppresses <=650ms Spotify poll jitter while immediately syncing seeks, pause/play, and track changes', () => {
  // Normal 3s poll with 240ms RTT and 280ms Spotify edge lag -> compensated 12120 vs local 12400 (280ms drift <= 650ms) -> DO NOT jump backward
  const steadyPoll = shouldResyncPlaybackClock({
    localProgressMs: 12400,
    remoteProgressMs: 12000,
    rttMs: 240,
    isPlaying: true,
    wasPlaying: true,
    trackChanged: false,
  });
  assert.deepEqual(steadyPoll, { shouldUpdate: false, nextProgressMs: 12400 });

  // External user seek in Spotify app (local 12400 vs remote 45000) -> resync immediately
  const externalSeek = shouldResyncPlaybackClock({
    localProgressMs: 12400,
    remoteProgressMs: 45000,
    rttMs: 200,
    isPlaying: true,
    wasPlaying: true,
    trackChanged: false,
  });
  assert.deepEqual(externalSeek, { shouldUpdate: true, nextProgressMs: 45100 });

  // Play/pause transition or track change -> always resync
  const pausedTransition = shouldResyncPlaybackClock({
    localProgressMs: 12400,
    remoteProgressMs: 12350,
    rttMs: 180,
    isPlaying: false,
    wasPlaying: true,
    trackChanged: false,
  });
  assert.deepEqual(pausedTransition, { shouldUpdate: true, nextProgressMs: 12350 });

  const newTrack = shouldResyncPlaybackClock({
    localProgressMs: 210000,
    remoteProgressMs: 120,
    rttMs: 200,
    isPlaying: true,
    wasPlaying: true,
    trackChanged: true,
  });
  assert.deepEqual(newTrack, { shouldUpdate: true, nextProgressMs: 220 });
});

test('extractAlbumPaletteFromGrid extracts distinct quadrant hues and computeAmbientMeshPixels applies smooth TPDF dithering without banding steps', () => {
  const w = 8;
  const h = 8;
  const grid = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x < 4 && y < 4) {
        // Top-left: warm amber
        grid[idx] = 230;
        grid[idx + 1] = 150;
        grid[idx + 2] = 45;
      } else if (x >= 4 && y < 4) {
        // Top-right: crimson red
        grid[idx] = 215;
        grid[idx + 1] = 42;
        grid[idx + 2] = 68;
      } else if (x < 4 && y >= 4) {
        // Bottom-left: cobalt blue
        grid[idx] = 40;
        grid[idx + 1] = 95;
        grid[idx + 2] = 220;
      } else {
        // Bottom-right: deep violet
        grid[idx] = 135;
        grid[idx + 1] = 58;
        grid[idx + 2] = 205;
      }
      grid[idx + 3] = 255;
    }
  }

  const palette = extractAlbumPaletteFromGrid(grid, w, h);
  assert.equal(palette.length, 4);
  assert.equal(palette[0].r > palette[0].b, true);
  assert.equal(palette[2].b > palette[2].r, true);

  const meshSize = 64;
  const mesh = computeAmbientMeshPixels(palette, meshSize, 'primary', 101);
  assert.equal(mesh.length, meshSize * meshSize * 4);

  // Outer perimeter pixels blend smoothly to the dark listening-room floor (~17,17,19 +/- dither)
  const cornerR = mesh[0];
  assert.equal(cornerR >= 14 && cornerR <= 21, true);
  assert.equal(mesh[3], 255);

  // Interior pixels should be brighter than corners and exhibit TPDF dither variance (no long flat quantized runs)
  const centerIdx = ((meshSize >> 1) * meshSize + (meshSize >> 1)) * 4;
  assert.equal(mesh[centerIdx] > cornerR + 20 || mesh[centerIdx + 2] > cornerR + 20, true);

  const fallbackMesh = computeAmbientMeshPixels(buildFallbackAmbientPalette(), 32, 'secondary', 202);
  assert.equal(fallbackMesh.length, 32 * 32 * 4);

  const tile = createFineDitherTilePixels(32, 9001);
  assert.equal(tile.length, 32 * 32 * 4);
  let nonZeroAlphaCount = 0;
  for (let i = 3; i < tile.length; i += 4) {
    assert.equal(tile[i] <= 6, true);
    if (tile[i] > 0) nonZeroAlphaCount++;
  }
  assert.equal(nonZeroAlphaCount > 100, true);
});

test('computeMarqueeMetrics disables marquee when text fits and computes right-fade-compensated slide offset when overflowing', () => {
  assert.deepEqual(computeMarqueeMetrics(120, 160), {
    isOverflowing: false,
    slideOffsetPx: 0,
    durationSec: 0,
  });
  assert.deepEqual(computeMarqueeMetrics(161, 160), {
    isOverflowing: false,
    slideOffsetPx: 0,
    durationSec: 0,
  });

  const overflow = computeMarqueeMetrics(260, 160, 14);
  assert.equal(overflow.isOverflowing, true);
  assert.equal(overflow.slideOffsetPx, 114);
  assert.equal(overflow.durationSec >= 6.5 && overflow.durationSec <= 24, true);
});

test('interleavedGradientNoise stays strictly within [-0.5, 0.5] and computeLobePositionsAtPhase is C-continuous across rate changes', () => {
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = interleavedGradientNoise(x, y);
      assert.equal(v >= -0.5 && v <= 0.5, true);
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  assert.equal(maxVal - minVal > 0.85, true);

  const pA = computeLobePositionsAtPhase(1.234);
  const pB = computeLobePositionsAtPhase(1.234 + 0.002);
  assert.equal(pA.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.equal(pA[i].x > 0 && pA[i].x < 1, true);
    assert.equal(pA[i].y > 0 && pA[i].y < 1, true);
    const stepDist = Math.hypot(pB[i].x - pA[i].x, pB[i].y - pA[i].y);
    assert.equal(stepDist < 0.002, true);
  }
});

test('tokenizeLyricWords splits hyphenated compounds (na-na-na), smooths word entrance glide, and computes immediate spatial wave phase', () => {
  // NFC normalization + space words + hyphen-delimited sub-words (e.g. na-na-na)
  const decomposed = '한글'.normalize('NFD') + ' na-na-na yeah';
  const words = tokenizeLyricWords(decomposed);
  assert.deepEqual(
    words.map((w) => ({ word: w.word, space: w.hasLeadingSpace })),
    [
      { word: '한글', space: false },
      { word: 'na-', space: true },
      { word: 'na-', space: false },
      { word: 'na', space: false },
      { word: 'yeah', space: true },
    ]
  );
  // Reconstructing text from tokens + hasLeadingSpace is 100% lossless
  const reconstructed = words.map((w) => (w.hasLeadingSpace ? ` ${w.word}` : w.word)).join('');
  assert.equal(reconstructed, '한글 na-na-na yeah');

  assert.equal(words[0].startCol, 0);
  assert.equal(words[0].centerCol, 1);
  // 'na-' starts after 2.0 + 0.85 space = 2.85, length 3 -> ends at 5.85 -> next 'na-' starts immediately at 5.85 (no 0.85 space gap)
  assert.equal(words[1].startCol, 2.85);
  assert.equal(words[2].startCol, 5.85);
  assert.equal(words[3].startCol, 8.85);

  // Smoother, slightly gentler single-stage word soft-scale + lift (860ms glide, ~1.035 scale, ~-2.35px lift)
  const e0 = buildWordEntranceSpec(0, 24);
  const e2 = buildWordEntranceSpec(2, 24);
  assert.equal(e0.delayMs, 0);
  assert.equal(e2.delayMs, 124);
  assert.equal(e0.durationMs, 860);
  assert.equal(e0.targetScale > 1.025 && e0.targetScale <= 1.042, true);
  assert.equal(e0.targetLiftPx < -1.8 && e0.targetLiftPx >= -2.8, true);
  assert.equal(e0.keyframes.length, 2);
  assert.equal(e0.keyframes[0].transform, 'translate3d(0, 0px, 0) scale(1)');

  // Gently narrowed horizontal wavelength (~32.7 columns per 2π cycle) & flattened font-size amplitude curve
  const fullWavelengthCols = (Math.PI * 2) / LYRIC_WAVE_SPATIAL_FREQ_RAD;
  assert.equal(fullWavelengthCols >= 31.5 && fullWavelengthCols <= 34.5, true);

  const wWave20 = buildWordWaveSpec(words[0].centerCol, 20);
  const wWave24 = buildWordWaveSpec(words[0].centerCol, 24);
  const wWave38 = buildWordWaveSpec(words[0].centerCol, 38);
  const wWave56 = buildWordWaveSpec(words[0].centerCol, 56);
  const wWaveLast = buildWordWaveSpec(words[4].centerCol, 24);
  assert.equal(wWave20.amplitudePx, 1.93);
  assert.equal(wWave24.amplitudePx, 2.03);
  assert.equal(wWave38.amplitudePx, 2.36);
  assert.equal(wWave56.amplitudePx, 2.55);
  assert.equal(wWaveLast.phaseOffsetMs > wWave24.phaseOffsetMs, true);
  assert.equal(wWaveLast.phaseOffsetMs < wWave24.periodMs, true);
  assert.equal(wWave24.keyframes.length, 5);

  // Additional hyphen patterns: repeated compounds, standalone spaced hyphen, en-dash
  for (const sample of ['DDU-DU DDU-DU', 'Oh-oh-oh!', 'Intro - Verse 1', 'la–la–la']) {
    const sampleTokens = tokenizeLyricWords(sample);
    const rebuilt = sampleTokens.map((w) => (w.hasLeadingSpace ? ` ${w.word}` : w.word)).join('');
    assert.equal(rebuilt, sample);
  }
  assert.equal(tokenizeLyricWords('DDU-DU DDU-DU').length, 4);
});

test('computeWordVisualPositions detects wrapped lyric rows and buildWordWaveSpec applies exact 300ms diagonal row lag regardless of wrap point', () => {
  // Case A: 7 words on row 0 (offsetTop=0) + 1 wrapped word on row 1 (offsetTop=29, offsetLeft=0)
  const boxesA = [
    { offsetLeft: 0, offsetTop: 0, offsetWidth: 80 },
    { offsetLeft: 88, offsetTop: 1, offsetWidth: 44 },
    { offsetLeft: 140, offsetTop: 0, offsetWidth: 96 },
    { offsetLeft: 244, offsetTop: 0, offsetWidth: 44 },
    { offsetLeft: 296, offsetTop: 0, offsetWidth: 62 },
    { offsetLeft: 366, offsetTop: 0, offsetWidth: 44 },
    { offsetLeft: 418, offsetTop: 0, offsetWidth: 24 },
    { offsetLeft: 0, offsetTop: 29, offsetWidth: 80 },
  ];
  const posA = computeWordVisualPositions(boxesA, [2, 6, 10, 15, 19, 23, 26, 30], 24);
  assert.equal(posA[0].rowIndex, 0);
  assert.equal(posA[6].rowIndex, 0);
  assert.equal(posA[7].rowIndex, 1);
  // Row 1 first word resets horizontal visualCol back to match Row 0 first word (both at left edge x=0, width=80)
  assert.equal(posA[7].visualCol, posA[0].visualCol);

  const specRow0Left = buildWordWaveSpec(posA[0].visualCol, 24, posA[0].rowIndex);
  const specRow1Left = buildWordWaveSpec(posA[7].visualCol, 24, posA[7].rowIndex);
  assert.equal(specRow1Left.phaseOffsetMs - specRow0Left.phaseOffsetMs, LYRIC_WAVE_ROW_DELAY_MS);
  assert.equal(LYRIC_WAVE_ROW_DELAY_MS, 300);

  // Case B: Different word count wrapping onto 3 rows — vertically aligned left words still keep exact +300ms / +600ms lag
  const boxesB = [
    { offsetLeft: 0, offsetTop: 0, offsetWidth: 80 },
    { offsetLeft: 90, offsetTop: 0, offsetWidth: 90 },
    { offsetLeft: 0, offsetTop: 30, offsetWidth: 80 },
    { offsetLeft: 90, offsetTop: 30, offsetWidth: 70 },
    { offsetLeft: 0, offsetTop: 60, offsetWidth: 80 },
  ];
  const posB = computeWordVisualPositions(boxesB, [2, 7, 12, 17, 22], 24);
  assert.deepEqual(
    posB.map((p) => p.rowIndex),
    [0, 0, 1, 1, 2]
  );
  const bRow0 = buildWordWaveSpec(posB[0].visualCol, 24, posB[0].rowIndex);
  const bRow1 = buildWordWaveSpec(posB[2].visualCol, 24, posB[2].rowIndex);
  const bRow2 = buildWordWaveSpec(posB[4].visualCol, 24, posB[4].rowIndex);
  assert.equal(bRow1.phaseOffsetMs - bRow0.phaseOffsetMs, 300);
  assert.equal(bRow2.phaseOffsetMs - bRow1.phaseOffsetMs, 300);

  // Diagonal wavefront check: Row 1 left word (x=40px, lag=548ms) matches phase of Row 0 word slightly to the right (boxesA[1] at x=110px, lag=681ms)
  const aRow0DiagRight = buildWordWaveSpec(posA[1].visualCol, 24, posA[1].rowIndex);
  assert.equal(Math.abs(specRow1Left.phaseOffsetMs - aRow0DiagRight.phaseOffsetMs) < 150, true);

  // Fallback when DOM boxes are unmeasured (all zeros)
  const fallbackPos = computeWordVisualPositions(
    [
      { offsetLeft: 0, offsetTop: 0, offsetWidth: 0 },
      { offsetLeft: 0, offsetTop: 0, offsetWidth: 0 },
    ],
    [1.5, 6.2],
    24
  );
  assert.deepEqual(fallbackPos, [
    { rowIndex: 0, visualCol: 1.5 },
    { rowIndex: 0, visualCol: 6.2 },
  ]);
});








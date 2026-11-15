import {
  LrcLibSongItem,
  LyricLine,
  NumericSettingKey,
  PresetId,
  SpotifyCredentials,
  UISettings,
} from '../types/lyrics';

export const PREVIEW_DURATION_MS = 45000;

export const DEFAULT_UI_SETTINGS: UISettings = {
  syncOffset: 0,
  fontSize: 24,
  vertPos: 40,
  blurAmount: 5,
  animSpeed: 2.0,
  waveDelay: 0.05,
  plainSpeed: 20,
  lineHeight: 1.2,
  margin: 1.5,
  uiScale: 1.0,
  keepAwake: false,
  hideControls: false,
  ambientLight: false,
};

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export const DEFAULT_AMBIENT_RGB: RGBColor = { r: 229, g: 169, b: 60 };

export interface UIPresetDefinition {
  id: PresetId;
  label: string;
  description: string;
  patch: Partial<UISettings>;
}

export const UI_PRESETS: UIPresetDefinition[] = [
  {
    id: 'standard',
    label: '기본',
    description: '24px · 표준 뷰',
    patch: {
      fontSize: 24,
      blurAmount: 5,
      vertPos: 40,
      lineHeight: 1.2,
      margin: 1.5,
      animSpeed: 2.0,
      hideControls: false,
    },
  },
  {
    id: 'stand',
    label: '거치 · 크게',
    description: '38px · 꺼짐 방지',
    patch: {
      fontSize: 38,
      blurAmount: 6,
      vertPos: 38,
      lineHeight: 1.25,
      margin: 1.8,
      animSpeed: 2.0,
      keepAwake: true,
      hideControls: false,
    },
  },
  {
    id: 'focus',
    label: '차분한 집중',
    description: '28px · 깊은 블러',
    patch: {
      fontSize: 28,
      blurAmount: 10,
      vertPos: 42,
      lineHeight: 1.3,
      margin: 1.6,
      animSpeed: 2.4,
      keepAwake: true,
      hideControls: true,
    },
  },
];

export function detectActivePreset(settings: UISettings): PresetId | null {
  for (const preset of UI_PRESETS) {
    const keys = Object.keys(preset.patch) as Array<keyof UISettings>;
    const matches = keys.every((k) => settings[k] === preset.patch[k]);
    if (matches) return preset.id;
  }
  return null;
}

export interface SettingConstraint {
  min: number;
  max: number;
  step: number;
  label: string;
  unit?: string;
}

export const SETTING_CONSTRAINTS: Record<NumericSettingKey, SettingConstraint> = {
  uiScale: { min: 0.5, max: 2.0, step: 0.1, label: '컨트롤러 배율', unit: 'x' },
  syncOffset: { min: -5000, max: 5000, step: 50, label: '가사 싱크', unit: 'ms' },
  fontSize: { min: 16, max: 64, step: 1, label: '글씨 크기', unit: 'px' },
  vertPos: { min: 10, max: 90, step: 1, label: '기준 높이', unit: '%' },
  blurAmount: { min: 0, max: 20, step: 1, label: '주변 블러', unit: 'px' },
  animSpeed: { min: 0.1, max: 5.0, step: 0.1, label: '이동 시간', unit: 's' },
  waveDelay: { min: 0.0, max: 1.0, step: 0.01, label: '줄 간 시차', unit: 's' },
  plainSpeed: { min: 0, max: 100, step: 1, label: '자동 스크롤', unit: 'px/s' },
  lineHeight: { min: 1.0, max: 3.0, step: 0.05, label: '줄 간격' },
  margin: { min: 0.5, max: 5.0, step: 0.1, label: '소절 간격', unit: 'rem' },
};

export const PREVIEW_LRC = `[00:00.000] 어두운 방 안에 첫 소절이 떠오릅니다
[00:03.000] 설정에서 빠른 프리셋으로 글자 크기를 바꿀 수 있습니다
[00:06.000] 가사 타이밍이 어긋날 때는
[00:09.000] 싱크 버튼으로 0.1초씩 바로 맞출 수 있습니다
[00:12.000] 슬라이더를 잡으면 모달 배경이 투명해지고
[00:15.000] 글씨 크기와 주변 블러를 보면서 조절합니다
[00:18.000] 조절하는 동안 주변 소절의 블러도 일시 해제됩니다
[00:21.000] 잠시 후 짧은 호흡의 구간이 이어집니다
[00:24.000] 하나
[00:25.000] 둘
[00:26.000] 셋
[00:27.000] 넷
[00:28.000] 다섯
[00:31.000] 원하는 소절을 누르면 그 시점으로 바로 이동합니다
[00:35.000] 잠시 후 처음 소절로 천천히 돌아갑니다`;

export function clampSettingValue(val: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(val)) return fallback;
  const clamped = Math.max(min, Math.min(max, val));
  return Math.round(clamped * 1000) / 1000;
}

export function resetSingleSetting<K extends keyof UISettings>(
  settings: UISettings,
  key: K
): UISettings {
  return {
    ...settings,
    [key]: DEFAULT_UI_SETTINGS[key],
  };
}

export function extractDominantColorFromPixels(data: ArrayLike<number>): RGBColor {
  if (!data || data.length < 4) {
    return { ...DEFAULT_AMBIENT_RGB };
  }

  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let totalWeight = 0;

  let fallbackR = 0;
  let fallbackG = 0;
  let fallbackB = 0;
  let opaqueCount = 0;

  for (let i = 0; i <= data.length - 4; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;

    fallbackR += r;
    fallbackG += g;
    fallbackB += b;
    opaqueCount++;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);

    // Skip near-black letterbox/shadows and near-white highlights when finding chroma
    if (maxC < 28 || minC > 235) continue;

    const delta = maxC - minC;
    const saturation = maxC === 0 ? 0 : delta / maxC;
    const weight = 0.35 + saturation * saturation * 3.2;

    weightedR += r * weight;
    weightedG += g * weight;
    weightedB += b * weight;
    totalWeight += weight;
  }

  if (opaqueCount === 0) {
    return { ...DEFAULT_AMBIENT_RGB };
  }

  let r = totalWeight > 0 ? weightedR / totalWeight : fallbackR / opaqueCount;
  let g = totalWeight > 0 ? weightedG / totalWeight : fallbackG / opaqueCount;
  let b = totalWeight > 0 ? weightedB / totalWeight : fallbackB / opaqueCount;

  // Normalize peak brightness into a balanced ambient glow range (145..220)
  const peak = Math.max(r, g, b, 1);
  if (peak < 145) {
    const boost = 145 / peak;
    r *= boost;
    g *= boost;
    b *= boost;
  } else if (peak > 220) {
    const scale = 220 / peak;
    r *= scale;
    g *= scale;
    b *= scale;
  }

  return {
    r: Math.round(Math.min(255, Math.max(0, r))),
    g: Math.round(Math.min(255, Math.max(0, g))),
    b: Math.round(Math.min(255, Math.max(0, b))),
  };
}

export function deriveSecondaryAmbientColor(primary: RGBColor): RGBColor {
  // Subtle warm-cool harmonic shift for dual-lobe breathing depth
  return {
    r: Math.round(primary.r * 0.72 + primary.b * 0.28),
    g: Math.round(primary.g * 0.78 + primary.r * 0.22),
    b: Math.round(primary.b * 0.75 + primary.g * 0.25),
  };
}

export function stepSyncOffset(currentOffset: number, deltaMs: number): number {
  const { min, max } = SETTING_CONSTRAINTS.syncOffset;
  return clampSettingValue(currentOffset + deltaMs, min, max, 0);
}

export function formatSyncOffsetLabel(offsetMs: number): string {
  if (offsetMs === 0) return '0ms · 정각';
  const sec = (Math.abs(offsetMs) / 1000).toFixed(offsetMs % 100 === 0 ? 1 : 2);
  if (offsetMs > 0) {
    return `+${offsetMs}ms · ${sec}초 빠르게`;
  }
  return `${offsetMs}ms · ${sec}초 느리게`;
}

export function computeTrackProgressMs(
  progressAnchorMs: number,
  anchorTimestamp: number,
  nowTimestamp: number,
  isPlaying: boolean,
  isPreviewMode: boolean
): number {
  const elapsed = isPlaying ? Math.max(0, nowTimestamp - anchorTimestamp) : 0;
  const raw = progressAnchorMs + elapsed;
  if (!isPreviewMode) {
    return Math.max(0, raw);
  }
  return ((raw % PREVIEW_DURATION_MS) + PREVIEW_DURATION_MS) % PREVIEW_DURATION_MS;
}

export function encodeBasicAuth(clientId: string, clientSecret: string): string | null {
  try {
    const raw = `${clientId}:${clientSecret}`;
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

export function parsePastedCredentials(rawText: string): Partial<SpotifyCredentials> | null {
  const trimmed = rawText.trim();
  if (!trimmed || (!trimmed.includes('\n') && !trimmed.startsWith('{'))) {
    return null;
  }

  // 1. Try JSON object format
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const cid = obj.clientId ?? obj.client_id ?? obj.SPOTIFY_CLIENT_ID ?? obj.sp_client_id;
      const csec =
        obj.clientSecret ?? obj.client_secret ?? obj.SPOTIFY_CLIENT_SECRET ?? obj.sp_client_secret;
      const rtok =
        obj.refreshToken ?? obj.refresh_token ?? obj.SPOTIFY_REFRESH_TOKEN ?? obj.sp_refresh_token;
      const extracted: Partial<SpotifyCredentials> = {};
      if (typeof cid === 'string' && cid.trim()) extracted.clientId = cid.trim();
      if (typeof csec === 'string' && csec.trim()) extracted.clientSecret = csec.trim();
      if (typeof rtok === 'string' && rtok.trim()) extracted.refreshToken = rtok.trim();
      if (Object.keys(extracted).length > 0) return extracted;
    } catch {
      // Fall through to line-by-line key=value / key:value parsing
    }
  }

  // 2. Try .env or key:value / key=value lines
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const extracted: Partial<SpotifyCredentials> = {};
  for (const line of lines) {
    const kvMatch = line.match(/^([a-zA-Z0-9_.\-\s]+?)\s*[:=]\s*["']?([^"']+)["']?$/);
    if (kvMatch) {
      const keyNorm = kvMatch[1].toLowerCase().replace(/[\s_-]/g, '');
      const val = kvMatch[2].trim();
      if (!val) continue;
      if (keyNorm.includes('clientid')) extracted.clientId = val;
      else if (keyNorm.includes('clientsecret') || keyNorm === 'secret') extracted.clientSecret = val;
      else if (keyNorm.includes('refreshtoken') || keyNorm === 'token') extracted.refreshToken = val;
    }
  }

  if (Object.keys(extracted).length > 0) {
    return extracted;
  }

  // 3. Fallback: exactly 3 plain non-empty lines (clientId, clientSecret, refreshToken)
  if (lines.length === 3 && lines.every((l) => !l.includes(' '))) {
    return {
      clientId: lines[0],
      clientSecret: lines[1],
      refreshToken: lines[2],
    };
  }

  return null;
}

export function cleanTitle(title: string): string {
  return title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/- .*?(Remaster|Live|Radio|Version).*/gi, '')
    .trim();
}

export function parseLRC(lrcText: string): LyricLine[] {
  const lines = lrcText.split(/\r?\n/);
  const timeRegEx = /\[(\d{2,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;

  const parsed: LyricLine[] = [];
  for (const line of lines) {
    const match = line.match(timeRegEx);
    if (!match) continue;

    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    let msStr = match[3] || '000';
    if (msStr.length === 1) msStr += '00';
    else if (msStr.length === 2) msStr += '0';
    const ms = parseInt(msStr, 10);
    const text = match[4].trim();

    if (text) {
      parsed.push({
        time: (min * 60 + sec) * 1000 + ms,
        text,
      });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

export function parsePlainLyrics(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ time: 0, text: line }));
}

export function normalizeMatchToken(str: string | undefined | null): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

export function buildSearchQueries(title: string, artist: string): { firstArtist: string; queries: string[] } {
  const firstArtist = artist.split(',')[0].trim();
  const cleanedTitle = cleanTitle(title);

  const candidates = [
    `${title} ${firstArtist}`.trim(),
    `${cleanedTitle} ${firstArtist}`.trim(),
    title.trim(),
    cleanedTitle.trim(),
  ].filter((q) => q.length > 0);

  return {
    firstArtist,
    queries: Array.from(new Set(candidates)),
  };
}

export function selectBestLyricsFromCandidates(
  songs: LrcLibSongItem[],
  queryStr: string,
  targetArtist: string,
  targetDurationSec: number
): { type: 'synced' | 'plain'; text: string } | null {
  if (!Array.isArray(songs) || songs.length === 0) return null;

  const expectedArtist = normalizeMatchToken(targetArtist);
  const normalizedQuery = normalizeMatchToken(queryStr);

  const validSongs = songs.filter((song) => {
    const apiArtist = normalizeMatchToken(song.artistName);
    const isArtistMatch =
      expectedArtist.length > 0 &&
      apiArtist.length > 0 &&
      (apiArtist.includes(expectedArtist) || expectedArtist.includes(apiArtist));
    const isDurationMatch =
      Boolean(targetDurationSec) &&
      typeof song.duration === 'number' &&
      Math.abs(song.duration - targetDurationSec) <= 8;

    if (isArtistMatch || isDurationMatch) return true;
    if (expectedArtist && !normalizedQuery.includes(expectedArtist)) return false;
    return true;
  });

  if (validSongs.length === 0) return null;

  const synced = validSongs.find((song) => song.syncedLyrics && song.syncedLyrics.trim().length > 0);
  if (synced && synced.syncedLyrics) {
    return { type: 'synced', text: synced.syncedLyrics };
  }

  const plain = validSongs.find((song) => song.plainLyrics && song.plainLyrics.trim().length > 0);
  if (plain && plain.plainLyrics) {
    return { type: 'plain', text: plain.plainLyrics };
  }

  return null;
}

export function findActiveLyricIndex(lyrics: LyricLine[], estimatedProgressMs: number): number {
  let activeIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (estimatedProgressMs >= lyrics[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}

export function computeLyricVisualStyle(
  index: number,
  activeIndex: number,
  options: {
    isPlainLyrics: boolean;
    forceClearBlur: boolean;
    blurIntensity: number;
  }
): { blurPx: number; opacity: number; isActive: boolean } {
  if (options.isPlainLyrics) {
    return { blurPx: 0, opacity: 0.8, isActive: false };
  }

  const distance = activeIndex === -1 ? index + 1 : Math.abs(index - activeIndex);
  const isActive = activeIndex !== -1 && distance === 0;

  if (options.forceClearBlur) {
    return {
      blurPx: 0,
      opacity: isActive ? 1 : 0.6,
      isActive,
    };
  }

  if (isActive) {
    return { blurPx: 0, opacity: 1, isActive: true };
  }
  if (distance === 1) {
    return { blurPx: options.blurIntensity * 0.25, opacity: 0.6, isActive: false };
  }
  if (distance === 2) {
    return { blurPx: options.blurIntensity * 0.6, opacity: 0.3, isActive: false };
  }
  return { blurPx: options.blurIntensity, opacity: 0.1, isActive: false };
}

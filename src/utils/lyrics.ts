import {
  InterludeState,
  LrcLibCandidate,
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
  vertPos: 50,
  blurAmount: 5,
  animSpeed: 2.0,
  waveDelay: 0.05,
  plainSpeed: 20,
  lineHeight: 1.2,
  margin: 1.5,
  uiScale: 1.0,
  keepAwake: false,
  hideControls: false,
  ambientLight: true,
  autoHideHud: true,
  splitLayout: true,
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
      vertPos: 50,
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
      vertPos: 50,
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
      vertPos: 50,
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
[00:14.500] 긴 간주에서는 5초 뒤 호흡 표시가 이어집니다
[00:26.500] 간주가 끝나고 다음 소절이 자연스럽게 시작됩니다
[00:29.500] 조절하는 동안 주변 소절의 블러도 일시 해제됩니다
[00:32.000] 짧은 호흡의 구간이 이어집니다
[00:34.000] 하나
[00:35.000] 둘
[00:36.000] 셋
[00:37.000] 넷
[00:38.000] 다섯
[00:40.500] 원하는 소절을 누르면 그 시점으로 바로 이동합니다`;

export const PREVIEW_ALT_SYNCED_LRC = `[00:00.000] 다른 버전의 싱크 가사를 직접 골라 적용한 화면입니다
[00:04.000] 상단 가사 선택창에서 앨범과 길이를 비교할 수 있습니다
[00:08.000] 와이드 모니터에서는 좌측 앨범 아트 분할 뷰도 어울립니다
[00:12.000] 하단 진행 바를 끌어 원하는 구간으로 곧바로 건너뜁니다
[00:20.000] 무조작 자동 숨김을 켜면 가사와 조명만 조용히 남습니다
[00:28.000] 언제든 원래 가사 후보로 다시 전환할 수 있습니다`;

export const PREVIEW_PLAIN_TEXT = `싱크 타임스탬프가 없는 일반 가사 예시입니다
재생 중에는 설정된 자동 스크롤 속도로 천천히 흐릅니다
마우스 휠이나 터치로 자유롭게 위아래를 살펴볼 수 있습니다
상단 가사 선택 버튼에서 다시 싱크 가사로 바꿀 수 있습니다`;

export const PREVIEW_CANDIDATES: LrcLibCandidate[] = [
  {
    id: 'preview-synced-default',
    trackName: 'UI 미리보기 체험 (기본 싱크)',
    artistName: '실시간 싱크 미리보기',
    albumName: 'Lyrictify Studio Session',
    durationSec: 45,
    hasSynced: true,
    hasPlain: true,
    syncedLyrics: PREVIEW_LRC,
    plainLyrics: PREVIEW_PLAIN_TEXT,
  },
  {
    id: 'preview-synced-alt',
    trackName: 'UI 미리보기 체험 (Acoustic Ver · Late Night Studio Session Remastered)',
    artistName: '실시간 싱크 미리보기',
    albumName: 'Lyrictify Live Session Deluxe Edition',
    durationSec: 45,
    hasSynced: true,
    hasPlain: false,
    syncedLyrics: PREVIEW_ALT_SYNCED_LRC,
    plainLyrics: null,
  },
  {
    id: 'preview-plain-only',
    trackName: 'UI 미리보기 체험 (일반 텍스트)',
    artistName: '실시간 싱크 미리보기',
    albumName: 'Booklet Edition',
    durationSec: 45,
    hasSynced: false,
    hasPlain: true,
    syncedLyrics: null,
    plainLyrics: PREVIEW_PLAIN_TEXT,
  },
];

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatCompactTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatRemainingTimeMs(currentMs: number, durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '-0:00';
  const safeCurrent = Number.isFinite(currentMs) ? Math.max(0, currentMs) : 0;
  const remainingSec = Math.max(0, Math.ceil((durationMs - safeCurrent) / 1000));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return `-${mins}:${String(secs).padStart(2, '0')}`;
}

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

  const peak = Math.max(r, g, b, 1);
  if (peak < 175) {
    const boost = 175 / peak;
    r *= boost;
    g *= boost;
    b *= boost;
  } else if (peak > 245) {
    const scale = 245 / peak;
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
  // Shift channels noticeably so secondary ambient lobe creates visible multi-tonal movement
  const rawR = primary.r * 0.45 + primary.b * 0.55;
  const rawG = primary.g * 0.52 + primary.r * 0.48;
  const rawB = primary.b * 0.48 + primary.g * 0.52;
  const peak = Math.max(rawR, rawG, rawB, 1);
  const boost = peak < 185 ? 185 / peak : 1;

  return {
    r: Math.round(Math.min(255, Math.max(0, rawR * boost))),
    g: Math.round(Math.min(255, Math.max(0, rawG * boost))),
    b: Math.round(Math.min(255, Math.max(0, rawB * boost))),
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

export interface PlaybackClockSyncInput {
  localProgressMs: number;
  remoteProgressMs: number;
  rttMs: number;
  isPlaying: boolean;
  wasPlaying: boolean;
  trackChanged: boolean;
  maxDriftMs?: number;
}

export function shouldResyncPlaybackClock(input: PlaybackClockSyncInput): {
  shouldUpdate: boolean;
  nextProgressMs: number;
} {
  const halfRtt = input.isPlaying ? Math.min(350, Math.max(0, input.rttMs) * 0.5) : 0;
  const compensatedRemote = Math.max(0, Math.round(input.remoteProgressMs + halfRtt));
  const threshold = input.maxDriftMs ?? 650;

  if (input.trackChanged || input.isPlaying !== input.wasPlaying) {
    return { shouldUpdate: true, nextProgressMs: compensatedRemote };
  }

  const drift = Math.abs(compensatedRemote - input.localProgressMs);
  if (!input.isPlaying) {
    return drift > 80
      ? { shouldUpdate: true, nextProgressMs: compensatedRemote }
      : { shouldUpdate: false, nextProgressMs: input.localProgressMs };
  }

  if (drift <= threshold) {
    return { shouldUpdate: false, nextProgressMs: input.localProgressMs };
  }

  return { shouldUpdate: true, nextProgressMs: compensatedRemote };
}

export const INTERLUDE_MIN_GAP_MS = 10000;
export const INTERLUDE_CYCLE_MS = 1800;
export const INTERLUDE_HOLD_AFTER_VOCAL_MS = 5000;
export const INTERLUDE_EXIT_LEAD_MS = 500;

export function computeInterludeState(
  lyrics: LyricLine[],
  activeIndex: number,
  estimatedProgressMs: number,
  isPlainLyrics: boolean
): InterludeState {
  const inactive: InterludeState = {
    active: false,
    afterLineIndex: -1,
    cyclePhase: 0,
    dotOpacities: [0.26, 0.26, 0.26],
  };

  if (isPlainLyrics || lyrics.length === 0) {
    return inactive;
  }

  let gapStartMs = -1;
  let gapEndMs = -1;
  let afterLineIndex = -1;

  if (activeIndex === -1) {
    const firstTime = lyrics[0].time;
    const effectiveStart = INTERLUDE_HOLD_AFTER_VOCAL_MS;
    const effectiveEnd = firstTime - INTERLUDE_EXIT_LEAD_MS;
    if (
      firstTime >= INTERLUDE_MIN_GAP_MS &&
      estimatedProgressMs >= effectiveStart &&
      estimatedProgressMs < effectiveEnd
    ) {
      gapStartMs = effectiveStart;
      gapEndMs = effectiveEnd;
      afterLineIndex = -1;
    }
  } else if (activeIndex >= 0 && activeIndex < lyrics.length - 1) {
    const curTime = lyrics[activeIndex].time;
    const nextTime = lyrics[activeIndex + 1].time;
    const gapDuration = nextTime - curTime;
    const effectiveStart = curTime + INTERLUDE_HOLD_AFTER_VOCAL_MS;
    const effectiveEnd = nextTime - INTERLUDE_EXIT_LEAD_MS;

    if (
      gapDuration >= INTERLUDE_MIN_GAP_MS &&
      estimatedProgressMs >= effectiveStart &&
      estimatedProgressMs < effectiveEnd
    ) {
      gapStartMs = effectiveStart;
      gapEndMs = effectiveEnd;
      afterLineIndex = activeIndex;
    }
  }

  if (gapStartMs < 0 || gapEndMs <= gapStartMs) {
    return inactive;
  }

  // Repeat every INTERLUDE_CYCLE_MS (1.8s) regardless of whether the interlude is 10s or 30s
  const elapsedInInterlude = Math.max(0, estimatedProgressMs - gapStartMs);
  const cyclePhase = (elapsedInInterlude % INTERLUDE_CYCLE_MS) / INTERLUDE_CYCLE_MS;

  const computeWaveOpacity = (dotOffset: number): number => {
    const shifted = (cyclePhase - dotOffset + 1) % 1;
    // Smooth raised-cosine wave peaking at shifted = 0.35 over a 0.70 active window
    if (shifted > 0.7) return 0.26;
    const wave = 0.5 - 0.5 * Math.cos((shifted / 0.7) * Math.PI * 2);
    return Math.round((0.26 + wave * 0.7) * 100) / 100;
  };

  return {
    active: true,
    afterLineIndex,
    cyclePhase: Math.round(cyclePhase * 1000) / 1000,
    dotOpacities: [
      computeWaveOpacity(0),
      computeWaveOpacity(260 / INTERLUDE_CYCLE_MS),
      computeWaveOpacity(520 / INTERLUDE_CYCLE_MS),
    ],
  };
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
      // Fall through
    }
  }

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

export interface ParsedTitleVersion {
  baseTitleNorm: string;
  fullTitleNorm: string;
  versionNorm: string;
  versionTags: string[];
}

function classifyVersionSegment(segment: string): string[] {
  const tags: string[] = [];
  if (/\b(instrumental|inst\.?|off\s*vocal|karaoke)\b|반주|인스트/i.test(segment)) {
    tags.push('instrumental');
  }
  if (/\b(live|concert|tour|unplugged\s*live)\b|라이브|콘서트/i.test(segment)) {
    tags.push('live');
  }
  if (/\b(acoustic|unplugged|piano\s*ver|guitar\s*ver)\b|어쿠스틱|언플러그드/i.test(segment)) {
    tags.push('acoustic');
  }
  if (/\b(remix|club\s*mix|vip\s*mix|bootleg)\b|리믹스/i.test(segment)) {
    tags.push('remix');
  }
  if (/\b(radio\s*edit|sped\s*up|speed\s*up|slowed|reverb|nightcore|extended|short\s*ver)\b/i.test(segment)) {
    tags.push('edit');
  }
  if (/\b(remaster(?:ed)?|anniversary)\b|리마스터/i.test(segment)) {
    tags.push('remaster');
  }
  if (/\b(demo|cover|tribute)\b|데모|커버/i.test(segment)) {
    tags.push('demo_cover');
  }
  if (/\b(japanese|jpn|jp\s*ver)\b|일본어/i.test(segment)) {
    tags.push('lang_jp');
  }
  if (/\b(english|eng\s*ver)\b|영어/i.test(segment)) {
    tags.push('lang_en');
  }
  if (/\b(korean|kor\s*ver)\b|한국어/i.test(segment)) {
    tags.push('lang_kr');
  }
  if (/\b(chinese|chn\s*ver)\b|중국어/i.test(segment)) {
    tags.push('lang_zh');
  }
  if (tags.length === 0 && /\b(ver\.?|version|ost|clean|explicit|mix)\b|버전/i.test(segment)) {
    tags.push('alt_ver');
  }
  return tags;
}

export function parseTitleAndVersion(rawTitle: string | undefined | null): ParsedTitleVersion {
  if (!rawTitle) {
    return { baseTitleNorm: '', fullTitleNorm: '', versionNorm: '', versionTags: [] };
  }

  // Strip featuring credits first so they don't pollute base title or version comparison
  let working = rawTitle
    .replace(/[([][\s]*(?:feat\.?|ft\.?|featuring)\b[^)\]]*[)\]]/gi, ' ')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/gi, ' ');

  const fullTitleNorm = normalizeMatchToken(working);
  const collectedTagSet = new Set<string>();
  const versionRawParts: string[] = [];

  // Extract bracketed/parenthetical version modifiers (preserving non-version parens like Korean subtitles)
  working = working.replace(/[([]([^)\]]+)[)\]]/g, (fullMatch, inner: string) => {
    const segTags = classifyVersionSegment(inner);
    if (segTags.length > 0) {
      segTags.forEach((t) => collectedTagSet.add(t));
      versionRawParts.push(inner);
      return ' ';
    }
    return fullMatch;
  });

  // Extract trailing hyphenated version modifiers (e.g., "- 2011 Remaster", "- Live Version")
  const hyphenMatch = working.match(/^(.*?)\s+-\s+(.+)$/);
  if (hyphenMatch) {
    const segTags = classifyVersionSegment(hyphenMatch[2]);
    if (segTags.length > 0) {
      segTags.forEach((t) => collectedTagSet.add(t));
      versionRawParts.push(hyphenMatch[2]);
      working = hyphenMatch[1];
    }
  }

  const baseTitleNorm = normalizeMatchToken(working) || fullTitleNorm;
  const versionTags = Array.from(collectedTagSet).sort();
  const versionNorm = normalizeMatchToken(versionRawParts.join(' '));

  return {
    baseTitleNorm,
    fullTitleNorm,
    versionNorm,
    versionTags,
  };
}

export interface LyricMatchContext {
  targetTitle?: string;
  targetArtist?: string;
  targetDurationSec?: number;
}

interface CandidateRankMetrics {
  titleTier: number;
  artistTier: number;
  versionTier: number;
  hasSynced: number;
  exactMmSs: number;
  durationDiffSec: number;
}

function evaluateCandidateMetrics(
  song: {
    trackName?: string;
    artistName?: string;
    duration?: number;
    syncedLyrics?: string | null;
  },
  ctx: LyricMatchContext
): CandidateRankMetrics {
  const targetParsed = parseTitleAndVersion(ctx.targetTitle);
  const candParsed = parseTitleAndVersion(song.trackName);

  // 1. Title tier (3: exact core/full title, 1: partial containment, 0: mismatch)
  let titleTier = 1;
  if (targetParsed.baseTitleNorm) {
    if (candParsed.baseTitleNorm && candParsed.baseTitleNorm === targetParsed.baseTitleNorm) {
      titleTier = 3;
    } else if (candParsed.fullTitleNorm && candParsed.fullTitleNorm === targetParsed.fullTitleNorm) {
      titleTier = 3;
    } else if (
      candParsed.baseTitleNorm &&
      (candParsed.baseTitleNorm.includes(targetParsed.baseTitleNorm) ||
        targetParsed.baseTitleNorm.includes(candParsed.baseTitleNorm))
    ) {
      titleTier = 1;
    } else {
      titleTier = 0;
    }
  }

  // 2. Artist tier (3: exact full or primary artist, 2: token containment, 0: mismatch)
  const rawTargetArtist = ctx.targetArtist ?? '';
  const normFullArtist = normalizeMatchToken(rawTargetArtist);
  const artistParts = rawTargetArtist
    .split(/[,&/]/)
    .map((p) => normalizeMatchToken(p))
    .filter((p) => p.length > 0);
  const normFirstArtist = artistParts[0] ?? normFullArtist;
  const candArtist = normalizeMatchToken(song.artistName);

  let artistTier = 1;
  if (normFullArtist) {
    if (candArtist && (candArtist === normFullArtist || candArtist === normFirstArtist)) {
      artistTier = 3;
    } else if (
      candArtist &&
      artistParts.some((part) => candArtist.includes(part) || part.includes(candArtist))
    ) {
      artistTier = 2;
    } else {
      artistTier = 0;
    }
  }

  // 3. Version tier (4: exact version / both studio original, 3: same canonical version tags, 2: remaster-only diff, 1: version mismatch, 0: unwanted instrumental)
  const targetIsInst = targetParsed.versionTags.includes('instrumental');
  const candIsInst = candParsed.versionTags.includes('instrumental');
  const targetTagKey = targetParsed.versionTags.join('|');
  const candTagKey = candParsed.versionTags.join('|');

  let versionTier = 3;
  if (!targetIsInst && candIsInst) {
    versionTier = 0;
  } else if (targetTagKey === candTagKey) {
    if (
      targetParsed.versionTags.length === 0 ||
      targetParsed.versionNorm === candParsed.versionNorm
    ) {
      versionTier = 4;
    } else {
      versionTier = 3;
    }
  } else {
    const nonRemasterTarget = targetParsed.versionTags.filter((t) => t !== 'remaster').join('|');
    const nonRemasterCand = candParsed.versionTags.filter((t) => t !== 'remaster').join('|');
    versionTier = nonRemasterTarget === nonRemasterCand ? 2 : 1;
  }

  // 4. Duration (exact MM:SS match first, then smallest second difference)
  const targetSec = ctx.targetDurationSec ?? 0;
  const candSec = typeof song.duration === 'number' && song.duration > 0 ? song.duration : 0;
  let exactMmSs = 0;
  let durationDiffSec = Number.POSITIVE_INFINITY;

  if (targetSec > 0 && candSec > 0) {
    const targetDisplay = formatDurationMs(targetSec * 1000);
    const candDisplay = formatDurationMs(Math.round(candSec) * 1000);
    const isSameMmSs =
      candDisplay === targetDisplay || Math.round(candSec) === Math.round(targetSec);
    exactMmSs = isSameMmSs ? 1 : 0;
    durationDiffSec = Math.abs(candSec - targetSec);
  }

  const hasSynced = song.syncedLyrics && song.syncedLyrics.trim().length > 0 ? 1 : 0;

  return {
    titleTier,
    artistTier,
    versionTier,
    hasSynced,
    exactMmSs,
    durationDiffSec,
  };
}

function compareCandidateMetrics(a: CandidateRankMetrics, b: CandidateRankMetrics): number {
  // Never pick an unwanted instrumental over a vocal track, or a completely different song title
  const aValidSong = a.titleTier > 0 && a.versionTier > 0 ? 1 : 0;
  const bValidSong = b.titleTier > 0 && b.versionTier > 0 ? 1 : 0;
  if (bValidSong !== aValidSong) return bValidSong - aValidSong;

  // Prefer synced lyrics over plain-only lyrics among valid candidates
  if (b.hasSynced !== a.hasSynced) return b.hasSynced - a.hasSynced;

  // Core user ranking order: 1. Title -> 2. Artist -> 3. Version -> 4. Exact MM:SS -> 5. Closest duration
  if (b.titleTier !== a.titleTier) return b.titleTier - a.titleTier;
  if (b.artistTier !== a.artistTier) return b.artistTier - a.artistTier;
  if (b.versionTier !== a.versionTier) return b.versionTier - a.versionTier;
  if (b.exactMmSs !== a.exactMmSs) return b.exactMmSs - a.exactMmSs;

  if (a.durationDiffSec !== b.durationDiffSec) {
    return a.durationDiffSec - b.durationDiffSec;
  }
  return 0;
}

export function normalizeLrcLibCandidates(
  items: LrcLibSongItem[],
  context?: LyricMatchContext
): LrcLibCandidate[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const entries: Array<{ candidate: LrcLibCandidate; metrics: CandidateRankMetrics | null }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const synced = item.syncedLyrics && item.syncedLyrics.trim().length > 0 ? item.syncedLyrics : null;
    const plain = item.plainLyrics && item.plainLyrics.trim().length > 0 ? item.plainLyrics : null;
    if (!synced && !plain) continue;

    const id = item.id !== undefined ? `lrclib-${item.id}` : `lrclib-idx-${i}-${item.trackName ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);

    entries.push({
      candidate: {
        id,
        trackName: item.trackName?.trim() || '제목 없음',
        artistName: item.artistName?.trim() || 'Unknown Artist',
        albumName: item.albumName?.trim() || '',
        durationSec: typeof item.duration === 'number' ? Math.round(item.duration) : 0,
        hasSynced: Boolean(synced),
        hasPlain: Boolean(plain),
        syncedLyrics: synced,
        plainLyrics: plain,
      },
      metrics: context ? evaluateCandidateMetrics(item, context) : null,
    });
  }

  entries.sort((a, b) => {
    if (a.metrics && b.metrics) {
      return compareCandidateMetrics(a.metrics, b.metrics);
    }
    return Number(b.candidate.hasSynced) - Number(a.candidate.hasSynced);
  });

  return entries.map((e) => e.candidate);
}

export function selectBestLyricsFromCandidates(
  songs: LrcLibSongItem[],
  queryStr: string,
  targetArtist: string,
  targetDurationSec: number,
  targetTitle?: string
): { type: 'synced' | 'plain'; text: string; selectedId?: string } | null {
  if (!Array.isArray(songs) || songs.length === 0) return null;

  const firstArtistOnly = targetArtist.split(',')[0].trim();
  const expectedArtist = normalizeMatchToken(firstArtistOnly);
  const normalizedQuery = normalizeMatchToken(queryStr);

  // Derive fallback title from queryStr when explicit targetTitle is omitted
  const inferredTitle =
    targetTitle !== undefined
      ? targetTitle
      : firstArtistOnly && queryStr.toLowerCase().endsWith(firstArtistOnly.toLowerCase())
        ? queryStr.slice(0, queryStr.length - firstArtistOnly.length).trim()
        : queryStr;

  const validSongs = songs.filter((song) => {
    const hasLyrics =
      Boolean(song.syncedLyrics && song.syncedLyrics.trim().length > 0) ||
      Boolean(song.plainLyrics && song.plainLyrics.trim().length > 0);
    if (!hasLyrics) return false;

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

  const ctx: LyricMatchContext = {
    targetTitle: inferredTitle,
    targetArtist,
    targetDurationSec,
  };

  const ranked = validSongs
    .map((song, idx) => ({
      song,
      idx,
      metrics: evaluateCandidateMetrics(song, ctx),
    }))
    .sort((a, b) => {
      const cmp = compareCandidateMetrics(a.metrics, b.metrics);
      return cmp !== 0 ? cmp : a.idx - b.idx;
    });

  const winner = ranked[0]?.song;
  if (!winner) return null;

  if (winner.syncedLyrics && winner.syncedLyrics.trim().length > 0) {
    return {
      type: 'synced',
      text: winner.syncedLyrics,
      selectedId: winner.id !== undefined ? `lrclib-${winner.id}` : undefined,
    };
  }

  if (winner.plainLyrics && winner.plainLyrics.trim().length > 0) {
    return {
      type: 'plain',
      text: winner.plainLyrics,
      selectedId: winner.id !== undefined ? `lrclib-${winner.id}` : undefined,
    };
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

export interface MarqueeMetrics {
  isOverflowing: boolean;
  slideOffsetPx: number;
  durationSec: number;
}

export function computeMarqueeMetrics(
  contentWidth: number,
  containerWidth: number,
  rightFadePx = 14
): MarqueeMetrics {
  if (
    !Number.isFinite(contentWidth) ||
    !Number.isFinite(containerWidth) ||
    containerWidth <= 0 ||
    contentWidth <= containerWidth + 1
  ) {
    return {
      isOverflowing: false,
      slideOffsetPx: 0,
      durationSec: 0,
    };
  }

  const safeRightFade = Math.max(0, Math.min(rightFadePx, containerWidth * 0.35));
  const rawOffset = Math.ceil(contentWidth - containerWidth + safeRightFade);
  const slideOffsetPx = Math.max(4, rawOffset);
  // Calm ping-pong reading pace (~26px/s travel + start/end dwell phases), clamped to [6.5s, 24s]
  const durationSec = Math.min(24, Math.max(6.5, Number((4.2 + slideOffsetPx / 24).toFixed(2))));

  return {
    isOverflowing: true,
    slideOffsetPx,
    durationSec,
  };
}


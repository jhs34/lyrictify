import { SpotifyCredentials, UISettings, NumericSettingKey } from '../types/lyrics';
import { DEFAULT_UI_SETTINGS, SETTING_CONSTRAINTS, clampSettingValue } from './lyrics';

export function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage restricted (e.g. private iframe mode)
  }
}

const STORAGE_KEY_MAP: Record<NumericSettingKey, string> = {
  syncOffset: 'sp_sync-offset',
  fontSize: 'sp_font-size',
  vertPos: 'sp_vert-pos',
  blurAmount: 'sp_blur-amount',
  animSpeed: 'sp_anim-speed',
  waveDelay: 'sp_wave-delay',
  plainSpeed: 'sp_plain-speed',
  lineHeight: 'sp_line-height',
  margin: 'sp_margin',
  uiScale: 'sp_ui-scale',
};

export function loadStoredCredentials(): SpotifyCredentials {
  return {
    clientId: safeGetItem('sp_client_id') ?? '',
    clientSecret: safeGetItem('sp_client_secret') ?? '',
    refreshToken: safeGetItem('sp_refresh_token') ?? '',
  };
}

export function saveStoredCredentials(creds: SpotifyCredentials): void {
  safeSetItem('sp_client_id', creds.clientId.trim());
  safeSetItem('sp_client_secret', creds.clientSecret.trim());
  safeSetItem('sp_refresh_token', creds.refreshToken.trim());
}

export function clearStoredCredentials(): void {
  try {
    window.localStorage.removeItem('sp_client_id');
    window.localStorage.removeItem('sp_client_secret');
    window.localStorage.removeItem('sp_refresh_token');
  } catch {
    // Storage restricted
  }
}

export function loadStoredUISettings(): UISettings {
  const numericEntries = (Object.keys(STORAGE_KEY_MAP) as NumericSettingKey[]).reduce(
    (acc, key) => {
      const raw = safeGetItem(STORAGE_KEY_MAP[key]);
      const parsed = raw !== null && raw !== '' ? Number(raw) : DEFAULT_UI_SETTINGS[key];
      const { min, max } = SETTING_CONSTRAINTS[key];
      acc[key] = clampSettingValue(parsed, min, max, DEFAULT_UI_SETTINGS[key]);
      return acc;
    },
    {} as Record<NumericSettingKey, number>
  );

  return {
    ...numericEntries,
    keepAwake: safeGetItem('sp_keep_awake') === 'true',
    hideControls: safeGetItem('sp_hide_controls') === 'true',
  };
}

export function saveNumericSetting(key: NumericSettingKey, value: number): void {
  safeSetItem(STORAGE_KEY_MAP[key], String(value));
}

export function saveBooleanSetting(key: 'keepAwake' | 'hideControls', value: boolean): void {
  const storageKey = key === 'keepAwake' ? 'sp_keep_awake' : 'sp_hide_controls';
  safeSetItem(storageKey, String(value));
}

export function saveAllUISettings(settings: UISettings): void {
  (Object.keys(STORAGE_KEY_MAP) as NumericSettingKey[]).forEach((key) => {
    saveNumericSetting(key, settings[key]);
  });
  saveBooleanSetting('keepAwake', settings.keepAwake);
  saveBooleanSetting('hideControls', settings.hideControls);
}

export function applySettingsToDocumentCss(settings: UISettings): void {
  const root = document.documentElement;
  root.style.setProperty('--lyric-base-size', `${settings.fontSize}px`);
  root.style.setProperty('--lyric-anim-duration', `${settings.animSpeed}s`);
  root.style.setProperty('--lyric-line-height', `${settings.lineHeight}`);
  root.style.setProperty('--lyric-margin-bottom', `${settings.margin}rem`);
  root.style.setProperty('--ui-scale', `${settings.uiScale}`);
  root.style.setProperty('--lyric-tracking', settings.fontSize >= 40 ? '-0.02em' : '0em');
}

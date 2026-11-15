import { BooleanSettingKey, NumericSettingKey, SpotifyCredentials, UISettings } from '../types/lyrics';
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

export function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage restricted
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

const BOOLEAN_STORAGE_KEY_MAP: Record<BooleanSettingKey, string> = {
  keepAwake: 'sp_keep_awake',
  hideControls: 'sp_hide_controls',
  ambientLight: 'sp_ambient_light_v2',
  autoHideHud: 'sp_auto_hide_hud_v2',
  splitLayout: 'sp_split_layout_v2',
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
  safeRemoveItem('sp_client_id');
  safeRemoveItem('sp_client_secret');
  safeRemoveItem('sp_refresh_token');
}

export interface StoredPkceSession {
  clientId: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
}

export function savePkceSession(session: StoredPkceSession): void {
  safeSetItem('sp_pkce_session', JSON.stringify(session));
}

export function loadPkceSession(): StoredPkceSession | null {
  const raw = safeGetItem('sp_pkce_session');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPkceSession>;
    if (parsed.clientId && parsed.codeVerifier && parsed.state && parsed.redirectUri) {
      return {
        clientId: parsed.clientId,
        codeVerifier: parsed.codeVerifier,
        state: parsed.state,
        redirectUri: parsed.redirectUri,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPkceSession(): void {
  safeRemoveItem('sp_pkce_session');
  safeRemoveItem('sp_pkce_pending_callback');
}

export function consumePendingPkceCallback(): {
  code: string;
  state: string;
  error: string;
} | null {
  const raw = safeGetItem('sp_pkce_pending_callback');
  if (!raw) return null;
  safeRemoveItem('sp_pkce_pending_callback');
  try {
    const parsed = JSON.parse(raw) as { code?: string; state?: string; error?: string };
    return {
      code: parsed.code ?? '',
      state: parsed.state ?? '',
      error: parsed.error ?? '',
    };
  } catch {
    return null;
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

  const booleanEntries = (Object.keys(BOOLEAN_STORAGE_KEY_MAP) as BooleanSettingKey[]).reduce(
    (acc, key) => {
      const raw = safeGetItem(BOOLEAN_STORAGE_KEY_MAP[key]);
      acc[key] = raw !== null ? raw === 'true' : DEFAULT_UI_SETTINGS[key];
      return acc;
    },
    {} as Record<BooleanSettingKey, boolean>
  );

  return {
    ...numericEntries,
    ...booleanEntries,
  };
}

export function saveNumericSetting(key: NumericSettingKey, value: number): void {
  safeSetItem(STORAGE_KEY_MAP[key], String(value));
}

export function saveBooleanSetting(key: BooleanSettingKey, value: boolean): void {
  safeSetItem(BOOLEAN_STORAGE_KEY_MAP[key], String(value));
}

export function saveAllUISettings(settings: UISettings): void {
  (Object.keys(STORAGE_KEY_MAP) as NumericSettingKey[]).forEach((key) => {
    saveNumericSetting(key, settings[key]);
  });
  (Object.keys(BOOLEAN_STORAGE_KEY_MAP) as BooleanSettingKey[]).forEach((key) => {
    saveBooleanSetting(key, settings[key]);
  });
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

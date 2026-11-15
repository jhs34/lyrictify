import { useEffect, useLayoutEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  BooleanSettingKey,
  NumericSettingKey,
  PresetId,
  SettingsTab,
  SpotifyCredentials,
  UISettings,
  ViewerStatus,
} from '../types/lyrics';
import {
  DEFAULT_UI_SETTINGS,
  SETTING_CONSTRAINTS,
  UI_PRESETS,
  clampSettingValue,
  detectActivePreset,
  parsePastedCredentials,
} from '../utils/lyrics';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab: SettingsTab;
  viewerStatus: ViewerStatus;
  isPreviewMode: boolean;
  credentials: SpotifyCredentials;
  settings: UISettings;
  isTransparentDrag: boolean;
  validationError: string | null;
  onClose: () => void;
  onSaveAndConnect: (creds: SpotifyCredentials) => void;
  onDisconnectSpotify: () => void;
  onStartPreview: () => void;
  onApplyPreset: (presetId: PresetId) => void;
  onStepSyncOffset: (deltaMs: number) => void;
  onUpdateNumericSetting: (key: NumericSettingKey, value: number) => void;
  onUpdateBooleanSetting: (key: BooleanSettingKey, value: boolean) => void;
  onResetSingleSetting: (key: keyof UISettings) => void;
  onResetDefaults: () => void;
  onSliderDragStart: (key: NumericSettingKey) => void;
  onSliderDragEnd: () => void;
  onClearValidationError: () => void;
}

const CORE_SLIDERS: NumericSettingKey[] = ['fontSize', 'blurAmount'];

const ADVANCED_SLIDERS: NumericSettingKey[] = [
  'vertPos',
  'lineHeight',
  'margin',
  'animSpeed',
  'waveDelay',
  'uiScale',
  'plainSpeed',
  'syncOffset',
];

const BOOLEAN_SWITCHES: Array<{ key: BooleanSettingKey; label: string }> = [
  { key: 'ambientLight', label: '앰비언트 라이트' },
  { key: 'keepAwake', label: '화면 꺼짐 방지' },
  { key: 'hideControls', label: '재생 컨트롤러 숨기기' },
];

const SYNC_STEPS: Array<{ label: string; deltaMs: number | 'reset' }> = [
  { label: '-0.5s', deltaMs: -500 },
  { label: '-0.1s', deltaMs: -100 },
  { label: '0ms', deltaMs: 'reset' },
  { label: '+0.1s', deltaMs: 100 },
  { label: '+0.5s', deltaMs: 500 },
];

interface DraftNumberInputProps {
  id: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (next: number) => void;
}

function DraftNumberInput({
  id,
  ariaLabel,
  value,
  min,
  max,
  step,
  onCommit,
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '-') {
      setDraft(String(value));
      return;
    }
    const next = clampSettingValue(Number(trimmed), min, max, value);
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <input
      id={id}
      type="number"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={isFocused ? draft : String(value)}
      onFocus={() => {
        setDraft(String(value));
        setIsFocused(true);
      }}
      onBlur={() => {
        setIsFocused(false);
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      onChange={(e) => setDraft(e.target.value)}
      className="no-spinner font-mono-tech w-16 h-8 px-2 bg-[var(--bg-deepest)] border border-[var(--border-hairline)] rounded-[6px] text-right text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none shrink-0 hide-on-drag transition-colors duration-150"
    />
  );
}

interface SliderRowProps {
  settingKey: NumericSettingKey;
  value: number;
  onUpdate: (key: NumericSettingKey, value: number) => void;
  onResetSingle: (key: keyof UISettings) => void;
  onDragStart: (key: NumericSettingKey) => void;
}

function SliderSettingRow({
  settingKey,
  value,
  onUpdate,
  onResetSingle,
  onDragStart,
}: SliderRowProps) {
  const constraint = SETTING_CONSTRAINTS[settingKey];
  const defaultVal = DEFAULT_UI_SETTINGS[settingKey];
  const isModified = value !== defaultVal;
  const sliderId = `slider-${settingKey}`;
  const numId = `num-${settingKey}`;
  const isSyncOffset = settingKey === 'syncOffset';

  return (
    <div className="flex items-center gap-3 h-9">
      <label
        htmlFor={sliderId}
        onDoubleClick={() => onResetSingle(settingKey)}
        title={`더블클릭하여 기본값(${defaultVal}${constraint.unit ?? ''})으로 복원`}
        className={`w-28 sm:w-32 text-sm shrink-0 hide-on-drag flex items-baseline justify-between pr-1 select-none cursor-pointer transition-colors duration-150 ${
          isModified ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>{constraint.label}</span>
          {isModified && (
            <span
              aria-hidden="true"
              className="w-1 h-1 rounded-[1px] bg-[var(--accent)] shrink-0"
            />
          )}
        </span>
        {constraint.unit && (
          <span className="font-mono-tech text-[11px] text-[var(--text-muted)]">
            {constraint.unit}
          </span>
        )}
      </label>

      <div className="relative flex-1 flex items-center">
        {isSyncOffset && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-[1px] h-3 bg-[var(--border-strong)]"
          />
        )}
        <input
          id={sliderId}
          type="range"
          min={constraint.min}
          max={constraint.max}
          step={constraint.step}
          value={value}
          onMouseDown={() => onDragStart(settingKey)}
          onTouchStart={() => onDragStart(settingKey)}
          onChange={(e) => {
            const next = clampSettingValue(
              Number(e.target.value),
              constraint.min,
              constraint.max,
              value
            );
            onUpdate(settingKey, next);
          }}
          className="lyrictify-range w-full h-8 relative z-10"
        />
      </div>

      <DraftNumberInput
        id={numId}
        ariaLabel={`${constraint.label} 수치 입력`}
        value={value}
        min={constraint.min}
        max={constraint.max}
        step={constraint.step}
        onCommit={(next) => onUpdate(settingKey, next)}
      />
    </div>
  );
}

interface BooleanRowProps {
  settingKey: BooleanSettingKey;
  label: string;
  checked: boolean;
  onToggle: (key: BooleanSettingKey, next: boolean) => void;
  onResetSingle: (key: keyof UISettings) => void;
}

function BooleanSettingRow({
  settingKey,
  label,
  checked,
  onToggle,
  onResetSingle,
}: BooleanRowProps) {
  const defaultVal = DEFAULT_UI_SETTINGS[settingKey];
  const isModified = checked !== defaultVal;
  const labelId = `label-${settingKey}`;
  const inputId = `input-${settingKey}`;

  return (
    <div className="flex items-center justify-between h-9">
      <span
        id={labelId}
        onDoubleClick={() => onResetSingle(settingKey)}
        title={`더블클릭하여 기본값(${defaultVal ? '켜짐' : '꺼짐'})으로 복원`}
        className={`text-sm select-none cursor-pointer inline-flex items-center gap-1.5 transition-colors duration-150 ${
          isModified ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
        }`}
      >
        <span>{label}</span>
        {isModified && (
          <span aria-hidden="true" className="w-1 h-1 rounded-[1px] bg-[var(--accent)] shrink-0" />
        )}
      </span>

      <label className="relative inline-flex items-center cursor-pointer">
        <input
          id={inputId}
          type="checkbox"
          aria-labelledby={labelId}
          checked={checked}
          onChange={(e) => onToggle(settingKey, e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-[var(--bg-raised)] border border-[var(--border-hairline)] rounded-[6px] peer peer-checked:bg-[var(--accent)] peer-checked:border-transparent peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--text-primary)] transition-colors duration-150 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-primary)] peer-checked:after:bg-[var(--bg-deepest)] after:rounded-[4px] after:h-4 after:w-4 after:transition-transform after:duration-150 peer-checked:after:translate-x-5" />
      </label>
    </div>
  );
}

export function SettingsModal({
  isOpen,
  initialTab,
  viewerStatus,
  isPreviewMode,
  credentials,
  settings,
  isTransparentDrag,
  validationError,
  onClose,
  onSaveAndConnect,
  onDisconnectSpotify,
  onStartPreview,
  onApplyPreset,
  onStepSyncOffset,
  onUpdateNumericSetting,
  onUpdateBooleanSetting,
  onResetSingleSetting,
  onResetDefaults,
  onSliderDragStart,
  onSliderDragEnd,
  onClearValidationError,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [clientId, setClientId] = useState(credentials.clientId);
  const [clientSecret, setClientSecret] = useState(credentials.clientSecret);
  const [refreshToken, setRefreshToken] = useState(credentials.refreshToken);

  const [showSecret, setShowSecret] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setPasteNotice(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setClientId(credentials.clientId);
    setClientSecret(credentials.clientSecret);
    setRefreshToken(credentials.refreshToken);
  }, [credentials, isOpen]);

  useEffect(() => {
    if (validationError) {
      setActiveTab('spotify');
    }
  }, [validationError]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isTransparentDrag) return;
    const handleRelease = () => {
      onSliderDragEnd();
    };
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchend', handleRelease);
    window.addEventListener('touchcancel', handleRelease);
    return () => {
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('touchend', handleRelease);
      window.removeEventListener('touchcancel', handleRelease);
    };
  }, [isTransparentDrag, onSliderDragEnd]);

  if (!isOpen) return null;

  const isSpotifyConnected =
    !isPreviewMode &&
    (viewerStatus === 'lyrics_ready' ||
      viewerStatus === 'searching_lyrics' ||
      viewerStatus === 'lyrics_not_found' ||
      viewerStatus === 'spotify_idle');
  const isSpotifyConnecting = viewerStatus === 'connecting';
  const hasSavedCreds = Boolean(
    credentials.clientId || credentials.clientSecret || credentials.refreshToken
  );

  const activePreset = detectActivePreset(settings);
  const isSyncModified = settings.syncOffset !== DEFAULT_UI_SETTINGS.syncOffset;

  const handleSmartPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text');
    const parsed = parsePastedCredentials(raw);
    if (!parsed) return;

    e.preventDefault();
    if (parsed.clientId) setClientId(parsed.clientId);
    if (parsed.clientSecret) setClientSecret(parsed.clientSecret);
    if (parsed.refreshToken) setRefreshToken(parsed.refreshToken);
    if (validationError) onClearValidationError();
    setPasteNotice('클립보드에서 인증 항목을 자동으로 채웠습니다');
  };

  const handleSpotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasteNotice(null);
    onSaveAndConnect({
      clientId,
      clientSecret,
      refreshToken,
    });
  };

  const handleClearCredentials = () => {
    setClientId('');
    setClientSecret('');
    setRefreshToken('');
    setPasteNotice(null);
    onClearValidationError();
    onDisconnectSpotify();
  };

  const connectionLabel = isSpotifyConnecting
    ? 'Spotify 연결 중'
    : isSpotifyConnected
      ? 'Spotify 연결됨'
      : viewerStatus === 'auth_error'
        ? '인증 확인 필요'
        : isPreviewMode
          ? '미리보기 체험 중'
          : '연결 안 됨';

  const statusDotClass = isSpotifyConnected
    ? 'bg-[var(--accent)]'
    : viewerStatus === 'auth_error'
      ? 'bg-[var(--danger)]'
      : 'bg-[var(--text-muted)]';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isTransparentDrag) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-50 flex justify-center items-center p-4 transition-colors duration-200 ${
        isTransparentDrag ? 'bg-transparent' : 'bg-black/65'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className={`surface-modal w-full max-w-[460px] rounded-2xl max-h-[88vh] flex flex-col overflow-hidden ${
          isTransparentDrag ? 'transparent-mode' : ''
        }`}
      >
        <h2 id="settings-modal-title" className="sr-only">
          설정
        </h2>

        {/* Pinned Segmented Tab Header: 56px height */}
        <div
          className={`flex items-center justify-between px-5 h-14 shrink-0 hide-on-drag border-b transition-colors duration-200 ${
            isTransparentDrag ? 'border-transparent' : 'border-[var(--border-hairline)]'
          }`}
        >
          <div
            role="tablist"
            aria-label="설정 카테고리"
            className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-deepest)] border border-[var(--border-hairline)]"
          >
            <button
              type="button"
              role="tab"
              id="tab-display"
              aria-selected={activeTab === 'display'}
              aria-controls="panel-display"
              onClick={() => setActiveTab('display')}
              className={`h-7 px-3 rounded-[6px] text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                activeTab === 'display'
                  ? 'bg-[var(--bg-raised)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              화면 · 싱크
            </button>
            <button
              type="button"
              role="tab"
              id="tab-spotify"
              aria-selected={activeTab === 'spotify'}
              aria-controls="panel-spotify"
              onClick={() => setActiveTab('spotify')}
              className={`h-7 px-3 rounded-[6px] text-xs font-medium flex items-center gap-2 transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                activeTab === 'spotify'
                  ? 'bg-[var(--bg-raised)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-[2px] ${statusDotClass}`} />
              <span>Spotify 연결</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            title="닫기 (Esc)"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 cursor-pointer"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* TAB 1: 화면 · 싱크 */}
        {activeTab === 'display' ? (
          <div
            id="panel-display"
            role="tabpanel"
            aria-labelledby="tab-display"
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto">
              {/* 1. One-Tap View Presets */}
              <section className="space-y-2 hide-on-drag" aria-label="빠른 화면 프리셋">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    빠른 프리셋
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    항목 이름 더블클릭 시 개별 초기화
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {UI_PRESETS.map((preset) => {
                    const isSelected = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onApplyPreset(preset.id)}
                        className={`rounded-lg p-2.5 text-left border transition-colors duration-150 active:scale-[0.98] cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--bg-raised)] border-[var(--accent)]/60 text-[var(--text-primary)]'
                            : 'bg-[var(--bg-deepest)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="text-xs font-medium leading-4">{preset.label}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-4 truncate">
                          {preset.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 2. Effortless Sync Stepper */}
              <section className="space-y-2 hide-on-drag" aria-label="가사 싱크 빠른 조절">
                <div className="flex items-center justify-between">
                  <span
                    onDoubleClick={() => onResetSingleSetting('syncOffset')}
                    title="더블클릭하여 기본값(0ms)으로 복원"
                    className={`text-xs font-medium select-none cursor-pointer inline-flex items-center gap-1.5 transition-colors duration-150 ${
                      isSyncModified ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <span>가사 싱크</span>
                    {isSyncModified && (
                      <span
                        aria-hidden="true"
                        className="w-1 h-1 rounded-[1px] bg-[var(--accent)] shrink-0"
                      />
                    )}
                  </span>
                  <span className="text-xs text-[var(--accent)] flex items-center gap-1.5">
                    <span className="font-mono-tech">
                      {settings.syncOffset > 0
                        ? `+${settings.syncOffset}ms`
                        : `${settings.syncOffset}ms`}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {settings.syncOffset === 0
                        ? '· 정각'
                        : settings.syncOffset > 0
                          ? `· ${(settings.syncOffset / 1000).toFixed(settings.syncOffset % 100 === 0 ? 1 : 2)}초 빠르게`
                          : `· ${(Math.abs(settings.syncOffset) / 1000).toFixed(settings.syncOffset % 100 === 0 ? 1 : 2)}초 느리게`}
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {SYNC_STEPS.map((item) => {
                    const isReset = item.deltaMs === 'reset';
                    const isZeroDisabled = isReset && settings.syncOffset === 0;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        disabled={isZeroDisabled}
                        onClick={() => {
                          if (item.deltaMs === 'reset') {
                            onResetSingleSetting('syncOffset');
                          } else {
                            onStepSyncOffset(item.deltaMs);
                          }
                        }}
                        aria-label={
                          isReset ? '가사 싱크 0ms 초기화' : `가사 싱크 ${item.label} 조절`
                        }
                        className="h-8 rounded-lg bg-[var(--bg-deepest)] border border-[var(--border-hairline)] font-mono-tech text-xs text-[var(--text-primary)] hover:bg-[var(--bg-raised)] hover:border-[var(--border-strong)] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none transition-[background-color,border-color,transform] duration-150 cursor-pointer"
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-[var(--text-muted)] leading-4">
                  가사가 늦게 나오면 +, 너무 일찍 나오면 - (단축키 [ · ] 지원)
                </p>
              </section>

              {/* 3. Core Live-Preview Sliders */}
              <section
                className={`pt-3.5 border-t space-y-1.5 transition-colors duration-200 ${
                  isTransparentDrag ? 'border-transparent' : 'border-[var(--border-hairline)]'
                }`}
                aria-label="글자 및 블러 설정"
              >
                {CORE_SLIDERS.map((key) => (
                  <SliderSettingRow
                    key={key}
                    settingKey={key}
                    value={settings[key]}
                    onUpdate={onUpdateNumericSetting}
                    onResetSingle={onResetSingleSetting}
                    onDragStart={onSliderDragStart}
                  />
                ))}
              </section>

              {/* 4. Core Switches (Ambient Light, Keep Awake, Hide Controls) */}
              <section
                className="pt-3 border-t border-[var(--border-hairline)] space-y-0.5 hide-on-drag"
                aria-label="배경 조명 및 화면 표시"
              >
                {BOOLEAN_SWITCHES.map((item) => (
                  <BooleanSettingRow
                    key={item.key}
                    settingKey={item.key}
                    label={item.label}
                    checked={settings[item.key]}
                    onToggle={onUpdateBooleanSetting}
                    onResetSingle={onResetSingleSetting}
                  />
                ))}
              </section>

              {/* 5. Collapsible Advanced Motion & Spacing */}
              <section
                className={`pt-2 border-t transition-colors duration-200 ${
                  isTransparentDrag ? 'border-transparent' : 'border-[var(--border-hairline)]'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={showAdvanced}
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="w-full h-9 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hide-on-drag cursor-pointer"
                >
                  <span>세부 모션 · 간격 설정</span>
                  {showAdvanced ? (
                    <ChevronUp size={16} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                  ) : (
                    <ChevronDown size={16} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="space-y-2 pt-2">
                    {ADVANCED_SLIDERS.map((key) => (
                      <SliderSettingRow
                        key={key}
                        settingKey={key}
                        value={settings[key]}
                        onUpdate={onUpdateNumericSetting}
                        onResetSingle={onResetSingleSetting}
                        onDragStart={onSliderDragStart}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Pinned Display Footer */}
            <div
              className={`px-5 py-3.5 border-t shrink-0 flex items-center justify-between gap-2 hide-on-drag transition-colors duration-200 ${
                isTransparentDrag
                  ? 'border-transparent bg-transparent'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-deepest)]/50'
              }`}
            >
              <button
                type="button"
                onClick={onResetDefaults}
                className="h-9 px-3.5 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#2c2c2f] text-xs font-normal flex items-center gap-1.5 active:scale-[0.97] transition-[background-color,color,transform] duration-150 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw size={14} strokeWidth={1.5} />
                <span>기본값 복원</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="h-9 px-5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-deepest)] font-medium text-sm hover:opacity-90 active:scale-[0.97] transition-[opacity,transform] duration-150 cursor-pointer whitespace-nowrap"
              >
                완료
              </button>
            </div>
          </div>
        ) : (
          /* TAB 2: Spotify 연결 */
          <form
            id="panel-spotify"
            role="tabpanel"
            aria-labelledby="tab-spotify"
            onSubmit={handleSpotifySubmit}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-5 py-5 space-y-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span aria-hidden="true" className={`w-2 h-2 rounded-[2px] ${statusDotClass}`} />
                  <span>상태 · {connectionLabel}</span>
                </div>

                <button
                  type="button"
                  aria-expanded={showGuide}
                  onClick={() => setShowGuide((prev) => !prev)}
                  className="h-8 px-3 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 active:scale-[0.97] transition-[color,transform] duration-150 cursor-pointer whitespace-nowrap"
                >
                  <span>토큰 발급 안내</span>
                  {showGuide ? (
                    <ChevronUp size={15} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                  ) : (
                    <ChevronDown size={15} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                  )}
                </button>
              </div>

              {showGuide && (
                <div className="rounded-lg bg-[var(--bg-deepest)] border border-[var(--border-hairline)] p-3 text-xs text-[var(--text-secondary)] space-y-2 leading-5">
                  <p className="font-medium text-[var(--text-primary)]">Spotify API 연동 순서</p>
                  <p>
                    1. Spotify Developer Dashboard에서 앱을 만든 뒤 Client ID와 Client Secret 확인
                  </p>
                  <p>
                    2. 권한 스코프{' '}
                    <code className="font-mono-tech text-[var(--text-primary)]">
                      user-read-currently-playing
                    </code>
                    ,{' '}
                    <code className="font-mono-tech text-[var(--text-primary)]">
                      user-read-playback-state
                    </code>
                    ,{' '}
                    <code className="font-mono-tech text-[var(--text-primary)]">
                      user-modify-playback-state
                    </code>
                    로 Refresh Token 발급
                  </p>
                  <p className="text-[var(--text-muted)]">
                    JSON이나 .env 형식을 복사해 입력칸에 붙여넣으면 세 항목이 한 번에 채워집니다
                  </p>
                </div>
              )}

              {(validationError || viewerStatus === 'auth_error') && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg bg-[#e5484d]/10 border border-[#e5484d]/30 p-3 text-xs text-[#f5b6b8]"
                >
                  <AlertCircle size={16} strokeWidth={1.5} className="text-[#e5484d] shrink-0" />
                  <span>
                    {validationError ??
                      'Spotify 인증에 실패했습니다. 입력한 키와 토큰 값을 다시 확인해주세요'}
                  </span>
                </div>
              )}

              {pasteNotice && !validationError && (
                <div
                  role="status"
                  className="rounded-lg bg-[var(--bg-deepest)] border border-[var(--accent)]/40 px-3 py-2 text-xs text-[var(--accent)]"
                >
                  {pasteNotice}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="input-client-id"
                    className="block text-xs font-normal text-[var(--text-secondary)] mb-1"
                  >
                    Client ID
                  </label>
                  <input
                    id="input-client-id"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={clientId}
                    onPaste={handleSmartPaste}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      if (validationError) onClearValidationError();
                    }}
                    placeholder="32자리 영문·숫자 (일괄 붙여넣기 지원)"
                    className="w-full h-9 px-3 bg-[var(--bg-deepest)] border border-[var(--border-hairline)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors duration-150"
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-client-secret"
                    className="block text-xs font-normal text-[var(--text-secondary)] mb-1"
                  >
                    Client Secret
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="input-client-secret"
                      type={showSecret ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={clientSecret}
                      onPaste={handleSmartPaste}
                      onChange={(e) => {
                        setClientSecret(e.target.value);
                        if (validationError) onClearValidationError();
                      }}
                      placeholder="시크릿 키"
                      className="w-full h-9 pl-3 pr-9 bg-[var(--bg-deepest)] border border-[var(--border-hairline)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((prev) => !prev)}
                      aria-label={showSecret ? 'Client Secret 숨기기' : 'Client Secret 표시'}
                      className="absolute right-1 w-7 h-7 rounded-[6px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showSecret ? (
                        <EyeOff size={15} strokeWidth={1.5} />
                      ) : (
                        <Eye size={15} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="input-refresh-token"
                    className="block text-xs font-normal text-[var(--text-secondary)] mb-1"
                  >
                    Refresh Token
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="input-refresh-token"
                      type={showRefreshToken ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={refreshToken}
                      onPaste={handleSmartPaste}
                      onChange={(e) => {
                        setRefreshToken(e.target.value);
                        if (validationError) onClearValidationError();
                      }}
                      placeholder="발급받은 리프레시 토큰"
                      className="w-full h-9 pl-3 pr-9 bg-[var(--bg-deepest)] border border-[var(--border-hairline)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRefreshToken((prev) => !prev)}
                      aria-label={showRefreshToken ? 'Refresh Token 숨기기' : 'Refresh Token 표시'}
                      className="absolute right-1 w-7 h-7 rounded-[6px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showRefreshToken ? (
                        <EyeOff size={15} strokeWidth={1.5} />
                      ) : (
                        <Eye size={15} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  인증 정보는 현재 브라우저 로컬 스토리지에만 보관됩니다
                </span>
                {hasSavedCreds && (
                  <button
                    type="button"
                    onClick={handleClearCredentials}
                    className="h-7 px-2.5 rounded-[6px] text-xs text-[var(--text-muted)] hover:text-[#f5b6b8] hover:bg-[#e5484d]/10 flex items-center gap-1 transition-colors duration-150 cursor-pointer shrink-0"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                    <span>연결 해제</span>
                  </button>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--border-hairline)] bg-[var(--bg-deepest)]/50 shrink-0 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onStartPreview}
                className="h-9 px-4 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-normal text-sm hover:bg-[#2c2c2f] active:scale-[0.97] transition-[background-color,transform] duration-150 cursor-pointer whitespace-nowrap"
              >
                UI 미리보기
              </button>
              <button
                type="submit"
                disabled={isSpotifyConnecting}
                className="h-9 px-4 rounded-lg bg-[var(--text-primary)] text-[var(--bg-deepest)] font-medium text-sm hover:opacity-90 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none transition-[opacity,transform] duration-150 cursor-pointer whitespace-nowrap"
              >
                {isSpotifyConnecting ? '연결 중...' : '저장 및 연결'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

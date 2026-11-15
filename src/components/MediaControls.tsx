import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, Rewind } from 'lucide-react';
import {
  computeTrackProgressMs,
  formatCompactTimeMs,
  formatRemainingTimeMs,
} from '../utils/lyrics';

export interface MediaControlsProps {
  variant: 'split' | 'header' | 'landscape-dock';
  visible: boolean;
  hiddenBySetting: boolean;
  isIdleHidden: boolean;
  isPlaying: boolean;
  isPreviewMode: boolean;
  durationMs: number;
  progressAnchorMs: number;
  anchorTimestamp: number;
  onSeek: (positionMs: number) => void;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
}

export function MediaControls({
  variant,
  visible,
  hiddenBySetting,
  isIdleHidden,
  isPlaying,
  isPreviewMode,
  durationMs,
  progressAnchorMs,
  anchorTimestamp,
  onSeek,
  onPrevious,
  onPlayPause,
  onNext,
}: MediaControlsProps) {
  const safeDurationMs = Math.max(durationMs, 1000);
  const effectiveInteractive = visible && !isIdleHidden && !hiddenBySetting;

  const [displayTimeMs, setDisplayTimeMs] = useState<number>(0);
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [isPointerScrubbing, setIsPointerScrubbing] = useState<boolean>(false);

  const rangeRef = useRef<HTMLInputElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbCarrierRef = useRef<HTMLDivElement | null>(null);
  const fillAnimRef = useRef<Animation | null>(null);
  const thumbAnimRef = useRef<Animation | null>(null);
  const lastDisplayBucketRef = useRef<number>(-1);

  const cancelCompositorAnimations = useCallback(() => {
    if (fillAnimRef.current) {
      fillAnimRef.current.onfinish = null;
      fillAnimRef.current.cancel();
      fillAnimRef.current = null;
    }
    if (thumbAnimRef.current) {
      thumbAnimRef.current.onfinish = null;
      thumbAnimRef.current.cancel();
      thumbAnimRef.current = null;
    }
  }, []);

  const applyStaticProgressTransforms = useCallback((ms: number, maxMs: number) => {
    const clamped = Math.min(maxMs, Math.max(0, ms));
    const ratio = Math.min(1, Math.max(0, clamped / maxMs));
    const pct = ratio * 100;

    if (fillRef.current) {
      fillRef.current.style.transform = `translate3d(${((ratio - 1) * 100).toFixed(5)}%, 0, 0)`;
    }
    if (thumbCarrierRef.current) {
      thumbCarrierRef.current.style.transform = `translate3d(${pct.toFixed(5)}%, 0, 0)`;
    }
    if (rangeRef.current) {
      rangeRef.current.style.setProperty('--seek-pct', `${pct.toFixed(4)}%`);
      rangeRef.current.value = String(Math.round(clamped));
      rangeRef.current.setAttribute('aria-valuenow', String(Math.round(clamped)));
    }
  }, []);

  // Launch hardware GPU-composited Web Animations API linear translate3d glide (zero integer-pixel snapping, zero main-thread stutter)
  useLayoutEffect(() => {
    if (variant === 'landscape-dock' || !visible || hiddenBySetting) {
      cancelCompositorAnimations();
      return;
    }

    cancelCompositorAnimations();

    if (isPointerScrubbing && scrubMs !== null) {
      applyStaticProgressTransforms(scrubMs, safeDurationMs);
      return;
    }

    const startCompositorGlide = (fromMs: number) => {
      cancelCompositorAnimations();
      const clampedStart = Math.min(safeDurationMs, Math.max(0, fromMs));
      applyStaticProgressTransforms(clampedStart, safeDurationMs);

      if (!isPlaying || !fillRef.current || !thumbCarrierRef.current) {
        return;
      }

      const startRatio = Math.min(1, Math.max(0, clampedStart / safeDurationMs));
      const remainingMs = Math.max(16, safeDurationMs - clampedStart);

      if (typeof fillRef.current.animate === 'function') {
        const fillAnim = fillRef.current.animate(
          [
            { transform: `translate3d(${((startRatio - 1) * 100).toFixed(5)}%, 0, 0)` },
            { transform: 'translate3d(0%, 0, 0)' },
          ],
          {
            duration: remainingMs,
            easing: 'linear',
            fill: 'forwards',
          }
        );

        const thumbAnim = thumbCarrierRef.current.animate(
          [
            { transform: `translate3d(${(startRatio * 100).toFixed(5)}%, 0, 0)` },
            { transform: 'translate3d(100%, 0, 0)' },
          ],
          {
            duration: remainingMs,
            easing: 'linear',
            fill: 'forwards',
          }
        );

        if (isPreviewMode) {
          fillAnim.onfinish = () => {
            startCompositorGlide(0);
          };
        }

        fillAnimRef.current = fillAnim;
        thumbAnimRef.current = thumbAnim;
      }
    };

    const now = performance.now();
    const currentMs = computeTrackProgressMs(
      progressAnchorMs,
      anchorTimestamp,
      now,
      isPlaying,
      isPreviewMode
    );
    startCompositorGlide(currentMs);

    return () => {
      cancelCompositorAnimations();
    };
  }, [
    variant,
    visible,
    hiddenBySetting,
    isPlaying,
    isPreviewMode,
    progressAnchorMs,
    anchorTimestamp,
    safeDurationMs,
    isPointerScrubbing,
    scrubMs,
    applyStaticProgressTransforms,
    cancelCompositorAnimations,
  ]);

  // Lightweight timestamp & ARIA synchronization (1Hz state update, never interrupts GPU compositor glide)
  useEffect(() => {
    if (variant === 'landscape-dock' || !visible || hiddenBySetting || isPointerScrubbing) {
      return;
    }

    const syncTimestampNow = () => {
      const now = performance.now();
      const currentMs = Math.min(
        safeDurationMs,
        Math.max(
          0,
          computeTrackProgressMs(
            progressAnchorMs,
            anchorTimestamp,
            now,
            isPlaying,
            isPreviewMode
          )
        )
      );

      if (rangeRef.current) {
        const pct = (currentMs / safeDurationMs) * 100;
        rangeRef.current.style.setProperty('--seek-pct', `${pct.toFixed(4)}%`);
        rangeRef.current.value = String(Math.round(currentMs));
        rangeRef.current.setAttribute('aria-valuenow', String(Math.round(currentMs)));
      }

      const bucket = Math.floor(currentMs / 1000);
      if (bucket !== lastDisplayBucketRef.current) {
        lastDisplayBucketRef.current = bucket;
        setDisplayTimeMs(Math.round(currentMs));
      }
    };

    syncTimestampNow();
    if (!isPlaying) return;

    const timerId = window.setInterval(syncTimestampNow, 200);
    return () => window.clearInterval(timerId);
  }, [
    variant,
    visible,
    hiddenBySetting,
    isPlaying,
    isPreviewMode,
    progressAnchorMs,
    anchorTimestamp,
    safeDurationMs,
    isPointerScrubbing,
  ]);

  useEffect(() => {
    if (!isPointerScrubbing) return;
    const finishPointerScrub = () => {
      setIsPointerScrubbing(false);
      setScrubMs((latest) => {
        if (latest !== null) {
          lastDisplayBucketRef.current = Math.floor(latest / 1000);
          setDisplayTimeMs(Math.round(latest));
          onSeek(latest);
        }
        return null;
      });
    };
    window.addEventListener('pointerup', finishPointerScrub);
    window.addEventListener('pointercancel', finishPointerScrub);
    window.addEventListener('mouseup', finishPointerScrub);
    window.addEventListener('touchend', finishPointerScrub);
    return () => {
      window.removeEventListener('pointerup', finishPointerScrub);
      window.removeEventListener('pointercancel', finishPointerScrub);
      window.removeEventListener('mouseup', finishPointerScrub);
      window.removeEventListener('touchend', finishPointerScrub);
    };
  }, [isPointerScrubbing, onSeek]);

  if (!visible || hiddenBySetting) {
    return null;
  }

  // Mobile Landscape Floating Bottom Transport Pill (active only on compact landscape viewports via CSS media query)
  if (variant === 'landscape-dock') {
    return (
      <div
        role="group"
        aria-label="하단 재생 컨트롤"
        data-testid="mobile-landscape-transport-dock"
        data-idle-hidden={isIdleHidden ? 'true' : 'false'}
        aria-hidden={isIdleHidden}
        className="mobile-landscape-transport-dock hud-layer-pinned rounded-full px-2.5 py-1 items-center gap-1.5 select-none"
      >
        <button
          type="button"
          onClick={onPrevious}
          disabled={isPreviewMode || !effectiveInteractive}
          tabIndex={effectiveInteractive ? 0 : -1}
          aria-label="이전 곡"
          title={isPreviewMode ? '미리보기에서는 이전 곡 이동을 지원하지 않습니다' : '이전 곡'}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 active:scale-[0.92] transition-[background-color,color,transform,opacity] duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          <Rewind size={17} fill="currentColor" strokeWidth={1.4} />
        </button>

        <button
          type="button"
          onClick={onPlayPause}
          disabled={!effectiveInteractive}
          tabIndex={effectiveInteractive ? 0 : -1}
          aria-label={isPlaying ? '일시정지' : '재생'}
          title={isPlaying ? '일시정지 (Space)' : '재생 (Space)'}
          className="w-10 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 active:scale-[0.92] transition-[background-color,transform,opacity] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          {isPlaying ? (
            <Pause size={20} fill="currentColor" strokeWidth={1.4} />
          ) : (
            <Play size={20} fill="currentColor" strokeWidth={1.4} className="translate-x-[1px]" />
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={isPreviewMode || !effectiveInteractive}
          tabIndex={effectiveInteractive ? 0 : -1}
          aria-label="다음 곡"
          title={isPreviewMode ? '미리보기에서는 다음 곡 이동을 지원하지 않습니다' : '다음 곡'}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 active:scale-[0.92] transition-[background-color,color,transform,opacity] duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          <FastForward size={17} fill="currentColor" strokeWidth={1.4} />
        </button>
      </div>
    );
  }

  const displayedMs = Math.min(
    safeDurationMs,
    Math.max(0, Math.round(scrubMs !== null ? scrubMs : displayTimeMs))
  );

  const handleRangeChange = (nextVal: number) => {
    cancelCompositorAnimations();
    applyStaticProgressTransforms(nextVal, safeDurationMs);
    lastDisplayBucketRef.current = Math.floor(nextVal / 1000);
    setDisplayTimeMs(Math.round(nextVal));

    if (isPointerScrubbing && !isPreviewMode) {
      setScrubMs(nextVal);
    } else if (isPointerScrubbing && isPreviewMode) {
      setScrubMs(nextVal);
      onSeek(nextVal);
    } else {
      onSeek(nextVal);
    }
  };

  const renderScrubberBar = (heightClass: string) => (
    <div
      data-testid="media-progress-shell"
      data-idle-hidden={isIdleHidden ? 'true' : 'false'}
      className={`apple-scrubber-shell relative flex items-center select-none ${heightClass} ${
        isIdleHidden ? 'pointer-events-none' : ''
      }`}
    >
      {/* GPU-composited sub-pixel rounded progress fill */}
      <div className="apple-scrubber-track relative w-full h-1 rounded-full overflow-hidden bg-white/24 pointer-events-none">
        <div
          ref={fillRef}
          data-testid="media-progress-fill"
          className="apple-scrubber-fill w-full h-full rounded-full bg-white/90"
        />
      </div>

      {/* GPU-composited sub-pixel circular thumb dot (fades & shrinks smoothly on idle) */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0">
        <div
          ref={thumbCarrierRef}
          data-testid="media-progress-thumb-carrier"
          className="apple-scrubber-thumb-carrier w-full h-0 relative"
        >
          <span
            data-idle-hidden={isIdleHidden ? 'true' : 'false'}
            className="apple-scrubber-dot"
          />
        </div>
      </div>

      {/* Native accessible range input hit-layer */}
      <input
        ref={rangeRef}
        type="range"
        aria-label="곡 재생 위치 탐색"
        data-testid="media-progress-bar"
        data-idle-hidden={isIdleHidden ? 'true' : 'false'}
        min={0}
        max={safeDurationMs}
        step={1}
        defaultValue={0}
        tabIndex={effectiveInteractive ? 0 : -1}
        onPointerDown={() => setIsPointerScrubbing(true)}
        onMouseDown={() => setIsPointerScrubbing(true)}
        onTouchStart={() => setIsPointerScrubbing(true)}
        onChange={(e) => handleRangeChange(Number(e.target.value))}
        className="apple-scrubber-input absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0 p-0"
      />
    </div>
  );

  if (variant === 'split') {
    return (
      <nav
        aria-label="재생 컨트롤"
        data-testid="split-playback-controls"
        data-idle-hidden={isIdleHidden ? 'true' : 'false'}
        className="hud-layer-pinned mt-4 w-full select-none"
      >
        <div className="w-full">
          {renderScrubberBar('w-full h-4')}

          <div
            data-testid="split-scrubber-timestamps"
            aria-hidden={isIdleHidden}
            className={`mt-1 flex items-center justify-between font-mono-tech text-[11px] text-white/55 transition-opacity duration-300 ${
              isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <span>{formatCompactTimeMs(displayedMs)}</span>
            <span>{formatRemainingTimeMs(displayedMs, safeDurationMs)}</span>
          </div>
        </div>

        {/* Centered Pure Transport Controls (Previous · Play/Pause · Next) */}
        <div
          data-testid="split-transport-buttons"
          aria-hidden={isIdleHidden}
          className={`transport-buttons-scalable mt-2.5 flex items-center justify-center gap-8 transition-opacity duration-300 ${
            isIdleHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={onPrevious}
            disabled={isPreviewMode || !effectiveInteractive}
            tabIndex={effectiveInteractive ? 0 : -1}
            aria-label="이전 곡"
            title={isPreviewMode ? '미리보기에서는 이전 곡 이동을 지원하지 않습니다' : '이전 곡'}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white active:scale-[0.92] transition-[color,transform,opacity] duration-150 disabled:opacity-35 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            <Rewind size={25} fill="currentColor" strokeWidth={1.4} />
          </button>

          <button
            type="button"
            data-testid="media-play-pause"
            onClick={onPlayPause}
            disabled={!effectiveInteractive}
            tabIndex={effectiveInteractive ? 0 : -1}
            aria-label={isPlaying ? '일시정지' : '재생'}
            title={isPlaying ? '일시정지 (Space)' : '재생 (Space)'}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:opacity-90 active:scale-[0.92] transition-[opacity,transform] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            {isPlaying ? (
              <Pause size={30} fill="currentColor" strokeWidth={1.4} />
            ) : (
              <Play size={30} fill="currentColor" strokeWidth={1.4} className="translate-x-[1.5px]" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={isPreviewMode || !effectiveInteractive}
            tabIndex={effectiveInteractive ? 0 : -1}
            aria-label="다음 곡"
            title={isPreviewMode ? '미리보기에서는 다음 곡 이동을 지원하지 않습니다' : '다음 곡'}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white active:scale-[0.92] transition-[color,transform,opacity] duration-150 disabled:opacity-35 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            <FastForward size={25} fill="currentColor" strokeWidth={1.4} />
          </button>
        </div>
      </nav>
    );
  }

  // Non-Split / Mobile Landscape / Mobile Portrait Inline Horizontal Progress Bar + Transport Buttons
  return (
    <nav
      aria-label="재생 컨트롤"
      data-testid="header-playback-controls"
      data-idle-hidden={isIdleHidden ? 'true' : 'false'}
      className="hud-layer-pinned flex items-center w-full select-none"
    >
      {/* Horizontal Progress Bar (expands smoothly end-to-end when timestamps & buttons collapse with left/right fade) */}
      <div className="flex items-center flex-1 min-w-0">
        <div
          data-testid="header-time-elapsed"
          data-idle-hidden={isIdleHidden ? 'true' : 'false'}
          aria-hidden={isIdleHidden}
          className="header-collapsible-x header-gap-right shrink-0"
        >
          <div className="header-collapsible-x-inner">
            <span className="block font-mono-tech text-[11px] text-white/60 w-8 text-right whitespace-nowrap">
              {formatCompactTimeMs(displayedMs)}
            </span>
          </div>
        </div>

        {renderScrubberBar('flex-1 min-w-0 h-6')}

        <div
          data-testid="header-time-remaining"
          data-idle-hidden={isIdleHidden ? 'true' : 'false'}
          aria-hidden={isIdleHidden}
          className="header-collapsible-x header-gap-left shrink-0"
        >
          <div className="header-collapsible-x-inner">
            <span className="block font-mono-tech text-[11px] text-white/50 w-9 text-left whitespace-nowrap">
              {formatRemainingTimeMs(displayedMs, safeDurationMs)}
            </span>
          </div>
        </div>
      </div>

      {/* Right-Side Compact Filled Transport Buttons (hidden in compact Mobile Landscape where bottom pill takes over so progress bar stays wide!) */}
      <div
        data-testid="header-transport-buttons"
        data-idle-hidden={isIdleHidden ? 'true' : 'false'}
        aria-hidden={isIdleHidden}
        className="header-collapsible-x header-gap-transport header-inline-transport shrink-0"
      >
        <div className="header-collapsible-x-inner">
          <div className="transport-buttons-scalable flex items-center gap-0.5 sm:gap-1 whitespace-nowrap">
            <button
              type="button"
              onClick={onPrevious}
              disabled={isPreviewMode || !effectiveInteractive}
              tabIndex={effectiveInteractive ? 0 : -1}
              aria-label="이전 곡"
              title={isPreviewMode ? '미리보기에서는 이전 곡 이동을 지원하지 않습니다' : '이전 곡'}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 active:scale-[0.93] transition-[background-color,color,transform,opacity] duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
            >
              <Rewind size={16} fill="currentColor" strokeWidth={1.4} />
            </button>

            <button
              type="button"
              data-testid="media-play-pause"
              onClick={onPlayPause}
              disabled={!effectiveInteractive}
              tabIndex={effectiveInteractive ? 0 : -1}
              aria-label={isPlaying ? '일시정지' : '재생'}
              title={isPlaying ? '일시정지 (Space)' : '재생 (Space)'}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white hover:bg-white/10 active:scale-[0.93] transition-[background-color,transform,opacity] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
            >
              {isPlaying ? (
                <Pause size={18} fill="currentColor" strokeWidth={1.4} />
              ) : (
                <Play size={18} fill="currentColor" strokeWidth={1.4} className="translate-x-[1px]" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={isPreviewMode || !effectiveInteractive}
              tabIndex={effectiveInteractive ? 0 : -1}
              aria-label="다음 곡"
              title={isPreviewMode ? '미리보기에서는 다음 곡 이동을 지원하지 않습니다' : '다음 곡'}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 active:scale-[0.93] transition-[background-color,color,transform,opacity] duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
            >
              <FastForward size={16} fill="currentColor" strokeWidth={1.4} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

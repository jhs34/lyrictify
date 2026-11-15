import { useEffect, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { computeTrackProgressMs, formatDurationMs } from '../utils/lyrics';

interface MediaControlsProps {
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
  const [liveProgressMs, setLiveProgressMs] = useState<number>(0);
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  const effectiveVisible = visible && !isIdleHidden;
  const safeDurationMs = Math.max(durationMs, 1000);

  useEffect(() => {
    const updateNow = () => {
      const current = computeTrackProgressMs(
        progressAnchorMs,
        anchorTimestamp,
        performance.now(),
        isPlaying,
        isPreviewMode
      );
      setLiveProgressMs(Math.min(safeDurationMs, current));
    };

    updateNow();

    if (!effectiveVisible || hiddenBySetting || !isPlaying) {
      return;
    }

    const intervalId = window.setInterval(updateNow, 250);
    return () => window.clearInterval(intervalId);
  }, [
    effectiveVisible,
    hiddenBySetting,
    isPlaying,
    isPreviewMode,
    progressAnchorMs,
    anchorTimestamp,
    safeDurationMs,
  ]);

  const [isPointerScrubbing, setIsPointerScrubbing] = useState<boolean>(false);

  useEffect(() => {
    if (!isPointerScrubbing) return;
    const finishPointerScrub = () => {
      setIsPointerScrubbing(false);
      setScrubMs((latest) => {
        if (latest !== null) {
          setLiveProgressMs(latest);
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

  if (hiddenBySetting) {
    return null;
  }

  const displayedMs = scrubMs !== null ? scrubMs : liveProgressMs;

  return (
    <nav
      aria-label="재생 컨트롤"
      aria-hidden={!effectiveVisible}
      data-idle-hidden={isIdleHidden ? 'true' : 'false'}
      className={`media-controller-bar fixed bottom-6 left-1/2 w-[min(90vw,340px)] surface-floating rounded-2xl px-4 py-2.5 flex flex-col gap-1.5 z-40 ${
        effectiveVisible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none controller-hidden-anim'
      }`}
    >
      {/* Mini Seek Bar & Tabular Timestamps */}
      <div className="flex items-center gap-2.5 w-full">
        <span className="font-mono-tech text-[11px] text-[var(--text-secondary)] w-9 text-left shrink-0 select-none">
          {formatDurationMs(displayedMs)}
        </span>

        <input
          type="range"
          aria-label="곡 재생 위치 탐색"
          min={0}
          max={safeDurationMs}
          step={250}
          disabled={!effectiveVisible}
          tabIndex={effectiveVisible ? 0 : -1}
          value={Math.min(safeDurationMs, Math.max(0, Math.round(displayedMs)))}
          onPointerDown={() => setIsPointerScrubbing(true)}
          onMouseDown={() => setIsPointerScrubbing(true)}
          onTouchStart={() => setIsPointerScrubbing(true)}
          onChange={(e) => {
            const nextVal = Number(e.target.value);
            if (isPointerScrubbing && !isPreviewMode) {
              setScrubMs(nextVal);
            } else if (isPointerScrubbing && isPreviewMode) {
              setScrubMs(nextVal);
              setLiveProgressMs(nextVal);
              onSeek(nextVal);
            } else {
              setLiveProgressMs(nextVal);
              onSeek(nextVal);
            }
          }}
          className="lyrictify-range flex-1 h-5"
        />

        <span className="font-mono-tech text-[11px] text-[var(--text-muted)] w-9 text-right shrink-0 select-none">
          {formatDurationMs(safeDurationMs)}
        </span>
      </div>

      {/* Transport Buttons */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isPreviewMode || !effectiveVisible}
          tabIndex={effectiveVisible ? 0 : -1}
          aria-label="이전 곡"
          title={isPreviewMode ? '미리보기에서는 이전 곡 이동을 지원하지 않습니다' : '이전 곡'}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 disabled:opacity-35 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text-primary)]"
        >
          <SkipBack size={17} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          onClick={onPlayPause}
          disabled={!effectiveVisible}
          tabIndex={effectiveVisible ? 0 : -1}
          aria-label={isPlaying ? '일시정지' : '재생'}
          title={isPlaying ? '일시정지 (Space)' : '재생 (Space)'}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text-primary)]"
        >
          {isPlaying ? (
            <Pause size={18} strokeWidth={1.5} />
          ) : (
            <Play size={18} strokeWidth={1.5} />
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={isPreviewMode || !effectiveVisible}
          tabIndex={effectiveVisible ? 0 : -1}
          aria-label="다음 곡"
          title={isPreviewMode ? '미리보기에서는 다음 곡 이동을 지원하지 않습니다' : '다음 곡'}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 disabled:opacity-35 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text-primary)]"
        >
          <SkipForward size={17} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}

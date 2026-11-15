import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

interface MediaControlsProps {
  visible: boolean;
  hiddenBySetting: boolean;
  isPlaying: boolean;
  isPreviewMode: boolean;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
}

export function MediaControls({
  visible,
  hiddenBySetting,
  isPlaying,
  isPreviewMode,
  onPrevious,
  onPlayPause,
  onNext,
}: MediaControlsProps) {
  if (hiddenBySetting) {
    return null;
  }

  return (
    <nav
      aria-label="재생 컨트롤"
      aria-hidden={!visible}
      className={`media-controller-bar fixed bottom-8 left-1/2 surface-floating rounded-xl p-1 flex items-center justify-center gap-1 z-40 ${
        visible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none controller-hidden-anim'
      }`}
    >
      <button
        type="button"
        onClick={onPrevious}
        disabled={isPreviewMode || !visible}
        tabIndex={visible ? 0 : -1}
        aria-label="이전 곡"
        title={isPreviewMode ? '미리보기에서는 이전 곡 이동을 지원하지 않습니다' : '이전 곡'}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 disabled:opacity-35 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text-primary)]"
      >
        <SkipBack size={18} strokeWidth={1.5} />
      </button>

      <button
        type="button"
        onClick={onPlayPause}
        disabled={!visible}
        tabIndex={visible ? 0 : -1}
        aria-label={isPlaying ? '일시정지' : '재생'}
        title={isPlaying ? '일시정지' : '재생'}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text-primary)]"
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
        disabled={isPreviewMode || !visible}
        tabIndex={visible ? 0 : -1}
        aria-label="다음 곡"
        title={isPreviewMode ? '미리보기에서는 다음 곡 이동을 지원하지 않습니다' : '다음 곡'}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 disabled:opacity-35 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text-primary)]"
      >
        <SkipForward size={18} strokeWidth={1.5} />
      </button>
    </nav>
  );
}

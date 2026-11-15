import { useEffect, useState } from 'react';
import { Disc3, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react';
import { TrackMetadata } from '../types/lyrics';

interface HeaderProps {
  track: TrackMetadata | null;
  isFullscreen: boolean;
  syncFeedback: string | null;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
}

export function Header({
  track,
  isFullscreen,
  syncFeedback,
  onToggleFullscreen,
  onOpenSettings,
}: HeaderProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [track?.albumArtUrl]);

  return (
    <header className="flex justify-between items-center px-6 sm:px-8 h-16 shrink-0 z-10 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3 overflow-hidden min-w-0 mr-4">
        {track ? (
          <>
            {track.albumArtUrl && !imgFailed ? (
              <img
                src={track.albumArtUrl}
                alt={`${track.title} 앨범 아트`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-11 h-11 rounded-lg object-cover transition-opacity duration-300 flex-none border border-[var(--border-hairline)]"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-11 h-11 rounded-lg bg-[var(--bg-card)] border border-[var(--border-hairline)] flex items-center justify-center flex-none"
              >
                <Disc3 size={18} strokeWidth={1.5} className="text-[var(--text-muted)]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] sm:text-base font-medium truncate text-[var(--text-primary)] leading-5">
                {track.title}
              </h1>
              <p className="text-[13px] font-normal text-[var(--text-secondary)] truncate leading-5">
                {track.artist}
              </p>
            </div>
          </>
        ) : (
          <span className="text-base font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0">
            Lyrictify
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-none">
        {syncFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="h-10 px-3 rounded-lg surface-floating flex items-center font-mono-tech text-xs text-[var(--accent)] whitespace-nowrap"
          >
            {syncFeedback}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? '전체 화면 종료' : '전체 화면 전환'}
          title={isFullscreen ? '전체 화면 종료 (F)' : '전체 화면 전환 (F)'}
          className="w-10 h-10 flex-none rounded-lg surface-floating text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] flex items-center justify-center shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] cursor-pointer"
        >
          {isFullscreen ? (
            <Minimize2 size={18} strokeWidth={1.5} />
          ) : (
            <Maximize2 size={18} strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="설정 열기"
          title="설정 열기"
          className="w-10 h-10 flex-none rounded-lg surface-floating text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] flex items-center justify-center shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--text-primary)] cursor-pointer"
        >
          <SlidersHorizontal size={18} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}

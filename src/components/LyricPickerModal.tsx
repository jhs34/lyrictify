import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Disc3, Loader2, Search, X } from 'lucide-react';
import { usePresenceTransition } from '../hooks/usePresenceTransition';
import { fetchLrcLibCandidates } from '../services/lrclib';
import { LrcLibCandidate, TrackMetadata } from '../types/lyrics';
import { MODAL_EXIT_DURATION_MS, formatDurationMs } from '../utils/lyrics';

interface OverflowMarqueeTextProps {
  text: string;
  className?: string;
}

function OverflowMarqueeText({ text, className = '' }: OverflowMarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const measure = () => {
      const hasMask = container.classList.contains('lyric-marquee-mask');
      const availableWidth = container.clientWidth - (hasMask ? 14 : 0);
      const naturalWidth = textEl.scrollWidth;
      const overflowPx = Math.ceil(naturalWidth - Math.max(0, availableWidth));

      if (overflowPx > 2) {
        const slideDistance = overflowPx + 14;
        const durationSec = Math.max(5.5, Math.min(14, 3.8 + slideDistance / 28));
        container.style.setProperty('--marquee-offset', `${slideDistance}px`);
        container.style.setProperty('--marquee-duration', `${durationSec.toFixed(2)}s`);
        setIsOverflowing(true);
      } else {
        container.style.removeProperty('--marquee-offset');
        container.style.removeProperty('--marquee-duration');
        setIsOverflowing(false);
      }
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      data-overflowing={isOverflowing ? 'true' : 'false'}
      className={`min-w-0 flex-1 ${isOverflowing ? 'lyric-marquee-mask' : 'overflow-hidden'}`}
    >
      <span
        ref={textRef}
        className={`${isOverflowing ? 'lyric-marquee-track' : 'block whitespace-nowrap'} ${className}`}
      >
        {text}
      </span>
    </div>
  );
}

interface LyricPickerModalProps {
  isOpen: boolean;
  track: TrackMetadata | null;
  initialCandidates: LrcLibCandidate[];
  selectedCandidateId: string | null;
  isVinylViewActive?: boolean;
  onSelectCandidate: (candidate: LrcLibCandidate, mode: 'synced' | 'plain') => void;
  onSelectNoLyrics?: () => void;
  onClose: () => void;
}

export function LyricPickerModal({
  isOpen,
  track,
  initialCandidates,
  selectedCandidateId,
  isVinylViewActive = false,
  onSelectCandidate,
  onSelectNoLyrics,
  onClose,
}: LyricPickerModalProps) {
  const [query, setQuery] = useState<string>('');
  const [candidates, setCandidates] = useState<LrcLibCandidate[]>(initialCandidates);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearchedCustom, setHasSearchedCustom] = useState<boolean>(false);

  const modalPresence = usePresenceTransition(isOpen, MODAL_EXIT_DURATION_MS);

  useEffect(() => {
    if (!isOpen) return;
    const defaultQuery = track ? `${track.title} ${track.artist}`.trim() : '';
    setQuery(defaultQuery);
    setCandidates(initialCandidates);
    setHasSearchedCustom(false);

    if (initialCandidates.length === 0 && defaultQuery) {
      const controller = new AbortController();
      const matchContext = track
        ? {
            targetTitle: track.title,
            targetArtist: track.artist,
            targetDurationSec: track.durationMs > 0 ? track.durationMs / 1000 : 0,
          }
        : undefined;
      setIsSearching(true);
      void fetchLrcLibCandidates(defaultQuery, controller.signal, matchContext).then((results) => {
        if (!controller.signal.aborted) {
          setCandidates(results);
          setHasSearchedCustom(true);
          setIsSearching(false);
        }
      });
      return () => controller.abort();
    }

    setIsSearching(false);
  }, [isOpen, track, initialCandidates]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!modalPresence.shouldRender) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const matchContext = track
      ? {
          targetTitle: track.title,
          targetArtist: track.artist,
          targetDurationSec: track.durationMs > 0 ? track.durationMs / 1000 : 0,
        }
      : undefined;

    setIsSearching(true);
    setHasSearchedCustom(true);
    const results = await fetchLrcLibCandidates(trimmed, undefined, matchContext);
    setCandidates(results);
    setIsSearching(false);
  };

  return (
    <div
      data-presence={modalPresence.phase}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="modal-backdrop-presence fixed inset-0 z-50 isolate flex justify-center items-center p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyric-picker-title"
        data-presence={modalPresence.phase}
        className="surface-modal modal-dialog-presence relative w-full max-w-[480px] rounded-2xl max-h-[82vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-[var(--border-hairline)]">
          <h2 id="lyric-picker-title" className="text-sm font-medium text-[var(--text-primary)]">
            가사 후보 선택
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="가사 선택창 닫기"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] active:scale-[0.97] transition-[background-color,color,transform] duration-150 cursor-pointer"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form
          onSubmit={handleSearch}
          className="px-5 py-3 border-b border-[var(--border-hairline)] flex items-center gap-2 shrink-0 bg-[var(--bg-deepest)]/40"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="text"
              aria-label="LRCLIB 가사 검색어"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="곡 제목 또는 아티스트 입력"
              className="w-full h-9 pl-9 pr-3 bg-[var(--bg-deepest)] border border-[var(--border-hairline)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors duration-150"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="h-9 px-3.5 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-hairline)] text-xs font-medium text-[var(--text-primary)] hover:bg-[#2c2c2f] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none transition-[background-color,transform] duration-150 cursor-pointer whitespace-nowrap"
          >
            {isSearching ? '탐색 중' : 'LRCLIB 검색'}
          </button>
        </form>

        <div className="p-3 space-y-1.5 flex-1 overflow-y-auto modal-scroll-body min-h-[220px]">
          {track && onSelectNoLyrics && (
            <div
              data-testid="lyric-picker-turntable-card"
              className={`candidate-item-enter rounded-lg border p-3 transition-colors duration-150 ${
                isVinylViewActive
                  ? 'bg-[var(--bg-raised)] border-[var(--accent)]/60'
                  : 'bg-[var(--bg-deepest)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={onSelectNoLyrics}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Disc3
                      size={15}
                      strokeWidth={1.6}
                      className={
                        isVinylViewActive
                          ? 'text-[var(--accent)] shrink-0'
                          : 'text-[var(--text-secondary)] shrink-0'
                      }
                    />
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      LP 턴테이블 모드
                    </span>
                    {isVinylViewActive && (
                      <Check
                        size={14}
                        strokeWidth={1.5}
                        className="text-[var(--accent)] shrink-0"
                      />
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                    가사를 숨기고 앨범 재킷과 회전하는 바이닐 원반으로 표시
                  </p>
                </button>

                <div className="flex items-center gap-1.5 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={onSelectNoLyrics}
                    className={`h-6 px-2.5 rounded-[4px] border text-[11px] font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                      isVinylViewActive
                        ? 'border-[var(--accent)]/55 bg-[var(--accent)]/18 text-[var(--accent)]'
                        : 'border-[var(--accent)]/45 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
                    }`}
                  >
                    {isVinylViewActive ? '적용됨' : '턴테이블 적용'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isSearching ? (
            <div className="h-36 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-[var(--text-muted)]" />
              <span>LRCLIB에서 가사 목록을 불러오는 중입니다</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="h-36 flex flex-col items-center justify-center text-center px-6 space-y-1.5">
              <p className="text-sm text-[var(--text-primary)]">
                {hasSearchedCustom ? '일치하는 가사 후보가 없습니다' : '불러온 가사 후보가 없습니다'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                영문 제목이나 원곡 아티스트 이름으로 검색어를 바꿔 다시 탐색해보세요
              </p>
            </div>
          ) : (
            candidates.map((item) => {
              const isCurrent = !isVinylViewActive && selectedCandidateId === item.id;
              const primaryMode: 'synced' | 'plain' = item.hasSynced ? 'synced' : 'plain';

              return (
                <div
                  key={item.id}
                  className={`candidate-item-enter rounded-lg border p-3 transition-colors duration-150 ${
                    isCurrent
                      ? 'bg-[var(--bg-raised)] border-[var(--accent)]/60'
                      : 'bg-[var(--bg-deepest)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(item, primaryMode)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <OverflowMarqueeText
                          text={item.trackName}
                          className="text-sm font-medium text-[var(--text-primary)]"
                        />
                        {isCurrent && (
                          <Check
                            size={14}
                            strokeWidth={1.5}
                            className="text-[var(--accent)] shrink-0"
                          />
                        )}
                      </div>
                      <div className="flex items-center min-w-0 mt-0.5">
                        <OverflowMarqueeText
                          text={`${item.artistName}${item.albumName ? ` · ${item.albumName}` : ''}`}
                          className="text-xs text-[var(--text-secondary)]"
                        />
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.durationSec > 0 && (
                        <span className="font-mono-tech text-[11px] text-[var(--text-muted)] mr-1">
                          {formatDurationMs(item.durationSec * 1000)}
                        </span>
                      )}

                      {item.hasPlain && (
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(item, 'plain')}
                          className="h-6 px-2 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-raised)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-pointer"
                        >
                          {item.hasSynced ? '일반' : '일반 적용'}
                        </button>
                      )}

                      {item.hasSynced && (
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(item, 'synced')}
                          className="h-6 px-2 rounded-[4px] border border-[var(--accent)]/45 bg-[var(--accent)]/10 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors duration-150 cursor-pointer"
                        >
                          싱크 적용
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

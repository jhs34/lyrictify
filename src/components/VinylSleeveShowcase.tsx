import { useEffect, useRef, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { TrackMetadata } from '../types/lyrics';
import { TURNTABLE_REV_DURATION_MS, stepTurntableSpinRate } from '../utils/lyrics';

interface VinylSleeveShowcaseProps {
  track: TrackMetadata;
  isPlaying: boolean;
  variant: 'single-stage' | 'split-stage';
}

export function VinylSleeveShowcase({
  track,
  isPlaying,
  variant,
}: VinylSleeveShowcaseProps) {
  const rotorRef = useRef<HTMLDivElement | null>(null);
  const spinAnimRef = useRef<Animation | null>(null);
  const spinRateRef = useRef<number>(isPlaying ? 1 : 0);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const reducedMotionRef = useRef<boolean>(false);
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  isPlayingRef.current = isPlaying;

  useEffect(() => {
    setImgFailed(false);
  }, [track.albumArtUrl]);

  // Mount continuous 33⅓ RPM-inspired GPU compositor rotation once per showcase mount
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mql.matches;

    const rotor = rotorRef.current;
    if (!rotor || typeof rotor.animate !== 'function') return;

    const initialRate = isPlayingRef.current && !reducedMotionRef.current ? 1 : 0;
    spinRateRef.current = initialRate;

    const anim = rotor.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      {
        duration: TURNTABLE_REV_DURATION_MS,
        iterations: Infinity,
        easing: 'linear',
      }
    );
    anim.playbackRate = initialRate;
    spinAnimRef.current = anim;

    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
      const nextRate = isPlayingRef.current && !e.matches ? 1 : 0;
      spinRateRef.current = nextRate;
      if (spinAnimRef.current) {
        spinAnimRef.current.playbackRate = nextRate;
      }
    };
    mql.addEventListener('change', onReducedMotionChange);

    return () => {
      mql.removeEventListener('change', onReducedMotionChange);
      anim.cancel();
      spinAnimRef.current = null;
    };
  }, []);

  // Smoothly ramp turntable playbackRate on Play <-> Pause transitions and stop rAF once settled
  useEffect(() => {
    const anim = spinAnimRef.current;
    if (!anim) return;

    if (reducedMotionRef.current) {
      spinRateRef.current = 0;
      anim.playbackRate = 0;
      return;
    }

    const targetRate = isPlaying ? 1 : 0;
    if (spinRateRef.current === targetRate) {
      anim.playbackRate = targetRate;
      return;
    }

    let rafId = 0;
    let prevTime = performance.now();

    const step = (now: number) => {
      const deltaMs = Math.max(0, now - prevTime);
      prevTime = now;

      const nextRate = stepTurntableSpinRate(spinRateRef.current, isPlaying, deltaMs);
      spinRateRef.current = nextRate;
      if (spinAnimRef.current) {
        spinAnimRef.current.playbackRate = nextRate;
      }

      if (nextRate !== targetRate) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isPlaying]);

  const artUrl = !imgFailed && track.albumArtUrl ? track.albumArtUrl : null;

  return (
    <div
      role="img"
      aria-label={`${track.title} — ${track.artist} 앨범 바이닐 디스크`}
      data-testid="vinyl-sleeve-showcase"
      data-stage-variant={variant}
      data-playing={isPlaying ? 'true' : 'false'}
      className="vinyl-showcase-unit vinyl-stage-enter"
    >
      <div aria-hidden="true" className="vinyl-floor-shadow" />

      {/* Half-Ejected 12" LP Vinyl Platter */}
      <div aria-hidden="true" className="vinyl-platter-shell">
        <div
          ref={rotorRef}
          data-testid="vinyl-platter-rotor"
          className="vinyl-platter-rotor"
        >
          <div className="vinyl-platter-grain" />

          {/* Circular Pressed Center Paper Label */}
          <div className="vinyl-center-label">
            {artUrl ? (
              <img
                src={artUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#242220] flex items-center justify-center">
                <Disc3 size={20} strokeWidth={1.4} className="text-[var(--accent)]/75" />
              </div>
            )}
            <div className="vinyl-label-ring" />
          </div>
        </div>

        {/* Stationary Room-Light Anisotropic Sheen & Sleeve Pocket Occlusion */}
        <div className="vinyl-platter-sheen" />
        <div className="vinyl-spindle-hole" />
      </div>

      {/* Square Matte Album Jacket Sleeve */}
      <div className="vinyl-sleeve-card">
        {artUrl ? (
          <img
            src={artUrl}
            alt={`${track.title} 앨범 커버`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-[var(--bg-card)] flex items-center justify-center">
            <Disc3 size={48} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          </div>
        )}
        <div aria-hidden="true" className="vinyl-sleeve-finish" />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { computeMarqueeMetrics } from '../utils/lyrics';

interface MarqueeTextProps {
  text: string;
  as?: 'h1' | 'h2' | 'p' | 'span' | 'div';
  className?: string;
  testId?: string;
}

export function MarqueeText({
  text,
  as: Tag = 'div',
  className = '',
  testId,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const measureOverflow = useCallback(() => {
    const container = containerRef.current;
    const measureEl = measureRef.current;
    const trackEl = trackRef.current;
    if (!container || !measureEl || !trackEl) return;

    const containerWidth = container.clientWidth;
    const contentWidth = measureEl.scrollWidth;
    const metrics = computeMarqueeMetrics(contentWidth, containerWidth, 14);

    setIsOverflowing((prev) => (prev === metrics.isOverflowing ? prev : metrics.isOverflowing));

    if (metrics.isOverflowing) {
      trackEl.style.setProperty('--marquee-offset', `${metrics.slideOffsetPx}px`);
      trackEl.style.setProperty('--marquee-duration', `${metrics.durationSec}s`);
    } else {
      trackEl.style.removeProperty('--marquee-offset');
      trackEl.style.removeProperty('--marquee-duration');
    }
  }, []);

  useLayoutEffect(() => {
    measureOverflow();
  }, [text, measureOverflow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measureOverflow);
    };

    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
      void document.fonts.ready.then(scheduleMeasure).catch(() => {});
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scheduleMeasure);
      observer.observe(container);
      return () => {
        window.cancelAnimationFrame(rafId);
        observer.disconnect();
      };
    }

    window.addEventListener('resize', scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [text, measureOverflow]);

  return (
    <Tag
      data-testid={testId}
      data-overflowing={isOverflowing ? 'true' : 'false'}
      title={text}
      className={`relative block min-w-0 max-w-full ${className}`}
    >
      {/* Hidden unclipped sizer keeps measurement independent of active marquee padding */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap select-none"
      >
        {text}
      </span>

      <span ref={containerRef} className="block w-full min-w-0">
        <span
          className={
            isOverflowing
              ? 'marquee-fade-mask is-overflowing block'
              : 'block overflow-hidden whitespace-nowrap'
          }
        >
          <span
            ref={trackRef}
            className={
              isOverflowing
                ? 'marquee-fade-track inline-block whitespace-nowrap'
                : 'inline-block whitespace-nowrap'
            }
          >
            {text}
          </span>
        </span>
      </span>
    </Tag>
  );
}

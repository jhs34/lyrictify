import { useEffect, useState } from 'react';
import {
  DEFAULT_AMBIENT_RGB,
  RGBColor,
  deriveSecondaryAmbientColor,
  extractDominantColorFromPixels,
} from '../utils/lyrics';

function applyAmbientColorVariables(primary: RGBColor): void {
  const secondary = deriveSecondaryAmbientColor(primary);
  const root = document.documentElement;
  root.style.setProperty('--ambient-rgb', `${primary.r}, ${primary.g}, ${primary.b}`);
  root.style.setProperty(
    '--ambient-secondary-rgb',
    `${secondary.r}, ${secondary.g}, ${secondary.b}`
  );
}

export function useDominantAlbumColor(albumArtUrl: string | null): RGBColor {
  const [dominantColor, setDominantColor] = useState<RGBColor>(DEFAULT_AMBIENT_RGB);

  useEffect(() => {
    if (!albumArtUrl) {
      setDominantColor(DEFAULT_AMBIENT_RGB);
      applyAmbientColorVariables(DEFAULT_AMBIENT_RGB);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      if (cancelled) return;
      try {
        const sampleSize = 24;
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          applyAmbientColorVariables(DEFAULT_AMBIENT_RGB);
          return;
        }
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const extracted = extractDominantColorFromPixels(imageData.data);
        if (!cancelled) {
          setDominantColor(extracted);
          applyAmbientColorVariables(extracted);
        }
      } catch {
        if (!cancelled) {
          setDominantColor(DEFAULT_AMBIENT_RGB);
          applyAmbientColorVariables(DEFAULT_AMBIENT_RGB);
        }
      }
    };

    img.onerror = () => {
      if (!cancelled) {
        setDominantColor(DEFAULT_AMBIENT_RGB);
        applyAmbientColorVariables(DEFAULT_AMBIENT_RGB);
      }
    };

    img.src = albumArtUrl;

    return () => {
      cancelled = true;
    };
  }, [albumArtUrl]);

  return dominantColor;
}

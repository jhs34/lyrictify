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

function sampleImageElement(img: HTMLImageElement): RGBColor {
  const sampleSize = 24;
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return DEFAULT_AMBIENT_RGB;
  }
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
  return extractDominantColorFromPixels(imageData.data);
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
    let objectUrlToRevoke: string | null = null;
    const abortController = new AbortController();

    const loadAndExtract = async () => {
      try {
        let srcForCanvas = albumArtUrl;

        // Fetch remote images via CORS into a same-origin Blob URL to avoid Chrome's non-CORS <img> cache collision
        if (/^https?:\/\//i.test(albumArtUrl)) {
          const response = await fetch(albumArtUrl, {
            mode: 'cors',
            credentials: 'omit',
            signal: abortController.signal,
          });
          if (!response.ok) {
            throw new Error('Album art CORS fetch failed');
          }
          const blob = await response.blob();
          objectUrlToRevoke = URL.createObjectURL(blob);
          srcForCanvas = objectUrlToRevoke;
        }

        const img = new Image();
        img.decoding = 'async';
        if (!objectUrlToRevoke) {
          img.crossOrigin = 'anonymous';
        }

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image decode failed'));
          img.src = srcForCanvas;
        });

        if (cancelled) return;
        const extracted = sampleImageElement(img);
        setDominantColor(extracted);
        applyAmbientColorVariables(extracted);
      } catch {
        if (!cancelled) {
          setDominantColor(DEFAULT_AMBIENT_RGB);
          applyAmbientColorVariables(DEFAULT_AMBIENT_RGB);
        }
      } finally {
        if (objectUrlToRevoke) {
          URL.revokeObjectURL(objectUrlToRevoke);
          objectUrlToRevoke = null;
        }
      }
    };

    void loadAndExtract();

    return () => {
      cancelled = true;
      abortController.abort();
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [albumArtUrl]);

  return dominantColor;
}

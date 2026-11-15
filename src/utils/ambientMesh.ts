import {
  DEFAULT_AMBIENT_RGB,
  RGBColor,
  deriveSecondaryAmbientColor,
  extractDominantColorFromPixels,
} from './lyrics';

export type AmbientPalette = [RGBColor, RGBColor, RGBColor, RGBColor];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeAtmosphericColor(color: RGBColor, targetPeak = 188): RGBColor {
  // Boost saturation slightly while keeping peak luminance controlled so white lyrics stay crisp
  const avg = (color.r + color.g + color.b) / 3;
  let r = avg + (color.r - avg) * 1.24;
  let g = avg + (color.g - avg) * 1.24;
  let b = avg + (color.b - avg) * 1.24;

  r = Math.max(8, r);
  g = Math.max(8, g);
  b = Math.max(8, b);

  const peak = Math.max(r, g, b, 1);
  if (peak < 135) {
    const boost = 135 / peak;
    r *= boost;
    g *= boost;
    b *= boost;
  } else if (peak > targetPeak) {
    const scale = targetPeak / peak;
    r *= scale;
    g *= scale;
    b *= scale;
  }

  return {
    r: Math.round(Math.min(255, Math.max(0, r))),
    g: Math.round(Math.min(255, Math.max(0, g))),
    b: Math.round(Math.min(255, Math.max(0, b))),
  };
}

function colorDistanceSq(a: RGBColor, b: RGBColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function buildFallbackAmbientPalette(base: RGBColor = DEFAULT_AMBIENT_RGB): AmbientPalette {
  const c0 = normalizeAtmosphericColor(base, 190);
  const c1 = normalizeAtmosphericColor(deriveSecondaryAmbientColor(c0), 178);
  const c2 = normalizeAtmosphericColor(
    {
      r: Math.round(c0.r * 0.68 + c1.b * 0.32),
      g: Math.round(c0.g * 0.55 + c1.r * 0.45),
      b: Math.round(c0.b * 0.42 + c1.g * 0.58),
    },
    168
  );
  const c3 = normalizeAtmosphericColor(
    {
      r: Math.round(c1.r * 0.52 + 28),
      g: Math.round(c0.g * 0.62 + 22),
      b: Math.round(c1.b * 0.75 + 36),
    },
    162
  );
  return [c0, c1, c2, c3];
}

function computeHueSector(r: number, g: number, b: number): number {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const delta = maxC - minC;
  if (delta <= 8) return 0;

  let hue = 0;
  if (maxC === r) {
    hue = ((g - b) / delta) % 6;
  } else if (maxC === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  if (hue < 0) hue += 6;
  return Math.min(5, Math.floor(hue)); // 6 sectors of 60 deg each
}

function extractPureSectorColor(pixels: number[], targetPeak: number): RGBColor {
  const sectorWeights = [0, 0, 0, 0, 0, 0];
  const sectorR = [0, 0, 0, 0, 0, 0];
  const sectorG = [0, 0, 0, 0, 0, 0];
  const sectorB = [0, 0, 0, 0, 0, 0];

  for (let i = 0; i <= pixels.length - 4; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 128) continue;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if (maxC < 26 || minC > 238) continue;

    const sat = (maxC - minC) / maxC;
    const w = 0.15 + sat * sat * 4.0 * (maxC / 255);
    const sector = computeHueSector(r, g, b);

    sectorWeights[sector] += w;
    sectorR[sector] += r * w;
    sectorG[sector] += g * w;
    sectorB[sector] += b * w;
  }

  let bestSector = -1;
  let bestW = 0;
  for (let s = 0; s < 6; s++) {
    if (sectorWeights[s] > bestW) {
      bestW = sectorWeights[s];
      bestSector = s;
    }
  }

  if (bestSector === -1 || bestW <= 0) {
    return normalizeAtmosphericColor(extractDominantColorFromPixels(pixels), targetPeak);
  }

  return normalizeAtmosphericColor(
    {
      r: Math.round(sectorR[bestSector] / bestW),
      g: Math.round(sectorG[bestSector] / bestW),
      b: Math.round(sectorB[bestSector] / bestW),
    },
    targetPeak
  );
}

export function extractAlbumPaletteFromGrid(
  data: ArrayLike<number>,
  width: number,
  height: number
): AmbientPalette {
  if (!data || width <= 0 || height <= 0 || data.length < width * height * 4) {
    return buildFallbackAmbientPalette(DEFAULT_AMBIENT_RGB);
  }

  const halfW = Math.max(1, Math.floor(width / 2));
  const halfH = Math.max(1, Math.floor(height / 2));

  const quadrants: number[][] = [[], [], [], []];

  for (let y = 0; y < height; y++) {
    const qy = y < halfH ? 0 : 1;
    for (let x = 0; x < width; x++) {
      const qx = x < halfW ? 0 : 1;
      const qIdx = qy * 2 + qx;
      const offset = (y * width + x) * 4;
      quadrants[qIdx].push(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3]
      );
    }
  }

  const overall = extractPureSectorColor(Array.from(data), 186);
  const extracted = quadrants.map((qPixels, idx) =>
    qPixels.length >= 4
      ? extractPureSectorColor(qPixels, idx === 3 ? 170 : 188)
      : overall
  ) as AmbientPalette;

  // Ensure multi-tonal variety even if an album cover is mostly uniform in color
  if (colorDistanceSq(extracted[0], extracted[1]) < 450) {
    extracted[1] = normalizeAtmosphericColor(deriveSecondaryAmbientColor(extracted[0]), 174);
  }
  if (colorDistanceSq(extracted[2], extracted[3]) < 450) {
    extracted[3] = normalizeAtmosphericColor(deriveSecondaryAmbientColor(extracted[2]), 164);
  }

  return extracted;
}

interface GaussianSource {
  cx: number;
  cy: number;
  invTwoSigmaSq: number;
  strength: number;
  color: RGBColor;
}

/**
 * Generates an isotropic 32-bit floating-point C-infinity multi-lobe color field
 * quantized to 8-bit RGBA using Triangular-PDF (TPDF) dithering so zero Mach bands
 * or concentric elliptical rings appear on dark backgrounds.
 */
export function computeAmbientMeshPixels(
  palette: AmbientPalette,
  size: number,
  variant: 'primary' | 'secondary',
  seed = variant === 'primary' ? 1337 : 7331
): Uint8ClampedArray {
  const safeSize = Math.max(16, Math.floor(size));
  const out = new Uint8ClampedArray(safeSize * safeSize * 4);
  const rand = mulberry32(seed);

  const floorR = 16;
  const floorG = 16;
  const floorB = 18;

  // Wide spatial separation between lobes preserves distinct album hues & dark listening-room depth instead of mixing into flat mauve
  const sources: GaussianSource[] =
    variant === 'primary'
      ? [
          { cx: 0.27, cy: 0.34, invTwoSigmaSq: 1 / (2 * 0.185 * 0.185), strength: 0.62, color: palette[0] },
          { cx: 0.52, cy: 0.29, invTwoSigmaSq: 1 / (2 * 0.175 * 0.175), strength: 0.48, color: palette[1] },
          { cx: 0.74, cy: 0.62, invTwoSigmaSq: 1 / (2 * 0.195 * 0.195), strength: 0.56, color: palette[2] },
          { cx: 0.34, cy: 0.71, invTwoSigmaSq: 1 / (2 * 0.18 * 0.18), strength: 0.44, color: palette[3] },
        ]
      : [
          { cx: 0.70, cy: 0.32, invTwoSigmaSq: 1 / (2 * 0.19 * 0.19), strength: 0.54, color: palette[0] },
          { cx: 0.28, cy: 0.62, invTwoSigmaSq: 1 / (2 * 0.195 * 0.195), strength: 0.52, color: palette[2] },
          { cx: 0.54, cy: 0.72, invTwoSigmaSq: 1 / (2 * 0.18 * 0.18), strength: 0.46, color: palette[1] },
        ];

  const invSize = 1 / (safeSize - 1);

  for (let y = 0; y < safeSize; y++) {
    const ny = y * invSize;
    const dyCenter = ny - 0.5;

    for (let x = 0; x < safeSize; x++) {
      const nx = x * invSize;
      const dxCenter = nx - 0.5;

      // Isotropic smooth circular envelope so outer edges of the rotating square blend seamlessly
      const rCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
      const edgeT = Math.min(1, Math.max(0, (0.49 - rCenter) / 0.17));
      const envelope = edgeT * edgeT * (3 - 2 * edgeT);

      let accumR = 0;
      let accumG = 0;
      let accumB = 0;

      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const dx = nx - s.cx;
        const dy = ny - s.cy;
        const w = Math.exp(-(dx * dx + dy * dy) * s.invTwoSigmaSq) * s.strength * envelope;
        accumR += (s.color.r - floorR) * w;
        accumG += (s.color.g - floorG) * w;
        accumB += (s.color.b - floorB) * w;
      }

      // Soft shoulder compression prevents hot clipping where lobes overlap
      const floatR = floorR + (210 * accumR) / (210 + Math.max(0, accumR) * 0.48);
      const floatG = floorG + (210 * accumG) / (210 + Math.max(0, accumG) * 0.48);
      const floatB = floorB + (210 * accumB) / (210 + Math.max(0, accumB) * 0.48);

      // Triangular-PDF dithering (mostly luminance-correlated + tiny per-channel decorrelation) eliminates 8-bit Mach bands without color speckle
      const lumaDither = (rand() - rand()) * 1.45;
      const rDither = lumaDither + (rand() - 0.5) * 0.35;
      const gDither = lumaDither + (rand() - 0.5) * 0.35;
      const bDither = lumaDither + (rand() - 0.5) * 0.35;

      const idx = (y * safeSize + x) * 4;
      out[idx] = Math.min(255, Math.max(0, Math.round(floatR + rDither)));
      out[idx + 1] = Math.min(255, Math.max(0, Math.round(floatG + gDither)));
      out[idx + 2] = Math.min(255, Math.max(0, Math.round(floatB + bDither)));
      out[idx + 3] = 255;
    }
  }

  return out;
}

export interface LobePoint {
  x: number;
  y: number;
}

/**
 * Jorge Jimenez's Interleaved Gradient Noise centered at 0 in [-0.5, 0.5].
 * High-spatial-frequency sub-LSB spiral lattice that eliminates 8-bit Mach bands
 * at native 1:1 pixel coordinates without visible film grain or low-frequency clumps.
 */
export function interleavedGradientNoise(x: number, y: number): number {
  const inner = 0.06711056 * x + 0.00583715 * y;
  const fracInner = inner - Math.floor(inner);
  const outer = 52.9829189 * fracInner;
  return outer - Math.floor(outer) - 0.5;
}

/**
 * Computes calm, non-rotating Lissajous positions for the 4 album color lobes
 * as a continuous C-infinity function of phaseRad so velocity changes never jump.
 */
export function computeLobePositionsAtPhase(
  phaseRad: number
): [LobePoint, LobePoint, LobePoint, LobePoint] {
  const p = Number.isFinite(phaseRad) ? phaseRad : 0;
  return [
    {
      x: 0.28 + 0.14 * Math.cos(p) + 0.05 * Math.sin(p * 1.7 + 0.4),
      y: 0.36 + 0.13 * Math.sin(p * 0.85) + 0.04 * Math.cos(p * 1.4),
    },
    {
      x: 0.68 + 0.15 * Math.sin(p * 0.9 + 1.1) - 0.04 * Math.cos(p * 1.6),
      y: 0.32 + 0.14 * Math.cos(p * 1.05 + 0.7),
    },
    {
      x: 0.72 + 0.15 * Math.cos(p * 0.8 + 2.3) + 0.04 * Math.sin(p * 1.5),
      y: 0.68 + 0.13 * Math.sin(p * 0.95 + 1.9),
    },
    {
      x: 0.32 + 0.14 * Math.sin(p * 0.75 + 3.6),
      y: 0.69 + 0.13 * Math.cos(p * 0.9 + 2.8) + 0.04 * Math.sin(p * 1.3),
    },
  ];
}

/**
 * Creates a repeatable 1:1-pixel neutral TPDF dither tile (+/- ~2/255 alpha)
 * retained for unit test compatibility.
 */
export function createFineDitherTilePixels(tileSize = 128, seed = 9001): Uint8ClampedArray {
  const safeSize = Math.max(16, Math.floor(tileSize));
  const out = new Uint8ClampedArray(safeSize * safeSize * 4);
  const rand = mulberry32(seed);

  for (let i = 0; i < safeSize * safeSize; i++) {
    const tpdf = rand() - rand();
    const idx = i * 4;
    if (tpdf >= 0) {
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
      out[idx + 3] = Math.round(tpdf * 6);
    } else {
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
      out[idx + 3] = Math.round(-tpdf * 6);
    }
  }

  return out;
}


import { useEffect, useRef } from 'react';
import {
  AmbientPalette,
  buildFallbackAmbientPalette,
  computeAmbientMeshPixels,
  computeLobePositionsAtPhase,
  extractAlbumPaletteFromGrid,
} from '../utils/ambientMesh';
import { DEFAULT_AMBIENT_RGB, RGBColor } from '../utils/lyrics';

interface AmbientBackdropProps {
  albumArtUrl: string | null;
  ambientLightEnabled: boolean;
  isPlaying: boolean;
}

const SAMPLE_GRID_SIZE = 24;
const FULL_DRIFT_PERIOD_SEC = 28; // Calm, meditative organic drift (zero spinning noise)
const RATE_RAMP_DURATION_SEC = 0.9;
const PALETTE_LERP_SPEED = 2.6;

const VERTEX_SHADER_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `
precision highp float;

uniform vec2 u_resolution;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec2 u_p0;
uniform vec2 u_p1;
uniform vec2 u_p2;
uniform vec2 u_p3;

void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - (gl_FragCoord.y / u_resolution.y));
  float maxDim = max(u_resolution.x, u_resolution.y);
  vec2 isoScale = u_resolution / maxDim;

  vec3 floorCol = vec3(16.0, 16.0, 18.0);
  vec3 accum = vec3(0.0);

  vec2 d0 = (uv - u_p0) * isoScale;
  float w0 = exp(-dot(d0, d0) / (2.0 * 0.255 * 0.255)) * 0.66;
  accum += (u_c0 - floorCol) * w0;

  vec2 d1 = (uv - u_p1) * isoScale;
  float w1 = exp(-dot(d1, d1) / (2.0 * 0.240 * 0.240)) * 0.54;
  accum += (u_c1 - floorCol) * w1;

  vec2 d2 = (uv - u_p2) * isoScale;
  float w2 = exp(-dot(d2, d2) / (2.0 * 0.265 * 0.265)) * 0.60;
  accum += (u_c2 - floorCol) * w2;

  vec2 d3 = (uv - u_p3) * isoScale;
  float w3 = exp(-dot(d3, d3) / (2.0 * 0.245 * 0.245)) * 0.48;
  accum += (u_c3 - floorCol) * w3;

  // 32-bit float soft-shoulder tone-mapping
  vec3 floatRgb = floorCol + (215.0 * accum) / (215.0 + max(vec3(0.0), accum) * 0.46);

  // Smooth listening-room vignette computed in 32-bit float prior to quantization
  float vigTop = smoothstep(0.0, 0.28, uv.y);
  float vigBottom = smoothstep(1.0, 0.58, uv.y);
  float vigFactor = mix(0.84, 1.0, vigTop) * mix(0.74, 1.0, vigBottom);
  floatRgb = mix(vec3(15.0, 15.0, 16.0), floatRgb, vigFactor);

  // Stationary 1:1 physical-pixel single-LSB Interleaved Gradient quantization (+/- 0.425/255):
  // mathematically eliminates 8-bit Mach bands without any visible grain or rotating noise.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  vec3 finalRgb = clamp((floatRgb + ign * 0.85) / 255.0, 0.0, 1.0);

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;

interface GlAmbientContext {
  gl: WebGLRenderingContext;
  isSoftwareGl: boolean;
  uResolution: WebGLUniformLocation | null;
  uC0: WebGLUniformLocation | null;
  uC1: WebGLUniformLocation | null;
  uC2: WebGLUniformLocation | null;
  uC3: WebGLUniformLocation | null;
  uP0: WebGLUniformLocation | null;
  uP1: WebGLUniformLocation | null;
  uP2: WebGLUniformLocation | null;
  uP3: WebGLUniformLocation | null;
  cleanup: () => void;
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initWebGlAmbient(canvas: HTMLCanvasElement): GlAmbientContext | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  let rendererName = String(gl.getParameter(gl.RENDERER) ?? '');
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    rendererName += ' ' + String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '');
  }
  const isSoftwareGl = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(rendererName);

  return {
    gl,
    isSoftwareGl,
    uResolution: gl.getUniformLocation(program, 'u_resolution'),
    uC0: gl.getUniformLocation(program, 'u_c0'),
    uC1: gl.getUniformLocation(program, 'u_c1'),
    uC2: gl.getUniformLocation(program, 'u_c2'),
    uC3: gl.getUniformLocation(program, 'u_c3'),
    uP0: gl.getUniformLocation(program, 'u_p0'),
    uP1: gl.getUniformLocation(program, 'u_p1'),
    uP2: gl.getUniformLocation(program, 'u_p2'),
    uP3: gl.getUniformLocation(program, 'u_p3'),
    cleanup: () => {
      if (buffer) gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}

function syncDocumentAmbientVariables(palette: AmbientPalette): void {
  const root = document.documentElement;
  const primary: RGBColor = palette[0];
  const secondary: RGBColor = palette[1];
  root.style.setProperty('--ambient-rgb', `${primary.r}, ${primary.g}, ${primary.b}`);
  root.style.setProperty(
    '--ambient-secondary-rgb',
    `${secondary.r}, ${secondary.g}, ${secondary.b}`
  );
}

function clonePalette(p: AmbientPalette): AmbientPalette {
  return [{ ...p[0] }, { ...p[1] }, { ...p[2] }, { ...p[3] }];
}

export function AmbientBackdrop({
  albumArtUrl,
  ambientLightEnabled,
  isPlaying,
}: AmbientBackdropProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const targetPaletteRef = useRef<AmbientPalette>(buildFallbackAmbientPalette(DEFAULT_AMBIENT_RGB));
  const currentPaletteRef = useRef<AmbientPalette>(
    clonePalette(targetPaletteRef.current)
  );

  const targetRateRef = useRef<number>(!ambientLightEnabled ? 0 : isPlaying ? 1 : 0.08);
  const currentRateRef = useRef<number>(targetRateRef.current);
  const phaseRadRef = useRef<number>(0.45);
  const forceRedrawRef = useRef<boolean>(true);

  useEffect(() => {
    targetRateRef.current = !ambientLightEnabled ? 0 : isPlaying ? 1 : 0.08;
    forceRedrawRef.current = true;
  }, [isPlaying, ambientLightEnabled]);

  // Mount WebGL shader (or clean 2D fallback) once; integrate phase continuously so Play <-> Pause never jumps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const glCtx = initWebGlAmbient(canvas);

    // Fallback 2D renderer if WebGL is disabled in browser settings
    if (!glCtx) {
      canvas.width = 224;
      canvas.height = 224;
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) {
        const pixels = computeAmbientMeshPixels(targetPaletteRef.current, 224, 'primary');
        ctx2d.putImageData(new ImageData(new Uint8ClampedArray(pixels), 224, 224), 0, 0);
      }
      return;
    }

    const syncViewportSize = () => {
      const dpr = glCtx.isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, 1.5);
      const nextW = Math.max(2, Math.round(window.innerWidth * dpr));
      const nextH = Math.max(2, Math.round(window.innerHeight * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
        glCtx.gl.viewport(0, 0, nextW, nextH);
        forceRedrawRef.current = true;
      }
    };

    syncViewportSize();
    window.addEventListener('resize', syncViewportSize);

    let rafId = 0;
    let lastSimTime = performance.now();
    let lastDrawTime = 0;
    const minFrameIntervalMs = glCtx.isSoftwareGl ? 110 : 32; // ~30fps on GPU, ~9fps on CPU SwiftShader
    const angularSpeedRadPerSec = (Math.PI * 2) / FULL_DRIFT_PERIOD_SEC;

    const drawFrame = () => {
      const { gl } = glCtx;
      const pal = currentPaletteRef.current;
      const lobes = computeLobePositionsAtPhase(phaseRadRef.current);

      gl.uniform2f(glCtx.uResolution, canvas.width, canvas.height);
      gl.uniform3f(glCtx.uC0, pal[0].r, pal[0].g, pal[0].b);
      gl.uniform3f(glCtx.uC1, pal[1].r, pal[1].g, pal[1].b);
      gl.uniform3f(glCtx.uC2, pal[2].r, pal[2].g, pal[2].b);
      gl.uniform3f(glCtx.uC3, pal[3].r, pal[3].g, pal[3].b);
      gl.uniform2f(glCtx.uP0, lobes[0].x, lobes[0].y);
      gl.uniform2f(glCtx.uP1, lobes[1].x, lobes[1].y);
      gl.uniform2f(glCtx.uP2, lobes[2].x, lobes[2].y);
      gl.uniform2f(glCtx.uP3, lobes[3].x, lobes[3].y);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (stageRef.current) {
        stageRef.current.dataset.playbackRate = currentRateRef.current.toFixed(3);
        stageRef.current.dataset.phaseRad = phaseRadRef.current.toFixed(4);
      }
    };

    // Draw initial frame synchronously so first paint has zero flash
    drawFrame();
    forceRedrawRef.current = false;

    const tick = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0, (now - lastSimTime) / 1000));
      lastSimTime = now;

      // Smoothly ramp playback velocity toward targetRate without touching phase position
      const targetRate = prefersReducedMotion ? 0 : targetRateRef.current;
      const rateDiff = targetRate - currentRateRef.current;
      if (Math.abs(rateDiff) > 0.0008) {
        const stepAlpha = Math.min(1, (dtSec / RATE_RAMP_DURATION_SEC) * 2.6);
        currentRateRef.current += rateDiff * stepAlpha;
      } else {
        currentRateRef.current = targetRate;
      }

      if (currentRateRef.current > 0.0005) {
        phaseRadRef.current =
          (phaseRadRef.current + dtSec * angularSpeedRadPerSec * currentRateRef.current) %
          (Math.PI * 400);
      }

      // Smoothly crossfade album palette colors on track change
      let paletteAnimating = false;
      const curPal = currentPaletteRef.current;
      const tgtPal = targetPaletteRef.current;
      const palAlpha = Math.min(1, dtSec * PALETTE_LERP_SPEED);
      for (let i = 0; i < 4; i++) {
        const dr = tgtPal[i].r - curPal[i].r;
        const dg = tgtPal[i].g - curPal[i].g;
        const db = tgtPal[i].b - curPal[i].b;
        if (Math.abs(dr) > 0.25 || Math.abs(dg) > 0.25 || Math.abs(db) > 0.25) {
          curPal[i].r += dr * palAlpha;
          curPal[i].g += dg * palAlpha;
          curPal[i].b += db * palAlpha;
          paletteAnimating = true;
        } else {
          curPal[i].r = tgtPal[i].r;
          curPal[i].g = tgtPal[i].g;
          curPal[i].b = tgtPal[i].b;
        }
      }

      const needsDraw =
        forceRedrawRef.current || paletteAnimating || currentRateRef.current > 0.0005;

      if (needsDraw && now - lastDrawTime >= minFrameIntervalMs) {
        lastDrawTime = now;
        forceRedrawRef.current = false;
        drawFrame();
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncViewportSize);
      glCtx.cleanup();
    };
  }, []);

  // Extract 4-quadrant album palette whenever track artwork changes
  useEffect(() => {
    const applyTargetPalette = (palette: AmbientPalette, immediate = false) => {
      syncDocumentAmbientVariables(palette);
      targetPaletteRef.current = clonePalette(palette);
      if (immediate) {
        currentPaletteRef.current = clonePalette(palette);
      }
      forceRedrawRef.current = true;
    };

    if (!albumArtUrl) {
      applyTargetPalette(buildFallbackAmbientPalette(DEFAULT_AMBIENT_RGB));
      return;
    }

    let cancelled = false;
    let objectUrlToRevoke: string | null = null;
    const abortController = new AbortController();

    const loadAndExtract = async () => {
      try {
        let srcForCanvas = albumArtUrl;

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

        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = SAMPLE_GRID_SIZE;
        sampleCanvas.height = SAMPLE_GRID_SIZE;
        const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        if (!sampleCtx) {
          applyTargetPalette(buildFallbackAmbientPalette(DEFAULT_AMBIENT_RGB));
          return;
        }

        sampleCtx.drawImage(img, 0, 0, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE);
        const rawData = sampleCtx.getImageData(0, 0, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE).data;
        const palette = extractAlbumPaletteFromGrid(rawData, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE);
        applyTargetPalette(palette);
      } catch {
        if (!cancelled) {
          applyTargetPalette(buildFallbackAmbientPalette(DEFAULT_AMBIENT_RGB));
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

  return (
    <div
      aria-hidden="true"
      className="ambient-backdrop-container pointer-events-none absolute inset-0 overflow-hidden z-0 bg-[#101012]"
    >
      <div
        ref={stageRef}
        data-testid="ambient-light-stage"
        data-active={ambientLightEnabled ? 'true' : 'false'}
        className={`ambient-light-stage absolute inset-0 overflow-hidden ${
          ambientLightEnabled ? 'opacity-100' : 'opacity-22'
        }`}
      >
        <canvas
          ref={canvasRef}
          className="ambient-shader-canvas block w-full h-full"
        />
      </div>
    </div>
  );
}

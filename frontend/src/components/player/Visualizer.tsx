import { useEffect, useRef } from "react";
import { audioEngine } from "../../lib/audio";
import type { Skin, VizConfig } from "../../lib/types";

export type { Skin };

export function Visualizer({
  config,
  playing,
}: {
  config: VizConfig;
  playing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);
  const peaks = useRef<number[]>([]);
  const angle = useRef(0);
  const cfg = useRef(config);
  cfg.current = config;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const { freq, wave } = audioEngine.sample();
      const { colors, intensity, density, glow, spin, skin } = cfg.current;
      const [c1, c2, c3] = colors;
      ctx.clearRect(0, 0, w, h);
      ctx.shadowBlur = glow;
      ctx.shadowColor = c1;

      if (!freq.length) {
        raf.current = requestAnimationFrame(draw);
        return;
      }
      angle.current += spin ? 0.004 : 0;

      const bass =
        (freq[1] + freq[2] + freq[3] + freq[4]) / (4 * 255) || 0;

      if (skin === "bars") {
        const bars = Math.max(16, Math.round(56 * density));
        const gap = 2;
        const bw = (w - (bars - 1) * gap) / bars;
        if (peaks.current.length !== bars) peaks.current = new Array(bars).fill(0);
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * (freq.length * 0.7));
          const v = (freq[idx] ?? 0) / 255;
          const bh = Math.max(2, v * h * 0.95 * intensity);
          const x = i * (bw + gap);
          const grad = ctx.createLinearGradient(0, h, 0, h - bh);
          grad.addColorStop(0, c1);
          grad.addColorStop(1, c2);
          ctx.fillStyle = grad;
          ctx.fillRect(x, h - bh, bw, bh);
          peaks.current[i] = Math.max((peaks.current[i] ?? 0) - 1.5, bh);
          ctx.fillStyle = c3;
          ctx.fillRect(x, h - peaks.current[i] - 2, bw, 2);
        }
      } else if (skin === "mirror") {
        const bars = Math.max(16, Math.round(48 * density));
        const gap = 2;
        const bw = (w - (bars - 1) * gap) / bars;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * (freq.length * 0.7));
          const v = (freq[idx] ?? 0) / 255;
          const bh = Math.max(2, v * h * 0.48 * intensity);
          const x = i * (bw + gap);
          const grad = ctx.createLinearGradient(0, h / 2 - bh, 0, h / 2 + bh);
          grad.addColorStop(0, c2);
          grad.addColorStop(0.5, c1);
          grad.addColorStop(1, c3);
          ctx.fillStyle = grad;
          ctx.fillRect(x, h / 2 - bh, bw, bh * 2);
        }
      } else if (skin === "wave") {
        ctx.lineWidth = 2;
        ctx.strokeStyle = c1;
        ctx.beginPath();
        const slice = w / wave.length;
        for (let i = 0; i < wave.length; i++) {
          const v = wave[i] / 128 - 1;
          const y = h / 2 + v * h * 0.42 * intensity;
          i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * slice, y);
        }
        ctx.stroke();
      } else if (skin === "aurora") {
        const n = Math.max(24, Math.round(64 * density));
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, c1);
        grad.addColorStop(0.5, c2);
        grad.addColorStop(1, c3);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i <= n; i++) {
          const idx = Math.floor((i / n) * (freq.length * 0.6));
          const v = (freq[idx] ?? 0) / 255;
          ctx.lineTo((i / n) * w, h - v * h * 0.9 * intensity);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (skin === "radial") {
        const n = Math.max(24, Math.round(72 * density));
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.22;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < n; i++) {
          const idx = Math.floor((i / n) * (freq.length * 0.6));
          const v = (freq[idx] ?? 0) / 255;
          const ang = (i / n) * Math.PI * 2 + angle.current;
          const len = r + v * Math.min(w, h) * 0.3 * intensity;
          ctx.strokeStyle = i % 2 ? c1 : c2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
          ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          ctx.stroke();
        }
      } else if (skin === "ripple") {
        const cx = w / 2;
        const cy = h / 2;
        const rings = Math.max(3, Math.round(6 * density));
        const maxR = Math.min(w, h) * 0.48;
        for (let i = rings; i >= 1; i--) {
          const band = Math.floor(((i / rings) * freq.length) / 2);
          const v = (freq[band] ?? 0) / 255;
          const r =
            (i / rings) * maxR + v * 26 * intensity + bass * 30 * intensity;
          ctx.strokeStyle = [c1, c2, c3][i % 3];
          ctx.globalAlpha = 0.35 + v * 0.6;
          ctx.lineWidth = 2 + v * 4;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, r), angle.current, angle.current + Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf.current);
      ro.disconnect();
    };
  }, [playing]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

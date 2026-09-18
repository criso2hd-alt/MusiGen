"""Generate the MusiGen app icon (installer/musigen.ico) — a neon vinyl disc with
an equalizer bar, in the app's cyan->purple->pink theme. Run once; commit the .ico.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # master canvas, downscaled into the .ico sizes


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


CYAN = (34, 211, 238)
PURPLE = (168, 85, 247)
PINK = (244, 63, 94)


def grad3(t):
    t = max(0.0, min(1.0, t))
    return lerp(CYAN, PURPLE, t * 2) if t < 0.5 else lerp(PURPLE, PINK, (t - 0.5) * 2)


def base_bg():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=lerp((11, 13, 22), (20, 15, 33), t) + (255,))
    return img


def glow_layer():
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = cy = S // 2
    r = int(S * 0.30)
    for i in range(28, 0, -1):
        rr = r + i * 7
        a = int(4 * (i / 28) * 8)  # soft purple halo
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(168, 85, 247, a))
    return layer


def draw_disc(img):
    d = ImageDraw.Draw(img)
    cx = cy = S // 2
    r = int(S * 0.30)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(12, 12, 16, 255))
    grooves = list(range(int(r * 0.42), r, max(1, int(r * 0.095))))
    for i, gr in enumerate(grooves):
        col = grad3(i / max(1, len(grooves) - 1))
        d.ellipse([cx - gr, cy - gr, cx + gr, cy + gr],
                  outline=col + (220,), width=max(2, int(S * 0.006)))
    hr = int(r * 0.13)
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=(6, 6, 10, 255))


def draw_equalizer(img):
    d = ImageDraw.Draw(img)
    heights = [0.30, 0.55, 0.42, 0.78, 0.60, 0.92, 0.55, 0.72, 0.40, 0.62, 0.34]
    n = len(heights)
    bw = int(S * 0.045)
    gap = int(S * 0.028)
    total = n * bw + (n - 1) * gap
    x0 = (S - total) // 2
    base_y = int(S * 0.82)
    for i in range(n):
        h = int(heights[i] * S * 0.34)
        x = x0 + i * (bw + gap)
        col = grad3(i / (n - 1))
        d.rounded_rectangle([x, base_y - h, x + bw, base_y],
                            radius=bw // 2, fill=col + (255,))


def main():
    img = base_bg()
    img = Image.alpha_composite(img, glow_layer())
    draw_disc(img)
    draw_equalizer(img)

    # round the corners LAST so nothing punches holes in the background
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255
    )
    img.putalpha(mask)

    out = Path(__file__).with_name("musigen.ico")
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master = img.resize((256, 256), Image.LANCZOS)
    master.save(out, format="ICO", sizes=sizes)
    master.save(Path(__file__).with_name("musigen.png"))
    print("wrote", out)


if __name__ == "__main__":
    main()

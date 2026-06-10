#!/usr/bin/env python3
"""Generate PWA icons for Pineapple Poker (pure stdlib: zlib + struct).

Renders a flat pineapple mark — gold crosshatched body, green crown — on the
app's dark felt background, supersampled 3x for antialiasing.

Outputs into frontend/public/:
  icon-192.png, icon-512.png   (rounded-corner transparent icons)
  icon-maskable-512.png        (full-bleed, content in the 80% safe zone)
  apple-touch-icon.png         (180px, full-bleed square)

Usage: python3 scripts/generate-icons.py
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'frontend' / 'public'

# Palette (app theme)
BG = (17, 24, 39)          # gray-900
GLOW = (21, 128, 61)       # green-700 radial glow
GOLD = (251, 191, 36)      # amber-400 body
GOLD_DARK = (180, 83, 9)   # amber-700 crosshatch
LEAF = (34, 197, 94)       # green-500
LEAF_DARK = (22, 163, 74)  # green-600


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = sign((px, py), a, b), sign((px, py), b, c), sign((px, py), c, a)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


# Crown: (tip, base-left, base-right) triangles in unit space, y down.
LEAVES = [
    ((0.50, 0.10), (0.44, 0.40), (0.56, 0.40)),   # center
    ((0.34, 0.16), (0.42, 0.42), (0.52, 0.38)),   # left
    ((0.66, 0.16), (0.48, 0.38), (0.58, 0.42)),   # right
    ((0.24, 0.28), (0.40, 0.44), (0.48, 0.40)),   # outer left
    ((0.76, 0.28), (0.52, 0.40), (0.60, 0.44)),   # outer right
]


def shade(u, v, maskable):
    """Color of the unit-space point (u, v) → (r, g, b, a)."""
    if maskable:
        # Shrink content into the maskable safe zone
        u = (u - 0.5) / 0.78 + 0.5
        v = (v - 0.5) / 0.78 + 0.5

    # Background with a soft green radial glow (matches the landing page)
    dx, dy = u - 0.5, v - 0.40
    glow = max(0.0, 1.0 - (dx * dx + dy * dy) / 0.16)
    color = lerp(BG, GLOW, 0.30 * glow)

    # Crown leaves (drawn under the body so the body overlaps their bases)
    for i, (tip, bl, br) in enumerate(LEAVES):
        if in_triangle(u, v, tip, bl, br):
            color = LEAF if i % 2 == 0 else LEAF_DARK

    # Body: ellipse with diagonal crosshatch
    bx, by = (u - 0.5) / 0.23, (v - 0.62) / 0.27
    if bx * bx + by * by <= 1.0:
        s, t = (u + v) * 14.0, (u - v) * 14.0
        on_line = (s % 1.0) < 0.22 or (t % 1.0) < 0.22
        color = GOLD_DARK if on_line else GOLD
        # darken toward the rim for a little depth
        rim = (bx * bx + by * by) ** 0.5
        if rim > 0.82:
            color = lerp(color, (0, 0, 0), (rim - 0.82) * 1.6)

    return color


def rounded_alpha(u, v, radius):
    """1.0 inside a rounded unit square of corner radius `radius`, else 0."""
    x = min(u, 1.0 - u)
    y = min(v, 1.0 - v)
    if x >= radius or y >= radius:
        return 1.0
    dx, dy = radius - x, radius - y
    return 1.0 if dx * dx + dy * dy <= radius * radius else 0.0


def render(size, maskable=False, rounded=True, ss=3):
    big = size * ss
    rows = []
    for y in range(big):
        row = bytearray()
        for x in range(big):
            u, v = (x + 0.5) / big, (y + 0.5) / big
            r, g, b = shade(u, v, maskable)
            a = 255 if not rounded else round(255 * rounded_alpha(u, v, 0.20))
            row += bytes((r, g, b, a))
        rows.append(bytes(row))

    # Box downsample ss×ss → size×size
    out_rows = []
    for oy in range(size):
        row = bytearray()
        for ox in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                src = rows[oy * ss + sy]
                for sx in range(ss):
                    o = (ox * ss + sx) * 4
                    for c in range(4):
                        acc[c] += src[o + c]
            n = ss * ss
            row += bytes(v // n for v in acc)
        out_rows.append(bytes(row))
    return out_rows


def write_png(path, size, rows):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    raw = b''.join(b'\x00' + r for r in rows)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    path.write_bytes(png)
    print(f'wrote {path.name} ({len(png)} bytes)')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / 'icon-192.png', 192, render(192))
    write_png(OUT / 'icon-512.png', 512, render(512))
    write_png(OUT / 'icon-maskable-512.png', 512, render(512, maskable=True, rounded=False))
    write_png(OUT / 'apple-touch-icon.png', 180, render(180, rounded=False))


if __name__ == '__main__':
    main()

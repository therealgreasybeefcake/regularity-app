"""Turns preview.cpp's 96x48 frames into LED-style PNGs plus a contact sheet."""

import csv
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

PITCH = 10  # screen px per LED (one P10 pixel = 10 mm)
LED = 6  # lit dot diameter
BORDER = 24  # black frame around the panels
PANEL_X, PANEL_Y = 32, 16  # module size, for the faint seams


def led_image(frame: Image.Image) -> Image.Image:
    w, h = frame.size
    out = Image.new("RGB", (w * PITCH + 2 * BORDER, h * PITCH + 2 * BORDER), (8, 8, 10))
    dots = Image.new("RGB", out.size, (0, 0, 0))
    d = ImageDraw.Draw(dots)
    px = frame.load()
    off = (PITCH - LED) // 2
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            x0, y0 = BORDER + x * PITCH + off, BORDER + y * PITCH + off
            if r or g or b:
                d.ellipse([x0, y0, x0 + LED, y0 + LED], fill=(r, g, b))
            else:
                d.ellipse([x0 + 1, y0 + 1, x0 + LED - 1, y0 + LED - 1], fill=(22, 22, 24))  # unlit LED
    glow = dots.filter(ImageFilter.GaussianBlur(4))
    out = Image.blend(out, glow, 0.55)
    out.paste(dots, mask=dots.convert("L").point(lambda v: 255 if v > 30 else 0))
    seams = ImageDraw.Draw(out)
    for x in range(PANEL_X, w, PANEL_X):
        seams.line([(BORDER + x * PITCH, BORDER), (BORDER + x * PITCH, BORDER + h * PITCH)], fill=(30, 30, 34))
    for y in range(PANEL_Y, h, PANEL_Y):
        seams.line([(BORDER, BORDER + y * PITCH), (BORDER + w * PITCH, BORDER + y * PITCH)], fill=(30, 30, 34))
    return out


def font(size: int):
    for name in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "Helvetica.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main(out_dir: str) -> None:
    out = Path(out_dir)
    rows = list(csv.DictReader(open(out / "scenes.tsv"), delimiter="\t"))
    tiles = []
    for row in rows:
        img = led_image(Image.open(out / f"{row['id']}.ppm").convert("RGB"))
        img.save(out / f"{row['id']}.png")
        caption = f"{row['title']}"
        power = f"≈{float(row['watts_full']):.0f} W at 75%  ·  30 W bank: {int(row['brightness_bank']) * 100 // 255}% → {float(row['watts_bank']):.0f} W"
        tile = Image.new("RGB", (max(img.width, 600), img.height + 64), (24, 24, 28))
        tile.paste(img, ((tile.width - img.width) // 2, 0))
        t = ImageDraw.Draw(tile)
        t.text((BORDER, img.height + 8), caption, fill=(235, 235, 235), font=font(22))
        t.text((BORDER, img.height + 36), power, fill=(150, 150, 160), font=font(17))
        tiles.append(tile)

    cols = 2
    tw, th = tiles[0].size
    gap = 16
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * gap, ((len(tiles) + cols - 1) // cols) * (th + gap) + gap), (14, 14, 16))
    for i, tile in enumerate(tiles):
        sheet.paste(tile, (gap + (i % cols) * (tw + gap), gap + (i // cols) * (th + gap)))
    sheet.save(out / "contact-sheet.png")
    print(f"wrote {len(tiles)} PNGs and contact-sheet.png to {out}/")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")

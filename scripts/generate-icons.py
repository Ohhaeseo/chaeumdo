"""Draws the app icons in frontend/public/icons from the favicon's design (frontend/public/favicon.svg):
a folded map in light lines on a dark square.

    python scripts/generate-icons.py

icon-192.png and icon-512.png keep the favicon's rounded corners. The maskable and Apple icons fill the
whole square, because the phone cuts its own shape out of them; their map is smaller, so it stays inside
the safe area of any mask.
"""
from pathlib import Path

from PIL import Image, ImageDraw

DARK = (17, 17, 17, 255)
LIGHT = (247, 247, 245, 255)
SUPERSAMPLE = 4
# The favicon's path "m6 10 7-3 7 3 6-3v16l-6 3-7-3-7 3zm7-3v16m7-13v16" in its 32-unit box.
OUTLINE = [(6, 10), (13, 7), (20, 10), (26, 7), (26, 23), (20, 26), (13, 23), (6, 26), (6, 10)]
FOLDS = [[(13, 7), (13, 23)], [(20, 10), (20, 26)]]
GLYPH_CENTER = (16, 16.5)


def draw(size: int, rounded: bool, glyph_scale: float) -> Image.Image:
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    canvas = ImageDraw.Draw(image)
    if rounded:
        canvas.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 8 / 32, fill=DARK)
    else:
        canvas.rectangle((0, 0, big, big), fill=DARK)
    unit = big / 32 * glyph_scale
    def place(point):
        return (big / 2 + (point[0] - GLYPH_CENTER[0]) * unit, big / 2 + (point[1] - GLYPH_CENTER[1]) * unit)
    width = max(1, round(1.5 * unit))
    # Running past the start once more makes the closing corner a rounded joint like the others.
    canvas.line([place(p) for p in OUTLINE + OUTLINE[1:2]], fill=LIGHT, width=width, joint="curve")
    for fold in FOLDS:
        canvas.line([place(p) for p in fold], fill=LIGHT, width=width)
    return image.resize((size, size), Image.LANCZOS)


def main():
    out = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    draw(192, rounded=True, glyph_scale=1).save(out / "icon-192.png", optimize=True)
    draw(512, rounded=True, glyph_scale=1).save(out / "icon-512.png", optimize=True)
    draw(512, rounded=False, glyph_scale=0.78).save(out / "icon-maskable-512.png", optimize=True)
    draw(180, rounded=False, glyph_scale=0.86).convert("RGB").save(out / "apple-touch-icon.png", optimize=True)
    for path in sorted(out.iterdir()):
        print(f"{path.name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()

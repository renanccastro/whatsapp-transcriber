"""Draws the extension icon: green speech bubble with text lines."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((32, 40, S - 32, S - 120), radius=110, fill=(26, 143, 76, 255))
d.polygon([(110, S - 140), (90, S - 30), (230, S - 130)], fill=(26, 143, 76, 255))
for i, w in enumerate((330, 260, 300)):
    y = 140 + i * 82
    d.rounded_rectangle((100, y, 100 + w, y + 44), radius=22, fill=(255, 255, 255, 255))

for size in (16, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(OUT / f"{size}.png")

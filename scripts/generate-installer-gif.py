"""
Generates assets/installer-loading.gif for the Smart Book Windows installer.
314x196px animated GIF — shown during SmartBookSetup.exe installation.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

# ── Config ────────────────────────────────────────────────────────────────────
W, H = 314, 196
FRAMES = 48
BG       = (15, 15, 25)        # deep navy
ACCENT   = (99, 179, 237)      # soft sky blue
ACCENT2  = (167, 139, 250)     # lavender
DIM      = (45, 55, 72)        # muted line colour
TEXT_COL = (226, 232, 240)     # near-white
SUB_COL  = (100, 116, 139)     # slate

# ── Book geometry ─────────────────────────────────────────────────────────────
BK_W, BK_H = 54, 68
BK_X = W // 2 - BK_W // 2
BK_Y = H // 2 - BK_H // 2 - 14
SPINE_W = 6

# ── Dots config ───────────────────────────────────────────────────────────────
DOT_R   = 3
DOT_GAP = 12
N_DOTS  = 5
DOT_Y   = BK_Y + BK_H + 22
DOT_X0  = W // 2 - ((N_DOTS - 1) * DOT_GAP) // 2


def ease_in_out(t):
    return t * t * (3 - 2 * t)


def lerp_colour(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def draw_book(draw: ImageDraw.ImageDraw, page_t: float):
    """Draw a simple open-book icon with an animated page turn."""
    # Shadow
    draw.rectangle([BK_X + 3, BK_Y + 3, BK_X + BK_W + 3, BK_Y + BK_H + 3],
                   fill=(0, 0, 0, 80))

    # Left cover
    draw.rectangle([BK_X, BK_Y, BK_X + BK_W // 2, BK_Y + BK_H],
                   fill=(30, 41, 59), outline=DIM, width=1)
    # Right cover
    draw.rectangle([BK_X + BK_W // 2, BK_Y, BK_X + BK_W, BK_Y + BK_H],
                   fill=(30, 41, 59), outline=DIM, width=1)
    # Spine
    draw.rectangle([BK_X + BK_W // 2 - SPINE_W // 2, BK_Y,
                    BK_X + BK_W // 2 + SPINE_W // 2, BK_Y + BK_H],
                   fill=(51, 65, 85))

    # Left-page lines
    for i in range(4):
        ly = BK_Y + 12 + i * 11
        draw.line([(BK_X + 6, ly), (BK_X + BK_W // 2 - 6, ly)],
                  fill=DIM, width=1)

    # Animated right page (turns over)
    t = ease_in_out(page_t)
    # Page goes from right side to left side as t: 0→1
    page_right_x = BK_X + BK_W - int((BK_W // 2 - SPINE_W // 2) * t)
    mid_x = BK_X + BK_W // 2 + SPINE_W // 2
    if page_right_x > mid_x:
        draw.rectangle([mid_x, BK_Y + 2, page_right_x, BK_Y + BK_H - 2],
                       fill=(248, 250, 252))
        for i in range(4):
            ly = BK_Y + 12 + i * 11
            draw.line([(mid_x + 4, ly), (page_right_x - 4, ly)],
                      fill=(180, 180, 190), width=1)

    # Accent bookmark ribbon
    rib_x = BK_X + BK_W - 10
    draw.polygon([
        (rib_x, BK_Y),
        (rib_x + 8, BK_Y),
        (rib_x + 8, BK_Y + 22),
        (rib_x + 4, BK_Y + 17),
        (rib_x, BK_Y + 22),
    ], fill=ACCENT2)


def draw_dots(draw: ImageDraw.ImageDraw, frame: int):
    """Pulsing loading dots — one wave travelling left→right."""
    for i in range(N_DOTS):
        phase = (frame / FRAMES - i / N_DOTS) % 1.0
        # pulse: bright at phase≈0, dim otherwise
        brightness = max(0.0, 1.0 - abs(phase - 0.0) * N_DOTS)
        brightness = min(brightness, 1.0)
        col = lerp_colour(DIM, ACCENT, brightness)
        r = DOT_R + int(1.5 * brightness)
        cx = DOT_X0 + i * DOT_GAP
        draw.ellipse([cx - r, DOT_Y - r, cx + r, DOT_Y + r], fill=col)


def make_frame(frame: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.ImageDraw(img)

    # Subtle horizontal rule at top
    draw.line([(0, 2), (W, 2)], fill=(30, 41, 59), width=1)

    # Book — page flip cycles every FRAMES
    page_t = (frame % FRAMES) / FRAMES
    draw_book(draw, page_t)

    # Title text
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
        font_sub   = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub   = font_title

    title = "Smart Book"
    bbox = draw.textbbox((0, 0), title, font=font_title)
    tw = bbox[2] - bbox[0]
    tx = (W - tw) // 2
    ty = BK_Y + BK_H + 6
    draw.text((tx, ty), title, font=font_title, fill=TEXT_COL)

    sub = "Installing…"
    bbox2 = draw.textbbox((0, 0), sub, font=font_sub)
    sw = bbox2[2] - bbox2[0]
    draw.text(((W - sw) // 2, DOT_Y + DOT_R + 7), sub, font=font_sub, fill=SUB_COL)

    # Dots
    draw_dots(draw, frame)

    return img


# ── Build frames ──────────────────────────────────────────────────────────────
print("Generating frames…")
frames = [make_frame(i) for i in range(FRAMES)]

out_path = os.path.join(os.path.dirname(__file__), "..", "assets", "installer-loading.gif")
out_path = os.path.normpath(out_path)

frames[0].save(
    out_path,
    save_all=True,
    append_images=frames[1:],
    loop=0,
    duration=50,   # ms per frame → ~20fps
    optimize=False,
)
print(f"Saved → {out_path}  ({os.path.getsize(out_path) // 1024} KB)")

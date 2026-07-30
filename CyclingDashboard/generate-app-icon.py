#!/usr/bin/env python3

from pathlib import Path
import sys

from PIL import Image, ImageDraw


SIZE = 1024


def build_icon() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (SIZE, SIZE))
    gradient_draw = ImageDraw.Draw(gradient)

    top = (38, 110, 235)
    bottom = (38, 195, 155)
    for y in range(SIZE):
        progress = y / (SIZE - 1)
        color = tuple(
            round(top[channel] * (1 - progress) + bottom[channel] * progress)
            for channel in range(3)
        )
        gradient_draw.line((0, y, SIZE, y), fill=(*color, 255))

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (24, 24, SIZE - 24, SIZE - 24),
        radius=220,
        fill=255,
    )
    image.paste(gradient, mask=mask)

    draw = ImageDraw.Draw(image)
    white = (255, 255, 255, 255)
    line_width = 28

    rear = (292, 632)
    front = (736, 632)
    radius = 154
    crank = (476, 632)
    seat_joint = (424, 392)
    head_top = (654, 414)
    head_bottom = (684, 500)

    for center in (rear, front):
        x, y = center
        draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            outline=white,
            width=line_width,
        )

    frame_lines = [
        (rear, crank),
        (crank, seat_joint),
        (seat_joint, rear),
        (seat_joint, head_top),
        (head_bottom, crank),
        (head_top, head_bottom),
        (head_bottom, front),
    ]
    for start, end in frame_lines:
        draw.line((*start, *end), fill=white, width=line_width, joint="curve")

    draw.line((seat_joint[0] - 42, seat_joint[1] - 12, seat_joint[0] + 52, seat_joint[1] - 12), fill=white, width=30)
    draw.line((head_top[0], head_top[1], head_top[0] + 36, head_top[1] - 82), fill=white, width=line_width)
    draw.line((head_top[0] + 8, head_top[1] - 82, head_top[0] + 98, head_top[1] - 82), fill=white, width=26)
    draw.ellipse(
        (crank[0] - 34, crank[1] - 34, crank[0] + 34, crank[1] + 34),
        outline=white,
        width=18,
    )
    draw.line((crank[0] - 70, crank[1], crank[0] + 70, crank[1]), fill=white, width=18)

    return image


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate-app-icon.py MASTER_PNG ICONSET_DIR")

    master_path = Path(sys.argv[1])
    iconset_dir = Path(sys.argv[2])
    master_path.parent.mkdir(parents=True, exist_ok=True)
    iconset_dir.mkdir(parents=True, exist_ok=True)

    image = build_icon()
    image.save(master_path)

    for size in (16, 32, 128, 256, 512):
        image.resize((size, size), Image.Resampling.LANCZOS).save(
            iconset_dir / f"icon_{size}x{size}.png"
        )
        image.resize((size * 2, size * 2), Image.Resampling.LANCZOS).save(
            iconset_dir / f"icon_{size}x{size}@2x.png"
        )


if __name__ == "__main__":
    main()

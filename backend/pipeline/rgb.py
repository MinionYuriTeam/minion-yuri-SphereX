"""False-colour frames: three detector arrays as the red, green and blue of one picture."""

from .render import rgb_png
from .stacks import get_stacks


def match_visits(stacks, max_days=30):
    """For each visit of the first array, the nearest visit of the other two (or skip it)."""
    rows = []
    for e in stacks[0].epochs:
        row = [e]
        for s in stacks[1:]:
            near = min(s.epochs, key=lambda o: abs(o.mjd - e.mjd), default=None)
            if near is None or abs(near.mjd - e.mjd) > max_days:
                break
            row.append(near)
        else:
            rows.append(row)
    return rows


def save_rgb_pngs(ra, dec, fov, folder, arrays=(6, 4, 2)):
    """Write rgb_00.png, rgb_01.png ... into folder. arrays = (red, green, blue).
    Returns [(date, path), ...], oldest first."""
    stacks = [get_stacks(ra, dec, fov, array) for array in arrays]
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("rgb_*.png"):
        old.unlink()
    ranges = [s.display_range for s in stacks]
    out = []
    for i, row in enumerate(match_visits(stacks)):
        path = rgb_png(*[e.image for e in row], ranges, folder / f"rgb_{i:02d}.png")
        out.append((row[0].date[:10], path))
    return out
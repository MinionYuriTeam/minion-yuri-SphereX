# Accessibility

Minion Yuri should work for everyone who wants to explore the sky, including
people using a keyboard, a screen reader, zoom, or who are sensitive to motion
or colour. This page says what works today, what doesn't yet, and how to
help. Our target is **WCAG 2.2 level AA** for everything except the sky
images themselves (see [Limits of the science](#limits-of-the-science)).

## What works today

**Keyboard**
- Every button, preset, array and field-of-view picker, and the frame slider
  can be reached with **Tab** and used with **Enter** / **Space**.
- Focused controls show a visible focus ring, and tooltips also open on
  keyboard focus, not just on hover.
- Loupe shortcuts: **+** / **−** zoom, **[** / **]** lens size, **P** pin or
  unpin the lens, **Esc** close the help.
- Dialogs (loupe help, GIF export) are marked as modal and close with **Esc**.

**Screen readers**
- The page language is set (`lang="en"`).
- Every blink frame has alt text naming the visit date; icon-only buttons have
  an `aria-label`.
- Toggles (Normal / Difference / Show 3, flags, loupe pin) say whether they're
  on with `aria-pressed`.
- Loading progress, the sky map and **Spot the mover** results are announced
  through live regions.
- The spectrum chart is labelled as an image with a text description;
  decorative markers are hidden from screen readers.

**Motion**
- The blink player has a **pause** button, and speeds of 1, 2 or 5 pictures per
  second. Nothing on the site flashes more than 3 times a second at the
  default speed (2 fps). 5 fps is opt-in.
- The frame slider lets you step through visits one at a time instead of
  watching them blink.

**Colour**
- Difference mode uses **orange (brighter) and teal (darker)** rather than red
  and green, so it stays readable for the most common kinds of colour
  blindness, and the legend spells the meaning out in words.

## Known gaps

We know about these and would welcome help with any of them:

| Gap | Who it affects | Idea for a fix |
|---|---|---|
| The player autoplays and ignores `prefers-reduced-motion` | People sensitive to motion | Start paused when reduced motion is requested |
| 5 fps blinks faster than 3 flashes a second (WCAG 2.3.1) | People with photosensitive epilepsy | Warn before 5 fps, or cap it at 3 fps |
| The loupe and difference lens follow the mouse; with the keyboard they can only zoom, not move | Keyboard-only users | Arrow keys to move the lens |
| **Spot the mover** and the sky map are mouse/touch first | Keyboard and screen-reader users | Arrow-key navigation of candidates and markers, with text names |
| No "skip to the player" link | Keyboard and screen-reader users | Add a skip link at the top of the page |
| False-colour images rely on colour by nature | Colour-blind visitors | Point to the single-array views, which are greyscale |
| Colour contrast hasn't been checked across the whole site | Low-vision visitors | Run an automated check (axe, Lighthouse) and fix failures |
| The Space Junk Sweeper easter egg needs arrow keys and quick reactions | Some motor-impaired visitors | It's optional; nothing else depends on it |

## Limits of the science

The heart of the site is **seeing a tiny change in a picture**. A screen reader
can't describe that from the pixels, so for the images we aim for the next
best thing: text around them. The target panel gives the position, field of
view and pixel scale as text, and the README describes each built-in target
(what it is, why it's here, how far it moves per year). Giving the Gaia track
and the spectrum as text too is still on the to-do list. If you have ideas for making the motion itself perceivable without
sight (sonification, for example), please open a feature request.

## Testing your change

Before opening a pull request that touches the frontend:

1. **Keyboard:** unplug the mouse (or don't touch it) and do the task with
   Tab, Shift+Tab, Enter, Space and Esc. Can you see where the focus is?
2. **Zoom:** set the browser to 200 % and check that nothing is cut off or
   overlaps, and that the phone layout still works at 320 px wide.
3. **Screen reader:** try it with VoiceOver (macOS: ⌘ F5) or NVDA (Windows).
   New buttons need a visible label or an `aria-label`; new images need `alt`
   (use `alt=""` and `aria-hidden` for decoration).
4. **Automated check:** run Lighthouse's Accessibility audit in Chrome DevTools
   and don't lower the score.
5. **Motion and colour:** anything new that moves can be paused, and nothing
   relies on colour alone to carry meaning.

The pull request template's checklist covers the basics; mention anything
accessibility-related under *Note*.

## Reporting a problem

Something on the site hard or impossible to use? Please tell us:

- open a [bug report](https://github.com/MinionYuriTeam/minion-yuri-SphereX/issues/new?template=bug_report.yml)
  and start the title with **"Accessibility:"**, or
- message a member of the [Team](README.md#team) if you'd rather not post in public.

Say what you were trying to do, which browser and assistive technology you
use, and what happened. We'll reply within 7 days. See also our
[Code of Conduct](CODE_OF_CONDUCT.md) and [Contributing guide](CONTRIBUTING.md).

# Gratitude Bloom — video memory

Paste the **Style lock** for the plan you are generating as the first paragraph of every 8-second prompt. The generator does not remember the previous export. If a clip drifts, regenerate that clip only. Do not change the lock.

Do not ask the generator to draw the SLT Mobitel logo or the words “Gratitude Bloom”. Add those in the editor on the last clip. Generated letters are usually wrong.

## What the video is

Gratitude Bloom is an intranet where someone sends a colleague a finished thank-you card. The intro shows the situation before the product: a person helped, the thanks was real, and it disappeared — a chat that scrolled away, a plain email, or a card that never went out. Then a card is chosen, a name is added, and it arrives.

One continuous evening-to-morning meadow. No scene change of city, season, or art style between clips.

## How to merge

- 5 clips × 8 seconds. Play them in order. Total 40 seconds.
- Export shape: 16:9, 1920×1080, 24 fps, no burned-in subtitles, no watermark, no music.
- If the tool accepts a start image, use the **last frame** of clip N as the **first frame** of clip N+1.
- Cut on the action already finished. Do not crossfade. A 4-frame dissolve hides a small style jump if one clip is slightly off.
- Silence in the generator. Add one music bed in the editor across all five clips.

## Shared world

Storybook illustration, not photoreal, not 3D, not anime. Soft paper texture. Gentle outlines in ink brown `#342e28`. Flat shapes with a little airbrush shading. Motion is slow and continuous. Camera barely moves. No lens flare, no film grain, no dutch tilt, no whip pan.

Palette, used the same way in every clip:

| Role | Hex | Use |
|---|---|---|
| Paper | `#fffaf4` | Sky wash, card stock, UI paper |
| Sage | `#7f9268` | Grass, foliage, “done” marks |
| Sage deep | `#6a735c` | Shadows in leaves |
| Petal | `#d4a090` | Flowers, blush, card accent |
| Petal deep | `#9a6b5c` | Flower centers, cardigan |
| Honey | `#e2b85a` | Lamp, highlights, one text color in Plan B |
| Ink | `#342e28` | Outlines, body text |
| Muted | `#5c534a` | Secondary text |

Meadow: low wildflowers in petal and sage, a pale cream dusk sky, one warm window or desk lamp in honey. Morning clips use the same meadow with a lighter sky, not a different place.

## Plan A — characters

Two people only. Same face, hair, clothes, and height in every clip. Illustrated adults, friendly proportions, about 6 heads tall. No logos on clothing. Hands are simple, four fingers is acceptable if it stays identical. They do not speak. No mouth-flap lip sync.

**A — the one who stayed.** Medium-warm brown skin. Short neat black hair. Sage-green collared shirt `#7f9268`, sleeves rolled once. No jacket. Sitting or standing at a wooden desk.

**B — the one who wants to say thanks.** Light-warm brown skin. Dark shoulder-length hair with a soft wave, no bangs. Cream blouse `#fffaf4` and a dusty-rose cardigan `#d4a090`.

Props that recur: a small desk lamp (honey glow), a cream chat window, a cream email window, one closed flower bud that becomes an open wildflower, and a stack of three finished greeting cards (petal border, sage leaf, honey line). No readable paragraphs inside the cards. A single name, “Ayesha”, may appear in clip 4 only, set in a serif, ink `#342e28`.

### Style lock A (paste into every Plan A prompt)

```
STYLE LOCK: 16:9 storybook illustration, soft paper texture, ink-brown outlines #342e28, palette only cream #fffaf4, sage #7f9268, dusty rose #d4a090, honey gold #e2b85a. Slow calm motion, locked-off camera, no photoreal, no 3D, no anime, no text except the exact words in this prompt, no logo, no watermark, no extra people. Character A: medium-warm brown skin, short neat black hair, sage collared shirt. Character B: light-warm brown skin, dark shoulder-length wavy hair, cream blouse, dusty-rose cardigan. Same meadow at the edge of a quiet desk, wildflowers, cream dusk sky.
```

## Plan B — type and cards

No characters. Full-frame color fields and three physical greeting cards. Type is set in the editor, not by the generator. Generate the picture only. Lay the words on top using the cue sheet so spelling, font, and color cannot drift.

Font: Fraunces (or Georgia if Fraunces is missing). Weight 560 for the main line, 460 for the smaller line. Tracking tight. Centered. Ink `#342e28` on paper fields. On the dark field in clip 1 and clip 3, text is paper `#fffaf4`. One honey word per clip at most: `#e2b85a`.

Cards: cream stock, soft shadow, dusty-rose border, a small sage sprig, no photographs of people, no tiny unreadable paragraphs. Card 1 reads as thanks, card 2 as well done, card 3 as welcome. Show them as pictures, not as UI screenshots of the app.

### Style lock B (paste into every Plan B prompt)

```
STYLE LOCK: 16:9 storybook motion graphic, soft paper texture, no people, no characters, no letters, no words, no logo, no watermark, no UI chrome. Palette only cream #fffaf4, sage #7f9268, dusty rose #d4a090, deep rose #9a6b5c, honey gold #e2b85a, ink brown #342e28. Slow calm motion, locked-off camera, flat illustration with a little shading. Wildflower meadow mood, not a city, not an office photo.
```

### Plan B on-screen text (add in the editor)

| Clip | At | Line | Color | Size |
|---|---|---|---|---|
| B1 | 0.6s–7.4s | Someone helped you this week. | `#fffaf4` | 72px |
| B2 | 0.4s–2.6s | A chat that scrolled away. | `#342e28` | 64px |
| B2 | 2.8s–5.0s | A plain email. | `#9a6b5c` | 64px |
| B2 | 5.2s–7.6s | A thank-you never sent. | `#6a735c` | 64px |
| B3 | 1.0s–7.2s | The help stayed. The thanks didn’t. | `#fffaf4` | 68px |
| B4 | 0.5s–7.4s | Choose a card. Add their name. Send it. | `#342e28` | 56px |
| B5 | 2.2s–7.6s | Gratitude Bloom | `#342e28` | 84px Fraunces |
| B5 | 4.4s–7.6s | Strong connections begin with appreciation | `#5c534a` | 28px |

Leave the center of B1, B3, and B5 empty of flowers so the type has room. Cards in B4 sit in the lower half.

## Negative prompt (append to every segment)

```
photorealistic, live action, 3D render, anime, pixar, extra limbs, extra fingers, deformed face, different outfit, different hair, crowd, city skyline, neon, lens flare, glitch, shaky cam, whip pan, dutch angle, captions, subtitles, watermark, misspelled text, random letters, logo, brand mark, stock-photo office
```

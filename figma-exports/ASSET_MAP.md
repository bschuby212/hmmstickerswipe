# Figma asset map — HMM Playground swipe screen

Source: https://www.figma.com/design/6TMmPv3nmKnh1qWUGBNEbM/HMM-Playground?node-id=17416-3086  
Frame: `17416:3086` — "USE THIS ONE TO START"

## Verdict

**Phase 1 can proceed.** We have 3 individual stickers + shared package header/front/back + wood background as separate PNGs.

Package front/back are **shared across all three sticker sets** (same bag layers; only the sticker changes). That matches the Figma structure.

## Mapped sets (swipe deck, back → front)

| Set | Sticker | Package header | Package back | Package front |
| --- | --- | --- | --- | --- |
| 1 — hike | `stickers/hike.png` | `packages/header-purple.png` | `packages/plastic-back.png` | `packages/plastic-front.png` |
| 2 — adventure mirror | `stickers/adventure-mirror.png` | *(same)* | *(same)* | *(same)* |
| 3 — turtles | `stickers/turtles.png` | *(same)* | *(same)* | *(same)* |

Wood background: `backgrounds/wood-tabletop-chatgpt.png` (primary) or `backgrounds/wood-tabletop-hf.png` (secondary overlay used in mockup).

Figma node mapping:

| Role | Node | Export file |
| --- | --- | --- |
| Wood (ChatGPT) | `17416:3087` | `backgrounds/wood-tabletop-chatgpt.png` |
| Wood (HF overlay) | `17416:3088` | `backgrounds/wood-tabletop-hf.png` / `layers/wood-bg-hf-overlay.png` |
| Hike sticker | `17416:3111` | `stickers/hike.png` |
| Mirror sticker | `17416:3105` | `stickers/adventure-mirror.png` |
| Turtle sticker | `17416:3099` | `stickers/turtles.png` |
| Header | `17416:3109` (and clones) | `packages/header-purple.png` |
| Plastic back | `17416:3110` | `packages/plastic-back.png` |
| Plastic front | `17416:3112` | `packages/plastic-front.png` |

## Layer notes (important for implementation)

1. **Header is separate** from the plastic bag — stack: back plastic → sticker → front plastic → header on top.
2. **Front vs back plastic** are different PNG hashes / slightly different crops from the same source sheet (`packages/plastic-sheet-4variants.png`). In Figma they use opacities ~40% (back) and ~15% (front). Prefer applying those opacities in CSS rather than baking them in.
3. **Raw sticker sources are sprite sheets.** Individual stickers were obtained by exporting the cropped rectangle nodes (recommended for runtime). Sheets kept for reference:
   - `stickers/sheet-adventure-5up.png`
   - `stickers/sheet-kindness-16up.png`
4. **Package plastic source** is a 2×2 sheet of full bag mockups (4 header colors). The approved mockup instead uses the purple header layer + a crop of the plastic body.

## Folder layout

```
figma-exports/
  backgrounds/   wood tabletop sources
  stickers/      individual crops + sprite sheets
  packages/      header, front, back, plastic sheet
  references/    full-screen and package-group composites (do not use as layered runtime assets)
  layers/        direct node exports (duplicates of classified files)
  raw/           all raw MCP image fills from the frame
  ASSET_MAP.md   this file
```

## Reference-only (composites)

- `references/swipe-screen-export.png` — full Screen 1 mockup
- `references/package-group-hike.png`
- `references/package-group-mirror.png`
- `references/package-group-turtles.png`

## Still missing / not blocked

- No per-sticker unique package fronts/backs (shared bag is intentional in Figma).
- Extra stickers exist only on sprite sheets (tree/dog, red rocks, kindness animals, etc.) — not in the approved 3-card swipe deck.
- Screen 2 (`17397:29698`) was not part of this pull.

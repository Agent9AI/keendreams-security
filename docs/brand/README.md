[Repository](../../README.md) / [Documentation](../README.md) / Brand kit

# KeenDreams Security identity

**Security decisions, remembered with evidence.**

The identity comes from the product's central idea: a security decision should
keep its evidence and history. Citation brackets enclose a K-shaped trace. Linked
records, explicit trust states, and defined account boundaries carry that idea
through the cover, product tour, and architecture diagrams.

![KeenDreams Security Memory wordmark](wordmark.svg)

## Design principles

- **Make the product name unmistakable.** Security Memory stays prominent beside KeenDreams.
- **Show the mechanism.** Illustrations explain evidence, review, recall, and isolation.
- **Keep evidence readable.** Real interface details are shown at a useful size, with overview captures in the product tour.
- **State the limits.** Demo captures are labelled. Diagrams illustrate behavior; they do not imply certification or a completed live integration.
- **Respect the reading surface.** The cover has a consistent dark treatment. Diagrams adapt to GitHub's light and dark themes; narrow layouts get their own exports. Native text headings keep the table of contents accessible.

This kit covers the repository and documentation. Product screenshots preserve
the application's actual interface. Source geometry, wording, and diagrams are
original to KeenDreams Security.

## Color roles

The authoritative values are `PALETTES` in [`drawing.py`](drawing.py).

| Role | Light | Dark |
|---|---|---|
| Canvas | `#F4F6F0` | `#081713` |
| Primary text | `#173A2A` | `#EDF5EE` |
| Secondary text | `#4A6253` | `#A4BDAF` |
| Evidence trace | `#235D42` | `#B8E7CA` |
| Decision accent | `#845519` | `#EABB72` |
| Hairline | `#BBCBBF` | `#315044` |
| Panel | `#E8EEE4` | `#10251D` |
| Emphasis surface | `#DCE6D8` | `#1A382A` |

Amber identifies an unconfirmed state or decision point. Green identifies a
trusted state. Labels state that meaning explicitly; color alone never carries
trust. Fine hairlines are decorative. Relationship arrows use the stronger
accent color.

## Typography and spacing

Manrope 800 defines the display wordmark, 700 the headings, and 500 the explanatory
text. IBM Plex Mono 400 supplies technical labels. The source font subsets and
their SIL Open Font Licenses are preserved under [`fonts/`](fonts/).

Body artwork uses 16, 24, and 32 unit spacing, with a 40–48 unit cover inset.
Text is checked against its available column before export. Small labels are
supplementary; essential explanations also appear in normal Markdown.

The SVGs outline their text, so they need no downloaded fonts, scripts, or
external image references. Each export includes a title and description. The
assets are static, and the recorded demo animation is inside an optional disclosure.

## Asset families

| Family | Files | Use |
|---|---|---|
| Cover | `hero-light.svg`, `hero-dark.svg` | 1280 × 352, fixed dark identity in both themes |
| Compact cover | `hero-mobile-light.svg`, `hero-mobile-dark.svg` | 640 × 356, readable mobile composition |
| Mark and wordmark | [`mark.svg`](mark.svg), [`wordmark.svg`](wordmark.svg) | Square identity and horizontal lockup |
| Trust states | [`trust-path-light.svg`](trust-path-light.svg), [`trust-path-dark.svg`](trust-path-dark.svg) | Default proposal-to-recall flow; separate mobile exports |
| Architecture | [`architecture-light.svg`](architecture-light.svg), [`architecture-dark.svg`](architecture-dark.svg) | Account and storage boundaries; separate mobile exports |
| Social preview | [`social-preview.svg`](social-preview.svg), [`social-preview.png`](social-preview.png) | 1280 × 640 repository preview artwork |

The social preview PNG is prepared for GitHub's repository **Settings → Social
preview** field. Committing it does not set that field automatically.

## Rebuild the vectors

```bash
python3 -m venv /tmp/keendreams-brand-env
/tmp/keendreams-brand-env/bin/pip install -r docs/brand/requirements.txt
/tmp/keendreams-brand-env/bin/python docs/brand/build.py
```

- [`drawing.py`](drawing.py) owns typography, colors, geometry primitives, and the mark.
- [`build.py`](build.py) composes covers, identity, and social artwork.
- [`diagrams.py`](diagrams.py) draws the implemented trust and deployment model.

Export `social-preview.svg` at 1280 × 640 when refreshing its PNG. Preserve the
outlined text and the source aspect ratio.

## Product captures

The [product tour](../product-tour.md) uses screenshots of the running local demo
with synthetic evidence. Detail images capture the actual review card and the
audit/rollback section, with separate narrow-screen captures for phones. Overview
captures preserve the surrounding interface.
No product controls, results, or verification states are drawn into those captures.

Keep the logo proportions, theme pairings, and normal-text equivalents. Do not
add endorsements or imply verified interoperability beyond the published
[verification record](../verification.md).

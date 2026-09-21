"""Build self-contained SVG assets. Text is outlined; no network or runtime fonts.

Run: python3 -m pip install -r docs/brand/requirements.txt
     python3 docs/brand/build.py
"""

from html import escape
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
MANROPE = TTFont(ROOT / "fonts/manrope-latin.woff2")
FONTS = {
    "title": instantiateVariableFont(MANROPE, {"wght": 700}, inplace=False),
    "body": instantiateVariableFont(MANROPE, {"wght": 500}, inplace=False),
    "mono": TTFont(ROOT / "fonts/ibm-plex-mono-latin.woff2"),
}
PALETTES = {
    "dark": {
        "bg": "#0B1815", "ink": "#F3F0E7", "muted": "#A6BEB2",
        "accent": "#BFE5CD", "amber": "#E9B86B", "line": "#30483D",
        "panel": "#152B22",
    },
    "light": {
        "bg": "#F6F3EA", "ink": "#173E2D", "muted": "#4F685A",
        "accent": "#235D42", "amber": "#966018", "line": "#CFD8CC",
        "panel": "#EAF0E6",
    },
}


class Canvas:
    def __init__(self, width, height, title, description):
        self.width, self.height = width, height
        self.title, self.description = title, description
        self.elements, self.glyphs = [], {}

    def add(self, markup):
        self.elements.append(markup)

    def text(self, value, x, y, size, color, face="body", tracking=0):
        font = FONTS[face]
        cmap, glyph_set = font.getBestCmap(), font.getGlyphSet()
        scale = size / font["head"].unitsPerEm
        pieces = []
        for char in value:
            name = cmap.get(ord(char))
            if name is None:
                raise ValueError(f"Missing glyph {char!r} in {face}")
            identifier = f"{face}-{ord(char)}"
            if identifier not in self.glyphs:
                pen = SVGPathPen(glyph_set)
                glyph_set[name].draw(pen)
                self.glyphs[identifier] = pen.getCommands()
            pieces.append(
                f'<use href="#{identifier}" transform="translate({x:.3f} {y}) '
                f'scale({scale:.6f} {-scale:.6f})"/>'
            )
            x += font["hmtx"][name][0] * scale + tracking
        self.add(f'<g fill="{color}">{"".join(pieces)}</g>')
        return x

    def save(self, filename):
        definitions = "".join(
            f'<path id="{name}" d="{path}"/>' for name, path in self.glyphs.items()
        )
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" '
            f'height="{self.height}" viewBox="0 0 {self.width} {self.height}" '
            f'role="img" aria-labelledby="title desc">'
            f'<title id="title">{escape(self.title)}</title>'
            f'<desc id="desc">{escape(self.description)}</desc>'
            f'<defs>{definitions}</defs>{"".join(self.elements)}</svg>\n'
        )
        destination = ROOT / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(svg)
        print(f"{destination.relative_to(ROOT)}: {len(svg):,} bytes")


def mark(c, x, y, size, ink, amber):
    c.add(
        f'<g transform="translate({x} {y}) scale({size / 112})" '
        f'fill="none" stroke="{ink}" stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M88 20 A46 46 0 1 0 91 88" stroke-width="3"/>'
        '<path d="M38 29 V83 M39 57 L78 27 M39 57 L78 87" stroke-width="5"/>'
        f'<circle cx="38" cy="57" r="6" fill="{amber}" stroke="none"/>'
        '<circle cx="78" cy="27" r="4" stroke-width="3"/>'
        '<circle cx="78" cy="87" r="4" stroke-width="3"/></g>'
    )


def graph(c, x, y, scale, p):
    c.add(f'<g transform="translate({x} {y}) scale({scale})" fill="none">')
    c.add(f'<circle cx="176" cy="140" r="119" stroke="{p["line"]}"/>')
    c.add(f'<circle cx="176" cy="140" r="94" stroke="{p["line"]}" stroke-dasharray="2 8"/>')
    for path in (
        "M30 47 H98 Q113 47 113 62 V108 H149",
        "M327 25 H247 Q231 25 231 41 V94 L199 126",
        "M323 246 H240 Q224 246 224 230 V185 L197 159",
        "M17 227 H95 Q110 227 110 212 V186 L155 145",
    ):
        c.add(f'<path d="{path}" stroke="{p["accent"]}" stroke-width="1.5"/>')
    c.add(f'<circle cx="176" cy="140" r="57" fill="{p["panel"]}" stroke="{p["accent"]}"/>')
    mark(c, 137, 101, 78, p["accent"], p["amber"])
    for nx, ny in ((30, 47), (327, 25), (323, 246), (17, 227)):
        c.add(f'<circle cx="{nx}" cy="{ny}" r="6" fill="{p["bg"]}" stroke="{p["amber"]}" stroke-width="2"/>')
        c.add(f'<circle cx="{nx}" cy="{ny}" r="2" fill="{p["amber"]}"/>')
    c.add('</g>')


def hero(theme):
    p = PALETTES[theme]
    c = Canvas(1280, 350, "KeenDreams Security Memory",
               "Every decision. Backed by evidence. Open-source security memory by Agent9, "
               "running in your own Cloudflare account. An open memory loop connects evidence to a shared record.")
    c.add(f'<rect x=".5" y=".5" width="1279" height="349" rx="16" fill="{p["bg"]}" stroke="{p["line"]}"/>')
    c.text("AGENT9 / OPEN SOURCE", 56, 46, 13, p["muted"], "mono", 1.2)
    c.text("EVIDENCE / MEMORY", 938, 46, 13, p["muted"], "mono", 1.1)
    mark(c, 52, 89, 92, p["accent"], p["amber"])
    c.text("KeenDreams", 164, 156, 70, p["ink"], "title", -2.7)
    c.text("SECURITY MEMORY", 169, 194, 16, p["muted"], "mono", 3.4)
    c.text("Every decision. Backed by evidence.", 56, 248, 25, p["ink"])
    c.add(f'<path d="M800 73 V270 M56 283 H1224" stroke="{p["line"]}"/>')
    graph(c, 864, 42, .96, p)
    c.text("YOUR CLOUDFLARE ACCOUNT", 56, 322, 13, p["muted"], "mono", .7)
    c.text("EVIDENCE ATTACHED", 498, 322, 13, p["muted"], "mono", .7)
    c.text("MCP / OAUTH / MIT", 1010, 322, 13, p["muted"], "mono", .4)
    c.save(f"hero-{theme}.svg")


def trust_path(theme):
    p = PALETTES[theme]
    c = Canvas(1280, 300, "From evidence to trusted recall",
               "Record quoted evidence, propose an unconfirmed fact, review it in a browser, "
               "then recall the trusted decision with provenance. Explicit administrator "
               "allowlists can let named automation sources write trusted facts directly.")
    c.add(f'<rect x=".5" y=".5" width="1279" height="299" rx="14" fill="{p["bg"]}" stroke="{p["line"]}"/>')
    c.text("THE TRUST BOUNDARY", 36, 40, 15, p["muted"], "mono", 1.5)
    stages = (
        (36, "01 / EVIDENCE", "Record", "Quote and redact", "record_episode"),
        (350, "02 / UNCONFIRMED", "Propose", "Attach the evidence", "assert_fact / suggest_facts"),
        (664, "03 / BROWSER", "Review", "A person decides", "confirm / reject"),
        (978, "04 / TRUSTED", "Recall", "Answer with provenance", "recall / find_facts"),
    )
    for index, (x, label, name, detail, command) in enumerate(stages):
        stroke = p["accent"] if index == 2 else p["line"]
        c.add(f'<rect x="{x}" y="67" width="266" height="155" rx="8" fill="{p["panel"]}" stroke="{stroke}"/>')
        c.text(label, x + 18, 96, 12, p["amber"] if index == 1 else p["muted"], "mono", .3)
        c.text(name, x + 18, 137, 29, p["ink"], "title")
        c.text(detail, x + 18, 165, 17, p["muted"])
        c.text(command, x + 18, 198, 11.5, p["muted"], "mono")
        if index < 3:
            c.add(f'<path d="M{x + 277} 144 H{x + 302} M{x + 296} 138 L{x + 302} 144 L{x + 296} 150" '
                  f'fill="none" stroke="{p["accent"]}" stroke-width="2"/>')
    c.add(f'<circle cx="43" cy="264" r="3" fill="{p["amber"]}"/>')
    c.text("Explicit admin allowlists can let named automation sources write trusted facts directly.",
           58, 270, 17, p["muted"])
    c.save(f"trust-path-{theme}.svg")


def mobile_hero(theme):
    p = PALETTES[theme]
    c = Canvas(640, 330, "KeenDreams Security Memory",
               "Every decision. Backed by evidence. Open-source security memory by Agent9.")
    c.add(f'<rect x=".5" y=".5" width="639" height="329" rx="14" fill="{p["bg"]}" stroke="{p["line"]}"/>')
    c.text("AGENT9 / OPEN SOURCE", 36, 42, 15, p["muted"], "mono", .6)
    mark(c, 30, 75, 83, p["accent"], p["amber"])
    c.text("KeenDreams", 131, 130, 58, p["ink"], "title", -2.3)
    c.text("SECURITY MEMORY", 136, 167, 16, p["muted"], "mono", 2.6)
    c.add(f'<path d="M36 202 H604" stroke="{p["line"]}"/>')
    c.text("Every decision.", 36, 248, 29, p["ink"])
    c.text("Backed by evidence.", 36, 289, 29, p["ink"])
    c.save(f"hero-mobile-{theme}.svg")


def identity():
    p = PALETTES["dark"]
    c = Canvas(128, 128, "KeenDreams mark", "A K-shaped evidence trace inside an open memory loop.")
    c.add(f'<rect width="128" height="128" rx="28" fill="{p["bg"]}"/>')
    mark(c, 8, 8, 112, p["accent"], p["amber"])
    c.save("mark.svg")
    c = Canvas(700, 148, "KeenDreams Security Memory", "KeenDreams wordmark, Agent9.")
    c.add(f'<rect width="700" height="148" rx="12" fill="{p["bg"]}"/>')
    mark(c, 20, 20, 108, p["accent"], p["amber"])
    c.text("KeenDreams", 152, 81, 60, p["ink"], "title", -2.4)
    c.text("SECURITY MEMORY", 156, 112, 14, p["muted"], "mono", 3)
    c.save("wordmark.svg")
    c = Canvas(1280, 640, "KeenDreams Security Memory by Agent9",
               "Every decision. Backed by evidence. Security memory in your own Cloudflare account.")
    c.add(f'<rect width="1280" height="640" fill="{p["bg"]}"/>')
    c.text("AGENT9 / OPEN SOURCE", 64, 64, 16, p["muted"], "mono", 1.5)
    mark(c, 61, 104, 104, p["accent"], p["amber"])
    c.text("KeenDreams", 64, 294, 94, p["ink"], "title", -3.5)
    c.text("SECURITY MEMORY", 68, 345, 20, p["muted"], "mono", 4.4)
    c.text("Every decision.", 64, 426, 36, p["ink"])
    c.text("Backed by evidence.", 64, 477, 36, p["ink"])
    graph(c, 834, 169, 1.08, p)
    c.add(f'<path d="M64 548 H1216" stroke="{p["line"]}"/>')
    c.text("YOUR CLOUD. YOUR MEMORY. YOUR CONTROL.", 64, 593, 16, p["muted"], "mono", 1)
    c.text("AGENT9.DEV", 1092, 593, 16, p["muted"], "mono", .8)
    c.save("social-preview.svg")


if __name__ == "__main__":
    for theme in PALETTES:
        hero(theme)
        mobile_hero(theme)
        trust_path(theme)
    identity()

"""Shared vector primitives and typography for the KeenDreams brand kit."""
from html import escape
from pathlib import Path
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
SOURCE_FONT = TTFont(ROOT / 'fonts/manrope-latin.woff2')
FONTS = {
    'display': instantiateVariableFont(SOURCE_FONT, {'wght': 800}, inplace=False),
    'title': instantiateVariableFont(SOURCE_FONT, {'wght': 700}, inplace=False),
    'body': instantiateVariableFont(SOURCE_FONT, {'wght': 500}, inplace=False),
    'mono': TTFont(ROOT / 'fonts/ibm-plex-mono-latin.woff2'),
}
PALETTES = {
    'dark': {
        'bg': '#081713', 'ink': '#EDF5EE', 'muted': '#A4BDAF',
        'accent': '#B8E7CA', 'amber': '#EABB72', 'line': '#315044',
        'panel': '#10251D', 'soft': '#1A382A',
    },
    'light': {
        'bg': '#F4F6F0', 'ink': '#173A2A', 'muted': '#4A6253',
        'accent': '#235D42', 'amber': '#845519', 'line': '#BBCBBF',
        'panel': '#E8EEE4', 'soft': '#DCE6D8',
    },
}

class Canvas:
    def __init__(self, width, height, title, description):
        self.width, self.height = width, height
        self.title, self.description = title, description
        self.elements, self.glyphs = [], {}

    def add(self, markup):
        self.elements.append(markup)

    def text(self, value, x, y, size, color, face='body', tracking=0, max_width=None):
        font = FONTS[face]
        cmap, glyph_set = font.getBestCmap(), font.getGlyphSet()
        scale = size / font['head'].unitsPerEm
        start = x
        pieces = []
        for char in value:
            name = cmap.get(ord(char))
            if name is None:
                raise ValueError(f'Missing glyph {char!r} in {face}')
            identifier = f'{face}-{ord(char)}'
            if identifier not in self.glyphs:
                pen = SVGPathPen(glyph_set)
                glyph_set[name].draw(pen)
                self.glyphs[identifier] = pen.getCommands()
            pieces.append(f'<use href="#{identifier}" transform="translate({x:.3f} {y}) scale({scale:.6f} {-scale:.6f})"/>')
            x += font['hmtx'][name][0] * scale + tracking
        if max_width is not None and x - start > max_width:
            raise ValueError(f'Text exceeds its column: {value!r}: {x-start:.1f} > {max_width}')
        self.add(f'<g fill="{color}">{"".join(pieces)}</g>')
        return x

    def rect(self, x, y, width, height, fill, stroke='none', radius=8, sw=1):
        self.add(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def path(self, path, color, width=1.5, dash=None):
        extra = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"{extra}/>')

    def dot(self, x, y, color, radius=3):
        self.add(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{color}"/>')

    def save(self, filename):
        definitions = ''.join(f'<path id="{name}" d="{path}"/>' for name, path in self.glyphs.items())
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" '
               f'viewBox="0 0 {self.width} {self.height}" role="img" aria-labelledby="title desc">'
               f'<title id="title">{escape(self.title)}</title><desc id="desc">{escape(self.description)}</desc>'
               f'<defs>{definitions}</defs>{"".join(self.elements)}</svg>\n')
        destination = ROOT / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(svg)
        print(f'{filename}: {len(svg):,} bytes')


def mark(c, x, y, size, ink, amber):
    """Citation brackets surround a K-shaped evidence trace."""
    c.add(f'<g transform="translate({x} {y}) scale({size/112})" fill="none" stroke-linecap="round" stroke-linejoin="round">')
    c.path('M27 13 H13 V99 H27 M85 13 H99 V99 H85', ink, 5)
    c.path('M39 29 V84 M40 57 L76 29 M40 57 L76 84', ink, 7)
    c.dot(39, 57, amber, 6)
    c.dot(76, 29, ink, 4)
    c.dot(76, 84, ink, 4)
    c.add('</g>')


def frame(c, p, radius=14):
    c.rect(.5, .5, c.width-1, c.height-1, p['bg'], p['line'], radius)


def arrow(c, x1, x2, y, color):
    c.path(f'M{x1} {y} H{x2} M{x2-7} {y-6} L{x2} {y} L{x2-7} {y+6}', color, 2)

"""Rebuild original, self-contained KeenDreams SVG artwork.

Run: python3 -m pip install -r docs/brand/requirements.txt
     python3 docs/brand/build.py
"""
from drawing import Canvas, PALETTES, frame, mark
from diagrams import architecture, trust_path


def evidence_record(c, x, y, scale=1):
    """Conceptual record illustration, not a screenshot or measured output."""
    p = PALETTES['dark']
    c.add(f'<g transform="translate({x} {y}) scale({scale})">')
    # Evidence documents converge on the record; the outer rails suggest a ledger.
    for dx, dy in [(16, 10), (8, 5)]:
        c.rect(92+dx, 29+dy, 291, 206, p['bg'], p['line'], 10)
    for sy in (38, 164):
        c.rect(0, sy, 70, 76, p['panel'], p['line'], 6)
        c.path(f'M16 {sy+21} H50 M16 {sy+33} H42 M16 {sy+45} H49', p['muted'], 2)
        c.path(f'M70 {sy+38} H83 V129 H103', p['accent'], 1.5)
        c.dot(70, sy+38, p['amber'], 3)
    c.rect(102, 18, 291, 211, p['panel'], p['accent'], 9)
    c.text('AFTER REVIEW', 122, 46, 12, p['muted'], 'mono', 1.1)
    c.text('A decision.', 122, 82, 25, p['ink'], 'title')
    c.text('Evidence attached.', 122, 112, 25, p['ink'], 'title', max_width=253)
    c.path('M122 133 H371', p['line'])
    for ix, label in enumerate(['Evidence', 'Reviewer', 'History']):
        py = 158 + ix*25
        c.path(f'M123 {py-5} L127 {py-1} L134 {py-9}', p['accent'], 2)
        c.text(label, 147, py, 15, p['muted'], 'mono')
        c.dot(364, py-5, p['amber'], 2)
    c.add('</g>')


def hero(theme):
    # A fixed dark cover gives the identity the same presence on both GitHub themes.
    p = PALETTES['dark']
    c = Canvas(1280, 352, 'KeenDreams Security Memory',
               'Security decisions, remembered with evidence. Open-source security memory by Agent9. '
               'A conceptual record brings together its evidence, reviewer and history.')
    frame(c, p, 14)
    c.path('M40 61 H1240', p['line'])
    c.text('AGENT9 / OPEN SOURCE', 44, 39, 14, p['muted'], 'mono', 1)
    c.text('KEENDREAMS SECURITY', 1000, 39, 14, p['muted'], 'mono', .5)
    mark(c, 43, 91, 99, p['accent'], p['amber'])
    c.text('KeenDreams', 162, 157, 79, p['ink'], 'display', -3.2)
    c.text('Security Memory', 166, 202, 34, p['accent'], 'body', -.4)
    c.text('Security decisions, remembered with evidence.', 46, 258, 24, p['ink'], max_width=714)
    evidence_record(c, 811, 48, 1)
    c.path('M40 296 H1240', p['line'])
    for x, text in [(45, 'CITED EVIDENCE'), (427, 'HUMAN REVIEW'), (862, 'YOUR CLOUDFLARE ACCOUNT')]:
        c.dot(x, 326, p['amber'], 3)
        c.text(text, x+15, 331, 14, p['muted'], 'mono', .5)
    c.save(f'hero-{theme}.svg')


def mobile_hero(theme):
    p = PALETTES['dark']
    c = Canvas(640, 356, 'KeenDreams Security Memory',
               'Security decisions, remembered with evidence. Open-source security memory by Agent9.')
    frame(c, p)
    c.text('AGENT9 / OPEN SOURCE', 32, 37, 15, p['muted'], 'mono', .7)
    c.path('M32 57 H608', p['line'])
    mark(c, 28, 92, 83, p['accent'], p['amber'])
    c.text('KeenDreams', 128, 140, 61, p['ink'], 'display', -2.6, max_width=475)
    c.text('Security Memory', 132, 180, 29, p['accent'])
    c.path('M32 215 H608', p['line'])
    c.text('Security decisions,', 32, 264, 32, p['ink'], 'body')
    c.text('remembered with evidence.', 32, 309, 32, p['ink'], 'body')
    c.save(f'hero-mobile-{theme}.svg')



def identity():
    p = PALETTES['dark']
    c = Canvas(128, 128, 'KeenDreams Security mark', 'Citation brackets enclose a K-shaped evidence trace.')
    c.rect(0, 0, 128, 128, p['bg'], radius=24)
    mark(c, 10, 10, 108, p['accent'], p['amber'])
    c.save('mark.svg')
    c = Canvas(760, 164, 'KeenDreams Security Memory', 'KeenDreams Security Memory by Agent9.')
    frame(c, p)
    mark(c, 18, 28, 105, p['accent'], p['amber'])
    c.text('KeenDreams', 154, 88, 67, p['ink'], 'display', -2.7)
    c.text('Security Memory', 158, 129, 28, p['accent'])
    c.save('wordmark.svg')
    c = Canvas(1280, 640, 'KeenDreams Security Memory by Agent9',
               'Security decisions, remembered with evidence. Open-source security memory in your own Cloudflare account.')
    frame(c, p, 0)
    c.text('AGENT9 / OPEN SOURCE', 58, 54, 17, p['muted'], 'mono', 1)
    c.path('M58 80 H1222', p['line'])
    mark(c, 56, 113, 108, p['accent'], p['amber'])
    c.text('KeenDreams', 58, 318, 101, p['ink'], 'display', -4.1)
    c.text('Security Memory', 64, 378, 45, p['accent'])
    c.text('Security decisions,', 64, 465, 33, p['ink'])
    c.text('remembered with evidence.', 64, 512, 33, p['ink'])
    evidence_record(c, 810, 192, 1)
    c.path('M58 560 H1222', p['line'])
    c.text('CITED EVIDENCE / HUMAN REVIEW / YOUR CLOUD', 64, 604, 15, p['muted'], 'mono', .7)
    c.text('AGENT9.DEV', 1106, 604, 15, p['muted'], 'mono')
    c.save('social-preview.svg')


if __name__ == '__main__':
    for theme in PALETTES:
        hero(theme)
        mobile_hero(theme)
        trust_path(theme)
        architecture(theme)
    identity()

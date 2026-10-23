"""Artwork for the Hexa to Memory skill page.

Values shown as live come from docs/evidence/hexa-risk-acceptance-2026-10-23.json and
docs/evidence/hexa-workflow-2026-10-10.json. Everything else is labelled as an illustration.
"""
from drawing import Canvas, FONTS, PALETTES, arrow, frame, mark

OUT = '../images/hexa-to-memory/'
ALLOWED = ['tenable_one_search_assets', 'workbenches_list_vulnerabilities',
           'workbenches_list_assets_with_vulnerabilities', 'workbenches_get_asset_vulnerabilities',
           'workbenches_get_asset_vulnerability_details']
REFUSED = ['scan_create', 'scan_launch', 'ticket_create_issue', 'ticket_notify_assignees',
           'tagging_create_tag', 'tagging_add_tags_assets']


def width(value, size, face='body', tracking=0):
    font = FONTS[face]
    cmap, scale = font.getBestCmap(), size / font['head'].unitsPerEm
    return sum(font['hmtx'][cmap[ord(ch)]][0] * scale + tracking for ch in value)


def centered(c, value, cx, y, size, color, face='body', tracking=0):
    c.text(value, cx - width(value, size, face, tracking) / 2, y, size, color, face, tracking)


def right(c, value, rx, y, size, color, face='body', tracking=0):
    c.text(value, rx - width(value, size, face, tracking), y, size, color, face, tracking)


def check(c, x, y, color, s=1):
    c.path(f'M{x} {y} L{x+5*s} {y+5*s} L{x+13*s} {y-5*s}', color, 2.2 * s)


def cross(c, x, y, color, s=1):
    c.path(f'M{x} {y-5*s} L{x+10*s} {y+5*s} M{x+10*s} {y-5*s} L{x} {y+5*s}', color, 2.2 * s)


def down(c, x, y1, y2, color):
    c.path(f'M{x} {y1} V{y2} M{x-7} {y2-7} L{x} {y2} L{x+7} {y2-7}', color, 2)


def chip(c, x, y, label, color, p, size=15):
    w = width(f'[ {label} ]', size, 'mono', .5)
    c.text(f'[ {label} ]', x, y, size, color, 'mono', .5)
    return x + w


# ---------------------------------------------------------------- cover

def finding_to_decision(c, x, y):
    """Illustration of the live pair: a Hexa finding meets the team's confirmed decision."""
    p = PALETTES['dark']
    c.add(f'<g transform="translate({x} {y})">')
    c.rect(0, 34, 176, 128, p['panel'], p['line'], 8)
    c.text('HEXA FINDING', 18, 62, 12, p['muted'], 'mono', 1)
    c.text('Plugin 344819', 18, 96, 21, p['ink'], 'title')
    c.text('Critical', 18, 124, 17, p['amber'], 'mono')
    c.text('read-only', 18, 148, 14, p['muted'], 'mono')
    c.path('M176 98 H206', p['accent'], 2)
    c.rect(206, 0, 228, 196, p['soft'], p['accent'], 9)
    c.text('TEAM MEMORY', 226, 28, 12, p['muted'], 'mono', 1)
    c.text('[ TRUSTED ]', 226, 58, 14, p['accent'], 'mono', .5)
    c.text('ACCEPTED_RISK', 226, 90, 21, p['ink'], 'title')
    c.path('M226 106 H414', p['line'])
    for row, label in enumerate(['Evidence', 'Reviewer', 'Expires 2027-01-21']):
        check(c, 228, 126 + row * 20, p['accent'], .8)
        c.text(label, 246, 131 + row * 20, 14, p['muted'], 'mono')
    c.add('</g>')


def hero():
    p = PALETTES['dark']
    for mobile in (False, True):
        if mobile:
            c = Canvas(640, 420, 'Hexa to Memory, a KeenDreams Security skill',
                       'A Claude Code skill that triages Tenable Hexa findings against your team\'s '
                       'confirmed decisions in KeenDreams Security Memory.')
            frame(c, p)
            c.text('AGENT9 / CLAUDE CODE SKILL', 32, 37, 15, p['muted'], 'mono', .7)
            c.path('M32 57 H608', p['line'])
            mark(c, 28, 86, 80, p['accent'], p['amber'])
            c.text('Hexa to', 126, 128, 52, p['ink'], 'display', -2)
            c.text('Memory', 126, 178, 52, p['ink'], 'display', -2)
            c.path('M32 210 H608', p['line'])
            c.text('Triage that remembers', 32, 258, 31, p['accent'])
            c.text('what your team decided.', 32, 300, 31, p['accent'])
            c.path('M32 336 H608', p['line'])
            for row, label in enumerate(['READS TENABLE HEXA AI MCP', 'REQUIRES KEENDREAMS SECURITY']):
                c.dot(37, 364 + row * 28, p['amber'], 3)
                c.text(label, 52, 369 + row * 28, 15, p['muted'], 'mono', .5)
            c.save(OUT + 'hero-mobile.svg')
            continue
        c = Canvas(1280, 352, 'Hexa to Memory, a KeenDreams Security skill',
                   'A Claude Code skill that triages Tenable Hexa findings against your team\'s confirmed '
                   'decisions in KeenDreams Security Memory. The illustration shows the live 2026-10-23 '
                   'pair: plugin 344819 meets a trusted ACCEPTED_RISK decision that expires 2027-01-21.')
        frame(c, p, 14)
        c.text('AGENT9 / CLAUDE CODE SKILL', 44, 39, 14, p['muted'], 'mono', 1)
        right(c, 'KEENDREAMS SECURITY', 1236, 39, 14, p['muted'], 'mono', .5)
        c.path('M40 61 H1240', p['line'])
        mark(c, 43, 91, 99, p['accent'], p['amber'])
        c.text('Hexa to Memory', 162, 157, 74, p['ink'], 'display', -3, max_width=600)
        c.text('Triage that remembers what your team decided.', 166, 202, 26, p['accent'], max_width=600)
        c.text('Tenable findings, checked against cited, human-confirmed memory.', 46, 258, 21, p['ink'], max_width=720)
        finding_to_decision(c, 800, 76)
        c.path('M40 296 H1240', p['line'])
        for x, label in [(45, 'READ-ONLY HEXA TOOLS'), (420, 'HUMAN-CONFIRMED DECISIONS'), (862, 'REQUIRES KEENDREAMS SECURITY')]:
            c.dot(x, 326, p['amber'], 3)
            c.text(label, x + 15, 331, 14, p['muted'], 'mono', .5)
        c.save(OUT + 'hero.svg')


def badges():
    p = PALETTES['dark']
    for name, key, value, color in [
        ('live', 'LIVE VERIFIED', '2026-10-23', p['accent']),
        ('readonly', 'HEXA', 'READ-ONLY', p['accent']),
        ('requires', 'REQUIRES', 'KEENDREAMS SECURITY', p['amber']),
        ('platform', 'PLATFORM', 'CLAUDE CODE', p['ink']),
    ]:
        kw, vw = width(key, 12, 'mono', .8), width(value, 12, 'mono', .8)
        w = int(kw + vw + 46)
        c = Canvas(w, 28, f'{key.title()}: {value.title()}', f'{key}: {value}')
        c.rect(.5, .5, w - 1, 27, p['bg'], p['line'], 6)
        c.add(f'<rect x="{kw + 23}" y="1" width="{w - kw - 24}" height="26" rx="5" fill="{p["soft"]}"/>')
        c.text(key, 12, 18, 12, p['muted'], 'mono', .8)
        c.text(value, kw + 34, 18, 12, color, 'mono', .8)
        c.save(OUT + f'badge-{name}.svg')


# ---------------------------------------------------------------- live result

TIMELINE = [
    ('2026-10-10 21:43', 'Finding confirmed', 'HAS_VULN, browser review', 'accent'),
    ('2026-10-23 19:00:09', 'Decision proposed', 'Claude Code, UNCONFIRMED', 'amber'),
    ('2026-10-23 19:01:38', 'Decision confirmed', 'Browser review, 89 s later', 'accent'),
    ('Next session', 'Recalled unprompted', 'Read-only, 0 writes', 'accent'),
]
FLAGS = ['Same person proposed and confirmed it: valid, not independent review',
         'Newer plugin 366093 on the same asset is not covered by this decision']


def live_result(theme):
    p = PALETTES[theme]
    c = Canvas(1280, 640, 'Live result, 2026-10-23',
               'A fresh read-only Claude Code session triaged plugin 344819 on a lab asset and reported a '
               'prior triage decision: ACCEPTED_RISK, confirmed by the maintainer at 19:01:38 UTC, expiring '
               '2027-01-21. The audit timeline runs from the 2026-10-10 confirmed finding to the fresh recall. '
               'The session flagged self-approval and an uncovered newer plugin, 366093.')
    frame(c, p)
    c.text('LIVE RESULT / 2026-10-23 / FRESH READ-ONLY SESSION', 32, 40, 15, p['accent'], 'mono', .8)
    right(c, 'ASSET ID WITHHELD', 1248, 40, 15, p['muted'], 'mono', .8)
    cols = [(32, 'ASSET'), (182, 'FINDING'), (452, 'SEVERITY'), (592, 'STATUS'), (902, 'DECIDED'), (1104, 'EXPIRES')]
    c.rect(32, 64, 1216, 150, p['panel'], p['line'], 9)
    for x, label in cols:
        c.text(label, x + 20, 98, 13, p['muted'], 'mono', 1)
    c.path('M52 114 H1228', p['line'])
    c.text('Lab asset', 52, 152, 22, p['ink'], 'title')
    c.text('Plugin 344819', 202, 152, 22, p['ink'], 'title')
    c.text('.NET Framework, Sep 2026', 202, 182, 16, p['muted'])
    c.text('Critical', 472, 152, 20, p['amber'], 'mono')
    chip(c, 612, 152, 'PRIOR TRIAGE DECISION', p['accent'], p, 16)
    c.text('ACCEPTED_RISK, trusted', 612, 182, 16, p['muted'], 'mono')
    c.text('Maintainer', 922, 152, 22, p['ink'], 'title')
    c.text('19:01 UTC, browser', 922, 182, 16, p['muted'])
    c.text('2027-01-21', 1124, 152, 22, p['ink'], 'title')
    c.text('90 days', 1124, 182, 16, p['muted'])
    c.text('AUDIT TIMELINE', 32, 262, 15, p['muted'], 'mono', .8)
    c.path('M68 318 H1004', p['line'], 2)
    c.path('M1016 318 H1212', p['line'], 2, '3 7')
    for index, (when, title, detail, tone) in enumerate(TIMELINE):
        x = 68 + index * 312
        color = p[tone]
        c.add(f'<circle cx="{x}" cy="318" r="11" fill="{p["bg"]}" stroke="{color}" stroke-width="2.5"/>')
        c.dot(x, 318, color, 4.5)
        c.text(when, x - 12, 296, 14, p['muted'], 'mono', .3, max_width=290)
        c.text(title, x - 12, 366, 22, p['ink'], 'title', max_width=290)
        c.text(detail, x - 12, 394, 16, color, 'mono', max_width=290)
    c.text('RAISED BY THE SKILL, UNPROMPTED', 32, 450, 15, p['muted'], 'mono', .8)
    for row, flag in enumerate(FLAGS):
        y = 470 + row * 58
        c.rect(32, y, 1216, 46, p['soft'], p['line'], 7)
        c.dot(54, y + 23, p['amber'], 5)
        c.text(flag, 74, y + 30, 19, p['ink'], max_width=1150)
    c.text('0 Tenable writes. 0 memory writes in the triage session. Source: docs/evidence/hexa-risk-acceptance-2026-10-23.json',
           32, 612, 15, p['muted'], 'mono', max_width=1216)
    c.save(OUT + f'live-result-{theme}.svg')
    live_result_mobile(theme)


def live_result_mobile(theme):
    p = PALETTES[theme]
    c = Canvas(640, 1130, 'Live result, 2026-10-23',
               'A fresh read-only session reported a prior triage decision for plugin 344819: ACCEPTED_RISK, '
               'confirmed by the maintainer, expiring 2027-01-21. It flagged self-approval and an uncovered newer plugin.')
    frame(c, p)
    c.text('LIVE RESULT / 2026-10-23', 28, 40, 17, p['accent'], 'mono', .6)
    c.text('Fresh read-only session. Asset ID withheld.', 28, 70, 19, p['muted'])
    c.rect(24, 92, 592, 402, p['panel'], p['line'], 9)
    rows = [('FINDING', 'Plugin 344819', '.NET Framework, Sep 2026, Critical'),
            ('STATUS', 'Prior triage decision', 'ACCEPTED_RISK, trusted'),
            ('DECIDED', 'Maintainer', '2026-10-23 19:01 UTC, browser'),
            ('EXPIRES', '2027-01-21', '90 days')]
    for i, (k, v, d) in enumerate(rows):
        y = 136 + i * 92
        c.text(k, 48, y, 14, p['muted'], 'mono', 1)
        c.text(v, 48, y + 32, 25, p['accent'] if k == 'STATUS' else p['ink'], 'title', max_width=540)
        c.text(d, 48, y + 58, 17, p['muted'], max_width=540)
    c.text('AUDIT TIMELINE', 28, 542, 16, p['muted'], 'mono', .8)
    c.path('M48 572 V810', p['line'], 2)
    for i, (when, title, detail, tone) in enumerate(TIMELINE):
        y = 578 + i * 76
        c.add(f'<circle cx="48" cy="{y}" r="10" fill="{p["bg"]}" stroke="{p[tone]}" stroke-width="2.5"/>')
        c.dot(48, y, p[tone], 4)
        c.text(when, 76, y - 6, 14, p['muted'], 'mono')
        c.text(title, 76, y + 22, 22, p['ink'], 'title')
        c.text(detail, 76, y + 46, 16, p[tone], 'mono', max_width=530)
    c.text('RAISED BY THE SKILL', 28, 900, 16, p['muted'], 'mono', .8)
    lines = [['Same person proposed and confirmed it:', 'valid, not independent review'],
             ['Newer plugin 366093 on the same asset', 'is not covered by this decision']]
    for i, pair in enumerate(lines):
        y = 918 + i * 88
        c.rect(24, y, 592, 76, p['soft'], p['line'], 7)
        c.dot(46, y + 26, p['amber'], 5)
        for j, value in enumerate(pair):
            c.text(value, 64, y + 32 + j * 26, 18, p['ink'], max_width=530)
    c.text('0 Tenable writes. 0 triage-session memory writes.', 28, 1112, 15, p['muted'], 'mono')
    c.save(OUT + f'live-result-mobile-{theme}.svg')


# ---------------------------------------------------------------- what you need

def requirements(theme):
    p = PALETTES[theme]
    c = Canvas(1280, 470, 'What the skill needs',
               'Three parts you own: your Tenable One tenant with Hexa AI MCP, Claude Code running the skill, '
               'and KeenDreams Security in your Cloudflare account. The skill reads findings from Hexa, checks '
               'and proposes in KeenDreams, and recalls confirmed decisions. A reviewer confirms proposals in a browser. '
               'Nothing passes through Agent9.')
    frame(c, p)
    c.text('WHAT YOU CONNECT', 32, 40, 15, p['muted'], 'mono', .8)
    boxes = [(32, 336, 'YOUR TENABLE ONE TENANT', 'Hexa AI MCP', ['Findings source', 'Your license, read keys']),
             (486, 308, 'YOUR MACHINE', 'Claude Code', ['hexa-to-memory skill', 'Allowlist and rules']),
             (912, 336, 'YOUR CLOUDFLARE ACCOUNT', 'KeenDreams Security', ['Decisions and evidence', 'Audit log'])]
    for x, bw, owner, title, details in boxes:
        accent = p['accent'] if title != 'Claude Code' else p['amber']
        c.rect(x, 70, bw, 206, p['panel'], p['line'], 10)
        c.text(owner, x + 24, 104, 13, accent, 'mono', .9, max_width=290)
        c.text(title, x + 24, 152, 28, p['ink'], 'title', -.6, max_width=290)
        for row, value in enumerate(details):
            c.text(value, x + 24, 196 + row * 32, 19, p['muted'], max_width=290)
    arrow(c, 380, 476, 150, p['accent'])
    centered(c, 'READ', 428, 134, 13, p['muted'], 'mono', .8)
    arrow(c, 806, 902, 140, p['accent'])
    centered(c, 'PROPOSE', 854, 124, 13, p['muted'], 'mono', .8)
    c.path('M902 188 H806 M813 182 L806 188 L813 194', p['accent'], 2)
    centered(c, 'RECALL', 854, 212, 13, p['muted'], 'mono', .8)
    c.rect(912, 326, 336, 92, p['soft'], p['accent'], 9)
    c.text('Reviewer, in a browser', 936, 364, 22, p['ink'], 'title', max_width=290)
    c.text('Confirms or rejects proposals', 936, 396, 17, p['muted'], max_width=290)
    c.path('M1080 326 V284 M1073 291 L1080 284 L1087 291', p['accent'], 2)
    c.dot(37, 344, p['amber'], 3)
    c.text('The skill cannot confirm anything. Only a signed-in person can.', 52, 350, 19, p['ink'], max_width=820)
    c.dot(37, 388, p['amber'], 3)
    c.text('Nothing passes through Agent9. Every part runs on accounts you control.', 52, 394, 19, p['ink'], max_width=820)
    c.text('Required, not optional: the skill does nothing without both MCP connections.', 32, 446, 15, p['muted'], 'mono', max_width=1216)
    c.save(OUT + f'requirements-{theme}.svg')
    requirements_mobile(theme)


def requirements_mobile(theme):
    p = PALETTES[theme]
    c = Canvas(640, 856, 'What the skill needs',
               'Your Tenable One tenant with Hexa AI MCP, Claude Code with the skill, and KeenDreams Security in your '
               'Cloudflare account. A reviewer confirms proposals in a browser. Nothing passes through Agent9.')
    frame(c, p)
    c.text('WHAT YOU CONNECT', 28, 40, 16, p['muted'], 'mono', .8)
    boxes = [('YOUR TENABLE ONE TENANT', 'Hexa AI MCP', 'Findings source, read keys', 'READ'),
             ('YOUR MACHINE', 'Claude Code + skill', 'Allowlist and rules', 'CHECK, PROPOSE, RECALL'),
             ('YOUR CLOUDFLARE ACCOUNT', 'KeenDreams Security', 'Decisions, evidence, audit log', 'CONFIRMS'),
             ('ANY BROWSER', 'Reviewer', 'Confirms or rejects proposals', None)]
    for i, (owner, title, detail, link) in enumerate(boxes):
        y = 64 + i * 178
        tone = p['amber'] if i == 1 else p['accent']
        c.rect(24, y, 592, 128, p['panel'] if i < 3 else p['soft'], p['line'] if i < 3 else p['accent'], 9)
        c.text(owner, 48, y + 34, 14, tone, 'mono', .8)
        c.text(title, 48, y + 76, 30, p['ink'], 'title', -.5, max_width=540)
        c.text(detail, 48, y + 108, 19, p['muted'], max_width=540)
        if link:
            down(c, 320, y + 136, y + 170, p['accent'])
            c.text(link, 340, y + 159, 13, p['muted'], 'mono', .6)
    c.text('Nothing passes through Agent9.', 28, 790, 22, p['ink'], 'title')
    c.text('Every part runs on accounts you control.', 28, 822, 19, p['muted'])
    c.save(OUT + f'requirements-mobile-{theme}.svg')


# ---------------------------------------------------------------- triage states

STATES = [
    ('NEW', 'line', 'No decision or pending proposal in the checked scope.', 'Live 2026-10-23'),
    ('PENDING REVIEW', 'amber', 'A proposal exists. It is not a decision.', 'Live 2026-10-23'),
    ('KNOWN FINDING', 'muted', 'A confirmed observation. Not a fix, not an acceptance.', 'Live 2026-10-10'),
    ('PRIOR TRIAGE DECISION', 'accent', 'Human-confirmed disposition, with reviewer and expiry.', 'Live 2026-10-23'),
    ('NEEDS REASSESSMENT', 'amber', 'Expired, conflicting, or too little evidence to apply.', 'Live 2026-10-23'),
]


def states(theme):
    p = PALETTES[theme]
    for mobile in (False, True):
        w = 640 if mobile else 1280
        row_h = 122 if mobile else 74
        h = 70 + row_h * 5 + (76 if mobile else 64)
        c = Canvas(w, h, 'Five triage states',
                   'New, Pending review, Known finding, Prior triage decision and Needs reassessment, each with its '
                   'meaning and whether it has been observed in a live check. A fresh finding is never suppressed.')
        frame(c, p)
        c.text('EVERY FINDING GETS EXACTLY ONE STATE', 28 if mobile else 32, 42, 15, p['muted'], 'mono', .8)
        if not mobile:
            right(c, 'OBSERVED', 1248, 42, 15, p['muted'], 'mono', .8)
        for i, (label, tone, meaning, proof) in enumerate(STATES):
            y = 70 + i * row_h
            color = p['ink'] if tone == 'line' else p[tone]
            live = proof.startswith('Live')
            c.rect(24 if mobile else 32, y, w - (48 if mobile else 64), row_h - 14,
                   p['soft'] if label == 'PRIOR TRIAGE DECISION' else p['panel'],
                   p['accent'] if label == 'PRIOR TRIAGE DECISION' else p['line'], 8)
            if mobile:
                chip(c, 46, y + 36, label, color, p, 17)
                c.text(meaning, 46, y + 68, 18, p['ink'], max_width=548)
                (check if live else cross)(c, 47, y + 92, p['accent'] if live else p['muted'], .7)
                c.text(proof, 66, y + 97, 15, p['accent'] if live else p['muted'], 'mono')
            else:
                chip(c, 56, y + 38, label, color, p, 16)
                c.text(meaning, 372, y + 38, 20, p['ink'], max_width=640)
                right(c, proof, 1224, y + 38, 15, p['accent'] if live else p['muted'], 'mono', .3)
        note_y = 70 + 5 * row_h + (34 if mobile else 30)
        c.dot(33 if mobile else 37, note_y - 6, p['amber'], 3)
        c.text('A prior decision never hides a fresh finding.' if mobile else
               'A prior decision never hides a fresh finding. Conflicts go to a reviewer, not a silent merge.',
               48 if mobile else 52, note_y, 19, p['ink'], max_width=w - 80)
        suffix = f'mobile-{theme}' if mobile else theme
        c.save(OUT + f'states-{suffix}.svg')


# ---------------------------------------------------------------- tool boundary

def boundary(theme):
    p = PALETTES[theme]
    for mobile in (False, True):
        w = 640 if mobile else 1280
        h = 970 if mobile else 590
        c = Canvas(w, h, 'What the skill may call in Hexa',
                   'Five named read tools are allowlisted. Documented write tools that launch scans, create tickets, '
                   'notify assignees or tag assets are refused. Any other tool must be shown to the person and agreed first.')
        frame(c, p)
        c.text('ONE HEXA CONNECTION, READS AND WRITES TOGETHER', 28 if mobile else 32, 42, 15 if not mobile else 14,
               p['muted'], 'mono', .6)
        panels = ([(24, 66, 592, 320), (24, 410, 592, 400)] if mobile else [(32, 70, 590, 392), (658, 70, 590, 392)])
        for index, (x, y, pw, ph) in enumerate(panels):
            allowed = index == 0
            tone = p['accent'] if allowed else p['amber']
            c.rect(x, y, pw, ph, p['panel'], tone, 10)
            chip(c, x + 24, y + 40, 'ALLOWLISTED READS (5)' if allowed else 'NEVER CALLED', tone, p, 16)
            items = ALLOWED if allowed else REFUSED
            for row, name in enumerate(items):
                iy = y + 92 + row * ((52 if mobile else 58) if allowed else (42 if mobile else 40))
                (check if allowed else cross)(c, x + 28, iy - 6, tone, .9)
                c.text(name, x + 56, iy, 16 if not mobile else 17, p['ink'], 'mono', max_width=pw - 80)
            if not allowed:
                c.text('...and anything named create, launch,', x + 24, y + ph - 46, 16, p['muted'], max_width=pw - 48)
                c.text('update, delete, notify, assign or tag.', x + 24, y + ph - 20, 16, p['muted'], max_width=pw - 48)
        if mobile:
            c.rect(24, 834, 592, 100, p['soft'], p['line'], 9)
            c.text('Anything else: show the person the', 46, 874, 20, p['ink'], 'title')
            c.text('tool, say what it does, and wait.', 46, 906, 20, p['ink'], 'title')
        else:
            c.rect(32, 490, 1216, 66, p['soft'], p['line'], 9)
            c.dot(58, 523, p['amber'], 5)
            c.text('Anything else: show the person the specific tool, say what it does, and wait for agreement.',
                   78, 530, 20, p['ink'], 'title', max_width=1150)
        suffix = f'mobile-{theme}' if mobile else theme
        c.save(OUT + f'boundary-{suffix}.svg')


def build():
    hero()
    badges()
    for theme in PALETTES:
        live_result(theme)
        requirements(theme)
        states(theme)
        boundary(theme)

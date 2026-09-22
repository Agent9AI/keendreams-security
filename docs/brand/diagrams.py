"""Product diagrams drawn from KeenDreams' implemented trust and storage model."""
from drawing import Canvas, PALETTES, arrow, frame


def trust_path(theme):
    p = PALETTES[theme]
    for mobile in (False, True):
        w, h = (640, 646) if mobile else (1280, 346)
        c = Canvas(w, h, 'From a proposed claim to trusted recall',
                   'A new claim is unconfirmed and excluded from default recall. A reviewer can '
                   'confirm it in a browser; trusted, currently valid facts can then be recalled '
                   'with their evidence and history. Named automation sources may be explicitly allowlisted.')
        frame(c, p)
        c.text('STANDARD REVIEW FLOW', 32, 37, 15 if not mobile else 18, p['muted'], 'mono', .8)
        panels = [(32, 67, 502), (746, 67, 502)] if not mobile else [(24, 65, 592), (24, 357, 592)]
        for index, (x, y, width) in enumerate(panels):
            status, color = ('UNCONFIRMED', p['amber']) if index == 0 else ('TRUSTED', p['accent'])
            c.rect(x, y, width, 202, p['panel'], color, 9)
            c.text(f'[ {status} ]', x+24, y+36, 16 if not mobile else 20, color, 'mono', .6)
            title = 'Absent from default recall' if index == 0 else 'Included while valid'
            c.text(title, x+24, y+89, 28 if not mobile else 32, p['ink'], 'title', -.6, max_width=width-48)
            details = ['Evidence is stored.', 'The claim waits for a decision.'] if index == 0 else ['The evidence, reviewer and', 'timeline stay attached to the fact.']
            for line, value in enumerate(details):
                c.text(value, x+24, y+133+line*31, 22 if not mobile else 24, p['muted'], max_width=width-48)
        if mobile:
            c.path('M320 280 V336 M313 329 L320 336 L327 329', p['accent'], 2)
            c.text('BROWSER REVIEW', 353, 313, 17, p['muted'], 'mono')
            c.text('Explicit admin allowlists can also let named', 26, 596, 21, p['muted'])
            c.text('automation sources write trusted facts.', 26, 624, 21, p['muted'])
        else:
            arrow(c, 550, 588, 165, p['accent'])
            arrow(c, 688, 730, 165, p['accent'])
            c.add(f'<circle cx="638" cy="165" r="34" fill="{p["soft"]}" stroke="{p["accent"]}" stroke-width="2"/>')
            c.path('M621 166 L632 177 L657 150', p['accent'], 3)
            c.text('BROWSER', 604, 220, 15, p['muted'], 'mono', .3)
            c.text('REVIEW', 609, 242, 15, p['muted'], 'mono', .3)
            c.dot(37, 309, p['amber'], 3)
            c.text('Explicit admin allowlists can let named automation sources write trusted facts directly.', 52, 315, 18, p['muted'], max_width=1162)
        suffix = f'mobile-{theme}' if mobile else theme
        c.save(f'trust-path-{suffix}.svg')


def architecture(theme):
    p = PALETTES[theme]
    c = Canvas(1280, 526, 'KeenDreams deployment architecture',
               'MCP clients and browser reviewers connect to a Worker with OAuth. Cloudflare Access '
               'provides OIDC sign-in. The registry selects a separate Durable Object and SQLite '
               'memory for each client. Each memory uses its own Vectorize namespace and Workers AI.')
    frame(c, p)
    c.text('DEPLOYMENT BOUNDARIES', 32, 39, 16, p['muted'], 'mono', .7)
    c.rect(326, 65, 922, 408, p['panel'], p['line'], 10)
    c.text('YOUR CLOUDFLARE ACCOUNT', 351, 100, 16, p['accent'], 'mono', 1)
    for y, title, detail in [(145, 'MCP clients', 'Agents use tools'), (284, 'Reviewers', 'People use a browser')]:
        c.rect(32, y, 242, 106, p['panel'], p['line'], 8)
        c.text(title, 51, y+42, 27, p['ink'], 'title', -.4, max_width=205)
        c.text(detail, 51, y+77, 19, p['muted'], max_width=205)
    c.path('M274 198 H299 V239 H351 M274 337 H299 V239', p['accent'], 2)
    arrow(c, 326, 350, 239, p['accent'])
    c.rect(351, 168, 316, 142, p['bg'], p['accent'], 9)
    c.text('Worker + OAuth', 372, 209, 29, p['ink'], 'title', -.7, max_width=275)
    c.text('MCP and browser routes', 372, 246, 20, p['muted'])
    c.text('Registry resolves access', 372, 279, 19, p['muted'])
    c.rect(351, 360, 316, 82, p['bg'], p['line'], 8)
    c.text('Access for SaaS', 372, 393, 23, p['ink'], 'title')
    c.text('OIDC sign-in', 372, 423, 19, p['muted'])
    c.path('M509 310 V352 M502 345 L509 352 L516 345', p['accent'], 2)
    arrow(c, 680, 730, 239, p['accent'])
    c.rect(735, 137, 487, 180, p['soft'], p['accent'], 9)
    c.text('One memory per client', 760, 178, 29, p['ink'], 'title', -.5, max_width=438)
    c.text('Durable Object / SQLite', 760, 218, 23, p['muted'])
    c.path('M760 238 H1197', p['line'])
    c.text('Evidence / Facts / Audit log', 760, 276, 20, p['muted'], max_width=438)
    c.path('M979 317 V339 H851 V360 M979 339 H1108 V360', p['accent'], 1.8)
    for x, title, detail in [(735, 'Vectorize', 'Client namespace'), (986, 'Workers AI', 'Embeddings + suggestions')]:
        c.rect(x, 360, 236, 82, p['bg'], p['line'], 8)
        c.text(title, x+16, 393, 23, p['ink'], 'title')
        c.text(detail, x+16, 423, 16, p['muted'], max_width=204)
    c.text("Each client's evidence and facts live in its own SQLite database.", 33, 507, 20, p['muted'])
    c.save(f'architecture-{theme}.svg')
    mobile_architecture(theme)


def mobile_architecture(theme):
    p = PALETTES[theme]
    c = Canvas(640, 864, 'KeenDreams deployment architecture',
               'MCP clients and reviewers connect through a Worker, OAuth and Cloudflare Access. '
               'The registry selects a separate SQLite memory and vector namespace per client. '
               'Workers AI provides embeddings and optional suggestions in the deployer account.')
    frame(c, p)
    c.rect(24, 30, 592, 115, p['panel'], p['line'], 9)
    c.text('MCP clients + reviewers', 48, 78, 32, p['ink'], 'title', -.8)
    c.text('Agents use tools. People use a browser.', 48, 115, 22, p['muted'])
    c.path('M320 155 V194 M312 186 L320 194 L328 186', p['accent'], 2)
    c.rect(24, 210, 592, 608, p['panel'], p['line'], 10)
    c.text('YOUR CLOUDFLARE ACCOUNT', 48, 252, 19, p['accent'], 'mono', .4)
    c.rect(48, 278, 544, 135, p['bg'], p['accent'], 8)
    c.text('Worker + OAuth', 74, 328, 34, p['ink'], 'title')
    c.text('Access sign-in + client registry', 74, 374, 25, p['muted'])
    c.path('M320 425 V460 M312 452 L320 460 L328 452', p['accent'], 2)
    c.rect(48, 474, 544, 159, p['soft'], p['accent'], 8)
    c.text('One memory per client', 74, 523, 33, p['ink'], 'title', -.5)
    c.text('Durable Object / SQLite', 74, 565, 26, p['muted'])
    c.text('Evidence / Facts / Audit log', 74, 608, 23, p['muted'])
    c.path('M320 633 V651 H172 V675 M320 651 H466 V675', p['accent'], 2)
    for x, title, details in [(48, 'Vectorize', ['Client namespace']), (332, 'Workers AI', ['Embeddings', '+ suggestions'])]:
        c.rect(x, 675, 260, 115, p['bg'], p['line'], 8)
        c.text(title, x+22, 716, 27, p['ink'], 'title')
        for row, value in enumerate(details):c.text(value, x+22, 747+row*26, 20, p['muted'], max_width=218)
    c.text('Your account. Separate client memories.', 28, 846, 21, p['muted'])
    c.save(f'architecture-mobile-{theme}.svg')

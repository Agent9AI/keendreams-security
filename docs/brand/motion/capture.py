"""Capture a deterministic HTML scene to a GIF.

Requires Playwright (with its bundled Chromium), Pillow and gifsicle.
    python3 docs/brand/motion/capture.py replay docs/images/hexa-to-memory/replay.gif [fps] [--poster t]
    python3 docs/brand/motion/capture.py replay still.png --still 13.5
"""
import io, os, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent


def open_scene(p, name):
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None)
    page = browser.new_page(viewport={'width': 960, 'height': 600})
    page.goto(f'file://{HERE / (name + ".html")}')
    page.wait_for_function('window.READY === true', timeout=20000)
    w, h, dur = page.evaluate('[SCENE.w, SCENE.h, SCENE.dur]')
    page.set_viewport_size({'width': w, 'height': h})
    return browser, page, w, h, dur


def gif(name, dest, fps=15, poster=None):
    frames = []
    with sync_playwright() as p:
        browser, page, w, h, dur = open_scene(p, name)
        for i in range(round(dur * fps)):
            page.evaluate(f'render({i / fps})')
            shot = page.screenshot(clip={'x': 0, 'y': 0, 'width': w, 'height': h})
            frames.append(Image.open(io.BytesIO(shot)).convert('RGB'))
        browser.close()
    if poster is not None:
        # Start the loop on a fully revealed frame: it is what a paused or reduced-motion viewer sees.
        k = round(poster * fps)
        frames = frames[k:] + frames[:k]
    # One palette for every frame keeps colors stable between frames, which also compresses well.
    # Brand swatches are added so small accents (amber dots, labels) keep their exact color.
    swatches = ['#081713', '#EDF5EE', '#A4BDAF', '#B8E7CA', '#EABB72', '#315044', '#10251D', '#1A382A']
    sample = Image.new('RGB', (w, h * 5))
    for k, frame in enumerate(frames[len(frames) // 5::len(frames) // 4][:4]):
        sample.paste(frame, (0, h * k))
    for k, color in enumerate(swatches):
        sample.paste(color, (k * w // len(swatches), h * 4, (k + 1) * w // len(swatches), h * 5))
    palette = sample.quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    raw = Path(tempfile.mkdtemp()) / 'raw.gif'
    indexed[0].save(raw, save_all=True, append_images=indexed[1:], duration=round(1000 / fps), loop=0, optimize=False)
    subprocess.run(['gifsicle', '-O3', '--lossy=30', str(raw), '-o', str(dest)], check=True)
    raw.unlink()
    print(f'{dest}: {Path(dest).stat().st_size / 1048576:.2f} MB, {w}x{h}, {dur}s @ {fps}fps')


def still(name, dest, t):
    with sync_playwright() as p:
        browser, page, w, h, _ = open_scene(p, name)
        page.evaluate(f'render({t})')
        page.screenshot(path=str(dest), clip={'x': 0, 'y': 0, 'width': w, 'height': h})
        browser.close()


if __name__ == '__main__':
    scene, out = sys.argv[1], sys.argv[2]
    if '--still' in sys.argv:
        still(scene, out, float(sys.argv[sys.argv.index('--still') + 1]))
    else:
        fps = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 15
        poster = float(sys.argv[sys.argv.index('--poster') + 1]) if '--poster' in sys.argv else None
        gif(scene, out, fps, poster)

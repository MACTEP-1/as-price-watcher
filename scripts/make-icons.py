import cairosvg
# Heroicons v1 "paper-airplane" (solid, 20x20), MIT licence — the same
# motif as the existing logo in the web nav/login.
PLANE = "M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
BLUE = "#0060ac"; AMBER = "#f59e0b"

def glyph(size, scale, cx, cy, dot=True, color="#ffffff"):
    # plane path box is ~2..18 x 2..18 in a 20 unit grid, centred at (10,10)
    s = size * scale / 20.0
    tx = cx - 10 * s; ty = cy - 10 * s
    g = f'<g transform="translate({tx},{ty}) scale({s})"><path fill="{color}" d="{PLANE}"/></g>'
    if dot:
        r = size * scale * 0.11
        g += f'<circle cx="{cx + size*scale*0.33}" cy="{cy - size*scale*0.30}" r="{r}" fill="{AMBER}" stroke="{BLUE}" stroke-width="{r*0.35}"/>'
    return g

def svg(size, body, bg=None, radius=0):
    rect = f'<rect width="{size}" height="{size}" rx="{radius}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{rect}{body}</svg>'

def out(name, data, size):
    cairosvg.svg2png(bytestring=data.encode(), write_to=name, output_width=size, output_height=size)

S = 1024
# iOS/app store icon: full-bleed square, no transparency (the OS rounds it)
out("icon.png", svg(S, glyph(S, 0.62, S/2, S/2+20), bg=BLUE), S)
# Android adaptive foreground: transparent, glyph inside the central safe zone
out("adaptive-icon.png", svg(S, glyph(S, 0.40, S/2, S/2+12)), S)
# Splash: white glyph on transparent; background colour comes from app.json
out("splash-icon.png", svg(S, glyph(S, 0.70, S/2, S/2+20)), S)
# Web: rounded-square icons
for n in (192, 512):
    out(f"web-icon-{n}.png", svg(n, glyph(n, 0.62, n/2, n/2+n*0.02), bg=BLUE, radius=n*0.22), n)
out("apple-icon.png", svg(180, glyph(180, 0.62, 90, 94), bg=BLUE), 180)
out("favicon-64.png", svg(64, glyph(64, 0.70, 32, 34, dot=False), bg=BLUE, radius=14), 64)
# preview sheet
from PIL import Image
sheet = Image.new("RGBA", (1100, 380), "#e2e8f0")
for i, (f, sz) in enumerate([("icon.png",300),("adaptive-icon.png",300),("web-icon-512.png",300)]):
    im = Image.open(f).convert("RGBA").resize((sz, sz))
    if f == "adaptive-icon.png":
        bgim = Image.new("RGBA", (sz, sz), BLUE); bgim.alpha_composite(im); im = bgim
    sheet.alpha_composite(im, (40 + i*350, 40))
sheet.save("preview.png")
print("done")

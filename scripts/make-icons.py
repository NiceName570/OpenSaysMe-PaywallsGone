"""Draw the OpenSaysMe vector keyhole mark and export matching toolbar PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BLUE = '#2563eb'
STATES = {'default': None, 'available': 'check', 'library': 'book', 'citations': 'bars',
          'warning': 'warning', 'disabled': 'slash', 'research': 'dot'}

def svg(state):
    glyph = ''
    kind = STATES[state]
    if kind:
        color = '#b42318' if kind == 'warning' else '#64748b' if kind == 'slash' else BLUE
        paths = {'check': '<path d="m90 100 6 6 12-14"/>', 'book': '<path d="M90 91h16v17H90zM98 91v17"/>',
                 'bars': '<path d="M90 106v-8m8 8V90m8 16V95"/>', 'warning': '<path d="M98 89v12m0 5v1"/>',
                 'slash': '<path d="m89 108 18-18"/>', 'dot': '<circle cx="98" cy="99" r="4" fill="white" stroke="none"/>'}
        glyph = f'<circle cx="98" cy="99" r="20" fill="white"/><circle cx="98" cy="99" r="16" fill="{color}"/><g fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{paths[kind]}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>OpenSaysMe</title><rect width="128" height="128" fill="white"/><rect x="5" y="5" width="118" height="118" rx="25" fill="white" stroke="{BLUE}" stroke-width="6"/><g fill="{BLUE}"><circle cx="64" cy="46" r="22"/><path d="M56 61h16l13 42H43z"/></g>{glyph}</svg>\n'

def raster(size, state):
    ratio = size * 8 / 128
    image = Image.new('RGB', (size * 8, size * 8), 'white')
    draw = ImageDraw.Draw(image)
    def box(values): return tuple(round(value * ratio) for value in values)
    def line(points, width=4):
        draw.line([(round(x * ratio), round(y * ratio)) for x, y in points], fill='white', width=max(1, round(width * ratio)), joint='curve')
    draw.rounded_rectangle(box((2,2,126,126)), radius=round(28*ratio), fill=BLUE)
    draw.rounded_rectangle(box((8,8,120,120)), radius=round(22*ratio), fill='white')
    draw.ellipse(box((42,24,86,68)), fill=BLUE)
    draw.polygon([(round(x*ratio),round(y*ratio)) for x,y in [(56,61),(72,61),(85,103),(43,103)]], fill=BLUE)
    kind = STATES[state]
    if kind:
        color = '#b42318' if kind == 'warning' else '#64748b' if kind == 'slash' else BLUE
        draw.ellipse(box((78,79,118,119)), fill='white')
        draw.ellipse(box((82,83,114,115)), fill=color)
        if kind == 'check': line([(90,100),(96,106),(108,92)])
        elif kind == 'book':
            line([(90,108),(90,91),(106,91),(106,108),(90,108)],3)
            line([(98,91),(98,108)],3)
        elif kind == 'bars':
            for x,y in [(90,98),(98,90),(106,95)]: line([(x,106),(x,y)])
        elif kind == 'warning':
            line([(98,89),(98,101)])
            draw.ellipse(box((96,104,100,108)), fill='white')
        elif kind == 'slash': line([(89,108),(107,90)])
        else: draw.ellipse(box((94,95,102,103)), fill='white')
    return image.resize((size,size), Image.Resampling.LANCZOS)

for state in STATES:
    base = 'opensaysme' if state == 'default' else 'opensaysme-' + state
    (ROOT/'images'/(base+'.svg')).write_text(svg(state),encoding='utf-8')
    for size in ([16,19,32,38,48,64,76,96,128,256,512] if state == 'default' else [19,38,76]):
        raster(size,state).save(ROOT/'images'/f'{base}-{size}.png')
print('Exported OpenSaysMe icon and six matching status variants.')

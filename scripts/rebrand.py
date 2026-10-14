"""Apply the OpenSaysMe presentation layer without renaming stored settings or APIs."""
from pathlib import Path
import json, re, shutil

ROOT = Path(__file__).resolve().parents[1]
def write(path, value): (ROOT/path).write_text(value,encoding='utf-8')
def brand(value):
    return re.sub(r'Bypass Paywalls Clean|Open Access Helper(?: Web)?', 'OpenSaysMe', value)

SHELL = '''@import url('shared/theme.css');
body{margin:0}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid var(--osm-border);background:white}
header>a{font-size:13px;font-weight:600}
nav{display:flex;gap:8px;padding:16px 18px;background:white}
nav button{flex:1}
nav button[aria-pressed=true]{color:white;background:var(--osm-blue);border-color:var(--osm-blue)}
.popup-shell{width:430px;background:white}
iframe{display:block;width:100%;height:260px;border:0;background:white}
footer{padding:16px 22px;font-size:11px;color:var(--osm-muted);border-top:1px solid var(--osm-border)}
.popup-shell #rule-status{margin:0 18px 12px;padding:10px;border:1px solid #f0c78d;background:#fff9ee;border-radius:9px;font-size:12px;color:#80501c}
.settings-shell main{max-width:1008px;margin:32px auto;padding:0 24px}
.settings-shell header{padding:0 0 24px;background:none}
.settings-shell header>span{font-size:12px;color:var(--osm-muted);border:1px solid var(--osm-border);border-radius:20px;padding:4px 12px;background:white}
h1{margin:32px 0 24px;font-size:30px}h2{font-size:19px;margin:0 0 12px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.cards section,.status{background:white;border:1px solid var(--osm-border);border-radius:12px;padding:26px}
.cards p{color:var(--osm-muted);line-height:1.7;min-height:76px}
.cards a{display:inline-block;margin:8px 14px 0 0;font-size:14px}
.cards a.primary{display:block;width:fit-content;margin-bottom:14px;padding:11px 16px}
.status{margin-top:22px}.status p,.status li{font-size:14px;line-height:1.7;color:var(--osm-muted)}
.hint{font-size:14px;line-height:1.7;color:var(--osm-muted);margin:24px 0}
.settings-shell footer{padding-left:0}@media(max-width:650px){.cards{grid-template-columns:1fr}}
'''
RESEARCH_POPUP = '''/* Research layout; controls and colors come from shared/theme.css. */
body{margin:0;padding:18px;min-width:0;min-height:0;background:white}
#header{display:flex;align-items:center;gap:10px;position:relative;padding-bottom:16px;margin-bottom:18px;border-bottom:1px solid var(--osm-border);font-size:14px;font-weight:650}
#oahelpericon{width:34px;height:34px}
#oah_settings_icon{width:18px;height:18px;margin-left:auto;order:2;cursor:pointer}
#popupanswer{width:100%}
#popupanswer button{width:100%;margin:10px 0;display:block;min-height:42px;background:var(--osm-blue);color:white;border-color:var(--osm-blue)}
#popupanswer button:hover{background:var(--osm-blue-hover)}
#popupanswer #rwbutton{color:var(--danger);background:#fff0ee;border-color:#f4b9b2}
#popupanswer #rwbutton:hover{background:#ffe4df}
#popupanswer #oabuttonrequestlink{display:inline;width:auto;min-height:0;margin:0;padding:0;border:0;background:none;color:var(--osm-blue)}
#footer{position:static;margin-top:18px;padding-top:14px;border-top:1px solid var(--osm-border);text-align:center;font-size:12px;color:var(--osm-muted)}
#footer a{color:var(--osm-blue)}
#sadbabyimg,#disabledomainicon{width:58px;height:58px;display:block;margin:20px auto}
.oah_center{text-align:center;color:var(--osm-muted);font-size:13px;line-height:1.75}
'''
write('opensaysme.css',SHELL)
write('css/popup.css',RESEARCH_POPUP)

manifest = json.loads((ROOT/'manifest.json').read_text())
manifest['version'] = '1.0.1'
manifest['icons'] = {str(size):f'images/opensaysme-{size}.png' for size in [16,32,48,128,256,512]}
manifest['action']['default_icon'] = {str(size):f'images/opensaysme-{size}.png' for size in [19,38]}
write('manifest.json',json.dumps(manifest,indent=2)+'\n')

def page_header(prefix, label):
    return f'<header class="osm-page-header"><a class="osm-brand" href="{prefix}settings.html"><img src="{prefix}images/opensaysme.svg" alt=""><span><strong>OpenSaysMe</strong><small>{label}</small></span></a><a href="{prefix}settings.html">All settings</a></header>'

for path in list((ROOT/'options').rglob('*.html')) + list((ROOT/'html').rglob('*.html')):
    html = path.read_text(encoding='utf-8')
    relative = path.relative_to(ROOT)
    prefix = '../' * (len(relative.parts)-1)
    # Keep original authorship explicit without attributing the new app to a provider.
    html = re.sub(r'<strong>Open Access Helper</strong> by .*?assistance</a>\.',
        'Research integration based on the work of <a href="https://www.oahelper.org" target="_blank">Claus Wolf</a>.',html,flags=re.S)
    html = brand(html).replace('../bypass.png','../images/opensaysme.svg').replace('images/oahelper_black.svg','images/opensaysme.svg')
    if 'shared/theme.css' not in html:
        html = html.replace('</head>',f'<link rel="stylesheet" href="{prefix}shared/theme.css">\n<link rel="icon" href="{prefix}images/opensaysme.svg">\n</head>')
    if path.name == 'popup.html':
        classes = 'popup osm-tool-popup' if relative.parts[0] == 'options' else 'osm-tool-popup osm-research-popup'
        html = re.sub(r'<body[^>]*>',f'<body class="{classes}">',html,count=1)
        html = re.sub(r'<title>.*?</title>', '<title>OpenSaysMe · '+('News tools' if relative.parts[0]=='options' else 'Research papers')+'</title>',html,flags=re.S)
        if '<title>' not in html: html = html.replace('<head>','<head>\n<title>OpenSaysMe · News tools</title>',1)
        if relative.parts[0] == 'options':
            html = re.sub(r'<div class="popup-foot">.*?</div>', '<div class="popup-foot"><a href="../settings.html" target="_blank">All settings</a> · <a href="options_custom.html" target="_blank">Custom sites</a></div>',html,flags=re.S)
    elif relative.parts[0] == 'options':
        html = re.sub(r'<body[^>]*>','<body class="osm-page">',html,count=1)
        label = {'options.html':'News settings','options_custom.html':'Custom sites','options_excluded.html':'Excluded sites','opt-in.html':'News preferences'}[path.name]
        if 'osm-page-header' not in html:
            if '<div class="page">' in html:
                html = html.replace('<div class="page">','<div class="page">\n'+page_header(prefix,label),1)
            else:
                html = html.replace('<body class="osm-page">','<body class="osm-page"><main class="page">'+page_header(prefix,label),1).replace('</body>','</main></body>')
        html = html.replace('OpenSaysMe Options Excluded','OpenSaysMe · Excluded sites').replace('OpenSaysMe Options','OpenSaysMe · News settings')
        if path.name == 'options.html': html = html.replace('<h1>Options |','<h1>News settings |')
        if path.name == 'opt-in.html':
            html = re.sub(r'<div id="update-prompt">.*?</div>\s*</div>',
              '<div id="update-prompt"><strong>OpenSaysMe updates</strong><p>This local build is updated manually.</p><span id="update-enabled" hidden></span><div id="update-container" hidden><button id="update-enable">Enable</button><button id="update-disable">Disable</button></div></div>',html,flags=re.S)
    else:
        html = re.sub(r'<body[^>]*>','<body class="osm-research-settings">',html,count=1)
        html = html.replace('<b class="navbar-item">','<a class="navbar-item" href="../settings.html">').replace('OpenSaysMe\n                    </b>','OpenSaysMe\n                    </a>')
    path.write_text(html,encoding='utf-8')

for filename in ['popup.html','settings.html']:
    text = (ROOT/filename).read_text(encoding='utf-8')
    if filename == 'popup.html':
        header = '<header><a class="osm-brand" href="settings.html" target="_blank"><img src="images/opensaysme.svg" alt=""><span><strong>OpenSaysMe</strong><small id="current-site">News &amp; research access</small></span></a><a href="settings.html" target="_blank" aria-label="Open settings">Settings</a></header>'
    else:
        header = '<header><a class="osm-brand" href="settings.html"><img src="images/opensaysme.svg" alt=""><span><strong>OpenSaysMe</strong><small>News &amp; research access, together.</small></span></a><span>1.0.1</span></header>'
    text = re.sub(r'<header>.*?</header>',header,text,flags=re.S)
    text = re.sub(r'<footer>.*?</footer>','<footer>OpenSaysMe · News &amp; research access</footer>',text,flags=re.S)
    if 'rel="icon"' not in text: text = text.replace('</head>','<link rel="icon" href="images/opensaysme.svg"></head>')
    write(filename,text)

# Update display copy in every packaged language, preserving placeholders and URLs.
for path in (ROOT/'_locales').glob('*/messages.json'):
    data = json.loads(path.read_text(encoding='utf-8'))
    for entry in data.values():
        if 'message' in entry:
            entry['message'] = brand(entry['message']).replace('images/student.svg','images/opensaysme.svg').replace('images/oahelper_disabled_76.png','images/opensaysme-disabled-76.png')
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

for directory in ['js','options']:
    for path in (ROOT/directory).rglob('*.js'):
        text = path.read_text(encoding='utf-8').replace('/Open Access Helper(?: Web)?/g', '/__OSM_LEGACY_BRAND_MATCH__/g')
        text = brand(text).replace('/__OSM_LEGACY_BRAND_MATCH__/g', '/Open Access Helper(?: Web)?/g')
        text = text.replace('images/oahelper_white_ok.svg','images/opensaysme-available.svg').replace('images/oahelper_white.svg','images/opensaysme.svg')
        text = text.replace('en/disable current site in BPC','Enable or disable this site in OpenSaysMe')
        text = text.replace('return textToReturn;',"return textToReturn.replace(/Open Access Helper(?: Web)?/g, 'OpenSaysMe');")
        path.write_text(text,encoding='utf-8')

for filename in ['contentScript.js','contentScript_once.js','sites.js']:
    text = (ROOT/filename).read_text(encoding='utf-8').replace('BPC >','OpenSaysMe ·').replace('* BPC settings','* OpenSaysMe settings')
    write(filename,text)

# A renamed combined build must never offer upstream extension updates or a
# counterfeit warning. Its own package version is the only version to display.
write('options/version.js', '''const version = document.getElementById('version');
if (version) version.textContent = 'v' + chrome.runtime.getManifest().version;
const versionNotice = document.getElementById('version_new');
if (versionNotice) versionNotice.replaceChildren();
''')

style = (ROOT/'options/style.css').read_text(encoding='utf-8')
style = re.sub(r'@media \(prefers-color-scheme: dark\) \{\s*:root \{.*?\n  \}\s*\}', '', style, flags=re.S)
write('options/style.css',style)

text = (ROOT/'js/background.js').read_text(encoding='utf-8')
text = text.replace('19: `images/oahelper_${iconType}_19.png`,','19: `images/opensaysme${state ? "-" + state : ""}-19.png`,').replace('38: `images/oahelper_${iconType}_38.png`,','38: `images/opensaysme${state ? "-" + state : ""}-38.png`,')
text = text.replace('  function setBrowserIcon(iconType) {','''  function setBrowserIcon(iconType) {
    const kind = iconType.replace(/^ezproxy_?/, '');
    const state = {orange:'available',orangeok:'available',blue:'research',purple:'citations',
      warning:'warning',disabled:'disabled',ebsco:'library'}[kind] || (iconType.startsWith('ezproxy') ? 'library' : '');''')
write('js/background.js',text)

custom = ROOT/'custom/manifest.json'
if custom.exists():
    data = json.loads(custom.read_text())
    data['name'] = 'OpenSaysMe'
    data['description'] = manifest['description']
    custom.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')

for size in [16,32,48]: shutil.copyfile(ROOT/'images'/f'opensaysme-{size}.png',ROOT/f'icon{size}.png')
for name in ['bypass.png','bypass-dark.png']: shutil.copyfile(ROOT/'images/opensaysme-128.png',ROOT/name)
print('Updated presentation, packaged translations, metadata, and toolbar status icons for OpenSaysMe 1.0.1.')

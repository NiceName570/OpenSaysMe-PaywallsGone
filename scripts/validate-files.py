from pathlib import Path
import json, re, subprocess

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['name'] == 'OpenSaysMe' and manifest['manifest_version'] == 3
assert 'webRequestBlocking' not in manifest['permissions']
paths = [manifest['background']['service_worker'], manifest['action']['default_popup'], manifest['options_ui']['page']]
paths.extend(manifest['icons'].values())
paths.extend(manifest['action']['default_icon'].values())
for content in manifest['content_scripts']:
    paths.extend(content.get('js', []) + content.get('css', []))
for relative in paths:
    assert (root / relative).is_file(), relative
checked = 0
for directory in ['shared', 'js', 'options']:
    for path in (root / directory).rglob('*.js'):
        subprocess.run(['node', '--check', str(path)], check=True, capture_output=True)
        checked += 1
for name in ['background.js', 'popup.js', 'settings.js', 'service-worker.js']:
    subprocess.run(['node', '--check', str(root / name)], check=True, capture_output=True)
    checked += 1
for directory in ['options', 'html']:
    for html in (root / directory).rglob('*.html'):
        for src in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)', html.read_text(encoding='utf-8'), re.I):
            if '://' not in src:
                assert (html.parent / src).is_file(), f'{html}: {src}'
print(f'PASS: manifest resources, local HTML scripts, and syntax of {checked} JavaScript files.')

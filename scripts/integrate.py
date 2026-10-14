"""Initial local integration of the two inspected source copies (no downloads)."""
from pathlib import Path
import argparse, json, re

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Historical one-time transformation; NOT a build or installation command.')
parser.add_argument('--bpc-source', type=Path, required=True, help='Original BPC source directory')
parser.add_argument('--oa-source', type=Path, required=True, help='Original OA Helper source directory')
parser.add_argument('--overwrite-integration', action='store_true', help='Allow overwriting later integration fixes in this checkout')
args = parser.parse_args()
if not args.overwrite_integration:
    parser.error('This historical script overwrites runtime files. Normal installation does not use it.')
BPC = args.bpc_source.resolve()
OA = args.oa_source.resolve()

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def bpc_port(text):
    return (text.replace('ext_api.storage.', 'bpcStorage.')
        .replace('ext_api.tabs.executeScript(', 'osmExecuteScript(')
        .replace('ext_api.browserAction.', 'chrome.action.'))

# Preserve the existing options, custom site detection, and content handlers.
for source in (BPC / 'options').rglob('*.js'):
    write(source.relative_to(BPC), bpc_port(source.read_text(encoding='utf-8')))
detect = (ROOT / 'options/detect.js').read_text(encoding='utf-8')
detect = detect.replace("api.tabs.executeScript(tabId, {code: '(' + pageProbe.toString() + ')()'}, function (results) {",
    "chrome.scripting.executeScript({target: {tabId}, func: pageProbe}).then(entries => {\n    const results = entries.map(entry => entry.result);")
detect = detect.replace('callback(buildRule(results[0], domain));\n  });',
    'callback(buildRule(results[0], domain));\n  }).catch(() => callback(buildRule({vendors: [], scriptPaths: []}, domain)));')
write('options/detect.js', detect)

# Both sets of HTML pages receive the storage adapter before their original scripts.
for dirname, origin in [('options', BPC), ('html', OA)]:
    for source in (origin / dirname).rglob('*.html'):
        target = source.relative_to(origin)
        depth = len(target.parts) - 1
        prefix = '../' * depth
        html = source.read_text(encoding='utf-8')
        html = html.replace('<head>', '<head>\n<script src="' + prefix + 'shared/storage.js"></script>\n<script src="' + prefix + 'shared/mv3-compat.js"></script>', 1)
        write(target, html)

for source in (OA / 'js').glob('*.js'):
    text = source.read_text(encoding='utf-8')
    text = text.replace('chrome.storage.local', 'oaStorage.local').replace('chrome.storage.onChanged', 'oaStorage.onChanged')
    if source.name == 'background.js':
        # The combined extension has its own welcome page and identity.
        start = text.index('chrome.runtime.onInstalled.addListener')
        end = text.index('// On browser startup', start)
        text = text[:start] + text[end:]
        text = text.replace('async function doTelemetry(id, lastLog, uuid){', 'async function doTelemetry(id, lastLog, uuid){\n    return; // Do not report a local fork as the upstream application.\n')
        text = text.replace("    default:\n      return true;", "    default:\n      return false;")
        # Use an explicit response for getoptions while startup storage loads.
        text = text.replace("      sendResponse({ mode: 'options', options: configuration });\n      return true;",
            "      oaStorage.local.get(null).then(options => { configuration = options; sendResponse({ mode: 'options', options }); });\n      return true;")
        # Do not repeatedly attempt CSS injection into browser-internal pages.
        text = text.replace('  orangeIcon = false;\n  greenIcon = false;', "  if (!tab?.id || !/^https?:/.test(tab.url || '')) return;\n  orangeIcon = false;\n  greenIcon = false;", 1)
    write(source.relative_to(OA), text)

original = (BPC / 'background.js').read_text(encoding='utf-8')
core = original[:original.index('// Get the enabled sites')]
core = core.replace('  disableJavascriptOnListedSites();', '  osmScheduleRules();')
# Local bundled rules are authoritative; the original discontinued update endpoints
# and upstream usage reporting must not be used by this combined application.
start = core.index('function check_sites_updated()')
end = core.index('function set_rules(', start)
core = core[:start] + 'function check_sites_updated() { return osmReloadBpc(); }\n\n' + core[end:]
helpers = original[original.index('function filterObject('):]
helpers = helpers.replace("  if (!ext_name.startsWith('Bypass Paywalls Clean'))\n    enabledSite = '';\n", '')
ui = original[original.index('function site_switch()'):original.index('function remove_cookies_fn(')]
runtime = original[original.index('var chrome_scheme'):original.index('// show the opt-in tab')]
runtime = runtime.replace("          let parser = new DOMParser();\n          let doc = parser.parseFromString(html, 'text/html');\n          let article_new = doc.querySelector(message.data.selector_source);\n          message.data.html = article_new.outerHTML;", '          message.data.html = html; // Parse and select in the content script, where DOMParser exists.')
# OA Helper controls the toolbar image; BPC retains the site badge and controls.
icon_start = runtime.index('  if (message.scheme')
icon_end = runtime.index('  if (message.csDone)', icon_start)
runtime = runtime[:icon_start] + runtime[icon_end:]
runtime = runtime.replace("  if (message.request === 'getExtSrc' && message.data) {", "  if (message.request === 'getExtSrc' && message.data && sender.tab) {")

# Retain publisher-family discovery from the original request observer. Network
# changes are applied by DNR, not by the now non-blocking observer.
discovery = original[original.index('  function customAddRules('):original.index('  // block external javascript for custom sites')]
discovery = discovery.replace('    return custom_domains;', '    osmScheduleRules();\n    return custom_domains;')
write('background.js', bpc_port(core + '\n' + helpers + '\n' + ui + '\n' + runtime + '\nfunction osmDiscoverBpc(details) {\n  const header_referer = details.documentUrl || details.initiator || "";\n' + discovery + '\n}\n'))

manifest = json.loads((OA / 'manifest.json').read_text())
for key in ['key', 'update_url']:
    manifest.pop(key, None)
manifest.update(name='OpenSaysMe', short_name='OpenSaysMe', version='1.0.0', minimum_chrome_version='120',
    description='News access tools and open-access research discovery in one extension.',
    background={'service_worker': 'service-worker.js'},
    permissions=['tabs', 'storage', 'contextMenus', 'scripting', 'cookies', 'webRequest', 'declarativeNetRequestWithHostAccess'],
    host_permissions=['http://*/*', 'https://*/*'],
    action={'default_title': 'OpenSaysMe', 'default_popup': 'popup.html', 'default_icon': manifest['action']['default_icon']},
    options_ui={'open_in_tab': True, 'page': 'settings.html'})
manifest['content_scripts'].insert(0, json.loads((BPC / 'manifest.json').read_text())['content_scripts'][0])
manifest['content_scripts'].append({'matches': ['http://*/*', 'https://*/*'], 'js': ['shared/bpc-loader.js'], 'run_at': 'document_end'})
for content in manifest['content_scripts']:
    if 'js/content.js' in content['js']:
        content['js'].insert(0, 'shared/storage.js')
write('manifest.json', json.dumps(manifest, indent=2) + '\n')
write('service-worker.js', "importScripts('shared/storage.js', 'shared/mv3-compat.js', 'shared/bpc-mv3.js', 'sites.js', 'background.js', 'js/background.js');\n")
print('Integrated both source copies as OpenSaysMe 1.0.0 (Manifest V3).')

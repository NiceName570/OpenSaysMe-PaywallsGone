import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'opensaysme-check-'));
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--disable-extensions-except=${root}`, `--load-extension=${root}`, 'about:blank'
], {windowsHide: true, stdio: 'ignore'});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let browser;
let closeBrowser;
const findings = [];
const messagingWarnings = [];
const uiResults = [];
const screenshotDirectory = join(root, 'artifacts', 'ui');
await mkdir(screenshotDirectory, {recursive:true});
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await delay(100); }
  }
  if (!port) throw new Error('The isolated Edge test profile did not start.');
  browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(browser.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const fixtureHtml = '<!doctype html><html><head><title>OpenSaysMe article fixture</title><meta name="citation_doi" content="10.1371/journal.pone.0000308"><script type="application/ld+json">{"@type":"Article","articleBody":"Fixture article text."}</script></head><body><div class="paywall">Subscribe</div><article class="locked">Fixture article text.</article></body></html>';
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callbacks = pending.get(message.id);
      if (callbacks) { pending.delete(message.id); message.error ? callbacks.reject(new Error(message.error.message)) : callbacks.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') findings.push({type: 'exception', details: message.params.exceptionDetails.text,
      description: message.params.exceptionDetails.exception?.description});
    if (message.method === 'Log.entryAdded' && /runtime\.lastError|Receiving end does not exist/.test(message.params.entry.text))
      messagingWarnings.push(message.params.entry.text);
    if (message.method === 'Runtime.consoleAPICalled') {
      const description = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
      if (/runtime\.lastError|Receiving end does not exist/.test(description)) messagingWarnings.push(description);
    }
    if (message.method === 'Fetch.requestPaused') {
      send('Fetch.fulfillRequest', {requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{name: 'Content-Type', value: 'text/html'}], body: Buffer.from(fixtureHtml).toString('base64')}, message.sessionId).catch(() => {});
    }
  };
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, {resolve, reject});
      socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    });
  }
  closeBrowser = () => send('Browser.close');
  async function evaluate(sessionId, expression) {
    const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  let worker;
  for (let attempt = 0; attempt < 80; attempt++) {
    worker = (await send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.endsWith('/service-worker.js'));
    if (worker) break;
    await delay(100);
  }
  if (!worker) throw new Error('OpenSaysMe service worker did not register in Edge.');
  const {sessionId} = await send('Target.attachToTarget', {targetId: worker.targetId, flatten: true});
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId).catch(() => {});
  const initial = await evaluate(sessionId, `(async () => { await osmBpcReady; return {name: chrome.runtime.getManifest().name,
    version: chrome.runtime.getManifest().version, rules: (await chrome.declarativeNetRequest.getDynamicRules()).length,
    status: (await chrome.storage.local.get('osm:rules'))['osm:rules']}; })()`);
  console.log(JSON.stringify({stage: 'worker', ...initial}, null, 2));
  if (initial.status?.error || !initial.rules) throw new Error('The news rules failed to initialize.');
  await evaluate(sessionId, `Promise.all(['black','orange','orangeok','blue','purple','warning','disabled','ebsco','ezproxy','ezproxy_orange'].map(setBrowserIcon))`);
  console.log('PASS: all toolbar icon states load the new OpenSaysMe artwork.');
  // A research-settings reset must never touch news preferences.
  const isolation = await evaluate(sessionId, `(async () => { await bpcStorage.local.set({isolationTest: 'keep'});
    await oaStorage.local.set({isolationTest: 'remove'}); await oaStorage.local.clear();
    const result = {bpc: (await bpcStorage.local.get('isolationTest')).isolationTest,
      oa: (await oaStorage.local.get('isolationTest')).isolationTest ?? null};
    await bpcStorage.local.remove('isolationTest'); return result; })()`);
  if (isolation.bpc !== 'keep' || isolation.oa !== null) throw new Error('The two settings stores are not isolated.');
  console.log(JSON.stringify({stage: 'storage-isolation', ...isolation}));
  const matching = await evaluate(sessionId, `(async () => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const check = async initiator => {
      const outcome = await chrome.declarativeNetRequest.testMatchOutcome({url:'https://cdn.tinypass.com/paywall.js', type:'script', initiator});
      return outcome.matchedRules.some(match => rules.find(rule => rule.id === match.ruleId)?.action.type === 'block');
    };
    return {supportedBlocked: await check('https://www.nytimes.com'), unrelatedBlocked: await check('https://example.org')};
  })()`);
  if (!matching.supportedBlocked || matching.unrelatedBlocked) throw new Error('Publisher scoping is incorrect.');
  console.log(JSON.stringify({stage: 'rule-matching', ...matching}));
  // Use a vanished frame to exercise the real Chrome missing-receiver callback,
  // without relying on web-store navigation or a third-party page.
  const protectedTarget = await send('Target.createTarget', {url:'about:blank'});
  const protectedSession = (await send('Target.attachToTarget', {targetId:protectedTarget.targetId, flatten:true})).sessionId;
  await send('Page.enable', {}, protectedSession);
  await send('Fetch.enable', {patterns:[{urlPattern:'https://opensaysme.test/missing-frame',requestStage:'Request'}]}, protectedSession);
  await send('Page.navigate', {url:'https://opensaysme.test/missing-frame'}, protectedSession);
  await delay(200);
  const noReceiver = await evaluate(sessionId, `(async () => {
    const [tab] = await chrome.tabs.query({url:'https://opensaysme.test/missing-frame'});
    const originalSend = chrome.tabs.sendMessage.bind(chrome.tabs);
    const missing = await originalSend(tab.id,{mode:'getBadge'},{frameId:2147483646}).then(() => false, () => true);
    await new Promise(resolve => {
      chrome.tabs.sendMessage = (id,message,callback) => originalSend(id,message,{frameId:2147483646},response => {
        try { callback(response); } finally { chrome.tabs.sendMessage = originalSend; resolve(); }
      });
      onTabActivate({tabId:tab.id});
    });
    return missing;
  })()`);
  await delay(200);
  console.log(JSON.stringify({stage:'protected-tab-messaging', noReceiver, warnings:messagingWarnings}));
  await send('Target.closeTarget', {targetId:protectedTarget.targetId});
  const extensionOrigin = worker.url.slice(0, worker.url.lastIndexOf('/'));
  const pages = {'popup.html':'popup-news', 'settings.html':'settings', 'options/options.html':'news-settings',
    'options/options_custom.html':'custom-sites', 'options/options_excluded.html':'excluded-sites',
    'options/optin/opt-in.html':'news-preferences', 'html/options.html':'research-settings', 'html/options1.html':'research-advanced'};
  async function screenshot(sessionId, name) {
    await evaluate(sessionId, 'window.scrollTo(0,0)');
    await delay(50);
    const shot = await send('Page.captureScreenshot', {format:'png'}, sessionId);
    await writeFile(join(screenshotDirectory, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  for (const [path, name] of Object.entries(pages)) {
    const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
    const attached = await send('Target.attachToTarget', {targetId, flatten: true});
    await send('Runtime.enable', {}, attached.sessionId);
    await send('Page.enable', {}, attached.sessionId);
    await send('Emulation.setDeviceMetricsOverride', {width:path === 'popup.html' ? 430 : 1100,
      height:path === 'popup.html' ? 650 : 850, deviceScaleFactor:1, mobile:false}, attached.sessionId);
    await send('Page.navigate', {url: `${extensionOrigin}/${path}`}, attached.sessionId);
    await delay(500);
    const state = await evaluate(attached.sessionId, `({title: document.title, body: document.body.innerText.slice(0, 130),
      missingScripts: [...document.scripts].filter(script => script.src && !script.src.startsWith(location.origin)).length,
      legacyBrand: /Bypass Paywalls Clean|Open Access Helper/.test(document.title+' '+document.body.innerText),
      brokenImages:[...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
      horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
      theme:getComputedStyle(document.documentElement).getPropertyValue('--osm-blue').trim()})`);
    console.log(JSON.stringify({stage: 'page', path, ...state}));
    uiResults.push({path,...state});
    if (state.legacyBrand || state.brokenImages.length || state.horizontalOverflow || state.theme !== '#2563eb')
      throw new Error('A presentation check failed for '+path);
    await screenshot(attached.sessionId, name);
    if (path === 'popup.html') {
      await evaluate(attached.sessionId, `document.getElementById('research').click()`);
      await delay(350);
      const iframe = await evaluate(attached.sessionId, `({src:document.getElementById('tools').getAttribute('src'),
        text:document.getElementById('tools').contentDocument.body.innerText.slice(0,200)})`);
      console.log(JSON.stringify({stage: 'research-popup', ...iframe}));
      await screenshot(attached.sessionId, 'popup-research');
    }
    if (path === 'html/options.html') {
      await evaluate(attached.sessionId, `document.getElementById('breadcrumb3a').click()`);
      await delay(150);
      await screenshot(attached.sessionId, 'research-features');
    }
    await send('Target.closeTarget', {targetId});
  }
  // Add a custom site through the same storage contract as the detection UI.
  await evaluate(sessionId, `bpcStorage.local.set({sites_custom: {'OpenSaysMe fixture': {domain:'opensaysme.test', allow_cookies:1,
    block_regex:'fixture-paywall[.]js', cs_code:[{cond:'.paywall',rm_elem:1},{cond:'article.locked',rm_class:'locked'}]}}})`);
  await delay(500);
  const customEnabled = await evaluate(sessionId, `(async () => { await osmReloadBpc(); await osmSyncRules();
    return isSiteEnabled({url:'https://opensaysme.test/article'}); })()`);
  if (!customEnabled) throw new Error('Newly detected custom sites are not automatically enabled.');
  // Deterministic API fixture: verifies the actual DOI -> worker -> content -> popup pipeline.
  await evaluate(sessionId, `(async () => {
    globalThis.osmOriginalFetch = globalThis.fetch;
    globalThis.fetch = (url, ...args) => String(url).startsWith('https://api.unpaywall.org/v2/')
      ? Promise.resolve(new Response(JSON.stringify({is_oa:true, best_oa_location:{url:'https://example.org/open-paper',
          url_for_pdf:'https://example.org/open-paper.pdf', host_type:'repository', version:'acceptedVersion'}}), {status:200}))
      : osmOriginalFetch(url, ...args);
    await oaStorage.local.set({ebscouc:false, ebsco_cgp:'unset', retractionwatch:false, openalexcitation:false,
      opencitation:false, ezproxy:false, nobadge:false});
  })()`);
  const fixtureTarget = await send('Target.createTarget', {url:'about:blank'});
  const fixtureSession = (await send('Target.attachToTarget', {targetId:fixtureTarget.targetId, flatten:true})).sessionId;
  await send('Runtime.enable', {}, fixtureSession);
  await send('Page.enable', {}, fixtureSession);
  await send('Fetch.enable', {patterns:[{urlPattern:'https://opensaysme.test/*', requestStage:'Request'}]}, fixtureSession);
  await send('Page.navigate', {url:'https://opensaysme.test/article'}, fixtureSession);
  await delay(1800);
  const fixture = await evaluate(fixtureSession, `({paywallRemoved: !document.querySelector('.paywall'),
    articleUnlocked: !document.querySelector('article').classList.contains('locked'), text:document.querySelector('article').textContent})`);
  const paper = await evaluate(sessionId, `(async () => chrome.tabs.sendMessage((await chrome.tabs.query({url:'https://opensaysme.test/*'}))[0].id, {mode:'popup'}))()`);
  console.log(JSON.stringify({stage:'article-fixture', ...fixture, researchUrl:paper?.data?.oaurl, researchStatus:paper?.data?.oastatus}));
  if (!fixture.paywallRemoved || !fixture.articleUnlocked) throw new Error('The custom-site article handler did not run.');
  if (!JSON.stringify(paper).includes('https://example.org/open-paper')) throw new Error('The DOI lookup did not reach the research popup state.');
  // Excluding the fixture must stop both its blocking rules and its page handler.
  await evaluate(sessionId, `bpcStorage.local.set({sites_excluded:['opensaysme.test']})`);
  await delay(600);
  await send('Page.reload', {}, fixtureSession);
  await delay(1400);
  const exclusion = await evaluate(fixtureSession, `({paywallPresent: !!document.querySelector('.paywall'),
    articleLocked:document.querySelector('article').classList.contains('locked')})`);
  console.log(JSON.stringify({stage:'excluded-fixture', ...exclusion}));
  if (!exclusion.paywallPresent || !exclusion.articleLocked) throw new Error('An excluded site still received news page changes.');
  const fixtureTabId = await evaluate(sessionId, `(async () => (await chrome.tabs.query({url:'https://opensaysme.test/*'}))[0].id)()`);
  const detectionTarget = await send('Target.createTarget', {url:'about:blank'});
  const detectionSession = (await send('Target.attachToTarget', {targetId:detectionTarget.targetId, flatten:true})).sessionId;
  await send('Runtime.enable', {}, detectionSession);
  await send('Page.navigate', {url:extensionOrigin + '/options/popup.html'}, detectionSession);
  await delay(350);
  const detection = await evaluate(detectionSession, `new Promise(resolve => detectSiteRule(${fixtureTabId}, 'opensaysme.test', resolve))`);
  if (detection.rule.ld_json !== 'div.paywall|article') throw new Error('Custom-site detection failed: ' + JSON.stringify(detection));
  console.log(JSON.stringify({stage:'custom-site-detection', found:detection.found}));
  await send('Target.closeTarget', {targetId:detectionTarget.targetId});
  await evaluate(fixtureSession, `localStorage.setItem('osm-test','clear'); sessionStorage.setItem('osm-test','clear');`);
  await evaluate(sessionId, `(async () => { await chrome.tabs.update(${fixtureTabId}, {active:true});
    await chrome.cookies.set({url:'https://opensaysme.test/', domain:'.opensaysme.test', name:'osm-test', value:'clear'});
    await clear_cookies(); })()`);
  await delay(400);
  const cleanup = await evaluate(sessionId, `(async () => ({cookies:(await chrome.cookies.getAll({domain:'opensaysme.test'})).length}))()`);
  const pageStorage = await evaluate(fixtureSession, `({local:localStorage.getItem('osm-test'), session:sessionStorage.getItem('osm-test')})`);
  if (cleanup.cookies || pageStorage.local || pageStorage.session) throw new Error('Cookie and page-storage cleanup did not finish before reloading.');
  console.log(JSON.stringify({stage:'cookie-and-storage-cleanup', ...cleanup, ...pageStorage}));
  await evaluate(sessionId, 'globalThis.fetch = osmOriginalFetch');
  await send('Target.closeTarget', {targetId:fixtureTarget.targetId});
  const live = await evaluate(sessionId, `(async () => {
    const response = await Promise.race([unpaywallCall('10.1371/journal.pone.0000308'), new Promise(resolve => setTimeout(() => resolve({timeout:true}), 12000))]);
    return {doi:'10.1371/journal.pone.0000308', isOpenAccess:response.is_oa === true,
      url:response.best_oa_location?.url || null, timedOut:!!response.timeout};
  })()`);
  console.log(JSON.stringify({stage:'live-unpaywall', ...live}));
  if (findings.length) console.log(JSON.stringify({runtimeFindings: findings}, null, 2));
  await writeFile(join(root, 'validation.json'), JSON.stringify({browser: browser.Browser, initial, isolation, matching, fixture,
    researchFixture: {url:paper?.data?.oaurl, status:paper?.data?.oastatus}, exclusion, detection, cleanup:{...cleanup,...pageStorage}, live,
    protectedTab:{noReceiver,warnings:messagingWarnings}, uiResults, findings, checkedAt: new Date().toISOString()}, null, 2));
  if (messagingWarnings.length) throw new Error('Unchecked extension messaging failures were recorded.');
  if (findings.length) throw new Error('Runtime exceptions occurred during the browser check.');
  await send('Browser.close');
  console.log('PASS: isolated Edge worker, rules, settings isolation, both popups and settings pages.');
} finally {
  if (socket?.readyState === WebSocket.OPEN) await closeBrowser?.().catch(() => {});
  socket?.close();
  if (edge.exitCode === null) edge.kill();
}

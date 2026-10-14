/* Manifest V3 integration. The publisher rules and DOM handlers remain upstream. */
let osmRuleTimer;
let osmRuleQueue = Promise.resolve();
let osmLoadQueue = Promise.resolve();
const osmInjectedDocuments = new Set();
const osmResourceTypes = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];
const osmPaywallFilters = [
  '||blueconic.net/', '||cxense.com/', '||evolok.net/', '||googletagmanager.com/',
  '||newsmemory.com/?meter*', '||onecount.net/', '||piano.io/', '||poool.fr/',
  '||qiota.com/', '||tribdss.com/', '||weborama.fr/', '||zephr.com/zephr-browser/',
  '/c/assets/pigeon.js', '/wp-content/evolok/ev-widgets/ev-widgets.min.js',
  '/wp-content/plugins/pico/includes/js/read-more.js',
  '||cdn.ampproject.org/v*/amp-access-*.*js', '||cdn.ampproject.org/v*/amp-subscriptions-*.*js',
  '||cdn.ampproject.org/v*/amp*-ad-*.*js', '||cdn.ampproject.org/v*/amp-analytics-*.*js',
  '||cdn.ampproject.org/v*/amp-fx-flying-carpet-*.*js', '||cdn.tinypass.com/',
  '||js.matheranalytics.com/', '||js.pelcro.com/',
  '||loader-cdn.azureedge.net/prod/*/loader.min.js', '||nexus.ensighten.com/*/Bootstrap.js'
];
const osmIsDomain = value => typeof value === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value);

function osmReloadBpc() {
  osmLoadQueue = osmLoadQueue.catch(() => {}).then(async () => {
    const items = await bpcStorage.local.get({sites: null, sites_custom: {}, sites_updated: {},
      sites_excluded: [], optIn: false, optInUpdate: false});
    if (!items.sites) {
      // Keep the actual display names used by the upstream options UI.
      items.sites = Object.fromEntries(Object.entries(defaultSites)
        .filter(([, val]) => val.domain && !val.domain.match(/^(###$|#options_(disable|optin)_)/))
        .map(([key, val]) => [key, val.domain]));
      await bpcStorage.local.set({sites: items.sites, optInUpdate: false, optInShown: true, customShown: true});
    }
    optionSites = items.sites;
    customSites = items.sites_custom;
    customSites_domains = Object.values(customSites).map(value => value.domain);
    updatedSites = items.sites_updated;
    if (Object.keys(updatedSites).length) expandSiteRules(updatedSites, true);
    updatedSites_domains_new = Object.values(updatedSites).flatMap(value => value.group || [value.domain]).filter(osmIsDomain);
    updatedSites_new = Object.keys(updatedSites).filter(key => !defaultSites[key]);
    excludedSites = items.sites_excluded;
    optin_setcookie = items.optIn;
    enabledSites = Object.values(optionSites).filter(Boolean).map(value => value.toLowerCase());
    disabledSites = defaultSites_grouped_domains.concat(customSites_domains).filter(value => !enabledSites.includes(value));
    add_grouped_enabled_domains(grouped_sites);
    set_rules(optionSites, updatedSites, customSites);
  });
  return osmLoadQueue;
}

function osmScheduleRules() {
  clearTimeout(osmRuleTimer);
  osmRuleTimer = setTimeout(() => osmSyncRules().catch(error => console.error('OpenSaysMe rules:', error)), 75);
}

function osmSyncRules() {
  osmRuleQueue = osmRuleQueue.catch(() => {}).then(async () => {
    const rules = [];
    const rejected = [];
    const enabled = [...new Set(enabledSites.filter(osmIsDomain))];
    const excluded = [...new Set(excludedSites.concat(disabledSites).filter(osmIsDomain))];
    const effective = enabled.filter(domain => !matchDomain(excluded, domain));
    const add = (action, condition, priority = 10) => rules.push({id: rules.length + 1, priority, action, condition});
    const subresources = osmResourceTypes.filter(type => type !== 'main_frame');
    const modify = (requestHeaders, condition, priority = 20) => add({type: 'modifyHeaders', requestHeaders}, condition, priority);
    const setHeader = (header, value) => ({header, operation: 'set', value});
    // Explicit exclusions override both blocking and header changes on subresources.
    if (excluded.length) {
      add({type: 'allow'}, {initiatorDomains: excluded, resourceTypes: subresources}, 100);
      add({type: 'allow'}, {requestDomains: excluded, resourceTypes: osmResourceTypes}, 100);
    }
    // Preserve explicit upstream exclusions for main-document URL paths.
    for (const [domain, regexFilter] of [
      ['bloomberg.com', '^https?://[^/]*bloomberg\\.com/news/terminal/'],
      ['espn.com', '^https?://[^/]*espn\\.com/watch'],
      ['elespanol.com', '^https?://cronicaglobal\\.elespanol\\.com/'],
      ['lastampa.it', '^https?://video\\.lastampa\\.it/'],
      ['repubblica.it', '^https?://video\\.repubblica\\.it/'],
      ['science.org', '^https?://[^/]*science\\.org/doi/'],
      ['statista.com', '^https?://[^/]*statista\\.com/(outlook|study)/'],
      ['quora.com', '^https?://[^/]*quora\\.com/search\\?q=']
    ]) add({type: 'allow'}, {requestDomains: [domain], regexFilter, resourceTypes: osmResourceTypes}, 90);
    const blockExceptions = [...new Set(excluded.concat(['asia.nikkei.com', 'cambridge.org', 'japantimes.co.jp']))];
    if (effective.length) {
      for (const urlFilter of osmPaywallFilters) add({type: 'block'}, {
        urlFilter, initiatorDomains: effective, excludedInitiatorDomains: blockExceptions,
        resourceTypes: ['script', 'xmlhttprequest']
      });
    }
    // Preserve opt-in detection of WordPress paywall plugins on unlisted sites.
    for (const [setting, urlFilter] of [['###_wp_evolok', '/wp-content/evolok/ev-widgets/ev-widgets.min.js'],
      ['###_wp_pico', '/wp-content/plugins/pico/includes/js/read-more.js'], ['###_wp_pigeon', '/c/assets/pigeon.js']]) {
      if (enabledSites.includes(setting)) add({type: 'block'}, {urlFilter, excludedInitiatorDomains: blockExceptions, resourceTypes: ['script']});
    }
    for (const domain of effective) {
      const requestScope = {requestDomains: [domain]};
      const restriction = restrictions[domain];
      if (restriction && !restriction.source.includes('(?')) {
        const support = await chrome.declarativeNetRequest.isRegexSupported({regex: restriction.source});
        if (support.isSupported) requestScope.regexFilter = restriction.source;
      }
      if (!matchDomain(allow_cookies, domain)) modify([{header: 'cookie', operation: 'remove'}],
        {...requestScope, resourceTypes: osmResourceTypes});
      if (block_js_custom.includes(domain)) add({type: 'block'}, {requestDomains: [domain], resourceTypes: ['script']});
      if (block_js_custom_ext.includes(domain)) add({type: 'block'}, {initiatorDomains: [domain],
        excludedRequestDomains: [domain], resourceTypes: ['script']});
      const regex = blockedRegexes[domain];
      if (regex) {
        const regexFilter = regex.source;
        const support = await chrome.declarativeNetRequest.isRegexSupported({regex: regexFilter, isCaseSensitive: !regex.ignoreCase});
        let parts = support.isSupported ? [regexFilter] : osmSplitRegex(regexFilter);
        if (!support.isSupported && parts.length === 1) parts = [];
        for (const part of parts) {
          const check = support.isSupported ? support : await chrome.declarativeNetRequest.isRegexSupported({regex: part, isCaseSensitive: !regex.ignoreCase});
          if (check.isSupported) add({type: 'block'}, {regexFilter: part, isUrlFilterCaseSensitive: !regex.ignoreCase,
            initiatorDomains: [domain], resourceTypes: subresources});
          else rejected.push({domain, regex: part, reason: check.reason});
        }
        if (!parts.length) rejected.push({domain, regex: regexFilter, reason: support.reason});
      }
      const headers = [];
      const condition = {...requestScope, resourceTypes: osmResourceTypes.filter(type => !['image', 'font', 'stylesheet'].includes(type))};
      const google = use_google_bot.includes(domain) && !(domain === 'barrons.com' && enabledSites.includes('#options_disable_gb_barrons'))
        && !(domain === 'wsj.com' && enabledSites.includes('#options_disable_gb_wsj'));
      if (google) {
        headers.push(setHeader('user-agent', userAgentDesktopG), setHeader('x-forwarded-for', '66.249.66.1'));
        if (domain === 'theaustralian.com.au') condition.urlFilter = '||www.theaustralian.com.au/the-oz/';
        if (domain === 'thetimes.co.uk') condition.urlFilter = '||epaper.thetimes.co.uk/article/';
      } else if (use_bing_bot.includes(domain)) headers.push(setHeader('user-agent', userAgentDesktopB));
      if (google || use_google_referer.includes(domain)) headers.push(setHeader('referer', 'https://www.google.com/'));
      else if (use_facebook_referer.includes(domain)) headers.push(setHeader('referer', 'https://www.facebook.com/'));
      else if (use_twitter_referer.includes(domain)) headers.push(setHeader('referer', 'https://t.co/'));
      // DNR values are declarative: refresh the random address when rules rebuild.
      if (random_ip[domain]) {
        const index = headers.findIndex(header => header.header === 'x-forwarded-for');
        if (index >= 0) headers.splice(index, 1);
        headers.push(setHeader('x-forwarded-for', random_ip[domain] === 'eu' ? randomIP(185, 185) : randomIP()));
      }
      if (headers.length) modify(headers, condition);
    }
    const enabledDomain = domain => effective.some(value => domain === value || domain.endsWith('.' + value));
    const redirect = (domain, regexFilter, regexSubstitution) => {
      if (enabledDomain(domain)) add({type: 'redirect', redirect: {regexSubstitution}}, {regexFilter, resourceTypes: ['main_frame']}, 30);
    };
    redirect('repubblica.it', '^(https?://[^/]*repubblica\\.it)/pwa/(.*)$', '\\1/ws/detail/\\2');
    redirect('business-standard.com', '^https?://wap\\.business-standard\\.com/(.*)$', 'https://www.business-standard.com/\\1');
    redirect('economictimes.com', '^https?://economictimes\\.indiatimes\\.com/([^?]*)\\?from=mdr$', 'https://m.economictimes.com/\\1');
    redirect('infzm.com', '^https?://www\\.infzm\\.com/contents/(.*)$', 'https://www.infzm.com/wap/#/content/\\1');
    redirect('telegraaf.nl', '^https?://www\\.telegraaf\\.nl/error\\?ref=/([^&]*).*$', 'https://www.telegraaf.nl/\\1');
    if (enabledDomain('faz.net')) modify([setHeader('user-agent', 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5) AppleWebKit/537.36 Chrome/81.0.4044.122 Mobile Safari/537.36')],
      {urlFilter: '||m.faz.net/', resourceTypes: ['xmlhttprequest']}, 40);
    if (enabledDomain('business-standard.com')) modify([setHeader('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')],
      {urlFilter: '||www.business-standard.com/', resourceTypes: ['main_frame']}, 40);
    if (enabledDomain('nytimes.com')) add({type: 'modifyHeaders', responseHeaders: [setHeader('x-frame-options', 'SAMEORIGIN')]},
      {requestDomains: ['nytimes.com'], resourceTypes: ['sub_frame']}, 20);
    if (enabledDomain('elpais.com')) add({type: 'modifyHeaders', responseHeaders: [{header: 'content-security-policy', operation: 'append', value: 'script-src *;'}]},
      {requestDomains: ['elpais.com'], regexFilter: '\\.html([?#]|$)', resourceTypes: ['main_frame', 'sub_frame']}, 20);
    if (enabledDomain('theglobeandmail.com') && enabledSites.includes('#options_optin_tgam_premium'))
      add({type: 'modifyHeaders', responseHeaders: [{header: 'content-security-policy', operation: 'append', value: 'script-src *;'}]},
        {requestDomains: ['theglobeandmail.com'], urlFilter: '?rel=premium', resourceTypes: ['main_frame', 'sub_frame']}, 20);
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: oldRules.map(rule => rule.id), addRules: rules});
    await chrome.storage.local.set({'osm:rules': {count: rules.length, skipped: rejected, updated: Date.now(), error: null}});
    return rules;
  }).catch(async error => {
    await chrome.storage.local.set({'osm:rules': {error: error.message, updated: Date.now()}});
    throw error;
  });
  return osmRuleQueue;
}

// A union can exceed Chromium's per-regex memory budget even when each branch
// fits. Split only genuine top-level alternatives, respecting escapes and groups.
function osmSplitRegex(source) {
  if (source.startsWith('(') && source.endsWith(')')) {
    let depth = 0, escaped = false, bracket = false, outer = true;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '[') bracket = true;
      if (char === ']') bracket = false;
      if (bracket) continue;
      if (char === '(') depth++;
      if (char === ')' && --depth === 0 && index !== source.length - 1) { outer = false; break; }
    }
    if (outer) source = source.slice(source.startsWith('(?:') ? 3 : 1, -1);
  }
  const parts = [];
  let depth = 0, escaped = false, bracket = false, start = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '[') bracket = true;
    if (char === ']') bracket = false;
    if (bracket) continue;
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === '|' && depth === 0) { parts.push(source.slice(start, index)); start = index + 1; }
  }
  parts.push(source.slice(start));
  return parts.filter(Boolean);
}

function osmBpcData(url) {
  const data = {optin_setcookie, amp_unhide: !!matchUrlDomain(amp_unhide, url)};
  for (const [name, table] of Object.entries({amp_redirect, cs_code, ld_json})) {
    const domain = matchUrlDomain(Object.keys(table), url);
    if (domain) data[name] = table[domain];
  }
  return data;
}

async function osmInjectBpc(sender) {
  await osmBpcReady;
  if (!sender.tab || !isSiteEnabled({url: sender.url || sender.tab.url})) return {enabled: false};
  const key = sender.documentId || `${sender.tab.id}:${sender.url}`;
  if (osmInjectedDocuments.has(key)) return {enabled: true};
  osmInjectedDocuments.add(key);
  const target = sender.documentId ? {tabId: sender.tab.id, documentIds: [sender.documentId]} : {tabId: sender.tab.id, frameIds: [sender.frameId || 0]};
  try {
    await chrome.scripting.executeScript({target, func: value => { globalThis.bg2csData = value; }, args: [osmBpcData(sender.url || sender.tab.url)]});
    await chrome.scripting.executeScript({target, files: ['lib/purify.min.js', 'contentScript.js']});
    return {enabled: true};
  } catch (error) {
    osmInjectedDocuments.delete(key);
    throw error;
  }
}

async function remove_cookies_fn(domain, exclusions = false) {
  const cookies = await chrome.cookies.getAll({domain});
  await Promise.all(cookies.filter(cookie => {
    if (!exclusions) return true;
    const host = cookie.domain.replace(/^\./, '');
    if (/consent|^optanon/i.test(cookie.name)) return false;
    if (remove_cookies_select_hold[host]?.includes(cookie.name)) return false;
    if (remove_cookies_select_drop[host] && !remove_cookies_select_drop[host].includes(cookie.name)) return false;
    return true;
  }).map(cookie => chrome.cookies.remove({url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
    name: cookie.name, storeId: cookie.storeId, ...(cookie.partitionKey ? {partitionKey: cookie.partitionKey} : {})})));
}

async function clear_cookies() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab || !/^https?:/.test(tab.url || '')) return;
  await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['options/clearCookies.js']});
  const result = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => globalThis.cookie_domain});
  const domain = result[0]?.result || new URL(tab.url).hostname;
  await remove_cookies_fn(domain);
  await chrome.tabs.reload(tab.id);
}

// Registered synchronously so cold service-worker starts receive all events.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.osm !== 'bpc-ready') return false;
  osmInjectBpc(sender).then(reply).catch(error => reply({error: error.message}));
  return true;
});
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;
  const settings = ['sites', 'sites_custom', 'sites_updated', 'sites_excluded', 'optIn'];
  if (settings.some(key => 'bpc:' + key in changes)) {
    (async () => {
      const customChange = changes['bpc:sites_custom'];
      if (customChange) {
        const previous = customChange.oldValue || {};
        const next = customChange.newValue || {};
        const {sites = {}} = await bpcStorage.local.get('sites');
        let modified = false;
        for (const [key, value] of Object.entries(next)) {
          if (!(key in previous) && !defaultSites[key] && !defaultSites_domains.includes(value.domain)) {
            sites[key] = value.domain;
            modified = true;
          }
        }
        for (const key of Object.keys(previous)) {
          if (!(key in next) && !defaultSites[key]) { delete sites[key]; modified = true; }
        }
        if (modified) await bpcStorage.local.set({sites});
      }
      await osmReloadBpc();
      await osmSyncRules();
      refreshCurrentTab();
    })().catch(console.error);
  }
});
chrome.webRequest.onBeforeRequest.addListener(details => {
  osmBpcReady.then(() => {
    osmDiscoverBpc(details);
    if (details.type === 'main_frame' && details.tabId >= 0) {
      const id = 1000000 + details.tabId;
      const restricted = matchUrlDomain(enabledSites, details.url) && !isSiteEnabled(details);
      chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [id], addRules: restricted ? [{id, priority:200,
        action:{type:'allow'}, condition:{tabIds:[details.tabId], resourceTypes:osmResourceTypes.filter(type => type !== 'main_frame')}}] : []}).catch(console.error);
    }
    // These legacy redirects require URL decoding, which DNR cannot express.
    if (details.type !== 'main_frame' || details.tabId < 0 || !isSiteEnabled(details)) return;
    const url = new URL(details.url);
    let target;
    if (matchUrlDomain('inkl.com', details.url)) {
      if (url.searchParams.has('etok')) { url.searchParams.delete('etok'); target = url.href; }
      if (url.pathname === '/signin' && url.searchParams.has('redirect_to'))
        target = new URL(url.searchParams.get('redirect_to'), 'https://www.inkl.com').href;
    }
    if (matchUrlDomain(au_news_corp_domains, details.url) && url.pathname.startsWith('/subscribe/') && !url.pathname.includes('digitalprinteditions')) {
      const dest = url.searchParams.get('dest');
      if (dest) target = matchUrlDomain('theaustralian.com.au', details.url) ? dest.replace('://www.', '://amp.') : dest + '?amp';
    }
    if (target && /^https?:/.test(target) && target !== details.url) chrome.tabs.update(details.tabId, {url: target}).catch(() => {});
  }).catch(console.error);
}, {urls: ['http://*/*', 'https://*/*']});
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1000000 + tabId]}).catch(() => {});
});
chrome.webRequest.onCompleted.addListener(details => {
  osmBpcReady.then(() => {
    const domain = matchUrlDomain(remove_cookies, details.url);
    if (domain && isSiteEnabled(details) && ['main_frame', 'sub_frame', 'xmlhttprequest', 'other'].includes(details.type))
      return remove_cookies_fn(domain, true);
  }).catch(console.error);
}, {urls: ['http://*/*', 'https://*/*']});
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') chrome.tabs.create({url: chrome.runtime.getURL('settings.html')});
});
const osmBpcReady = Promise.resolve().then(osmReloadBpc).then(osmSyncRules);

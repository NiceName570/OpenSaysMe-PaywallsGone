'use strict';
var ext_api = (typeof browser === 'object') ? browser : chrome;
var url_loc = (typeof browser === 'object') ? 'firefox' : 'chrome';
var manifestData = ext_api.runtime.getManifest();
var ext_name = manifestData.name;
var ext_version = manifestData.version;

const cs_limit_except = ['elespanol.com', 'faz.net', 'nation.africa', 'nationalgeographic.com', 'thetimes.co.uk'];
const dompurify_sites = ['asiatimes.com', 'bloomberg.com', 'cicero.de', 'economictimes.com', 'hs.fi', 'iltalehti.fi', 'ipolitics.ca', 'italiaoggi.it', 'lesechos.fr', 'marianne.net', 'newleftreview.org', 'nzherald.co.nz', 'prospectmagazine.co.uk', 'stratfor.com', 'techinasia.com', 'timesofindia.com', 'valor.globo.com', 'vn.nl'].concat(be_mediahuis_domains, fr_groupe_sud_ouest_domains, nl_mediahuis_region_domains, no_nhst_media_domains, usa_theathletic_domains);
var currentTabUrl = '';
var csDone = false;
var optin_setcookie = false;
var optin_update = true;
var blocked_referer = false;

// defaultSites are loaded from sites.js at installation extension

var restrictions = {
  'bloomberg.com': /^((?!\.bloomberg\.com\/news\/terminal\/).)*$/,
  'economictimes.com': /\.economictimes\.com($|\/($|(__assets|prime)(\/.+)?|.+\.cms))/,
  'elespanol.com': /^((?!\/cronicaglobal\.elespanol\.com\/).)*$/,
  'espn.com': /^((?!espn\.com\/watch).)*$/,
  'faz.net': /^((?!\.faz\.net\/aktuell\/(\?switchfaznet)?$).)*$/,
  'foreignaffairs.com': /\.foreignaffairs\.com\/((articles|fa-caching|interviews|reviews|sites)\/)/,
  'lastampa.it': /^((?!\/video\.lastampa\.it\/).)*$/,
  'science.org': /^((?!\.science\.org\/doi\/).)*$/,
  'timesofindia.com': /\.timesofindia\.com($|\/($|toi-plus(\/.+)?|.+\.cms))/,
  'quora.com': /^((?!quora\.com\/search\?q=).)*$/,
  'repubblica.it': /^((?!\/video\.repubblica\.it\/).)*$/,
  'seekingalpha.com': /\/seekingalpha\.com($|\/($|(amp\/)?(article|news)\/|samw\/))/,
  'statista.com': /^((?!\.statista\.com\/(outlook|study)\/).)*$/,
  'techinasia.com': /\.techinasia\.com\/.+/,
  'timeshighereducation.com': /\.timeshighereducation\.com\/((features|news|people)\/|.+((\w)+(\-)+){3,}.+|sites\/default\/files\/)/
}

for (let domain of au_news_corp_domains)
  restrictions[domain] = new RegExp('^((?!todayspaper\\.' + domain.replace(/\./g, '\\.') + '\\/).)*$');
if (typeof browser !== 'object') {
  for (let domain of [])
    restrictions[domain] = new RegExp('((\\/|\\.)' + domain.replace(/\./g, '\\.') + '\\/$|' + restrictions[domain].toString().replace(/(^\/|\/$)/g, '') + ')');
}

// Don't remove cookies before/after page load
var allow_cookies = [];
var remove_cookies = [];
// select specific cookie(s) to hold/drop from remove_cookies domains
var remove_cookies_select_hold, remove_cookies_select_drop;

// Set User-Agent
var use_google_bot, use_bing_bot;
// Set Referer
var use_facebook_referer, use_google_referer, use_twitter_referer;
// Set random IP-address
var random_ip = {};
var use_random_ip = [];
// concat all sites with change of headers (useragent, referer or random ip)
var change_headers;

// block paywall-scripts individually
var blockedRegexes = {};

// unhide text on amp-page
var amp_unhide;
// redirect to amp-page
var amp_redirect;
// code for contentScript
var cs_code;
// load text from json
var ld_json;

// custom: block javascript
var block_js_custom = [];
var block_js_custom_ext = [];

function initSetRules() {
  allow_cookies = [];
  remove_cookies = [];
  remove_cookies_select_drop = {};
  remove_cookies_select_hold = {};
  use_google_bot = [];
  use_bing_bot = [];
  use_facebook_referer = [];
  use_google_referer = [];
  use_twitter_referer = [];
  random_ip = {};
  change_headers = [];
  amp_unhide = [];
  amp_redirect = {};
  cs_code = {};
  ld_json = {};
  block_js_custom = [];
  block_js_custom_ext = [];
  blockedRegexes = {};
}

const userAgentDesktopG = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const userAgentMobileG = "Chrome/80.0.3987.92 Mobile Safari/537.36 (compatible ; Googlebot/2.1 ; +http://www.google.com/bot.html)"

const userAgentDesktopB = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"
const userAgentMobileB = "Chrome/80.0.3987.92 Mobile Safari/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"

var enabledSites = [];
var disabledSites = [];
var optionSites = {};
var customSites = {};
var customSites_domains = [];
var updatedSites = {};
var updatedSites_new = [];
var updatedSites_domains_new = [];
var excludedSites = [];

function setDefaultOptions() {
  bpcStorage.local.set({
    sites: filterObject(defaultSites, function (val, key) {
      return val.domain && !val.domain.match(/^(###$|#options_(disable|optin)_)/)
    },
      function (val, key) {
      return [key, val.domain]
    })
  }, function () {
    ext_api.runtime.openOptionsPage();
  });
}

function check_sites_updated() { return osmReloadBpc(); }

function set_rules(sites, sites_updated, sites_custom) {
  initSetRules();
  for (let site in sites) {
    let site_domain = sites[site].toLowerCase();
    let custom = false;
    if (!site_domain.match(/^(###$|#options_)/)) {
      let rule = {};
      let site_default = defaultSites.hasOwnProperty(site) ? site : Object.keys(defaultSites).find(default_key => compareKey(default_key, site));
      if (site_default) {
        rule = defaultSites[site_default];
        if (sites_updated.hasOwnProperty(site_default) && !sites_updated[site_default].new_site)
          rule = sites_updated[site_default];
      } else if (sites_updated.hasOwnProperty(site)) { // updated (new) sites
        rule = sites_updated[site];
      } else if (sites_custom.hasOwnProperty(site)) { // custom (new) sites
        rule = sites_custom[site];
        custom = true;
      } else
        continue;
      let domains = [site_domain];
      let group = false;
      if (rule.hasOwnProperty('group')) {
        domains = rule.group;
        group = true;
      }
      let rule_default = {};
      if (rule.hasOwnProperty('exception')) {
        for (let key in rule)
          rule_default[key] = rule[key];
      }
      for (let domain of domains) {
        let custom_in_group = false;
        if (rule_default.hasOwnProperty('exception')) {
          let exception_rule = rule_default.exception.filter(x => domain === x.domain || (typeof x.domain !== 'string' && x.domain.includes(domain)));
          if (exception_rule.length > 0)
            rule = exception_rule[0];
          else
            rule = rule_default;
        }
        // custom domain for default site(group)
        if (!custom) {
          let isCustomSite = matchDomain(customSites_domains, domain);
          let customSite_title = isCustomSite ? Object.keys(customSites).find(key => customSites[key].domain === isCustomSite) : '';
          if (customSite_title) {
            // add default block_regex
            let block_regex_default = '';
            if (rule.hasOwnProperty('block_regex'))
              block_regex_default = rule.block_regex;
            rule = {};
            for (let key in sites_custom[customSite_title])
              rule[key] = sites_custom[customSite_title][key];
            if (block_regex_default) {
              if (rule.hasOwnProperty('block_regex')) {
                if (block_regex_default instanceof RegExp)
                  block_regex_default = block_regex_default.source;
                rule.block_regex = '(' + block_regex_default + '|' + rule.block_regex.replace(/(^\/|\/$)/g, '') + ')';
              } else
                rule.block_regex = block_regex_default;
            }
            if (group)
              custom_in_group = true;
            else
              custom = true;
          }
        }
        addCookieRules(rule, custom || custom_in_group);
        
        if (rule.allow_cookies > 0 && !allow_cookies.includes(domain))
          allow_cookies.push(domain);
        if (rule.remove_cookies > 0 && !remove_cookies.includes(domain))
          remove_cookies.push(domain);
        if (rule.hasOwnProperty('remove_cookies_select_drop'))
          remove_cookies_select_drop[domain] = rule.remove_cookies_select_drop;
        if (rule.hasOwnProperty('remove_cookies_select_hold'))
          remove_cookies_select_hold[domain] = rule.remove_cookies_select_hold;
        if (rule.hasOwnProperty('block_regex')) {
          if (rule.block_regex instanceof RegExp)
            blockedRegexes[domain] = rule.block_regex;
          else {
            try {
              blockedRegexes[domain] = new RegExp(rule.block_regex.replace('{domain}', domain.replace(/\./g, '\\.').replace(/(^\/|\/$)/g, '')));
            } catch (e) {
              false;
            }
          }
        }
        if (rule.useragent) {
          switch (rule.useragent) {
          case 'googlebot':
            if (!use_google_bot.includes(domain))
              use_google_bot.push(domain);
            break;
          case 'bingbot':
            if (!use_bing_bot.includes(domain))
              use_bing_bot.push(domain);
            break;
          }
        }
        if (rule.referer) {
          switch (rule.referer) {
          case 'facebook':
            if (!use_facebook_referer.includes(domain))
              use_facebook_referer.push(domain);
            break;
          case 'google':
            if (!use_google_referer.includes(domain))
              use_google_referer.push(domain);
            break;
          case 'twitter':
            if (!use_twitter_referer.includes(domain))
              use_twitter_referer.push(domain);
            break;
          }
        }
        if (rule.random_ip) {
          random_ip[domain] = rule.random_ip;
        }
        // updated
        if (rule.amp_redirect)
          amp_redirect[domain] = rule.amp_redirect.paywall ? rule.amp_redirect : {paywall: rule.amp_redirect};
        if (rule.cs_code)
          cs_code[domain] = rule.cs_code;
        // custom
        if (rule.googlebot > 0)
          use_google_bot.push(domain);
        if (rule.block_javascript > 0)
          block_js_custom.push(domain);
        if (rule.block_javascript_ext > 0)
          block_js_custom_ext.push(domain);
        if (rule.amp_unhide > 0)
          amp_unhide.push(domain);
        if (rule.ld_json) {
          ld_json[domain] = rule.ld_json;
          if (!dompurify_sites.includes(domain))
            dompurify_sites.push(domain);
        }
      }
    }
  }
  if (enabledSites.includes('#options_optin_tgam_premium'))
    blockedRegexes['theglobeandmail.com'] = /smartwall\.theglobeandmail\.com\//;
  use_random_ip = Object.keys(random_ip);
  change_headers = use_google_bot.concat(use_bing_bot, use_facebook_referer, use_google_referer, use_twitter_referer, use_random_ip);
  osmScheduleRules();
}

// add grouped sites to en/disabledSites (and exclude sites)
function add_grouped_enabled_domains(groups) {
  for (let key in groups) {
    if (enabledSites.includes(key))
      enabledSites = enabledSites.concat(groups[key]);
    else
      disabledSites = disabledSites.concat(groups[key]);
    for (let site of excludedSites) {
      if (enabledSites.includes(site)) {
        enabledSites.splice(enabledSites.indexOf(site), 1);
        disabledSites.push(site);
      }
    }
  }
}


function filterObject(obj, filterFn, mapFn = function (val, key) {
  return [key, val];
}) {
  return Object.fromEntries(Object.entries(obj).
    filter(([key, val]) => filterFn(val, key)).map(([key, val]) => mapFn(val, key)));
}

function compareKey(firstStr, secondStr) {
  return firstStr.toLowerCase().replace(/\s\(.*\)/, '') === secondStr.toLowerCase().replace(/\s\(.*\)/, '');
}

function isSiteEnabled(details) {
  var enabledSite = matchUrlDomain(enabledSites, details.url);
  if (enabledSite in restrictions) {
    return restrictions[enabledSite].test(details.url);
  }
  return !!enabledSite;
}

function matchDomain(domains, hostname = '') {
  var matched_domain = false;
  if (typeof domains === 'string')
    domains = [domains];
  domains.some(domain => (hostname === domain || hostname.endsWith('.' + domain)) && (matched_domain = domain));
  return matched_domain;
}

function urlHost(url) {
  if (url && url.startsWith('http')) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      console.log(`url not valid: ${url} error: ${e}`);
    }
  }
  return url;
}

function matchUrlDomain(domains, url) {
  return matchDomain(domains, urlHost(url));
}

function getParameterByName(name, url) {
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
  results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function stripQueryStringAndHashFromPath(url) {
  return url.split("?")[0].split("#")[0];
}

function decode_utf8(str) {
  return decodeURIComponent(escape(str));
}

function randomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function randomIP(range_low = 0, range_high = 223) {
  let rndmIP = [];
  for (let n = 0; n < 4; n++) {
    if (n === 0)
      rndmIP.push(range_low + randomInt(range_high - range_low + 1));
    else
      rndmIP.push(randomInt(255) + 1);
  }
  return rndmIP.join('.');
}

// Refresh the current tab
function refreshCurrentTab() {
  ext_api.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
      if (ext_api.runtime.lastError)
        return;
      ext_api.tabs.update(tabs[0].id, {
        url: tabs[0].url
      });
    }
  });
}

function site_switch() {
  ext_api.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
      let currentUrl = tabs[0].url;
      let isDefaultSite = matchUrlDomain(defaultSites_grouped_domains, currentUrl);
      if (!isDefaultSite) {
        let isDefaultSiteGroup = matchUrlDomain(defaultSites_domains, currentUrl);
        if (isDefaultSiteGroup)
          isDefaultSite = Object.keys(grouped_sites).find(key => grouped_sites[key].includes(isDefaultSiteGroup));
      }
      if (!isDefaultSite) {
        let sites_updated_domains_new = Object.values(updatedSites).filter(x => x.domain && !defaultSites_domains.includes(x.domain));
        let isUpdatedSite = matchUrlDomain(sites_updated_domains_new, currentUrl);
        if (isUpdatedSite)
          isDefaultSite = isUpdatedSite;
      }
      let defaultSite_title = isDefaultSite ? Object.keys(defaultSites).find(key => defaultSites[key].domain === isDefaultSite) : '';
      let isCustomSite = matchUrlDomain(Object.values(customSites_domains), currentUrl);
      let customSite_title = isCustomSite ? Object.keys(customSites).find(key => customSites[key].domain === isCustomSite) : '';
      let site_title = defaultSite_title || customSite_title;
      let domain = isDefaultSite || isCustomSite;
      if (domain && site_title) {
        let added_site = [];
        let removed_site = [];
        if (enabledSites.includes(domain))
          removed_site.push(site_title);
        else
          added_site.push(site_title);
        bpcStorage.local.get({
          sites: {}
        }, function (items) {
          var sites = items.sites;
          for (let key of added_site)
            sites[key] = domain;
          for (let key of removed_site) {
            key = Object.keys(sites).find(sites_key => compareKey(sites_key, key));
            delete sites[key];
          }
          bpcStorage.local.set({
            sites: sites
          }, function () {
            true;
          });
        });
      }
    }
  });
}


var chrome_scheme = 'light';
ext_api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.request === 'clear_cookies') {
    clear_cookies().then(() => sendResponse({ok: true})).catch(error => sendResponse({error: error.message}));
    return true;
  }
  // clear cookies for domain
  if (message.domain) {
    remove_cookies_fn(message.domain).then(() => sendResponse({ok: true})).catch(error => sendResponse({error: error.message}));
    return true;
  }
  if (message.request === 'site_switch') {
    site_switch();
  }
  if (message.request === 'check_sites_updated') {
    check_sites_updated();
  }
  if (message.request === 'popup_show_toggle') {
    ext_api.tabs.query({
      active: true,
      currentWindow: true
    }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
        let currentUrl = tabs[0].url;
        let domain;
        let isExcludedSite = matchUrlDomain(excludedSites, currentUrl);
        if (!isExcludedSite) {
          let isDefaultSiteGrouped = matchUrlDomain(defaultSites_domains, currentUrl);
          let isDefaultSite = matchUrlDomain(defaultSites_domains, currentUrl);
          let isCustomSite = matchUrlDomain(Object.values(customSites_domains), currentUrl);
          domain = isDefaultSiteGrouped || (!isDefaultSite && isCustomSite);
        }
        ext_api.runtime.sendMessage({
          msg: "popup_show_toggle",
          data: {
            domain: domain,
            enabled: enabledSites.includes(domain)
          }
        });
      }
    });
  }
  if (message.request === 'refreshCurrentTab') {
    refreshCurrentTab();
  }
  if (message.request === 'getExtSrc' && message.data && sender.tab) {
    fetch(message.data.url)
    .then(response => {
      if (response.ok) {
        response.text().then(html => {
          if (message.data.base64) {
            html = decode_utf8(atob(html));
            message.data.selector_source = 'body';
          }
          message.data.html = html; // Parse and select in the content script, where DOMParser exists.
          ext_api.tabs.query({
            active: true,
            currentWindow: true
          }, function (tabs) {
            if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
              ext_api.tabs.sendMessage(sender.tab.id, {msg: "showExtSrc", data: message.data});
            }
          });
        });
      }
    }).catch(function (err) {
      message.data.html = '';
      ext_api.tabs.query({
        active: true,
        currentWindow: true
      }, function (tabs) {
        if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
          ext_api.tabs.sendMessage(sender.tab.id, {msg: "showExtSrc", data: message.data});
        }
      });
    });
  }
  if (message.csDone) {
    csDone = true;
    //console.log('msg.csDone: ' + csDone);
  }
});


function osmDiscoverBpc(details) {
  const header_referer = details.documentUrl || details.initiator || "";
  function customAddRules(custom_domains, custom_allow_cookies = '', custom_block_regex = '', custom_useragent = '', custom_referer = '', custom_amp_unhide = false) {
    let custom_domain = urlHost(header_referer).replace(/^(www|m|account|amp|edition|eu)\./, '');
    if (custom_allow_cookies && !allow_cookies.includes(custom_domain))
      allow_cookies.push(custom_domain);
    if (custom_block_regex) {
      if ((typeof custom_block_regex === 'string') && custom_block_regex.includes('{domain}'))
        custom_block_regex = new RegExp(custom_block_regex.replace('{domain}', custom_domain.replace(/\./g, '\\.')));
      blockedRegexes[custom_domain] = custom_block_regex;
    }
    if (custom_useragent) {
      if (custom_useragent === 'googlebot') {
        if (!use_google_bot.includes(custom_domain))
          use_google_bot.push(custom_domain);
        change_headers.push(custom_domain);
      }
    }
    if (custom_referer) {
      if (custom_referer === 'twitter') {
        if (!use_twitter_referer.includes(custom_domain))
          use_twitter_referer.push(custom_domain);
        change_headers.push(custom_domain);
      }
    }
    if (custom_amp_unhide) {
      if (!amp_unhide.includes(custom_domain))
        amp_unhide.push(custom_domain);
    }
    custom_domains.push(custom_domain);
    if (!enabledSites.includes(custom_domain))
      enabledSites.push(custom_domain);
    osmScheduleRules();
    return custom_domains;
  }

  if (!matchUrlDomain(excludedSites, header_referer)) {

  // remove cookies for sites medium platform (custom domains)
  var medium_custom_domain = (matchUrlDomain('cdn-client.medium.com', details.url) && ['script'].includes(details.type) && !matchUrlDomain(medium_custom_domains.concat(['medium.com']), header_referer) && enabledSites.includes('###_medium_custom'));
  if (medium_custom_domain)
    medium_custom_domains = customAddRules(medium_custom_domains);
  else {
    let header_referer_hostname = urlHost(header_referer);
    if (header_referer_hostname.match(/\.(com|net)\.au$/)) {
      // block Piano.io for regional Australian Community Media sites (opt-in to custom sites)
      var au_comm_media_domain = (details.url.startsWith('https://' + header_referer_hostname + '/promotions/website_content_esov/') && ['xmlhttprequest'].includes(details.type) && !matchUrlDomain(au_comm_media_domains, header_referer) && enabledSites.includes('###_au_comm_media'));
      if (au_comm_media_domain)
        au_comm_media_domains = customAddRules(au_comm_media_domains, true, blockedRegexes['canberratimes.com.au']);
      else if (header_referer_hostname.endsWith('.com.au')) {
        // enable regional The West Australian sites (opt-in to custom sites)
        var au_thewest_domains = ['thewest.com.au'];
        var au_thewest_domain = (details.url.startsWith('https://images.thewest.com.au/') && ['image'].includes(details.type) &&
          !matchUrlDomain(au_thewest_domains, header_referer) && enabledSites.includes('thewest.com.au'));
        if (au_thewest_domain)
          au_thewest_domains = customAddRules(au_thewest_domains, true);
      }
    } else if (header_referer_hostname.endsWith('.ch')) {
      // set googlebot-useragent for regional nzz.ch sites (opt-in to custom sites)
      var ch_media_domains = [];
      var ch_media_domain = (matchUrlDomain('static-chmedia.ch', details.url) && ['script'].includes(details.type) && !matchUrlDomain(ch_media_domains, header_referer) && enabledSites.includes('nzz.ch'));
      if (ch_media_domain)
        ch_media_domains = customAddRules(ch_media_domains, true, blockedRegexes['nzz.ch'], 'googlebot');
    } else if (header_referer_hostname.endsWith('.cl')) {
      // block scripts for regional El Mercurio sites (opt-in to custom sites)
      var cl_emol_region_domains = [];
      var cl_emol_region_domain = (matchUrlDomain('impresa.soy-chile.cl', details.url) && ['xmlhttprequest'].includes(details.type) && !matchUrlDomain(cl_emol_region_domains, header_referer) && enabledSites.includes('elmercurio.com'));
      if (cl_emol_region_domain) {
        cl_emol_region_domains = customAddRules(cl_emol_region_domains, false, "(\\.{domain}\\/impresa\\/.+\\/assets\\/(vendor|\\d)\\.js|pram\\.pasedigital\\.cl\\/API\\/User\\/Status\\?)");
	  }
    } else if (header_referer_hostname.endsWith('.de')) {
      // set googlebot-useragent for additional Funke sites (opt-in to custom sites)
      var de_funke_medien_domains = grouped_sites['###_de_funke_medien'];
      var de_funke_domain = (matchUrlDomain('funkedigital.de', details.url) && ['script'].includes(details.type) && !matchUrlDomain(de_funke_medien_domains, header_referer) && enabledSites.includes('###_de_funke_medien'));
      if (de_funke_domain)
        de_funke_medien_domains = customAddRules(de_funke_medien_domains, true, blockedRegexes['waz.de'], 'googlebot');
      else {
        // block script for additional Madsack/RND sites (opt-in to custom sites)
        var de_madsack_domains = grouped_sites['###_de_madsack'];
        var de_madsack_custom_domains = ['aller-zeitung.de', 'dnn.de', 'gnz.de', 'goettinger-tageblatt.de', 'paz-online.de', 'sn-online.de', 'waz-online.de'];
        var de_madsack_domain = (matchUrlDomain(de_madsack_custom_domains, details.url) && !matchUrlDomain(de_madsack_domains, header_referer) && enabledSites.includes('###_de_madsack'));
        if (de_madsack_domain)
          de_madsack_domains = customAddRules(de_madsack_domains, true, blockedRegexes['haz.de']);
      }
    } else if (header_referer_hostname.match(/\.(es|cat)$/) || matchUrlDomain(['diariocordoba.com', 'elperiodicodearagon.com', 'elperiodicoextremadura.com', 'elperiodicomediterraneo.com', 'emporda.info'], header_referer)) {
      // block Piano.io for unlisted Grupo Prensa Ibérica (opt-in to custom sites)
      var es_epiberica_domains = grouped_sites['###_es_epiberica'];
      var es_epiberica_custom_domains = ['diaridegirona.cat', 'diariocordoba.com', 'diariodeibiza.es', 'elperiodicodearagon.com', 'elperiodicoextremadura.com', 'elperiodicomediterraneo.com', 'emporda.info', 'laopinioncoruna.es', 'laopiniondemalaga.es', 'laopiniondemurcia.es', 'laopiniondezamora.es', 'regio7.cat'];
      var es_epiberica_domain = (matchUrlDomain(es_epiberica_custom_domains, details.url) && !matchUrlDomain(es_epiberica_domains, header_referer) && enabledSites.includes('###_es_epiberica'));
      if (es_epiberica_domain)
        es_epiberica_domains = customAddRules(es_epiberica_domains, true, blockedRegexes['epe.es']);
    } else if (header_referer_hostname.endsWith('.fi')) {
      // set user-agent to GoogleBot for additional Snamoma Media Finland (opt-in to custom sites)
      var fi_sanoma_domains = grouped_sites['###_fi_sanoma'];
      var fi_sanoma_sndp_domain = (matchUrlDomain('sanoma-sndp.fi', details.url) && ['xmlhttprequest'].includes(details.type) && !matchUrlDomain(fi_sanoma_domains, header_referer) && enabledSites.includes('###_fi_sanoma'));
      if (fi_sanoma_sndp_domain)
        fi_sanoma_domains = customAddRules(fi_sanoma_domains, true, '', 'googlebot');
    } else if (header_referer_hostname.endsWith('.nl')) {
      // block Evolok for Mediahuis Noord sites (opt-in to custom sites)
      var nl_mediahuis_noord_domains = [];
      var nl_mediahuis_noord_domain = (matchUrlDomain('ndcmediagroep.nl', details.url) && ['script'].includes(details.type) && !matchUrlDomain(nl_mediahuis_noord_domains, header_referer) && enabledSites.includes('###_nl_mediahuis_noord'));
      if (nl_mediahuis_noord_domain)
        nl_mediahuis_noord_domains = customAddRules(nl_mediahuis_noord_domains, true, blockedRegexes['lc.nl']);
    } else if (header_referer_hostname.match(/\.(ca|com|org)$/)) {
      // block TinyPass for Postmedia Network sites
      var ca_postmedia_domains = grouped_sites['###_ca_postmedia'];
      var ca_postmedia_domain = (matchUrlDomain('postmedia.digital', details.url) && ['script'].includes(details.type) && !matchUrlDomain(ca_postmedia_domains.concat(['canada.com', 'canoe.com', 'driving.ca']), header_referer) && enabledSites.includes('###_ca_postmedia'));
      if (ca_postmedia_domain)
        ca_postmedia_domains = customAddRules(ca_postmedia_domains, true, blockedRegexes['nationalpost.com']);
      else {
        // set googlebot-useragent for Gannett sites
        var usa_gannett_domains = grouped_sites['###_usa_gannett'];
        var usa_gannett_domain = (matchUrlDomain('gannett-cdn.com', details.url) && ['xmlhttprequest'].includes(details.type) && !matchUrlDomain(usa_gannett_domains.concat(['usatoday.com']), header_referer) && enabledSites.includes('###_usa_gannett'));
        if (usa_gannett_domain)
          usa_gannett_domains = customAddRules(usa_gannett_domains, '', blockedRegexes['azcentral.com'], 'googlebot', '', true);
        else {
          var usa_hearst_comm_domains = grouped_sites['###_usa_hearst_comm'];
          var usa_hearst_comm_domain = (matchUrlDomain('treg.hearstnp.com', details.url) && ['script'].includes(details.type) && !matchUrlDomain(usa_hearst_comm_domains, header_referer) && enabledSites.includes('###_usa_hearst_comm'));
          if (usa_hearst_comm_domain)
            usa_hearst_comm_domains = customAddRules(usa_hearst_comm_domains, '', blockedRegexes['houstonchronicle.com']);
          else {
            // block script for additional Lee Enterprises sites (opt-in to custom sites)
            var usa_lee_ent_domains = grouped_sites['###_usa_lee_ent'];
            var usa_lee_ent_domain = (details.url.match(/\.townnews\.com\/(central\.)?leetemplates\.com\//) && ['script'].includes(details.type) &&
              !matchUrlDomain(usa_lee_ent_domains, header_referer) && enabledSites.includes('###_usa_lee_ent'));
            if (usa_lee_ent_domain)
              usa_lee_ent_domains = customAddRules(usa_lee_ent_domains, '', blockedRegexes['buffalonews.com']);
            else {
              // block script for TownNews sites (Blox CMS; opt-in to custom sites)
              var usa_townnews_domains = [];
              var usa_townnews_domain = (details.url.match(/\.townnews\.com\/.+\/tncms\//) && ['script'].includes(details.type) &&
                !matchUrlDomain(usa_townnews_domains.concat(usa_lee_ent_domains, ['townnews.com', 'galvnews.com']), header_referer) && enabledSites.includes('###_usa_townnews'));
              if (usa_townnews_domain)
                usa_townnews_domains = customAddRules(usa_townnews_domains, '', /\.com\/shared-content\/art\/tncms\/user\/user\.js/);
              else {
                // block script for additional McClatchy sites (opt-in to custom sites)
                var usa_mcc_domains = grouped_sites['###_usa_mcc'];
                var usa_mcc_domain = (((matchUrlDomain('mcclatchyinteractive.com', details.url) && ['script'].includes(details.type)) ||
                    (matchUrlDomain('mcclatchy-wires.com', details.url) && ['image'].includes(details.type))) &&
                  !matchUrlDomain(usa_mcc_domains, header_referer) && enabledSites.includes('###_usa_mcc'));
                if (usa_mcc_domain)
                  usa_mcc_domains = customAddRules(usa_mcc_domains, '', blockedRegexes['bnd.com']);
                else {
                  // block script for additional MediaNews Group sites (opt-in to custom sites)
                  var usa_mng_domains = grouped_sites['###_usa_mng'];
                  var usa_mng_domain = (details.url.match(/\.com\/wp-content\/plugins\/dfm(-|_).+\.js/) && ['script'].includes(details.type) &&
                    !matchUrlDomain(usa_mng_domains, header_referer) && enabledSites.includes('###_usa_mng'));
                  if (usa_mng_domain)
                    usa_mng_domains = customAddRules(usa_mng_domains, '', blockedRegexes['denverpost.com']);
                }
              }
            }
          }
        }
      }
    }
  }

  } // not in excludedSites


}

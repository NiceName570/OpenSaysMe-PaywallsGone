// Auto-detect paywall settings for the current page (runs locally, nothing is sent anywhere).
// pageProbe() runs inside the page; buildRule() turns its findings into a custom-site rule.

function pageProbe() {
  var info = {paywallSel: '', articleSel: '', hasAmp: false, hasLdBody: false, vendors: [], scriptPaths: []};
  var cssId = function (v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : v; };

  // paywall container: first visible-ish element whose id/class says paywall
  var re = /(paywall|pay-wall|regwall|subscriber-only|subscription-wall|premium-wall|metered|gateway|leaky|barrier)/i;
  var cand = Array.from(document.querySelectorAll('[id],[class]')).filter(function (el) {
    var s = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
    return re.test(s) && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'HTML' && el.tagName !== 'BODY';
  });
  if (cand.length) {
    var el = cand[0];
    if (el.id)
      info.paywallSel = '#' + cssId(el.id);
    else {
      var m = (el.className || '').split(/\s+/).find(function (c) { return re.test(c); });
      info.paywallSel = el.tagName.toLowerCase() + (m ? '.' + cssId(m) : '');
    }
  }

  // article container
  var art = document.querySelector('[itemprop="articleBody"]') || document.querySelector('article') ||
            document.querySelector('[class*="article-body"],[class*="article__body"],[class*="story-body"]');
  if (art) {
    if (art.getAttribute('itemprop') === 'articleBody')
      info.articleSel = '[itemprop="articleBody"]';
    else if (art.tagName === 'ARTICLE')
      info.articleSel = 'article';
    else {
      var cl = (art.className || '').split(/\s+/).find(function (c) { return /article|story/.test(c); });
      info.articleSel = cl ? '.' + cssId(cl) : art.tagName.toLowerCase();
    }
  }

  info.hasAmp = !!document.querySelector('link[rel="amphtml"]');

  // articleBody present in ld+json?
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
    if (/"articleBody"\s*:/.test(s.textContent))
      info.hasLdBody = true;
  });

  // paywall scripts
  var vendorRe = /(piano\.io|tinypass|zephr|pelcro|poool|laterpay|evolok|wallkit|leaky|cxense|mather|swgjs|paywall|metering|regwall|subscribe)/i;
  document.querySelectorAll('script[src]').forEach(function (s) {
    var u;
    try { u = new URL(s.src, location.href); } catch (e) { return; }
    if (!vendorRe.test(u.href))
      return;
    if (u.hostname.replace(/^www\./, '') !== location.hostname.replace(/^www\./, ''))
      info.vendors.push(u.hostname);
    else
      info.scriptPaths.push(u.pathname);
  });
  return info;
}

function buildRule(info, domain) {
  var rule = {domain: domain};
  var found = [];

  if (info.hasAmp) {
    rule.amp_unhide = 1;
    found.push('AMP text');
    if (info.paywallSel)
      rule.amp_redirect = info.paywallSel;
  }
  if (info.hasLdBody && info.paywallSel && info.articleSel) {
    rule.ld_json = info.paywallSel + '|' + info.articleSel;
    found.push('article text in page data');
  }
  if (info.vendors.length) {
    rule.block_javascript_ext = 1;
    found.push('paywall scripts (' + Array.from(new Set(info.vendors)).slice(0, 2).join(', ') + ')');
  }
  if (info.scriptPaths.length) {
    var p = info.scriptPaths[0].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    rule.block_regex = '{domain}' + p;
    found.push('paywall script');
  }
  if (!found.length) {
    // nothing recognizable: Googlebot is the most common thing that works
    rule.useragent = 'googlebot';
    found.push('nothing specific, using Googlebot');
  }
  return {rule: rule, found: found};
}

function detectSiteRule(tabId, domain, callback) {
  var api = (typeof browser === 'object') ? browser : chrome;
  chrome.scripting.executeScript({target: {tabId}, func: pageProbe}).then(entries => {
    const results = entries.map(entry => entry.result);
    if (api.runtime.lastError || !results || !results[0]) {
      callback(buildRule({vendors: [], scriptPaths: []}, domain));
      return;
    }
    callback(buildRule(results[0], domain));
  }).catch(() => callback(buildRule({vendors: [], scriptPaths: []}, domain)));
}

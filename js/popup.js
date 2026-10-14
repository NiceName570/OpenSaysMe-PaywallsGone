
/** Increments a named usage counter in the background service worker. */
function recordStat(key) {
  chrome.runtime.sendMessage({ mode: 'stat', key: 'stat_' + key });
}

/**
 * Replaces __MSG_key__ placeholders in the page with localized strings, via a TreeWalker over
 * text nodes plus a walk of every element's attributes - never innerHTML, so this can't reparse
 * (and drop event listeners from) the whole document. Locale strings may themselves contain
 * inline markup/entities, so each substituted text node is rendered through
 * renderSafeTemplate()'s allowlisted DOMParser-based renderer rather than assigned as raw text.
 */
function localizeHtmlPage() {
  const replaceTokens = (str) => str.replace(/__MSG_(\w+)__/g, (match, key) => chrome.i18n.getMessage(key) || '');

  const textWalker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let textNode = textWalker.nextNode();
  while (textNode) {
    if (textNode.nodeValue.includes('__MSG_')) {
      textNodes.push(textNode);
    }
    textNode = textWalker.nextNode();
  }
  textNodes.forEach((node) => {
    node.replaceWith(renderSafeTemplate(replaceTokens(node.nodeValue), null));
  });

  const elementWalker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  let el = elementWalker.currentNode;
  while (el) {
    Array.from(el.attributes || []).forEach((attr) => {
      if (attr.value.includes('__MSG_')) {
        el.setAttribute(attr.name, replaceTokens(attr.value));
      }
    });
    el = elementWalker.nextNode();
  }
}

localizeHtmlPage();

// The footer links (Support, Settings, Hide Badge, See Example) are static markup in
// popup.html and must work even if the tab's content script never responds (e.g. its message
// listener was torn down by the OS suspending the tab across a system sleep) - so they're wired
// up unconditionally here, rather than only inside the tabs.sendMessage callback below.
addConfigurationListener();
addSupportListener();
addHideListener();
addSeeExampleListener();

// Query the active tab and render the popup based on oahelper state from the content script.
chrome.windows.getAll({
  populate: true,
}, (windows) => {
  // For all windows
  for (let i = 0; i < windows.length; i++) {
    const currentWindow = windows[i];
    // For all tabs in that window
    for (let j = 0; j < currentWindow.tabs.length; j++) {
      const currentTab = currentWindow.tabs[j];
      // Only send message to http or https pages, not ftp://, chrome:// etc.
      if (currentTab.active && currentTab.url.match(/(http|https):\/\//gi)) {
        chrome.tabs.sendMessage(currentTab.id, { mode: 'popup' }, (response) => {
          if(chrome.runtime.lastError != null || response == undefined) {
            // The content script on this tab didn't answer - most commonly because its message
            // listener was discarded by the OS suspending the tab (e.g. across a system sleep).
            // Reloading the page re-injects the content script and restores normal behavior.
            const element = document.getElementById('popupanswer');
            element.textContent = '';
            element.appendChild(renderSafeTemplate(chrome.i18n.getMessage('popup_connection_lost'), {}));
            recordStat('popup_opened');
            return;
          }
          console.log(response);
          const element = document.getElementById('popupanswer');
          let oabutton = null;
          let subbutton = null;
          let citationbutton = null;
          let proxybutton = null;
          let institute = '';
          let buttonCount = 0;
          let illButtonCount = 0;
          let retractionButton = null;
          if (response != undefined && response.data != undefined && response.data.oaurl != '' && response.data.oastatus != '') {
            let oaurl = '';
            if(Array.isArray(response.data.oaurl)){
              oaurl = response.data.oaurl[0];
            }
            else {
              oaurl = response.data.oaurl;
            }
            if(response.data.isAtOpenAccessLocation){
              oabutton = renderSafeTemplate(translateOAH(response, 'popup_oabutton_006'), { url: oaurl, buttonlabel: response.data.oastatus });
              buttonCount += 1;
            }
            else {
              oabutton = renderSafeTemplate(translateOAH(response, 'popup_oabutton_002'), { url: oaurl, buttonlabel: response.data.oastatus });
              buttonCount += 1;
            }
          }

          if (response != undefined && response.data != undefined && response.data.substatus != '' && response.data.suburl != '') {
            subbutton = renderSafeTemplate(translateOAH(response, 'popup_oabutton_007'), { url: response.data.suburl, buttonlabel: 'EBSCOhost' });
            buttonCount += 1;
          }

          if (response != undefined && response.data != undefined && response.data.citationcount > 0) {
            citationbutton = renderSafeTemplate(translateOAH(response, 'popup_citationbutton_001'), { url: response.data.citationurl, citationcount: response.data.citationcount.toString() });
            buttonCount += 1;
          }

          if(response != undefined && response.data != undefined && response.data.rw_label != undefined && response.data.rw_label != ''){
            retractionButton = renderSafeTemplate(translateOAH(response, 'popup_oabutton_008'), { url: response.data.rw_url, buttonlabel: response.data.rw_label });
            buttonCount += 1;
          }

          if (response != undefined && response.configuration != undefined && response.configuration.name != undefined && response.configuration.name != '') {
            institute = response.configuration.name;
          }

          if (response != undefined && response.configuration != undefined && response.configuration.ezproxy && response.configuration.url != '' && !onProxiedDomain(response.configuration.url, response.data.currenturl) && response.data.shouldProxy) {
            const newUrl = new URL(response.data.currenturl);
            let urltoproxy = newUrl.hostname;
            if (urltoproxy.length > 25) {
              urltoproxy = `${urltoproxy.substring(0, 25)}&hellip;`;
            }
            let proxyUrl = response.configuration.url + response.data.currenturl;
            if (response.configuration.url.includes("go.openathens.net") || response.configuration.url.includes("qurl=")) {
              proxyUrl = response.configuration.url + encodeURIComponent(response.data.currenturl);
            }
            proxybutton = renderSafeTemplate(translateOAH(response, 'popup_proxybutton_001a'), { url: proxyUrl, institute, urltoproxy });
            buttonCount += 1;
          }

          let addonButton = null;
          if(response != undefined && response.configuration != undefined && response.configuration.ill && response.data.doi != '' && response.data.doi != '-' && illButtonCount == 0){
            let illUrl = response.configuration.illurl + response.data.doi;
            let illLabel = translateOAH(response, 'content_ill_002');

            if(buttonCount < 3){
              //we will simply add a new button
              addonButton = renderSafeTemplate(translateOAH(response, 'popup_oabutton_005'), { url: illUrl, buttonlabel: illLabel });
            }
            else{
              addonButton = renderSafeTemplate(translateOAH(response, 'popup_oabutton_004'), { url: illUrl, buttonlabel: illLabel });
            }
          }

          const buttonFragments = [retractionButton, oabutton, subbutton, citationbutton, proxybutton, addonButton].filter(Boolean);
          const hasButtons = buttonFragments.length > 0;

          let resultFragment;
          if (!hasButtons && response != undefined && response.configuration != undefined && onProxiedDomain(response.configuration.url, response.data.currenturl)) {
            resultFragment = renderSafeTemplate(translateOAH(response, 'popup_empty_responses_proxied'), {});
          }
          else if (response.data.disabledOnDomain) {
            resultFragment = renderSafeTemplate(translateOAH(response, 'popup_disabled_on_domain'), {});
          }
          else if(!hasButtons) {
            resultFragment = renderSafeTemplate(translateOAH(response, 'popup_empty_responses'), {});
          }
          else {
            resultFragment = document.createDocumentFragment();
            buttonFragments.forEach((frag) => resultFragment.appendChild(frag));
          }
          element.textContent = '';
          element.appendChild(resultFragment);
          recordStat('popup_opened');
          addButtonListener();
          addConfigurationListener();
          addSupportListener();
          addHideListener();
          addSeeExampleListener();
        });
      } else {
        const element = document.getElementById('popupanswer');
        //html = chrome.i18n.getMessage('popup_non_http_source');
        element.textContent = '';
        element.appendChild(renderSafeTemplate(translateOAH(null, 'popup_empty_responses'), {}));
        addConfigurationListener();
        addSupportListener();
        addHideListener();
        addSeeExampleListener();
      }
    }
  }
});

/**
 * Checks whether currentUrl is being served through the institution's proxy.
 * Strips the first subdomain from the proxy URL (e.g. login.proxy.uni.edu → proxy.uni.edu)
 * before testing, since EZProxy rewrites hostnames as domain-tld.proxy.uni.edu.
 * @param {string} proxyUrl - The institution's proxy base URL.
 * @param {string} currentUrl - The active tab's URL.
 * @returns {boolean} True if the current URL routes through the proxy.
 */
function onProxiedDomain(proxyUrl, currentUrl){
  //we take apart the proxy url and remove the first part of it,
  //as it could be something like login.proxy.uni.edu
  //the finaly proxied url then only contains domain-tld.proxy.uni.edu
  if (proxyUrl == '') {
    return false;
  }
  const ezproxyUrl = new URL(proxyUrl);
  const urlParts = ezproxyUrl.hostname.split('.');
  urlParts.splice(0,1);
  const testUrl = urlParts.join('.');
  if(currentUrl.indexOf(testUrl) >= 0){
    return true;
  }
  return false;
}

/** Maps popup button IDs to their corresponding telemetry stat keys. */
const POPUP_BUTTON_STATS = {
  'oabutton': 'popup_oa_clicked',
  'oabuttonrequest': 'popup_ill_clicked',
  'oabuttonrequestlink': 'popup_ill_clicked',
  'ebscobutton': 'popup_ebsco_clicked',
  'citationbutton': 'popup_citation_clicked',
  'ezproxybutton': 'popup_proxy_clicked',
  'rwbutton': 'popup_rw_clicked',
};

/** Attaches click handlers to popup action buttons, opening each data-url in a new tab. */
function addButtonListener() {
  const links = document.getElementsByTagName('button');
  for (var i = 0; i < links.length; i++) {
    (function () {
      const ln = links[i];
      const location = ln.dataset.url;
      const id = ln.getAttribute('id');
      ln.onclick = function () {
        const statKey = POPUP_BUTTON_STATS[id];
        if (statKey) recordStat(statKey);
        chrome.tabs.create({ active: true, url: location });
      };
    }());
  }
}

/** Opens the options page when the configuration link or settings icon is clicked. */
function addConfigurationListener() {
  const configLink = document.getElementById('configurationlink');
  configLink.onclick = function () {
    chrome.tabs.create({ active: true, url: chrome.runtime.getURL('html/options.html') });
  };

  const configIcon = document.getElementById('oah_settings_icon');
  configIcon.onclick = function () {
    chrome.tabs.create({ active: true, url: chrome.runtime.getURL('html/options.html') });
  };
}

/** Opens the support page in a new tab when the support link is clicked. */
function addSupportListener() {
  const configLink = document.getElementById('supportlink');
  configLink.onclick = function () {
    chrome.tabs.create({ active: true, url: 'https://www.oahelper.org/support/' });
  };
}

/** Sends a hidebadges message to the active tab and hides the hide-badge UI element. */
function addHideListener() {
  const configLink = document.getElementById('hidebadges');
  configLink.onclick = function () {
    document.getElementById('hidebadgespan').style.display = 'none';
    chrome.windows.getAll({ populate: true }, (windows) => {
      // For all windows
      for (let i = 0; i < windows.length; i++) {
        const currentWindow = windows[i];
        // For all tabs in that window
        for (let j = 0; j < currentWindow.tabs.length; j++) {
          const currentTab = currentWindow.tabs[j];
          if (currentTab.active && currentTab.url.match(/(http|https):\/\//gi)) {
            chrome.tabs.sendMessage(currentTab.id, { mode: 'hidebadges' }, () => {
              if (chrome.runtime.lastError) {
                const element = document.getElementById('popupanswer');
                element.replaceChildren(renderSafeTemplate(chrome.i18n.getMessage('popup_connection_lost'), {}));
              }
            });
          }
        }
      }
    });
  };
}

/** Opens the example page in a new tab when the example link is clicked. */
function addSeeExampleListener() {
  const configLink = document.getElementById('seeexample');
  if (configLink == null) {
    return;
  }
  configLink.onclick = function () {
    chrome.tabs.create({ active: true, url: 'https://www.oahelper.org/example/' });
  };
}

/**
 * Returns a localized string, checking institute-specific translation overrides before
 * falling back to the standard chrome.i18n message catalogue.
 * @param {object|null} response - Popup response object containing configuration.
 * @param {string} key - The i18n message key.
 * @param {string[]|null} variableArray - Optional substitution values for $1$, $2$, etc.
 * @returns {string} The localized string.
 */
function translateOAH(response, key, variableArray = null) {
  const language = chrome.i18n.getUILanguage().substring(0,2);
  if(response != null
    && response['configuration'] != undefined
    && response['configuration']['translations'] != undefined
    && response['configuration']['translations'][key] != undefined
    && response['configuration']['translations'][key][language] != undefined)
  {
      let textToReturn = response['configuration']['translations'][key][language];
      if (variableArray != null && variableArray.length > 0) {
        for (let i=0; i<variableArray.length; i++) {
          textToReturn = textToReturn.replace(`$${i+1}$`, variableArray[i]);
        }
      }
      return textToReturn.replace(/Open Access Helper(?: Web)?/g, 'OpenSaysMe');
  }
  else {
    return chrome.i18n.getMessage(key, variableArray);
  }

}

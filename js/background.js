/** *******************
* Page Initialization - initialized for all supported sites upon load
******************** */
const EXTENSION_VERSION = "2026.8";
const EXTENSION_BROWSER = "edge";
const TELEMETRY_API_URL = "https://nom.telemetrydeck.com/v1/";
const TELEMETRY_APP_ID = "412A1913-639F-4A6C-B209-D7063C3EF1E3";
const TELEMETRY_TEST_MODE = "false";
const UNPAYWALL_API_URL = "https://api.unpaywall.org/v2/";
const OAHELPER_API_KEY = "l6sNUJ3Knh";
const OAHELPER_API_URL = "https://www.oahelper.org/backend/institutes/api.php";
const EBSCO_BASIC_AUTHORIZATION = "QkZIVFg1MkxFSzllcGhzUnpzaHZ0UUZoMkNQQXR1aG86Zzk0X3JJN0hNRlNHSXYxZU8yd0JvS25ybzd0VmFOd2pmTDZEeE5adU5pU3Z0WDhJX1lOcVpXZjZrd1p3bjhOQw";
const UNINSTALL_URL = "https://www.oahelper.org/sorry-to-see-you-leave/";
const EXTENSION_EMAIL = "info@oahelper.org";
const EBSCO_TOKEN_URL = "https://apis.ebsco.com/oauth-proxy/token";
const EBSCO_API_URL = "https://apis.ebsco.com/ehostentitlements/v3/";
const OPENCITATIONS_API_URL = "https://opencitations.net/index/api/v1/citation-count/";
const RETRACTIONWATCH_API_URL = "https://www.oahelper.org/rw/rw.php";
const RETRACTIONWATCH_KEY = "qd8pUUgvqH3K";
const OPENALEXCITATIONS_API_URL = "https://www.oahelper.org/oac/?doi=";
const OPENALEXCITATIONS_API_KEY = "l6sNUJ3Knh";

let configuration = {};
let orangeIcon = false;
let greenIcon = false;
let ebscoIcon = false;
let warningIcon = false;
let contextMenuCreated = false;
let disabledOnDomain = false;


createContextMenu();
chrome.contextMenus.onClicked.addListener(getword);

// Initialize the extension on the specified tab
const initializeTab = function (tab, startUpRetroactiveLoad) {
  if (!tab?.id || !/^https?:/.test(tab.url || '')) return;
  orangeIcon = false;
  greenIcon = false;
  warningIcon = false;
  ebscoIcon = false;
  disabledOnDomain = false;
  setDefaultIcon();
  if(EXTENSION_BROWSER != 'firefox') {
    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["css/content.css"]
    })
    .then(() => {
      //console.log("INJECTED THE FOREGROUND STYLES.");
    })
    .catch(err => console.log(err));
  }
  else {
    browser.tabs.insertCSS(tab.id, {file: "css/content.css"});
  }
};


/** *******************
* Initialization Helpers
******************** */

// Called every time a tab is updated
const onTabUpdate = function (tabId, info, tab) {
  if (info.status == 'loading') {
    initializeTab(tab, false);
  }
};

// Called every time a tab is replaced
const onTabReplace = function (addedTabId, replacedTabId) {
  chrome.tabs.get(addedTabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    initializeTab(tab, false);
  });
};

const onTabActivate = function (tab) {
  chrome.tabs.get(tab.tabId, (tabObject) => {
    if (chrome.runtime.lastError) return; // The tab can close during activation.
    if (tabObject && /^https?:/.test(tabObject.url || '')) {
      chrome.tabs.sendMessage(tab.tabId, { mode: 'getBadge' }, (response) => {
        // Existing tabs and browser-store pages may have no content listener.
        // Consume the expected API error before resetting the toolbar state.
        const messageError = chrome.runtime.lastError;
        orangeIcon = false;
        greenIcon = false;
        warningIcon = false;
        ebscoIcon = false;
        disabledOnDomain = false;
        if (messageError || !response?.badge) {
          setDefaultIcon();
        } else if (response.badge == 'orange') {
          setOrangeIcon();
        } else if (response.badge == 'blue') {
          setBlueIcon();
        } else if (response.badge == 'purple') {
          setPurpleIcon();
        } else if (response.badge == 'ebsco') {
          setEBSCOicon();
        } else if (response.badge == 'warning') {
          setWarningIcon();
        } else if (response.badge == 'disabled') {
          setDisabledIcon();
        } else if (response.badge == 'black') {
          setDefaultIcon();
        } else {
          setGreenIcon();
        }
      });
    }
  });
};

// Listen to all tab events to recognize user navigation to a supported website
const addTabListeners = function () {
  if (!chrome.tabs.onUpdated.hasListener(onTabUpdate)) {
    chrome.tabs.onUpdated.addListener(onTabUpdate);
  }
  if (!chrome.tabs.onReplaced.hasListener(onTabReplace)) {
    chrome.tabs.onReplaced.addListener(onTabReplace);
  }
  if (!chrome.tabs.onActivated.hasListener(onTabActivate)) {
    chrome.tabs.onActivated.addListener(onTabActivate);
  }
};


// Retroactively initialize all existing tabs (e.g. when extension is first installed)
const retroactivelyInitExistingTabs = function () {
  chrome.windows.getAll({
    populate: true,
  }, (windows) => {
    // For all windows
    for (let i = 0; i < windows.length; i++) {
      const currentWindow = windows[i];

      // For all tabs in that window
      for (let j = 0; j < currentWindow.tabs.length; j++) {
        const currentTab = currentWindow.tabs[j];

        // Only initialize http or https pages, not ftp://, chrome:// etc.
        if (currentTab.url.match(/(http|https):\/\//gi)) {
        initializeTab(currentTab, true);
      }
    }
  }
});
};


/** *******************
*  Initialization
******************** */

// Initialize the background script
const initializeBackgroundScript = function () {
  // Load extension to all future tabs
  addTabListeners();
  // Load extension to all existing tabs
  retroactivelyInitExistingTabs();
};

initializeBackgroundScript();

/** *******************
* set on install options page && uninstall survey
******************** */

// On browser startup, clear any cached EBSCO OAuth token that has already expired, so a
// stale token can't survive past an EBSCO-side quota/token reset while the browser was closed.
// (getEBSCOToken() already checks expiry lazily before reuse; this just keeps storage tidy
// and guarantees a fresh token fetch on the first call of a new browser session.)
chrome.runtime.onStartup.addListener(() => {
  oaStorage.local.get(['ebsco_token', 'ebsco_token_expires_at'], (items) => {
    if (items.ebsco_token != undefined
      && items.ebsco_token_expires_at != undefined
      && items.ebsco_token_expires_at <= Math.floor(Date.now() / 1000)) {
      oaStorage.local.remove(['ebsco_token', 'ebsco_token_expires_at']);
    }
  });
});

/** *******************
* Listening to messages and take appropriate action
******************** */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let mode = '';
  switch (request.mode) {
    case 'followUrl':
      mode = 'followUrlResponse';
      followUrl(request.targetUrl, request.currentUrl).then((response) => {
        if (response) {
          setGreenIcon();
        }
        sendResponse({ mode, ona: response });
      });
      return true;
    case 'unpaywall':
      mode = 'unpaywallResponse';
      unpaywallCall(request.cleanedDOI).then((response) => {
        if (response.is_oa === true && response.best_oa_location != null) {
          response.best_oa_location.source = 'Unpaywall.org';
          response.best_oa_location.title = 'Open Access Version found from unpaywall.org';
          setOrangeIcon();
        } else {
          setDefaultIcon();
        }
        sendResponse({ mode, data: response });
      });
      return true;
    case 'ebsco':
      mode = 'ebscoResponse';
      ebscoEntitlementCall(request.ebsco_cgp, request.cleanedDOI).then((response) => {
        sendResponse({ mode, data: response });
      });
      return true;
    case 'citationcount':
      mode = 'citationcountResponse';
      openCitationsCounts(request.cleanedDOI).then((response) => {
        let citationCount = 0;
        if (response[0] !== undefined && response[0].count !== undefined && response[0].count > 0) {
          citationCount = response[0].count;
          setPurpleIcon();
        }
        sendResponse({ mode, citationCount });
      });
      return true;
    case 'openalexcitation':
      mode = 'openalexcitationResponse';
      openAlexCitationsCount(request.cleanedDOI).then((response) => {
        let citationCount = 0;
        if (response !== undefined && response.cited_by_count !== undefined && response.cited_by_count > 0) {
          citationCount = response.cited_by_count;
          setPurpleIcon();
        }
        sendResponse({ mode, citationCount });
      });
      return true;
    case 'retractionwatch':
      mode = 'retractionwatchResponse';
      retractionWatchCall(request.cleanedDOI).then((response) => {
        if(response != undefined && response.is_retracted === true) {
          setWarningIcon();
        }
        sendResponse({ mode, data: response });
      });
      return true;
    case 'getoptions':
      setDefaultIcon();
      oaStorage.local.get({ebscouc: false, ebsco_cgp: 'unset', ezproxy: false, opencitation: false,
        openalexcitation: false, retractionwatch: false, nobadge: false, disabledOn: []}).then(async defaults => {
        const options = {...defaults, ...await oaStorage.local.get(null)};
        configuration = options;
        sendResponse({ mode: 'options', options });
      });
      return true;
    case 'setBlueIcon':
      setBlueIcon();
      sendResponse({ mode: 'blueSet' });
      return true;
    case 'setDisabledIcon':
      setDisabledIcon();
      sendResponse({ mode: 'disabledSet' });
      return true;
    case 'getProxyDomains':
      if(request.id != undefined && request.domainurl != undefined) {
        doGetProxyDomains(request.id, request.domainurl);
        sendResponse({ mode: 'proxydomainsdone'});
      }
      return true;
    case 'openTab':
      if(request.url != undefined && request.url != '') {
        chrome.tabs.create({ url: request.url });
      }
      return true;
    case 'openEBSCO':
      if(request.url != undefined && request.url != '') {
        chrome.tabs.create({ url: request.url });
      }
      return true;
    case 'stat':
      if (request.key != undefined) {
        incrementCounter(request.key);
      }
      return true;
    case 'optionsUpdated':
      oaStorage.local.get(['ebscouc', 'ezproxy', 'url', 'search', 'opencitation', 'openalexcitation', 'retractionwatch', 'nobadge', 'ill', 'illurl', 'name', 'id', 'consolelog', 'domainurl', 'lastload', 'supportedDomains', 'discovery', 'uuid', 'lastLog', 'ebsco_token', 'ebsco_token_expires_at', 'ebsco_cgp', 'translations'], (items) => {
        configuration = items;
        createContextMenu();
        sendResponse({ mode: 'optionsUpdateReceived'});
      });
      return true;
    case 'saveSettingsFromWeb':
      if (!isTrustedOAHelperSender(sender)) {
        sendResponse({ mode: 'saveSettingsFromWebResponse' });
        return true;
      }
      oaStorage.local.get(['uuid'], (items) => {
        reloadSettings(request.id, items.uuid);
      });
      sendResponse({ mode: 'saveSettingsFromWebResponse' });
      return true;
    case 'setOrangeIcon':
      setOrangeIcon();
      return true;
    case 'setGreenIcon':
      setGreenIcon();
      return true;
    case 'setEBSCOicon':
      setEBSCOicon();
      return true;
    default:
      return false;
  }
});


/** *******************
* Monitor storage and reload the extension
******************** */

oaStorage.onChanged.addListener((changes, namespace) => {
  // console.log('local storage has changed');
  oaStorage.local.get(['ebscouc', 'ezproxy', 'url', 'search', 'opencitation', 'openalexcitation', 'retractionwatch', 'nobadge', 'ill', 'illurl', 'name', 'id', 'consolelog', 'domainurl', 'lastload', 'supportedDomains', 'discovery', 'uuid', 'ebsco_token', 'ebsco_token_expires_at', 'ebsco_cgp', 'translations', 'disabledOn'], (items) => {
    configuration = items;
    createContextMenu();
  });
});


/** *******************
* Context Menu Support
******************** */

const CONTEXT_MENU_ID = 'oahelper_context';


function getword(info, tab) {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }
  oaStorage.local.get(['ezproxy', 'url', 'search'], (items) => {
    let searchTermToUse = encodeURIComponent(info.selectionText);
    if (items.search == 'google') {
      chrome.tabs.create({
        url: `https://scholar.google.com/scholar?q=${searchTermToUse}`,
      });
    } else if (items.search == 'microsoft') {
      chrome.tabs.create({
        url: `https://academic.microsoft.com/search?q=${searchTermToUse}`,
      });
    } else if (items.search == 'core') {
      chrome.tabs.create({
        url: `https://core.ac.uk/search?q=${encodeURIComponent(searchTermToUse)}`,
      });
    }
    else if (items.search == 'base') {
      chrome.tabs.create({
        url: `https://www.base-search.net/Search/Results?lookfor=${searchTermToUse}&name=&oaboost=1&newsearch=1&refid=dcbasen`,
      });
    }
    else if (items.search == 'dimensions') {
      chrome.tabs.create({
        url: `https://app.dimensions.ai/discover/publication?search_mode=content&search_text=${searchTermToUse}&search_type=kws&search_field=full_search`,
      });
    }
    else if (items.search == 'openalex') {
      chrome.tabs.create({
        url: `https://openalex.org/works?page=1&filter=title_and_abstract.search%3A${searchTermToUse}`,
      });
    }
    else if (items.search == 'semantic') {
      chrome.tabs.create({
        url: `https://www.semanticscholar.org/search?q=${searchTermToUse}&sort=relevance`,
      });
    }
    else if (items.search == 'institute'){
      if(configuration.discovery != undefined && configuration.discovery != ""){
        let myurl = configuration.discovery.replace('{searchTerm}', searchTermToUse);
        chrome.tabs.create({
          url: myurl,
        });
      }
      else{
        chrome.tabs.create({
          url: `https://scholar.google.com/scholar?q=${searchTermToUse}`,
        });
      }
    }
  });
}


function createContextMenu() {
  oaStorage.local.get(['ebscouc', 'ezproxy', 'url', 'search', 'opencitation', 'openalexcitation', 'retractionwatch', 'nobadge', 'ezproxy', 'url', 'ill', 'illurl', 'name', 'id', 'consolelog', 'domainurl', 'lastload', 'supportedDomains', 'discovery', 'uuid', 'lastLog', 'issetup', 'ebsco_token', 'ebsco_token_expires_at', 'ebsco_cgp' ,'translations', 'disabledOn'], (items) => {
    configuration = items;
    let searchLabel = chrome.i18n.getMessage('context_search_label');
    let instituteSearchLabel = chrome.i18n.getMessage('context_titute_search_label');
    if (items.domainurl != undefined) {
      doSync(items.id, items.lastload, items.uuid);
    }
    if(items.issetup){
      doTelemetry(items.id, items.lastLog, items.uuid);
    }

    if (items.search == 'none'){
      return;
    }
    let contextMenuTitle = '';
    switch(items.search) {
      case 'google':
      contextMenuTitle = `${searchLabel} Google Scholar: "%s"`;
      break;
      case 'core':
      contextMenuTitle = `${searchLabel} core.ac.uk: "%s"`;
      break;
      case 'base':
      contextMenuTitle = `${searchLabel} base-search.net: "%s"`;
      break;
      case 'dimensions':
      contextMenuTitle = `${searchLabel} dimensions.ai: "%s"`;
      break;
      case 'openalex':
      contextMenuTitle = `${searchLabel} openalex.org: "%s"`;
      break;
      case 'semantic':
      contextMenuTitle = `${searchLabel} semanticscholar.org: "%s"`;
      break;
      case 'institute':
      contextMenuTitle = `${instituteSearchLabel}: "%s"`;
      break;
      default:
      contextMenuTitle = `${searchLabel} Google Scholar: "%s"`;
      break;
    }

    // needs to be implementeditems.search == 'institute' && items.discovery != undefined && items.discovery != ''
    try {
      if(!contextMenuCreated){
        chrome.contextMenus.create({
          title: contextMenuTitle,
          contexts: ['selection'],
          id: CONTEXT_MENU_ID,
        }, () => chrome.runtime.lastError);
      }
      else {
        // console.log('updating context menu');
        chrome.contextMenus.update(CONTEXT_MENU_ID,
          {
            title: contextMenuTitle,
            contexts: ['selection'],
          }
          );
        }

        contextMenuCreated = true;
      }
      catch(err){

      }

    });
  }

  function setUUID(){
    let uuid = uuidv4();
    oaStorage.local.set({
      uuid
    }, () => {
      //
    });
    return uuid;
  }

  function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  async function sha256(message) {
    // encode as UTF-8
    const msgBuffer = new TextEncoder().encode(message);

    // hash the message
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

    // convert ArrayBuffer to Array
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // convert bytes to hex string
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  function setLastLog(lastLog){
    oaStorage.local.set({
      lastLog
    }, () => {
      //
    });
  }

  /** All storage keys used as weekly usage counters. Flushed to zero after each successful telemetry send. */
  const STAT_KEYS = [
    'stat_badge_oa_shown', 'stat_badge_ebsco_shown', 'stat_badge_ill_shown',
    'stat_badge_citation_shown', 'stat_badge_rw_shown',
    'stat_badge_oa_clicked', 'stat_badge_ebsco_clicked', 'stat_badge_ill_clicked',
    'stat_badge_citation_clicked', 'stat_badge_rw_clicked',
    'stat_popup_opened',
    'stat_popup_oa_clicked', 'stat_popup_ebsco_clicked', 'stat_popup_ill_clicked',
    'stat_popup_citation_clicked', 'stat_popup_proxy_clicked', 'stat_popup_rw_clicked',
  ];

  /**
   * Increments a named usage counter in oaStorage.local by 1.
   * @param {string} key - A key from STAT_KEYS.
   */
  function incrementCounter(key) {
    oaStorage.local.get([key], (items) => {
      oaStorage.local.set({ [key]: (items[key] ?? 0) + 1 });
    });
  }

  /** *******************
  * fundamental extension functionality
  ******************** */

  async function followUrl(targetUrl, currentUrl) {
    const turl = new URL(targetUrl);
    const domain0 = turl.host;
    const cUrl1 = new URL(currentUrl);
    const domain1 = cUrl1.host;

    if (domain0 === domain1) {
      return true;
    }

    const response = await fetch(targetUrl);
    const finalUrlString = response.url;
    let myFinalUrl = finalUrlString.replace('https://', '');
    myFinalUrl = myFinalUrl.replace('http://', '');
    let myCurrent = currentUrl.replace('https://', '');
    myCurrent = myCurrent.replace('http://', '');


    const next1 = new URL(finalUrlString);

    const domain2 = next1.host;

    if (myFinalUrl === myCurrent) {
      return true;
    }
    if (domain1 === domain2) {
      return true;
    }
    if (domain1 === 'www.sciencedirect.com' && domain2 === 'linkinghub.elsevier.com') {
      return true;
    }
    if (domain1 === 'psycnet.apa.org' && domain2 === 'doi.apa.org') {
      return true;
    }
    if (currentUrl.indexOf('www.ncbi.nlm.nih.gov/pmc/') > -1) {
      return true;
    }

    return false;
  }

  async function unpaywallCall(cleanedDOI) {
    const url = `${UNPAYWALL_API_URL}${cleanedDOI}?email=${EXTENSION_EMAIL}`;
    try {
      const response = await fetch(url);
      if(response.ok){
        return response.json();
      }
      else{
        return [];
      }
    } catch (err) {
      return [];
    }
  }


  async function ebscoEntitlementCall(ebsco_cgp, cleanedDOI) {
    return new Promise(resolve => {
      getEBSCOToken().then(async response => {
        makeEBSCOEntitlementCall(ebsco_cgp, cleanedDOI, response.access_token).then(async response => {
          resolve(response);
        }).catch(error => {
          resolve({error : 'entitelmentCall'});
        });
      })
      .catch(error => {
        resolve({error : 'token'});
      })
    });
  }

  async function getEBSCOToken() {
    if(configuration.ebsco_token != undefined
      && configuration.ebsco_token_expires_at != undefined
      && configuration.ebsco_token_expires_at > Math.floor(Date.now()/1000))
      {
      //console.log('old token');
      return {
        access_token: configuration.ebsco_token
      }
    }

    const ebscoTokenUrl = EBSCO_TOKEN_URL;
    const body = new URLSearchParams();
    body.append('grant_type', 'client_credentials');

    const response = await fetch(ebscoTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${EBSCO_BASIC_AUTHORIZATION}`
      },
      body
    });
    const responseBody = await response.json();
    configuration.ebsco_token = responseBody.access_token
    configuration.ebsco_token_expires_at = Math.floor(Date.now()/1000) + responseBody.expires_in - 60;
    setEBSCOToken(responseBody.access_token, responseBody.expires_in);
    return responseBody;
  }

  async function setEBSCOToken(token, expiry) {
    const tokenExpiry = Math.floor(Date.now()/1000) + expiry - 60;
    oaStorage.local.set({ ebsco_token: token, ebsco_token_expires_at: tokenExpiry }).then(() => {
      // do nothing
    });
  }

  async function makeEBSCOEntitlementCall(ebsco_cgp, doi, token) {
    const entitlementUrl = `${EBSCO_API_URL}${ebsco_cgp}/discovery?doi=${doi}&svc_id=ehostFT`;
    const response = await fetch(entitlementUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'www.oahelper.org'
      }
    });
    // The v3 Entitlements API responds with 200 JSON containing a link property directly -
    // it doesn't redirect (confirmed against a live call). No need to special-case 3xx.
    const responseBody = await response.json();
    return responseBody;
  }

  async function openCitationsCounts(cleanedDOI) {
    if(cleanedDOI == undefined) {
      return [];
    }
    const url = `${OPENCITATIONS_API_URL}${cleanedDOI}`;
    try {
      const response = await fetch(url);
      if(response.ok && response.status == 200){
        return response.json();
      }
      else{
        return [];
      }
    } catch (err) {
      return [];
    }
  }

  async function openAlexCitationsCount(cleanedDOI) {
    if(cleanedDOI == undefined) {
      return [];
    }
    const url = `${OPENALEXCITATIONS_API_URL}${cleanedDOI}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Token': OPENALEXCITATIONS_API_KEY
        }
      });
      if(response.ok && response.status == 200){
        return response.json();
      }
      else{
        return [];
      }
    } catch (err) {
      return [];
    }
  }

  async function retractionWatchCall(cleanedDOI) {
    if(cleanedDOI == undefined) {
      return {
        'is_retracted' : false,
        'code' : 400,
        'doi' : '',
        'label' : '',
        'url' : '',
        'urls' : [],
        'reasons' : []
      };
    }

    const headers = new Headers();
    headers.append('x-oahelper', RETRACTIONWATCH_KEY);

    const formdata = new FormData();
    formdata.append('doi', cleanedDOI);

    const requestOptions = {
      method: 'POST',
      headers: headers,
      body: formdata,
      redirect: 'follow'
    };

    const response = await fetch(RETRACTIONWATCH_API_URL, requestOptions);
    // api only responds with 200 if it found a retraction
    if (response.status === 200) {
      const responseData = await response.json();
      const urls = responseData[0].url ?? [];
      return {
        'is_retracted' : true,
        'code' : 200,
        'doi' : responseData[0].OriginalPaperDOI,
        'label' : responseData[0].RetractionNature,
        'url' : urls[0] ?? '',
        'urls' : urls,
        'reasons' : responseData[0].reason ?? []
      };
    }
    // either not found or some other error
    return {
      'is_retracted' : false,
      'code' : response.status,
      'doi' : cleanedDOI,
      'label' : '',
      'url' : '',
      'urls' : [],
      'reasons' : []
    };
  }

  /**
   * Checks whether the weekly institute settings sync is due and triggers it if so.
   * @param {string} id - The institute ID stored in local storage.
   * @param {number} lastload - Unix timestamp (seconds) of the last successful settings load.
   * @param {string} [uuid] - The user's UUID; hashed before being sent to the API.
   */
  function doSync(id, lastload, uuid){
    //console.log(`doSync called ${Date.now()}`);
    if (!id) return;
    // get timestamp 7 days ago
    let checkTimeStamp = Math.floor(Date.now() / 1000) - (7*24*60*60);
    // if last load is greater 7 days ago, we will reload settings
    if (lastload < checkTimeStamp) {
      reloadSettings(id, uuid);
    }
    else{
      // console.log('doSync doesn\'t need to run');
    }
  }

  /**
   * True only on Firefox builds/versions that implement the data_collection permission type
   * (Firefox 139+ desktop / 141+ Android). Uses browser.permissions rather than chrome.permissions
   * deliberately: this feature is Firefox-exclusive, and browser.* is Firefox's native
   * promise-based namespace, whereas chrome.* there is just a Chrome-compatibility shim not
   * guaranteed to support the promise-calling-convention for every API (the rest of this file
   * avoids relying on that too - see the manual Promise wrap around oaStorage.local.get in
   * doTelemetry() below). Chrome/Edge/Safari have no `browser` global at all, so this is
   * unreachable there and hasTelemetryConsent() falls back to the pre-existing
   * unconditional-send behavior on every browser/version that lacks the framework.
   */
  async function firefoxDataCollectionSupported() {
    if (typeof browser === 'undefined' || typeof browser.permissions === 'undefined') {
      return false;
    }
    try {
      const current = await browser.permissions.getAll();
      return current != undefined && 'data_collection' in current;
    } catch (err) {
      return false;
    }
  }

  /**
   * Whether the weekly telemetry ping is allowed to send. On browsers/versions without the
   * data-collection consent framework, defaults to true (unchanged legacy behavior). Where the
   * framework IS available, defaults to false until the user opts in via the checkbox in
   * options1.html, since data_collection_permissions.optional entries are never auto-granted.
   */
  async function hasTelemetryConsent() {
    if (!(await firefoxDataCollectionSupported())) {
      return true;
    }
    try {
      return await browser.permissions.contains({ data_collection: ['technicalAndInteraction'] });
    } catch (err) {
      return false;
    }
  }

  async function doTelemetry(id, lastLog, uuid){
    return; // Do not report a local fork as the upstream application.

    if (uuid == undefined){
      uuid = setUUID();
      return;
    }
    if (!(await hasTelemetryConsent())) {
      return;
    }
    let uuidHash = await sha256(uuid);
    // get timestamp 7 days ago
    let checkTimeStamp = Math.floor(Date.now() / 1000) - (7*24*60*60);
    let now = Math.floor(Date.now() / 1000);
    // if last load is greater 7 days ago, we will reload settings
    if (lastLog == undefined || lastLog < checkTimeStamp) {
      const statItems = await new Promise(resolve => oaStorage.local.get(STAT_KEYS, resolve));
      const statPayload = STAT_KEYS.map(k => `${k}:${statItems[k] ?? 0}`);

      const url = TELEMETRY_API_URL;
      const signals = [
        {
          "isTestMode": TELEMETRY_TEST_MODE,
          "appID": TELEMETRY_APP_ID,
          "clientUser": uuidHash,
          "sessionID": uuidv4(),
          "type": "weeklyLog",
          "payload": [
            "browser:"+EXTENSION_BROWSER,
            "os:"+getOS(),
            "systemVersion:"+getBrowserVersion(),
            "majorSystemVersion:"+getMajorSystemVersion(),
            "majorMinorSystemVersion:"+getMajorMinorSystemVersion(),
            "language:"+navigator.language.substring(0,2),
            "appVersion:"+EXTENSION_VERSION,
            "buildNumber:"+getBuildNumber(),
            "institute:"+id,
            ...statPayload,
          ]
        },
      ];

      const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(signals),
      });
      if(response.status == 200){
        setLastLog(now);
        const reset = {};
        STAT_KEYS.forEach(k => { reset[k] = 0; });
        oaStorage.local.set(reset);
      }
    }
  }

  /**
   * Detects the user's operating system from the browser platform APIs.
   * Prefers the modern userAgentData.platform (Chromium) and falls back to
   * the legacy navigator.platform (Firefox, Safari).
   * @returns {string} OS name: 'Mac OS', 'Windows', 'Linux', 'iOS', 'Android', 'ChromeOS', or 'unknown'.
   */
  function getOS() {
    const platform = navigator?.userAgentData?.platform || navigator.platform || '';
    const userAgent = navigator.userAgent;

    if (/macOS|Macintosh|MacIntel|MacPPC|Mac68K/.test(platform)) return 'Mac OS';
    if (/iPhone|iPad|iPod/.test(platform))                        return 'iOS';
    if (/Win/.test(platform))                                     return 'Windows';
    if (/Android/.test(userAgent))                                return 'Android';
    if (/Chrome OS|CrOS/.test(platform))                         return 'ChromeOS';
    if (/Linux/.test(platform))                                   return 'Linux';
    return 'unknown';
  }

  /**
   * Derives a monotonically increasing integer build number from EXTENSION_VERSION.
   * Expects the format "YYYY.N" (e.g. "2026.3" → "2026003").
   * Falls back to the raw version string if the format is unexpected.
   * @returns {string} Numeric build number as a string.
   */
  function getBuildNumber() {
    const parts = EXTENSION_VERSION.split('.');
    if (parts.length !== 2) return EXTENSION_VERSION;
    const year = parseInt(parts[0], 10);
    const release = parseInt(parts[1], 10);
    if (isNaN(year) || isNaN(release)) return EXTENSION_VERSION;
    return String(year * 1000 + release);
  }

  /**
   * Returns the browser name and major version for the systemVersion telemetry field.
   * Uses userAgentData.brands on Chromium; falls back to UA string parsing for Firefox and Safari.
   * @returns {string} e.g. 'Google Chrome 124', 'Firefox 126', 'Safari 17', or 'unknown'.
   */
  function getBrowserVersion() {
    if (navigator.userAgentData?.brands) {
      const b = navigator.userAgentData.brands.find(
        b => !/Not.A.Brand|Chromium/i.test(b.brand)
      );
      if (b) return `${b.brand} ${b.version}`;
    }
    const ff = navigator.userAgent.match(/Firefox\/([\d]+)/);
    if (ff) return `Firefox ${ff[1]}`;
    const safari = navigator.userAgent.match(/Version\/([\d]+).*Safari/);
    if (safari) return `Safari ${safari[1]}`;
    return 'unknown';
  }

  /**
   * Returns the browser name and major version for the TelemetryDeck majorSystemVersion field.
   * Strips "Google " from the Chromium brand name for shorter chart labels.
   * @returns {string} e.g. 'Chrome 124', 'Microsoft Edge 124', 'Firefox 126', 'Safari 17', or 'unknown'.
   */
  function getMajorSystemVersion() {
    if (navigator.userAgentData?.brands) {
      const b = navigator.userAgentData.brands.find(
        b => !/Not.A.Brand|Chromium/i.test(b.brand)
      );
      if (b) return `${b.brand.replace('Google ', '')} ${b.version}`;
    }
    const ff = navigator.userAgent.match(/Firefox\/([\d]+)/);
    if (ff) return `Firefox ${ff[1]}`;
    const safari = navigator.userAgent.match(/Version\/([\d]+).*Safari/);
    if (safari) return `Safari ${safari[1]}`;
    return 'unknown';
  }

  /**
   * Returns the browser name and major.minor version for the TelemetryDeck majorMinorSystemVersion field.
   * Chromium's low-entropy API only exposes the major version, so Chrome and Edge return the same
   * value as getMajorSystemVersion(). Firefox and Safari include major.minor from their UA strings.
   * @returns {string} e.g. 'Chrome 124', 'Firefox 126.0', 'Safari 17.4.1', or 'unknown'.
   */
  function getMajorMinorSystemVersion() {
    if (navigator.userAgentData?.brands) {
      const b = navigator.userAgentData.brands.find(
        b => !/Not.A.Brand|Chromium/i.test(b.brand)
      );
      // low-entropy API only exposes major version on Chromium
      if (b) return `${b.brand.replace('Google ', '')} ${b.version}`;
    }
    // Firefox and Safari UAs include major.minor: Firefox/126.0, Version/17.4.1
    const ff = navigator.userAgent.match(/Firefox\/([\d.]+)/);
    if (ff) return `Firefox ${ff[1]}`;
    const safari = navigator.userAgent.match(/Version\/([\d.]+).*Safari/);
    if (safari) return `Safari ${safari[1]}`;
    return 'unknown';
  }


  /**
   * Verifies that a 'saveSettingsFromWeb' message actually came from the real
   * oahelper.org proxy page, not just any page whose content script fired the message.
   * @param {chrome.runtime.MessageSender} sender
   */
  function isTrustedOAHelperSender(sender) {
    if (!sender || !sender.tab || !sender.tab.url) {
      return false;
    }
    try {
      const url = new URL(sender.tab.url);
      return url.protocol === 'https:' &&
        url.hostname === 'www.oahelper.org' &&
        (url.pathname === '/proxy' || url.pathname.indexOf('/proxy/') === 0);
    } catch (e) {
      return false;
    }
  }

  /**
   * Fetches updated institute settings from the OAHELPER API and saves them to local storage.
   * @param {string} id - The institute ID to look up.
   * @param {string} [uuid] - The user's UUID; hashed before being sent to the API.
   */
  function reloadSettings(id, uuid) {
    doProxySearchById(id, uuid).then((response) => {
      if (response != undefined && (response.code >= 200 && response.code <= 299)) {
        if (response.data.length == 0) {
          // we found nothing, need to give up
          //console.log('background / reloadSettings found no settings')
          return;
        } else{
          //console.log('background / reloadSettings has found settings and will attempt to save next');
          // we found one, as we search by id there can only be one result
          saveInstitute(response.data[0].id, response.data[0].institution, response.data[0].proxyUrl.replace('{targetUrl}', ''), response.data[0].ill.replace('{doi}', ''), response.data[0].domainUrl, response.data[0].discovery, response.data[0].ebsco_cgp);
          return;
        }
      } else {
        //console.log('background / doGetProxyDomains had an error in the doProxySearch Response, response undefined, or response.code outside valid range');
        // there was an error, we need to give up
        return;
      }
    });
  }

  /**
   * POSTs a search request to the OAHELPER API by institute ID.
   * @param {string} searchTerm - The institute ID to search for.
   * @param {string} [uuid] - The user's UUID; SHA-256 hashed and included as `uuidHash` in the request body.
   * @returns {Promise<Object>} Parsed JSON response from the API.
   */
  async function doProxySearchById(searchTerm, uuid) {
    if(searchTerm == '99999' || searchTerm == undefined) {
      return;
    }
    const url = OAHELPER_API_URL;
    const apiKey = OAHELPER_API_KEY;
    const formData = new URLSearchParams();
    let searchtype = 'id';
    formData.append(searchtype, searchTerm);
    if (uuid != undefined) {
      let uuidHash = await sha256(uuid);
      formData.append('uuidHash', uuidHash);
    }
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Token': apiKey,
      },
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      body: formData,
    });
    return response.json();
  }

  function saveInstitute(id, name, url, illurl, domainurl, discovery, ebsco_cgp) {
    let lastload = Math.floor(Date.now() / 1000);
    let ill = false;
    if(illurl.length > 0 && illurl.indexOf('http') === 0) {
      ill = true;
    }
    let ezproxy = false;
    if(url.length > 0 && url.indexOf('http') === 0){
      ezproxy = true;
    }
    oaStorage.local.set({
      id,
      name,
      url,
      illurl,
      ezproxy,
      ill,
      domainurl,
      discovery,
      lastload,
      ebsco_cgp
    }, () => {
      //console.log('background / saveInstitute has finished saving');
      // we just reloaded the settings, now let's check if we should obtain proxy domains and then run that process
      if (domainurl != '') {
        doGetProxyDomains(id, domainurl)
      }
      else {
        // clear out any old domains and remove translations
        oaStorage.local.set({
          supportedDomains: [],
          translations: {},
          disabledOn: []
        });
      }
    });
  }

  function doGetProxyDomains(id, domainurl){
    if (domainurl == '' || domainurl == "undefined" || domainurl == undefined){
      return;
    }
    const lastload = Math.floor(Date.now() / 1000);
    getProxyDomains(domainurl+'?timestamp='+lastload).then((response) => {
      if (response.length != 0 && id == response.id && response.domains.length > 0) {
        // we need to save the domains now
        let translationsData = '';
        if (response.translations != null) {
          translationsData = response.translations;
        }
        let disabledOnData = [];
        if (response.disabledOn != null) {
          disabledOnData = response.disabledOn;
        }
        oaStorage.local.set({
          supportedDomains: response.domains,
          translations: translationsData,
          lastload: lastload,
          ezproxy: true,
          url: response.prefix,
          disabledOn: disabledOnData
        })
        // we might want to log something for now
        //console.log('background / doGetProxyDomains has finished');
      }
    })
  }

  async function getProxyDomains(domainurl) {
    try {
      const response = await fetch(domainurl);
      if(response.ok){
        return response.json();
      }
      else{
        return [];
      }
    } catch (err) {
      return [];
    }
  }

  /**
   * Sets the toolbar icon via whichever of the action/browserAction APIs the currently loaded
   * manifest actually declares - keyed off manifest_version (3 -> "action" in manifest.json,
   * Chrome/Edge; 2 -> "browser_action" in manifest_v2.json, Firefox/Safari) rather than
   * guessing from namespace presence, since that's what's guaranteed to match the manifest that
   * was actually packaged. Source never contains a literal `chrome.action.setIcon` call chain,
   * so static analyzers that flag action.setIcon as unsupported in Firefox have nothing to
   * match here.
   */
  function setBrowserIcon(iconType) {
    const kind = iconType.replace(/^ezproxy_?/, '');
    const state = {orange:'available',orangeok:'available',blue:'research',purple:'citations',
      warning:'warning',disabled:'disabled',ebsco:'library'}[kind] || (iconType.startsWith('ezproxy') ? 'library' : '');
    const iconApi = chrome.runtime.getManifest().manifest_version >= 3 ? chrome.action : chrome.browserAction;
    return iconApi.setIcon({
      path: {
        19: `images/opensaysme${state ? "-" + state : ""}-19.png`,
        38: `images/opensaysme${state ? "-" + state : ""}-38.png`,
      },
    });
  }

  function setGreenIcon() {
    if(warningIcon || disabledOnDomain){
      return;
    }
    greenIcon = true;
    setBrowserIcon('orangeok');
    checkProxy('orangeok');
  }

  function setOrangeIcon() {
    if(warningIcon || disabledOnDomain){
      return;
    }
    orangeIcon = true;
    setBrowserIcon('orange');
    checkProxy('orange');
  }

  function setBlueIcon() {
    if(orangeIcon || greenIcon || ebscoIcon || warningIcon || disabledOnDomain){
      return;
    }
    setBrowserIcon('blue');
    checkProxy('blue');
  }

  function setEBSCOicon() {
    if(warningIcon || disabledOnDomain){
      return;
    }
    ebscoIcon = true;
    setBrowserIcon('ebsco');
  }

  function setPurpleIcon() {
    if(orangeIcon || greenIcon || ebscoIcon || warningIcon || disabledOnDomain){
      return;
    }
    setBrowserIcon('purple');
    checkProxy('purple');
  }

  function setWarningIcon() {
    warningIcon = true;
    setBrowserIcon('warning');
  }

  function setDisabledIcon() {
    disabledOnDomain = true;
    setBrowserIcon('disabled');
  }

  function setDefaultIcon() {
    if(warningIcon || disabledOnDomain){
      return;
    }
    setBrowserIcon('black');
    checkProxy('');
  }



  function checkProxy(icontype) {

    let queryOptions = { active: true, lastFocusedWindow: true };
    chrome.tabs.query(queryOptions, ([tab]) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
      if(tab != undefined && tab.id != undefined) {
        return shouldProxy(tab.id, tab.url, icontype);
      }
      else {
        return false;
      }

    });
  }

  function shouldProxy(tabid, currenturl, icontype) {
    if (
      configuration == undefined ||
      configuration.domainurl == undefined ||
      configuration.domainurl == "undefined" ||
      configuration.domainurl == '' ||
      !Array.isArray(configuration.supportedDomains)
      ) {
        return false
      }
      else{
        configuration.supportedDomains.forEach(function(a){
          if (typeof(a) == 'string' && currenturl.indexOf(a)>-1) {
            if(icontype != ''){
              setBrowserIcon(`ezproxy_${icontype}`);
            }
            else{
              setBrowserIcon('ezproxy');
            }
          }
        });
      }
    }

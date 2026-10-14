var oah_loaded = 0; // eslint-disable-line no-var
var oah_processedSinglePageApplication = false; // eslint-disable-line no-var
var spaUrl = location.href; // eslint-disable-line no-var

var preprintServers = ['arxiv.org', 'biorxiv.org', 'osf.io', 'engrxiv.org', 'psyarxiv.com', 'paleorxiv.org', 'eartharxiv.org', 'edarxiv.org', 'arabixiv.org', 'indiarxiv.org', 'biohackrxiv.org', 'ecoevorxiv.org', 'ecsarxiv.org', 'frenxiv.org', 'mediarxiv.org', 'thesiscommons.org']; // eslint-disable-line no-var


/**
* The oahelper object is going to be the key to the extension
*/

let oahelper = {
  configuration: {},
  doi: [],
  shouldExtProxy: {},
  freeAccess: {},
  alternativeAccess: {},
  subscriptionAccess: {},
  addOnFeatures: {},
  hideAlternativeAccess: false, // this is used for sites that offer PDF Full Text (e.g. ebscohost.com),
  currentUrl: '',
  isSpa: false,
  isDisabledOnDomain: false,
  isAtOpenAccessLocation: false
};


/*******
*
*  Getting the extension started
*
*/

if (typeof (EXT_NAME_CONTENT_SCRIPT_LOADED) === 'undefined') {
  var EXT_NAME_CONTENT_SCRIPT_LOADED = true;

  const ExtName = {};

  //---------------------------------------------------------------------------------
  ExtName.initialize = function () {
    docReady(() => {
      if (!inIframe() && oah_loaded == 0) {
        oah_loaded++;
        if (onSupportedDomain('psycnet.apa.org') || onSupportedDomain('discovery.ebsco.com') || onSupportedDomain('research.ebsco.com')) {
          oahelper.isSpa = true;
          document.addEventListener('click', () => {
            requestAnimationFrame(() => {
              if(oahelper.currentUrl != location.href) {
                singlePageApplications();
              }
            });
          }, true);
          if (!oah_processedSinglePageApplication) {
            getConfigurationAndStart();
          }
        }
        else {
          getConfigurationAndStart();
        }
        findOAHelperWebsite();
        addMessageListener();
      }
    });
  };

  ExtName.initialize();
}

/**
 * Calls fn immediately if the DOM is ready, otherwise waits for DOMContentLoaded.
 * @param {Function} fn - The function to run when the DOM is ready.
 */
function docReady(fn) {
  // see if DOM is already available
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // call on next available tick
    setTimeout(fn, 1);
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

/**
 * Detects whether the content script is running inside an iframe.
 * @returns {boolean} True if running inside a cross-origin iframe.
 */
function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
 * Handles URL changes in SPAs by removing the existing badge and re-running the full check.
 * Called on each click event via requestAnimationFrame on psycnet, discovery.ebsco, and research.ebsco.
 */
function singlePageApplications() {
  if (spaUrl !== location.href && oah_processedSinglePageApplication) {
    oah_processedSinglePageApplication = true;
    removeMyself();
    setTimeout(() => {
      getConfigurationAndStart();
    }, 4000);
  }
  else if(!oah_processedSinglePageApplication) {
    // ebsco falls into this one
    // Note: since getConfigurationAndStart() now sets oahelper.currentUrl at the start of the
    // pipeline (not just at the end), the click listener's oahelper.currentUrl != location.href
    // guard should no longer be true on the initial load, so this branch may now be dead/
    // unreachable in practice. Left in place intentionally - not verified against a live
    // psycnet/discovery.ebsco/research.ebsco session yet.
    oah_processedSinglePageApplication = true;
    removeMyself();
    getConfigurationAndStart();
  }
  spaUrl = location.href;
}

/*****
*
*  Getting the configuration from background.js - this will help us
*  understand what we need to get right
*
*/

/**
 * Fetches configuration from the background and orchestrates the full DOI-check pipeline.
 * Sequentially: loads config, detects DOIs, runs all API checks in parallel, injects badges.
 */
function getConfigurationAndStart() {
  chrome.runtime.sendMessage({ mode: 'getoptions' }, async (response) => {
    if (response != undefined && response.options != undefined && !response.options != null) {
      oahelper.currentUrl = location.href;
      oahelper.configuration = response.options;
      if (oahelper.configuration.disabledOn != undefined && oahelper.configuration.disabledOn != null && oahelper.configuration.disabledOn.length > 0) {
        if (onDisabledDomain(oahelper.configuration.disabledOn, window.location.href)) {
          console.log('OpenSaysMe is disabled on this domain');
          // consider setting a flag, so we can check in other places too
          oahelper.isDisabledOnDomain = true;
          // consider updating icon
          chrome.runtime.sendMessage({ mode: 'setDisabledIcon' }, (response) => {
            // console.log(response);
          });
          return;
        }
      }

      oahelper.doi = await getDOIs();
      oahelper.shouldExtProxy = shouldProxy(window.location.href);
      oahelper.freeAccess = await findFreeAccess();
      oahelper.alternativeAccess = await checkAlternativeAccess(oahelper.doi);
      oahelper.addOnFeatures = await checkAddOnFeatures(oahelper.doi);
      // let's not waste time, if subscription access is not enabled AND unpaywall didn't have an oaVersion
      // might need to consider checking oaVersion too
      if (shouldDoSubscriptionAccess()) {
        oahelper.subscriptionAccess = await checkSubscriptionAccess(oahelper.doi);
      }
      processAccessData();
      addCitationCount();
      addRetractionWatch();
      onAccessLocation();
      onOpenAthensFourOhFour();
    }
  });
}

/**
 * Determines whether the EBSCO subscription check should run.
 * Skips if EBSCO is unconfigured, disabled by the user, or if Unpaywall already found a published OA version.
 * @returns {boolean} True if the EBSCO check should proceed.
 */
function shouldDoSubscriptionAccess() {
  if (oahelper.configuration.ebsco_cgp == 'unset') {
    return false;
  }
  if (oahelper.configuration.ebsco_cgp == '') {
    return false;
  }
  if (oahelper.configuration.ebscouc != undefined && !oahelper.configuration.ebscouc) {
    return false;
  }
  if (oahelper.alternativeAccess.unpaywall.isOA && oahelper.alternativeAccess.unpaywall.version == 'publishedVersion') {
    return false;
  }
  return true;
}

/**
 * Collects DOIs from all available sources (metatags, schema, CSS selectors, webscraping).
 * SPAs use only the webscraper; standard pages run all sources in parallel.
 * @returns {Promise<string[]>} Flat list of found DOIs.
 */
async function getDOIs() {
  return new Promise(async resolve => {
    if(oahelper.isSpa) {
      let doi = await Promise.all([find_DOI_webscraping()]);
      resolve(doi.flat());
    }
    else {
      let doi = await Promise.all([find_DOI_Metatags(), find_DOI_Metaschema(), find_DOI_MetaProperty(), find_DOI_CSS_Selector(), find_DOI_webscraping()]);
      resolve(doi.flat());
    }
  });
}

/**
 * Increments a named usage counter in the background service worker.
 * No PII — keys are fixed strings like 'badge_oa_clicked'.
 * @param {string} key - The stat counter name.
 */
function recordStat(key) {
  chrome.runtime.sendMessage({ mode: 'stat', key: 'stat_' + key });
}

/**
 * Runs Unpaywall and ILL checks in parallel.
 * @param {string[]} doi - DOI array; first element is used.
 * @returns {Promise<{unpaywall: object, ill: object}>}
 */
async function checkAlternativeAccess(doi) {
  return new Promise(async resolve => {
    let alternativeAccess = await Promise.all([checkUnpaywall(doi), makeIll(doi)]);
    let response = {
      unpaywall: alternativeAccess[0],
      ill: alternativeAccess[1]
    };
    resolve(response);
  });
}

/**
 * Runs the EBSCO subscription availability check.
 * @param {string[]} doi - DOI array; first element is used.
 * @returns {Promise<{ebsco: object}>}
 */
async function checkSubscriptionAccess(doi) {
  return new Promise(async resolve => {
    let subscriptionAccess = await Promise.all([checkEBSCO(doi)]);
    let response = {
      ebsco: subscriptionAccess[0]
    };
    resolve(response);
  });
}

/**
 * Runs OpenCitations, OpenAlex citation, and RetractionWatch checks in parallel.
 * @param {string[]} doi - DOI array; first element is used.
 * @returns {Promise<{opencitations: object, openalexcitation: object, retractionwatch: object}>}
 */
async function checkAddOnFeatures(doi) {
  return new Promise(async resolve => {
    let addOnFeatures = await Promise.all([checkOpenCitations(doi), checkOpenAlexCitation(doi), checkRetractionWatch(doi)]);
    let response = {
      opencitations: addOnFeatures[0],
      openalexcitation: addOnFeatures[1],
      retractionwatch: addOnFeatures[2]
    };
    resolve(response);
  });
}

/**
 * Injects a friendly explanation when the user lands on an OpenAthens 404 page,
 * helping them understand the error and what to do next.
 */
function onOpenAthensFourOhFour() {
  if (oahelper.configuration.url != undefined && oahelper.configuration.url != '' && oahelper.configuration.url.length > 0 && window.location.href.includes(oahelper.configuration.url) && document.title == "OpenAthens: 404") {
    const elements = document.getElementsByClassName('unauthLink');
    const requiredElement = elements[0];

    const newDiv = document.createElement("div");
    newDiv.id = "oahelper_openathens_404";
    newDiv.innerHTML = "<div class=\"error-title\">Hello from OpenSaysMe!</div><p>My apologies for bringing you to a page that might look a bit scary.</p><p>It simply means that your institution hasn't configured this domain for OpenAthens access. You might want to let them know.</p><p>For now, the best thing to do is click the link above or hit the back button. Thanks so much for your understanding!</p>";
    requiredElement.append(newDiv);
  }
}


/**
*  DOI Related Function
*  - includes the AsyncFunction of trying to find content in different places
*  - + helper functions, which validat we found a DOI, clean it, etc.
*/



/**
 * Searches standard meta name attributes (citation_doi, dc.identifier, etc.) for a DOI.
 * @returns {Promise<string[]>} Valid DOIs found in meta name tags.
 */
function find_DOI_Metatags() {
  return new Promise(resolve => {
    // we are going to look in meta-tags for the DOI
    const option = ['citation_doi', 'doi', 'dc.doi', 'dc.identifier', 'dc.identifier.doi', 'bepress_citation_doi', 'rft_id', 'dcsext.wt_doi', 'DC.identifier', 'publication_doi'];
    const doi = [];
    for (let i = 0; i < option.length; i++) {
      const potentialDoiArray = getMeta(option[i]);
      for (let j = 0; j < potentialDoiArray.length; j++) {
        const testDoi = potentialDoiArray[j];
        if (testDoi != '' && isDOI(cleanDOI(testDoi))) {
          doi.push(cleanDOI(testDoi));
        }
      }
    }
    resolve(doi);
  });
}

/**
 * Searches meta tags matching both name="dc.Identifier" and scheme="doi".
 * @returns {Promise<string[]>} Valid DOIs found.
 */
function find_DOI_Metaschema() {
  return new Promise(resolve => {
    // in this case, we are looking for both meta-tag and its scheme
    const potentialDoiArray = getMetaScheme('dc.Identifier', 'doi');
    const doi = [];
    for (let i = 0; i < potentialDoiArray.length; i++) {
      const testDoi = potentialDoiArray[i];
      if (testDoi != '' && isDOI(cleanDOI(testDoi))) {
        doi.push(cleanDOI(testDoi));
      }
    }
    resolve(doi);
  });
}

/**
 * Searches meta property attributes for a DOI (used by ResearchGate and similar sites).
 * @returns {Promise<string[]>} Valid DOIs found.
 */
function find_DOI_MetaProperty() {
  return new Promise(resolve => {
    // this handled Research Gate or others that use meta property
    const selectors = ['citation_doi', 'doi', 'dc.doi', 'dc.identifier', 'dc.identifier.doi', 'bepress_citation_doi', 'rft_id', 'dcsext.wt_doi', 'DC.identifier'];
    let doi = [];
    for (let i = 0; i < selectors.length; i++) {
      const testDoi = getMetaProperty(selectors[i]);
      if (testDoi != 0) {
        doi.push(cleanDOI(testDoi));
        break;
      }
    }
    resolve(doi);
  });
}

/**
 * Searches specific CSS selectors for a DOI value as a last-resort fallback.
 * @returns {Promise<string[]>} Valid DOIs found via CSS selector matching.
 */
function find_DOI_CSS_Selector() {
  return new Promise(resolve => {
    // this is a place for more complex fallbacks, where we can provide additional "CSS-Selectors" to find
    // a DOI. Right now it really only handles two cases, but hopefully there will be aditional cases
    // in future
    const selectors = ['a[ref=\"aid_type=doi\"]', 'a.citation__doi__link'];
    let doi = [];
    for (let i = 0; i < selectors.length; i++) {
      const testDoi = getFromSelector(selectors[i]);
      if (testDoi != 0) {
        doi.push(cleanDOI(testDoi));
        break;
      }
    }
    resolve(doi);
  });
}

/**
 * Runs site-specific DOI extraction for known domains that require DOM scraping.
 * Only active on the domains listed in domainArray; dispatches to the matching webscraper.
 * @returns {Promise<string[]>} Valid DOIs found via site-specific webscraping.
 */
function find_DOI_webscraping() {
  // if we cannot work through specific selectors, a more general scraping approach might be neeeded
  // to avoid doing this on every page, we specify the pages we support

  return new Promise(async resolve => {
    let doi = [];
    const domainArray = ['ieeexplore.ieee.org', 'nber.org', 'base-search.net', 'psycnet.apa.org', 'proquest.com', 'dl.acm.org', 'ebscohost.com', 'discovery.ebsco.com', 'research.ebsco.com']
    for(let i=0; i<domainArray.length; i++) {
      if (onSupportedDomain(domainArray[i])){
        const functionName = domainArray[i].replaceAll('.','');
        // the timeout in IEEE causes trouble
        const testDoi = await webscrapers[functionName]();
        if (isDOI(testDoi)){
          doi.push(testDoi);
        }
        break;
      }
    }
    resolve(doi);
  });
}

/**
 * Checks if the current hostname matches a domain, including EZProxy-rewritten hostnames
 * where dots are replaced with hyphens (e.g. ieeexplore-ieee-org.proxy.uni.edu).
 * @param {string} domain - The domain to check (e.g. 'ieeexplore.ieee.org').
 * @returns {boolean} True if the current page is on or proxied through that domain.
 */
function onSupportedDomain(domain){
  const host = window.location.hostname;
  if(host.indexOf(domain) > -1){
    return true;
  }
  const proxiedDomain = domain.replaceAll('.', '-')+'.';
  if(host.indexOf(proxiedDomain) > -1){
    return true;
  }
  return false;
}


/**
 * Returns all meta tag content values where the name attribute matches metaName.
 * @param {string} metaName - The meta name attribute to match.
 * @returns {string[]} Array of content values (may be empty).
 */
function getMeta(metaName) {
  // get meta tags and loop through them. Looking for the name attribute and see if it is the metaName
  // we were looking for
  const metas = document.getElementsByTagName('meta');
  const response = [];

  for (let i = 0; i < metas.length; i++) {
    if (metas[i].getAttribute('name') === metaName) {
      response.push(metas[i].getAttribute('content'));
    }
  }
  return response;
}

/**
 * Returns the content of the first meta tag whose name matches, or '0' if not found.
 * Used for abstract/title extraction where a single value is expected.
 * @param {string} metaName - The meta name attribute to match.
 * @returns {string} The content value or '0'.
 */
function getMetaForAbstract(metaName) {
  // get meta tags and loop through them. Looking for the name attribute and see if it is the metaName
  // we were looking for
  const metas = document.getElementsByTagName('meta');

  for (let i = 0; i < metas.length; i++) {
    if (metas[i].getAttribute('name') === metaName) {
      return metas[i].getAttribute('content');
    }
  }

  return '0';
}

/**
 * Returns meta content values matching both name and scheme attributes.
 * @param {string} metaName - The meta name attribute to match.
 * @param {string} scheme - The meta scheme attribute to match.
 * @returns {string[]} Array of content values.
 */
function getMetaScheme(metaName, scheme) {
  // pretty much the same as the other function, but it also double-checks the scheme
  const metas = document.getElementsByTagName('meta');
  const response = [];
  for (let i = 0; i < metas.length; i++) {
    if (metas[i].getAttribute('name') === metaName && metas[i].getAttribute('scheme') === scheme) {
      response.push(metas[i].getAttribute('content'));
    }
  }

  return response;
}

/**
 * Returns the content of the first meta tag whose property attribute matches, or 0 if not found.
 * @param {string} metaName - The meta property attribute to match.
 * @returns {string|number} The content value or 0.
 */
function getMetaProperty(metaName) {
  const metas = document.getElementsByTagName('meta');

  for (let i = 0; i < metas.length; i++) {
    if (metas[i].getAttribute('property') === metaName) {
      return metas[i].getAttribute('content');
    }
  }

  return 0;
}

/**
 * Returns the first valid DOI found among elements matching the CSS selector, or 0.
 * @param {string} selector - A CSS selector to query.
 * @returns {string|number} A cleaned DOI or 0.
 */
function getFromSelector(selector) {
  // allow for more complex CSS selectors, these are likely more unreliable
  const elements = document.querySelectorAll(selector);

  for (let i = 0; i < elements.length; i++) {
    // make sure we test what we find to be a proper DOI
    if (isDOI(cleanDOI(elements[i].innerHTML))) {
      return cleanDOI(elements[i].innerHTML);
    }
  }

  return 0;
}

/**
 * Strips known URL prefixes from a raw DOI string (e.g. 'https://doi.org/', 'info:doi/').
 * @param {string} doi - Raw DOI, possibly prefixed.
 * @returns {string} The bare DOI.
 */
function cleanDOI(doi) {
  // clean for a few common known prefixes (well exactly one right now, but easy to expand
  const clean = ['info:doi/', 'https://doi.org/'];

  for (let i = 0; i < clean.length; i++) {
    doi = doi.replace(clean[i], '');
  }

  return doi;
}

/**
 * Validates a string against CrossRef-recommended DOI regular expressions.
 * @param {string} doi - The string to test.
 * @returns {boolean} True if the string is a valid DOI.
 */
function isDOI(doi) {
  // these regular expressions were recommended by CrossRef in a blog post
  // https://www.crossref.org/blog/dois-and-matching-regular-expressions/
  const regex1 = /^10.\d{4,9}\/[-._;()\/:A-Z0-9]+$/i;
  const regex2 = /^10.1002\/[^\s]+$/i;
  const regex3 = /^10.\d{4}\/\d+-\d+X?(\d+)\d+<[\d\w]+:[\d\w]*>\d+.\d+.\w+;\d$/i;
  const regex4 = /^10.1021\/\w\w\d+$/i;
  const regex5 = /^10.1207\/[\w\d]+\&\d+_\d+$/i;

  if (regex1.test(doi)) {
    return true;
  }
  if (regex2.test(doi)) {
    return true;
  }
  if (regex3.test(doi)) {
    return true;
  }
  if (regex4.test(doi)) {
    return true;
  }
  if (regex5.test(doi)) {
    return true;
  }

  return false;
}

/**
 * Runs a regex against the full document HTML and returns the first capture group.
 * @param {RegExp} regEx - A regex with at least one capture group.
 * @returns {string|false} The first captured match, or false if no match.
 */
function runRegexOnDoc(regEx) {
  const m = regEx.exec(document.documentElement.innerHTML);
  if (m && m.length > 1) {
    return m[1];
  }
  return false;
}

/**
 * Runs a regex against a text string and returns the first capture group.
 * @param {string} text - The text to search.
 * @param {RegExp} regEx - A regex with at least one capture group.
 * @returns {string|false} The first captured match, or false if no match.
 */
function runRegexOnText(text, regEx) {
  const m = regEx.exec(text);
  if (m && m.length > 1) {
    return m[1];
  }
  return false;
}


/**
*
* Some Webpage specific functions, basically webscraping the heck out of things
*
*/
var webscrapers = {};

/**
 * Extracts DOI from IEEE Xplore via JSON regex on the page source; uses a 1500ms timeout
 * because the DOI data is injected by a script after initial page load.
 * @returns {Promise<string[]>} DOI array.
 */
webscrapers['ieeexploreieeeorg'] = async function(){
  return new Promise(resolve => {
    let returnDOI = [];
    setTimeout(() => {
      const regex = new RegExp('"doi":"([^"]+)"');
      const doi = runRegexOnDoc(regex);
      if (isDOI(doi)) {
        returnDOI.push(doi);
      }
      resolve(returnDOI);
    }, 1500);
  });
}


/** Extracts DOI from NBER working paper pages via regex on the page source.
 * @returns {Promise<string[]>}
 */
webscrapers['nberorg'] = async function(){
  return new Promise(resolve => {
    let returnDOI = [];
    var regex = new RegExp('Document Object Identifier \\(DOI\\): (10.*?)<\\/p>');
    var doi = runRegexOnDoc(regex);
    if (isDOI(doi)) {
      returnDOI.push(doi);
    }
    resolve(returnDOI);
  });
}

/** Extracts DOI from BASE search result pages via an orange DOI link element.
 * @returns {Promise<string[]>}
 */
webscrapers['basesearchnet'] = async function(){
  return new Promise(resolve => {
    let returnDOI = [];
    if (document.querySelectorAll('a.link-orange[href^="https://doi.org/"]').length > 0) {
    var doi = document.querySelectorAll('a.link-orange[href^="https://doi.org/"]')[0].href.replace('https://doi.org/', '').replace('http://doi.org/', '');
    if (isDOI(doi)) {
      returnDOI.push(doi);
    }
  }
  resolve(returnDOI);
});
}

/**
 * Extracts DOI from PsycNET by re-running metatag/schema checks after a 2500ms delay
 * to allow the SPA to finish rendering the article page.
 * @returns {Promise<string>} The first DOI found.
 */
webscrapers['psycnetapaorg'] = async function(){
  return new Promise(resolve => {
    setTimeout(async ()=> {
      oahelper.doi = [];
      let doi = await Promise.all([find_DOI_Metatags(), find_DOI_Metaschema(), find_DOI_MetaProperty(), find_DOI_CSS_Selector()]);
      let returnArray = doi.flat();
      resolve(returnArray[0]);
    },2500);

  });

}



/** Extracts DOI from ProQuest abstract pages via regex on the abstract text element.
 * @returns {Promise<string[]>}
 */
webscrapers['proquestcom'] = async function(){
  return new Promise(resolve => {
    let returnDOI = [];
    if (document.querySelectorAll('.abstract_Text').length > 0) {
      var doiElements = document.querySelectorAll('.abstract_Text');
      var potentialDoi = doiElements[0];
      var regex = new RegExp('DOI:(10\..*)');
      var doi = runRegexOnText(potentialDoi.textContent, regex);
      if (isDOI(doi)) {
        returnDOI.push(doi);
      }
    }
    resolve(returnDOI);
  });
}

/**
 * Extracts DOI from EBSCOhost detail pages via dd elements.
 * Also sets hideAlternativeAccess when the record already shows a full-text PDF/HTML link,
 * since offering a duplicate OA badge would be redundant.
 * @returns {Promise<string[]>}
 */
webscrapers['ebscohostcom'] = async function(){
  return new Promise(resolve => {
    let returnDOI = [];
    if ((onSupportedDomain('ebscohost.com') && document.location.href.indexOf('/detail') > -1) || (onSupportedDomain('discovery.ebsco.com') && document.location.href.indexOf('/details/') > -1)) {
      const fullTextIndicators = ['pdf-ft', 'html-ft', 'html-ftwg'];
      let isFullText = false;
      fullTextIndicators.forEach((item) => {
        const element = document.getElementsByClassName(item);
        if (element.length > 0) {
          isFullText = true;
        }
      });
      if(isFullText){
        oahelper.hideAlternativeAccess = true;
      }
      if (document.getElementsByTagName('dd').length > 0) {
        var doiElements = document.getElementsByTagName('dd');
        [...doiElements].forEach((element) => {
          if (element.textContent.indexOf('10.') == 0 && isDOI(element.textContent)) {
            returnDOI.push(element.textContent);
          }
        });
      }
    }
    resolve(returnDOI);
  });

}

/**
 * Extracts DOI from research.ebsco.com by re-running metatag checks after a 4000ms delay
 * to allow the SPA to finish rendering.
 * @returns {Promise<string>} The first DOI found.
 */
webscrapers['researchebscocom'] = async function() {
  //console.log(`oah: research.ebsco.com`);
  return new Promise(resolve => {
    setTimeout(async ()=> {
      oahelper.doi = [];
      let doi = await Promise.all([find_DOI_Metatags()]);
      let returnArray = doi.flat();
      resolve(returnArray[0]);
    },4000);

  });
}

/**
 * Extracts DOI from discovery.ebsco.com by re-running metatag checks after a 4000ms delay
 * to allow the SPA to finish rendering.
 * @returns {Promise<string>} The first DOI found.
 */
webscrapers['discoveryebscocom'] = async function(){
  //console.log(`oah: discovery.ebsco.com`);
  return new Promise(resolve => {
    setTimeout(async ()=> {
      oahelper.doi = [];
      let doi = await Promise.all([find_DOI_Metatags()]);
      let returnArray = doi.flat();
      resolve(returnArray[0]);
    },4000);

  });
}

/** Extracts DOI from ACM Digital Library by parsing it directly from the /doi/ URL path.
 * @returns {Promise<string[]>}
 */
webscrapers['dlacmorg'] = async function(){
  return new Promise(resolve => {
    let returnDOI = [];
    if (onSupportedDomain('dl.acm.org') && document.location.href.indexOf('/doi/') > -1) {
      //doConsoleLog(translateOAHelper('content_console_002', 'dl.acm.org'));
      const urlParts = document.location.href.split('/doi/');
      if (isDOI(urlParts[1])) {
        returnDOI.push(urlParts[1]);
      }
    }
    resolve(returnDOI);
  });
}

/**
*
*  Free Access, some publishers will provide free access to articles
*  The extension should indicate this too
*
*/


/**
 * Detects publisher-side free or open access on the current page using site-specific logic.
 * Checks ~15 publisher platforms including Ingenta, IEEE, SAGE, Wiley, Springer, and preprint servers.
 * @returns {Promise<{isFree: boolean, url: string, labelText: string}>}
 */
async function findFreeAccess() {
  return new Promise(async resolve => {

    const host = window.location.hostname;
    const path = window.location.pathname;
    const generator = getMeta('Generator');
    let freeAccessResponse = {
      isFree: false,
      url: '',
      labelText: ''
    };

    if (host.indexOf('ingentaconnect') > -1) {
      freeAccessResponse = doIngentaConnect();
    } else if (host.indexOf('base-search.net') > -1 && window.location.href.indexOf('/Record/') > -1) {
      freeAccessResponse = doBaseSearch();
    } else if (host.indexOf('ieeexplore.ieee.org') > -1) {
      freeAccessResponse = doIEEExplore();
    } else if (host.indexOf('journals.sagepub.com') > -1 && path.indexOf('doi') > -1) {
      freeAccessResponse = doSagePub();
    } else if (host.indexOf('academic.oup.com') > -1) {
      freeAccessResponse = doOup();
    } else if (host.indexOf('bmj.com') > -1) {
      freeAccessResponse = doBmj();
    } else if (host.indexOf('cambridge.org') > -1) {
      freeAccessResponse = doCambridge();
    } else if (host.indexOf('onlinelibrary.wiley.com') > -1 && path.indexOf('doi') > -1) {
      freeAccessResponse = doWiley();
    } else if (host.indexOf('link.springer.com') > -1 && path.indexOf('article') > -1) {
      freeAccessResponse = doSpringerLink();
    } else if (host.indexOf('tandfonline.com') > -1 && path.indexOf('/doi/full/') > -1){
      freeAccessResponse = doTandFOnline();
    } else if (document.location.href.indexOf('www.biorxiv.org') > -1 || document.location.href.indexOf('www.medrxiv.org') > -1) {
      freeAccessResponse = await doBioMedArxiv();
    } else if (
      document.location.href.indexOf('osf.io/preprints') > -1 ||
      document.location.href.indexOf('engrxiv.org/') > -1 ||
      document.location.href.indexOf('biohackrxiv.org/') > -1 ||
      document.location.href.indexOf('ecsarxiv.org') > -1 ||
      document.location.href.indexOf('frenxiv.org/') > -1 ||
      document.location.href.indexOf('mediarxiv.org/') > -1
      ) {
        freeAccessResponse = await doOSFArxiv();
      } else if (document.location.href.indexOf('arxiv.org') > -1) {
        freeAccessResponse = await doArxivOrg();
      } else if (document.location.href.indexOf('ascopubs.org') > -1) {
        freeAccessResponse = await ascopubs();
      }
      resolve(freeAccessResponse);
    });
  }


  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doIngentaConnect() {
    // Ingenta Connect
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };
      const fulltextLink = document.querySelectorAll('a.fulltext.pdf')[0];
      if (document.querySelectorAll("span.access-icon img[alt='Open Access']").length > 0 && fulltextLink != undefined) {
        const onclick = fulltextLink.getAttribute('onclick');
        if (onclick != null && onclick != '' && onclick.indexOf('javascript') > -1) {
          const href = onclick.replace("javascript:popup('", '').replace("','downloadWindow','900','800')", '');
          if (href != null && href != '') {
            var url = `${window.location.protocol}//${host}${href}`;
            freeAccessResponse.isFree = true;
            freeAccessResponse.url = url;
            freeAccessResponse.labelText = 'Free Access';
          }
        }
        else {
          const { popup } = fulltextLink.dataset;
          if (popup != null && popup != '' && popup.indexOf('download') > -1) {
            if (popup != null && popup != '') {
              var url = `${window.location.protocol}//${host}${popup}`;
              freeAccessResponse.isFree = true;
              freeAccessResponse.url = url;
              freeAccessResponse.labelText = 'Free Access';
            }
          }
        }
      }
      resolve(freeAccessResponse);
    });
  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doBmj() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };

      const bmjFreeAccessClass = 'highwire-access-icon highwire-access-icon-user-access user-access bmjj-free bmjj-free-access bmjj-access-tag';
      const pdf = getMeta('citation_pdf_url');

      if (document.querySelectorAll('svg.icon-open-access').length > 0) {
        if (pdf != '' && pdf.indexOf('http') == 0) {
          freeAccessResponse.isFree = true;
          freeAccessResponse.url = pdf;
          freeAccessResponse.labelText = 'Open Access';
        }
      } else if (document.getElementsByClassName(bmjFreeAccessClass).length > 0) {
        const freeAccess = document.getElementsByClassName(bmjFreeAccessClass);
        const bmjFree = false;
        for (let i = 0; i < freeAccess.length; i++) {
          if (freeAccess[i].textContent == 'Free' && !bmjFree) {
            freeAccessResponse.isFree = true;
            freeAccessResponse.url = pdf;
            freeAccessResponse.labelText = 'Free Access';
          }
        }
      }
      resolve(freeAccessResponse);
    });
  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doBaseSearch() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };
      if (document.querySelectorAll("img.pull-right[alt='Open Access']").length > 0) {
        freeAccessResponse = webscraperBadge('a.link-gruen.bold');
      }
      resolve(freeAccessResponse);
    });

  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doIEEExplore() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };
      if (document.querySelectorAll('i.icon-access-open-access').length > 0) {
        freeAccessResponse = webscraperBadge('a.doc-actions-link.stats-document-lh-action-downloadPdf_2');
      }
      resolve(freeAccessResponse);
    });
  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doSagePub() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };
      if (document.querySelectorAll('img.accessIcon.freeAccess').length > 0) {
        freeAccessResponse = webscraperBadge('a[data-item-name="download-PDF"]');
      }
      else if (document.querySelectorAll('img.accessIcon.openAccess').length > 0) {
        freeAccessResponse = webscraperBadge('div.pdf-access>a');
      }
      else if (document.querySelectorAll('.meta-panel__access.meta-panel__access--free').length > 0) {
        freeAccessResponse = webscraperBadge('a[data-id="article-toolbar-pdf-epub"]');
      }
      resolve(freeAccessResponse);
    });
  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doOup() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };
      if (document.querySelectorAll('i.icon-availability_free').length > 0) {
        freeAccessResponse = webscraperBadge('a.article-pdfLink');
      }
      resolve(freeAccessResponse);
    });
  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doCambridge() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };

      if (document.querySelectorAll('span.entitled').length > 0) {
        const pdf = getMeta('citation_pdf_url');
        if (pdf != '' && pdf.indexOf('http') == 0) {
          freeAccessResponse.isFree = true;
          freeAccessResponse.url = pdf;
          freeAccessResponse.labelText = 'Free / Subscription Access';
        }
      }
      resolve(freeAccessResponse);
    });

  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doWiley() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };

      const toCheck = document.querySelectorAll('div.article-citation > div > div.doi-access-container.clearfix > div > div');
      const toCheck2 = document.getElementById('pdf-iframe');
      if (toCheck.length > 0 && toCheck[0].innerHTML.indexOf('Free Access') > -1) {
        if (toCheck2 === null) {
          const pdf = getMeta('citation_pdf_url');
          freeAccessResponse.isFree = true;
          freeAccessResponse.url = pdf;
          freeAccessResponse.labelText = 'Free Access';
        }
      }
      resolve(freeAccessResponse);
    });
  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doSpringerLink() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };

      const toCheck = document.querySelectorAll('div.download-article');
      if (toCheck.length > 0 && toCheck[0].innerHTML.indexOf('Download') > -1) {
        const pdf = getMeta('citation_pdf_url');
        freeAccessResponse.isFree = true;
        freeAccessResponse.url = pdf;
        freeAccessResponse.labelText = 'Free / Subscription Access';
      }
      resolve(freeAccessResponse);
    });

  }

  /** @returns {Promise<{isFree: boolean, url: string, labelText: string}>} */
  async function doTandFOnline(){
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };

      const toCheck = document.querySelectorAll('div.accessIconLocation');
      if (toCheck.length > 0 && toCheck[0].alt == 'Open access' && getMeta('citation_fulltext_world_readable').length > 0){
        freeAccessResponse.isFree = true;
        freeAccessResponse.url = window.location.href;
        freeAccessResponse.labelText = 'Open Access';
      }
      resolve(freeAccessResponse);
    });
  }

  /**
   * Extracts a PDF/article href from the given CSS selector for free-access badge injection.
   * @param {string} selector - CSS selector pointing to the download link element.
   * @returns {{isFree: boolean, url: string, labelText: string}}
   */
  function webscraperBadge(selector) {
    let freeAccessResponse = {
      isFree: false,
      url: '',
      labelText: ''
    };

    const selected = document.querySelectorAll(selector);
    if (selected.length == 0) {
      return freeAccessResponse;
    }
    const { href } = document.querySelectorAll(selector)[0];
    if (href != null && href != '') {
      const message = new Array();
      freeAccessResponse.isFree = true;
      freeAccessResponse.url = href;
      freeAccessResponse.labelText = 'Free Access (*)';
    }
    return freeAccessResponse;
  }

  /** Detects preprint availability on bioRxiv/medRxiv; uses 2000ms delay for dynamic content.
   * @returns {Promise<{isFree: boolean, url: string, labelText: string}>}
   */
  async function doBioMedArxiv() {
    return new Promise(resolve => {
      setTimeout(() => {
        let freeAccessResponse = {
          isFree: false,
          url: '',
          labelText: ''
        };
        const possibleDocs = document.getElementsByClassName('article-dl-pdf-link link-icon');
        if (possibleDocs.length > 0) {
          for (const link of possibleDocs) {
            const href = link.getAttribute('href');
            if (href.indexOf('pdf') > -1) {
              const url = `${window.location.protocol}//${window.location.hostname}${href}`;
              freeAccessResponse.isFree = true;
              freeAccessResponse.url = url;
              freeAccessResponse.labelText = 'Preprint Server';
            }
          }
        }
        resolve(freeAccessResponse);
      }, 2000);
    });
  }

  /** Detects preprint availability on arXiv.org; uses 2000ms delay for dynamic content.
   * @returns {Promise<{isFree: boolean, url: string, labelText: string}>}
   */
  async function doArxivOrg() {
    return new Promise(resolve => {
      setTimeout(() => {
        let freeAccessResponse = {
          isFree: false,
          url: '',
          labelText: ''
        };
        const possibleDocs = document.getElementsByClassName('abs-button download-pdf');
        if (possibleDocs.length > 0) {
          for (const link of possibleDocs) {
            const href = link.getAttribute('href');
            if (href.indexOf('pdf') > -1) {
              // I am on Open Access
              const url = `${window.location.protocol}//${window.location.hostname}${href}`;
              freeAccessResponse.isFree = true;
              freeAccessResponse.url = url;
              freeAccessResponse.labelText = 'Preprint Server';
            }
          }
        }
        resolve(freeAccessResponse);
      }, 2000);
    });
  }

  /** Detects preprint availability on OSF and affiliated preprint servers; uses 2000ms delay.
   * @returns {Promise<{isFree: boolean, url: string, labelText: string}>}
   */
  async function doOSFArxiv() {
    return new Promise(resolve => {
      let freeAccessResponse = {
        isFree: false,
        url: '',
        labelText: ''
      };

      setTimeout(() => {

        const classArray = ['btn btn-primary p-v-xs', 'btn btn-primary p-v-xsf', 'pdf-download-link'];
        classArray.forEach(className => {
          const possibleDocs = document.getElementsByClassName(className);
          if (possibleDocs.length > 0) {
            for (const link of possibleDocs) {
              const href = link.getAttribute('href');
              if (href.indexOf('download') > -1) {
                // I am on Open Access
                const url = `${href}`;
                freeAccessResponse.isFree = true;
                freeAccessResponse.url = url;
                freeAccessResponse.labelText = 'Preprint Server';
              }
            }
          }
        });
        resolve(freeAccessResponse);
      }, 2000);
    });
  }

  /** Detects open access on ASCO Publications via icon class presence; uses 1000ms delay.
   * @returns {Promise<{isFree: boolean, url: string, labelText: string}>}
   */
  async function ascopubs() {
    return new Promise(resolve => {
      setTimeout(() => {
        let freeAccessResponse = {
          isFree: false,
          url: '',
          labelText: ''
        };
        const classArray = ['icon-open_access', 'icon-lock_open'];
        classArray.forEach(className => {
          const possibleDocs = document.getElementsByClassName(className);
          if (possibleDocs.length > 0) {
                // I am on Open Access
                const url = `${window.location.href}`;
                freeAccessResponse.isFree = true;
                freeAccessResponse.url = url;
                freeAccessResponse.labelText = possibleDocs[0].getAttribute('title') ?? 'Free Access';
          }
        })
        resolve(freeAccessResponse);
      }, 1000);
    });
  }

  /**
  *
  *  support Proxy
  *
  */

  /**
   * Determines whether to proxy the current URL through the institution's proxy.
   * Uses the supportedDomains list when a domainurl is configured; otherwise proxies all URLs.
   * Constructs OpenAthens URLs with encodeURIComponent, EZProxy URLs with plain concatenation.
   * @param {string} currenturl - The URL to evaluate.
   * @returns {{toProxy: boolean, prefix: string, proxiedUrl: string}}
   */
  function shouldProxy(currenturl) {
    let returnValue = {
      toProxy: false,
      prefix: '',
      proxiedUrl: ''
    };
    returnValue['toProxy'] = false;
    if (oahelper.configuration.domainurl == undefined || oahelper.configuration.domainurl == "undefined" || oahelper.configuration.domainurl == '') {
      returnValue.toProxy = true;
      returnValue.prefix = oahelper.configuration.url;
      if (oahelper.configuration.url != undefined && oahelper.configuration.url != '' && (oahelper.configuration.url.includes("go.openathens.net") || oahelper.configuration.url.includes("qurl="))) {
        returnValue.proxiedUrl = oahelper.configuration.url + encodeURIComponent(currenturl);
      }
      else {
        returnValue.proxiedUrl = oahelper.configuration.url + currenturl;
      }
    }
    else{
      oahelper.configuration.supportedDomains.forEach(function(a){
        //  console.log(a);
        if (typeof(a) == 'string' && currenturl.indexOf(a)>-1) {
          returnValue.toProxy = true;
          returnValue.prefix = oahelper.configuration.url;
          if (oahelper.configuration.url != undefined && oahelper.configuration.url != '' && (oahelper.configuration.url.includes("go.openathens.net") || oahelper.configuration.url.includes("qurl="))) {
            returnValue.proxiedUrl = oahelper.configuration.url + encodeURIComponent(currenturl);
          }
          else {
            returnValue.proxiedUrl = oahelper.configuration.url + currenturl;
          }
        }
      });
    }
    return(returnValue);
  }

  /**
  *
  * Function to support check Access Options
  *
  */

  /**
   * Queries the Unpaywall API via background message for an open access version.
   * @param {string[]} doi - DOI array; first element is used.
   * @returns {Promise<{source: string, isOA: boolean, url: string, version: string, doi: string}>}
   */
  async function checkUnpaywall(doi) {
    let cleanedDOI = doi[0];

    return new Promise(resolve => {
      var unpaywall = {
        source: 'unpaywall.org',
        enabled: true,
        isOA: false,
        url: '',
        version: '',
        title: 'Open Access Version found from unpaywall.org',
        doi: cleanedDOI
      };
      if(doi.length == 0) {
        resolve(unpaywall);
      }
      else {
        const mode = 'unpaywall';
        chrome.runtime.sendMessage({ mode, cleanedDOI }, (response) => {
          if (response.data.is_oa && response.data.best_oa_location != null) {
            unpaywall.url = response.data.best_oa_location.url;
            unpaywall.isOA = true;
            unpaywall.version = response.data.best_oa_location.version ?? "Unpaywall.org";
          }
          resolve(unpaywall);
        });
      }
    });
  }

  /**
   * Queries the EBSCO API via background for subscription access availability.
   * Only runs when an EBSCO CustomGroup profile ID is configured.
   * @param {string[]} doi - DOI array; first element is used.
   * @returns {Promise<{source: string, isAvailable: boolean, url: string, doi: string}>}
   */
  async function checkEBSCO(doi) {
    return new Promise(resolve => {
      let cleanedDOI = doi[0];
      let ebsco_cgp = oahelper.configuration.ebsco_cgp;
      let ebscoData = {
        source: 'ebsco',
        enabled: false,
        isAvailable: false,
        url: '',
        doi: cleanedDOI
      };
      const mode = 'ebsco';
      if(oahelper.configuration != null && doi.length != 0 && oahelper.configuration.ebsco_cgp != undefined && oahelper.configuration.ebsco_cgp != 'unset'){
        ebscoData.enabled = true;
        chrome.runtime.sendMessage({ mode, cleanedDOI, ebsco_cgp }, (response) => {
          if(response.data.link != undefined) {
            ebscoData.isAvailable = true;
            ebscoData.url = response.data.link;
          }
          resolve(ebscoData);
        });
      }
      else {
        resolve(ebscoData);
      }
    });
  }

  /**
   * Queries OpenCitations via background for the citation count.
   * @param {string[]} doi - DOI array; first element is used.
   * @returns {Promise<{source: string, enabled: boolean, citationCount: number, url: string}>}
   */
  async function checkOpenCitations(doi) {
    const cleanedDOI = doi[0];
    let openCitations = {
      source: 'opencitations',
      enabled: false,
      citationCount: 0,
      doi: cleanedDOI,
      url: ''
    }
    return new Promise(resolve => {
      if (oahelper.configuration.opencitation == undefined || oahelper.configuration.opencitation != undefined && oahelper.configuration.opencitation) {
        const mode = 'citationcount';
        chrome.runtime.sendMessage({ mode, cleanedDOI }, (response) => {
          if (response.citationCount != undefined && response.citationCount > 0) {
            openCitations.enabled = true;
            openCitations.citationCount = response.citationCount;
            openCitations.url = `https://www.oahelper.org/opencitations/?doi=${cleanedDOI}`;
          }
          resolve(openCitations);
        });
      }
      else {
        resolve(openCitations);
      }
    });
  }

  /**
   * Queries OpenAlex via background for the citation count when the feature is enabled.
   * @param {string[]} doi - DOI array; first element is used.
   * @returns {Promise<{source: string, enabled: boolean, citationCount: number, url: string}>}
   */
  async function checkOpenAlexCitation(doi) {
    const cleanedDOI = doi[0];
    let openAlexCitations = {
      source: 'openalexcitation',
      enabled: false,
      citationCount: 0,
      doi: cleanedDOI,
      url: ''
    }
    return new Promise(resolve => {
      if (oahelper.configuration.openalexcitation != undefined && oahelper.configuration.openalexcitation) {
        const mode = 'openalexcitation';
        chrome.runtime.sendMessage({ mode, cleanedDOI }, (response) => {
          if (response.citationCount != undefined && response.citationCount > 0) {
            openAlexCitations.enabled = true;
            openAlexCitations.citationCount = response.citationCount;
            openAlexCitations.url = `https://www.oahelper.org/openalexcitationcounts/?bdoi=${createPayload(cleanedDOI)}`;
          }
          resolve(openAlexCitations);
        });
      }
      else {
        resolve(openAlexCitations);
      }
    });
  }

/**
 * Creates a time-stamped, token-signed Base64 payload used to construct the OpenAlex citation URL.
 * @param {string} doi - The DOI to encode.
 * @returns {string} Base64-encoded JSON payload.
 */
function createPayload(doi) {
  const token = "l6sNUJ3Knh";        // your token constant
  const timestamp = Math.floor(Date.now() / 1000); // current Unix timestamp in seconds

  const payload = {
    doi,
    token,
    timestamp
  };

  const jsonString = JSON.stringify(payload);

  // Base64 encode (works in browser environments)
  const base64Encoded = btoa(jsonString);
  return base64Encoded
}

  /**
   * Queries RetractionWatch via background to check whether the article has been retracted.
   * @param {string[]} doi - DOI array; first element is used.
   * @returns {Promise<{source: string, is_retracted: boolean, label: string, url: string, urls: string[], reasons: string[]}>}
   */
  async function checkRetractionWatch(doi) {
    const cleanedDOI = doi[0];

    let retractionWatch = {
      source: 'retractionWatch',
      enabled: false,
      is_retracted: false,
      doi: cleanedDOI,
      url: '',
      label: '',
      urls: [],
      reasonsons: []
    }
    return new Promise(resolve => {
      if (oahelper.configuration != null && oahelper.configuration.retractionwatch) {
        const mode = 'retractionwatch';
        chrome.runtime.sendMessage({ mode, cleanedDOI }, (response) => {
          if (response.data.is_retracted != undefined && response.data.is_retracted) {
            retractionWatch.enabled = true;
            retractionWatch.is_retracted = response.data.is_retracted;
            retractionWatch.label = response.data.label ?? 'Retraction';
            retractionWatch.url = response.data.urls[0] ?? `https://www.otzberg.net/retractionwatch/index.php?doi=${cleanedDOI}`;
            retractionWatch.urls = response.data.urls;
            retractionWatch.reasons = response.data.reasons;
          }
          resolve(retractionWatch);
        });
      }
      else {
        resolve(retractionWatch);
      }
    });
  }

  /**
   * Builds an ILL (Interlibrary Loan) request URL by appending the DOI to the configured ILL prefix.
   * @param {string[]} doi - DOI array; first element is used.
   * @returns {Promise<{source: string, enabled: boolean, url: string}>}
   */
  function makeIll(doi) {
    const cleanDOI = doi[0];
    let ill = {
      source: 'ill',
      enabled: false,
      doi: cleanDOI,
      url: ''
    };
    return new Promise(resolve => {
      if (oahelper.configuration.ill && oahelper.configuration.illurl != ''){
        ill.enabled = true;
        ill.url =  `${oahelper.configuration.illurl}${cleanDOI}`;
      }
      resolve(ill);
    });
  }


  /****
  *
  * inject the Open Access or Subscription Buttons
  *
  */

  /**
   * Selects the highest-priority access result and injects the appropriate badge into the page.
   * Priority: EBSCO subscription > Unpaywall OA > free access > ILL request.
   * Important to know that EBSCO will not be searched if unpaywall had a response already
   */
  async function processAccessData() {
    if(oahelper.hideAlternativeAccess){
      return;
    }
    oahelper.currentUrl = location.href;
    let message =  {
      version: '',
      url: '',
      title: '',
      source: '',
      doi: ''
    };
    // I need to determine the rules under which to show this badge
    if(oahelper.subscriptionAccess.ebsco != undefined && oahelper.subscriptionAccess.ebsco.isAvailable){
      message.version = 'subscription';
      message.url = oahelper.subscriptionAccess.ebsco.url;
      message.title = 'Access through your institution\'s subscription';
      message.source = 'EBSCOhost';
      message.doi = oahelper.subscriptionAccess.ebsco.doi;
      injectSubscriptionBadge(message);
    }
    else if(oahelper.alternativeAccess.unpaywall.isOA) {
      message.version = oahelper.alternativeAccess.unpaywall.version;
      message.url = oahelper.alternativeAccess.unpaywall.url;
      message.title = oahelper.alternativeAccess.unpaywall.title;
      message.source = oahelper.alternativeAccess.unpaywall.source;
      message.doi = oahelper.alternativeAccess.unpaywall.doi;
      injectAccessBadge(message);
    }
    else if(oahelper.freeAccess.isFree != undefined && oahelper.freeAccess.isFree && oahelper.freeAccess.url != '') {
      message.version = oahelper.freeAccess.labelText;
      message.url = oahelper.freeAccess.url;
      message.title = oahelper.freeAccess.labelText;
      message.source = oahelper.freeAccess.labelText;
      message.doi = ''
      injectAccessBadge(message);
    }
    else {
      requestDocument();
    }

  }

  /**
   * Injects the orange/green OA access badge div into the page DOM and updates the toolbar icon.
   * @param {{version: string, url: string, title: string, source: string, doi: string}} message
   */
  function injectAccessBadge(message) {
    if(message.version == ''){
      return;
    }
    // here we inject the icon into the page
    const src = chrome.runtime.getURL('images/opensaysme.svg'); // padlock
    const oaVersionString = makeOaVersion(message.version);

    let oaVersion = '';
    if (oaVersionString != '') {
      oaVersion = ` - OA Version: ${oaVersionString}`;
    }


    const badgeTitle = `${message.title}${oaVersion} | Location: ${message.url}`;
    const div = document.createElement('div');
    div.appendChild(buildBadgeContent({
      innerId: 'oahelper_open1',
      innerClass: 'oahelper_doifound',
      innerTitle: badgeTitle,
      innerDataset: { url: message.url },
      imgId: 'oahelper_doicheckmark',
      imgSrc: src,
      imgTitle: badgeTitle,
      imgDataset: { oaurl: message.url, badge: 'open-access-found', doi: message.doi },
      msgId: 'oahelper_oahelpmsg',
      msgText: oaVersionString,
      liveRegionId: 'oahelper_LiveRegion',
    }));
    div.id = 'oahelper_doifound_outer';
    div.className = 'oahelper_doifound_outer';
    if (oahelper.configuration.nobadge) {
      div.className = 'oah_hidden';
    }

    if (document.body.parentNode.parentNode != '#document') {
      document.body.appendChild(div);
      //doOaHelperLiveRegion(message.title);
      const element = document.getElementById('oahelper_open1');
      element.addEventListener("click", oahelper_open1, false);
      recordStat('badge_oa_shown');
    }

    if(oaVersionString == 'Free Access (*)') {
      chrome.runtime.sendMessage({ mode: 'setGreenIcon' }, (response) => {
        // console.log(response);
      });
    }

  }

  /**
   * Injects the EBSCO subscription access badge into the page DOM and sets the toolbar icon to EBSCO blue.
   * @param {{version: string, url: string, title: string, source: string, doi: string}} message
   */
  function injectSubscriptionBadge(message) {
    if(message.version == ''){
      return;
    }
    // here we inject the icon into the page
    const src = chrome.runtime.getURL('images/ebsco_e.svg'); // EBSCO E

    const badgeTitle = `${message.title} | Location: ${message.url}`;
    const div = document.createElement('div');
    div.appendChild(buildBadgeContent({
      innerId: 'oahelper_ebsco',
      innerClass: 'oahelper_doifound',
      innerTitle: badgeTitle,
      innerDataset: { url: message.url },
      imgId: 'oahelper_doicheckmark',
      imgSrc: src,
      imgTitle: badgeTitle,
      imgDataset: { oaurl: message.url, badge: 'ebsco-subscription', doi: message.doi },
      msgId: 'oahelper_oahelpmsg',
      msgText: translateOAHelper('ebsco_access'),
      liveRegionId: 'oahelper_LiveRegion',
    }));
    div.id = 'oahelper_doifound_outer';
    div.className = 'oahelper_doifound_outer ebsco_badge';
    if (oahelper.configuration.nobadge) {
      div.className = 'oah_hidden';
    }

    if (document.body.parentNode.parentNode != '#document') {
      document.body.appendChild(div);
      //doOaHelperLiveRegion(message.title);
      const element = document.getElementById('oahelper_ebsco');
      element.addEventListener("click", oahelper_ebsco, false);
      recordStat('badge_ebsco_shown');
    }

    chrome.runtime.sendMessage({ mode: 'setEBSCOicon' }, (response) => {
      // console.log(response);
    });

  }

  /**
   * Translates a raw OA version string (e.g. 'publishedVersion') to a display label via i18n.
   * @param {string} version - Raw version string from Unpaywall.
   * @returns {string} Translated version label, or the original string if no translation exists.
   */
  function makeOaVersion(version) {
    const translation = translateOAHelper(`content_version_${version}`);
    if (translation.length == 0) {
      return version;
    }
    return translation;
  }

  /** Click handler for the OA badge; opens the OA URL in a new tab via the background script. */
  function oahelper_open1() {
    recordStat('badge_oa_clicked');
    const element = document.getElementById('oahelper_open1');
    const url = element.dataset.url;
    chrome.runtime.sendMessage({ mode: 'openTab', url }, (response) => {
      // console.log(response);
    });
  }

  /** Click handler for the EBSCO badge; opens the EBSCO URL via the background script. */
  function oahelper_ebsco() {
    recordStat('badge_ebsco_clicked');
    const element = document.getElementById('oahelper_ebsco');
    const url = element.dataset.url;
    chrome.runtime.sendMessage({ mode: 'openEBSCO', url }, (response) => {
      // console.log(response);
    });
  }

  /***
  *
  * Handle Citation Button
  *
  */

  /**
   * Injects the citation count badge (OpenCitations or OpenAlex) into the page DOM.
   * OpenCitations takes precedence; OpenAlex is used as a fallback when configured.
   */
  function addCitationCount() {
    let source = "";
    let title = "";
    let badge = "";
    let doi = "";
    let count = 0;
    let url = "";
    let src = "";
    if (oahelper.addOnFeatures.opencitations.enabled) {
      source = "opencitations";
      title = "OpenCitations";
      badge = "opencitations";
      doi = oahelper.addOnFeatures.opencitations.doi;
      count = oahelper.addOnFeatures.opencitations.citationCount;
      url = `https://www.oahelper.org/opencitations/?doi=${doi}`;
      src = chrome.runtime.getURL('images/ocicon.svg');
    }
    else if(oahelper.addOnFeatures.openalexcitation.enabled){
      source = "openalexcitation";
      title = "OpenAlex Citations";
      badge = "openalex-citations";
      doi = oahelper.addOnFeatures.openalexcitation.doi;
      count = oahelper.addOnFeatures.openalexcitation.citationCount;
      url = `https://www.oahelper.org/openalexcitationcounts/?bdoi=${createPayload(doi)}`;
      src = chrome.runtime.getURL('images/oacicon.png');
    }

    if(count == 0){
      return;
    }

    const message = `${translateOAHelper('content_times_cited')} ${count}`;
    const div = document.createElement('div');

    div.appendChild(buildBadgeContent({
      innerClass: `oahelper_${source}`,
      innerTitle: `${title} ${message}`,
      imgId: `oahelper_${source}_logo`,
      imgSrc: src,
      imgTitle: message,
      imgDataset: { citcount: count, oaurl: url, badge },
      msgId: `oahelper_${source}_msg`,
      msgText: message,
      liveRegionId: `oahelper_${source}_LiveRegion`,
    }));
    div.id = `oahelper_${source}_outer`;
    div.className = `oahelper_${source}_outer`;
    if (oahelper.configuration.nobadge) {
      div.className = 'oah_hidden';
    }

    if (document.body.parentNode.parentNode != '#document') {
      document.body.appendChild(div);
      div.querySelector(`div.oahelper_${source}`).addEventListener('click', () => {
        recordStat('badge_citation_clicked');
        window.open(url);
      });
      recordStat('badge_citation_shown');
    }
  }

  /***
  *
  * Handle RetractionWatch
  *
  */

  /** Injects the RetractionWatch warning badge into the page DOM if the article is retracted. */
  function addRetractionWatch() {
    const doi = oahelper.addOnFeatures.retractionwatch.doi ?? '';
    const is_retracted = oahelper.addOnFeatures.retractionwatch.is_retracted ?? false;
    const label = oahelper.addOnFeatures.retractionwatch.label ?? '';

    // if not retracted, if bad response, do not show the badge
    if(!is_retracted){
      return;
    }

    let url = `https://www.otzberg.net/retractionwatch/index.php?doi=${doi}`;
    if(oahelper.addOnFeatures.retractionwatch.urls.length > 0){
      url = oahelper.addOnFeatures.retractionwatch.urls[0];
    }
    const message = `${label}`;
    const src = chrome.runtime.getURL('images/oa_retraction_watch.svg');
    const div = document.createElement('div');

    div.appendChild(buildBadgeContent({
      innerClass: 'oahelper_retractionwatch',
      innerTitle: `retractionwatch: ${message}`,
      imgId: 'oahelper_retractionwatch_logo',
      imgSrc: src,
      imgTitle: message,
      imgDataset: { oaurl: url, badge: 'retraction-watch' },
      msgId: 'oahelper_retractionwatch_msg',
      msgText: message,
      liveRegionId: 'oahelper_retractionwatch_LiveRegion',
    }));
    div.id = 'oahelper_retractionwatch_outer';
    div.className = 'oahelper_retractionwatch_outer';
    if (oahelper.configuration.nobadge) {
      div.className = 'oah_hidden';
    }

    if (document.body.parentNode.parentNode != '#document') {
      document.body.appendChild(div);
      div.querySelector('div.oahelper_retractionwatch').addEventListener('click', () => {
        recordStat('badge_rw_clicked');
        window.open(url);
      });
      recordStat('badge_rw_shown');
    }
  }

  /***
   *
   * Handle Ask the Library Button
   *
   */

  /**
   * Injects an ILL (Interlibrary Loan) request button when no OA version is found.
   * Skipped on preprint servers and when ILL is not configured by the institution.
   */
  function requestDocument() {
    const doi = oahelper.doi;
    let isPreprint = false;
    preprintServers.forEach((server) => {
      if (document.location.href.indexOf(server) > -1) {
        isPreprint = true;
      }
    });

    if (isPreprint) {
      return;
    }

    if (!oahelper.configuration.ill) {
      return;
    }

    if(doi == '') {
      return;
    }

    const src = chrome.runtime.getURL('images/ask.svg'); // padlock
    const oabUrl = oahelper.alternativeAccess.ill.url;
    const message = translateOAHelper('content_ill_001');
    const usermsg = translateOAHelper('content_ill_002');
    const databadge = 'ill-request';

    const div = document.createElement('div');
    div.appendChild(buildBadgeContent({
      innerClass: 'oahelper_doifound',
      innerTitle: message,
      imgId: 'oahelper_doicheckmark',
      imgSrc: src,
      imgTitle: message,
      imgDataset: { oaurl: oabUrl, badge: databadge, doi },
      msgId: 'oahelper_oahelpmsg',
      msgText: usermsg,
      liveRegionId: 'oahelper_LiveRegion',
    }));
    div.id = 'oahelper_doifound_outer';
    div.className = 'oahelper_doifound_outer oahelper_doiblue';
    if (oahelper.configuration.nobadge) {
      div.className = 'oah_hidden';
    }

    if (document.body.parentNode.parentNode != '#document') {
      document.body.appendChild(div);
      div.querySelector('div.oahelper_doifound').addEventListener('click', () => {
        recordStat('badge_ill_clicked');
        window.open(oabUrl);
      });
      recordStat('badge_ill_shown');
    }

    chrome.runtime.sendMessage({ mode: 'setBlueIcon' }, (response) => {
      // console.log(response);
    });

  }

  /** Registers the content script's runtime message listener for popup, getBadge, and hidebadges requests. */
  function addMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if(request.mode == undefined){
        return true;
      }
      switch (request.mode) {
        case 'getBadge':
          sendResponse({ mode: 'getBadgeResponse', badge: getBadge() });
          return true;
        case 'popup':
          let configuration = oahelper.configuration
          sendResponse({ mode: 'popupAnswer', data: getPopupAnswer(), configuration });
          return true;
        case 'hidebadges':
          hideBadgeRequest();
          sendResponse({ mode: 'badgehidden' });
          return true;
        default:
          return true;
      }
    });
  }


  /**
   * Assembles the full oahelper state object sent back to the popup on request.
   * @returns {{oaurl: string, oastatus: string, suburl: string, substatus: boolean, citationsource: string, citationcount: number, citationurl: string, currenturl: string, illUrl: string, doi: string, shouldProxy: boolean, rw_label: string, rw_url: string, disabledOnDomain: boolean, isAtOpenAccessLocation: boolean}}
   */
  function getPopupAnswer() {
    let doi = '';
    if (oahelper.doi[0] != undefined) {
      doi = oahelper.doi[0];
    }
    let response = {
      oaurl: '',
      oastatus: '',
      suburl: '',
      substatus: false,
      citationsource: '',
      citationcount: 0,
      citationurl: '',
      currenturl: window.location.href,
      illUrl: '',
      doi: doi,
      shouldProxy: false,
      rw_label: '',
      rw_url: '',
      disabledOnDomain: oahelper.isDisabledOnDomain,
      isAtOpenAccessLocation: oahelper.isAtOpenAccessLocation
    };

    // unpaywall > freeAccess
    if (oahelper.alternativeAccess.unpaywall != undefined && oahelper.alternativeAccess.unpaywall.isOA) {
      response.oaurl = oahelper.alternativeAccess.unpaywall.url;
      response.oastatus = makeOaVersion(oahelper.alternativeAccess.unpaywall.version);
    }
    else if (oahelper.freeAccess.isFree != undefined && oahelper.freeAccess.isFree){
      response.oaurl = oahelper.freeAccess.url;
      response.oastatus = oahelper.freeAccess.labelText;
    }
    // subscription access - right now only EBSCO
    if (oahelper.subscriptionAccess.ebsco != undefined && oahelper.subscriptionAccess.ebsco.enabled && oahelper.subscriptionAccess.ebsco.isAvailable) {
      response.suburl = oahelper.subscriptionAccess.ebsco.url;
      response.substatus = oahelper.subscriptionAccess.ebsco.source;
    }
    // opencitations
    if (oahelper.addOnFeatures.opencitations != undefined && oahelper.addOnFeatures.opencitations.url != '') {
      response.citationurl = oahelper.addOnFeatures.opencitations.url;
      response.citationsource = 'opencitations';
    }

    if (oahelper.addOnFeatures.opencitations != undefined && oahelper.addOnFeatures.opencitations.citationCount > 0) {
      response.citationcount = oahelper.addOnFeatures.opencitations.citationCount;
    }

    // openalexcitation
    if (oahelper.addOnFeatures.openalexcitation != undefined && oahelper.addOnFeatures.openalexcitation.url != '') {
      response.citationurl = oahelper.addOnFeatures.openalexcitation.url;
      response.citationsource = 'openalexcitation';
    }

    if (oahelper.addOnFeatures.openalexcitation != undefined && oahelper.addOnFeatures.openalexcitation.citationCount > 0) {
      response.citationcount = oahelper.addOnFeatures.openalexcitation.citationCount;
    }

    // ILL form
    if (oahelper.alternativeAccess.ill != undefined && oahelper.alternativeAccess.ill.url != '') {
      response.illUrl = oahelper.alternativeAccess.ill.url;
    }
    // should offer a proxy button?
    if(oahelper.shouldExtProxy.toProxy != undefined && oahelper.shouldExtProxy.toProxy) {
      response.shouldProxy = true;
    }
    // retraction watch
    if (oahelper.addOnFeatures.retractionwatch != undefined && oahelper.addOnFeatures.retractionwatch.is_retracted) {
      response.rw_label = oahelper.addOnFeatures.retractionwatch.label;
      response.rw_url = oahelper.addOnFeatures.retractionwatch.url;
    }
    return response;
  }

  /**
   * Checks whether the current page URL is itself an OA location and turns the badge green if so.
   * Delegates URL comparison to the background via the followUrl message to handle redirects.
   */
  function onAccessLocation() {
    // if we are on free access, turn icon green right away
    if(oahelper.freeAccess.isFree) {
      onOpenAccess(oahelper.freeAccess.labelText);
      return;
    }
    // if there is no Open Access, nothing to make green
    if(!oahelper.alternativeAccess.unpaywall.isOA) {
      return;
    }
    const mode 		= 'followUrl';
    let targetUrl = oahelper.alternativeAccess.unpaywall.url;

    const currentUrl 	= window.location.href;
    chrome.runtime.sendMessage({ mode, currentUrl, targetUrl }, (response) => {
      if (response.ona != undefined && response.ona == true) {
        // the current location is Open Access
        onOpenAccess(translateOAHelper('content_onoa_001'));
      }
    });

  }

  /**
   * Switches the injected badge to the checkmark variant to indicate the user is already on the OA version.
   * @param {string} title - Tooltip text for the updated badge image.
   */
  function onOpenAccess(title) {
    const src = chrome.runtime.getURL('images/opensaysme-available.svg');
    const div1 = document.getElementById('oahelper_doicheckmark');
    div1.dataset.badge = 'at-open-access-location';
    div1.src = src;
    oahelper.isAtOpenAccessLocation = true;
  }

  /**
   * Determines the toolbar icon color key based on the current access state.
   * Priority order: disabled > warning (retraction) > orange (OA) > ebsco > green (free) > blue (ILL) > purple (citations) > black.
   * @returns {string} One of: 'disabled', 'warning', 'orange', 'ebsco', 'green', 'blue', 'purple', 'black'.
   */
  function getBadge() {
    let badge = 'black';
    if(oahelper.isDisabledOnDomain) {
      return 'disabled';
    }

    // need to early on identify retractionwatch status
    if(oahelper.addOnFeatures.retractionwatch != undefined && oahelper.addOnFeatures.retractionwatch.is_retracted != undefined && oahelper.addOnFeatures.retractionwatch.is_retracted) {
      return 'warning';
    }
    // only after we are certain there is not retraction can we care about the rest
    if(oahelper.alternativeAccess.unpaywall != undefined && oahelper.alternativeAccess.unpaywall.isOA != undefined && oahelper.alternativeAccess.unpaywall.isOA) {
      badge = 'orange';
    }
    else if(oahelper.subscriptionAccess.ebsco != undefined && oahelper.subscriptionAccess.ebsco.isAvailable != undefined && oahelper.subscriptionAccess.ebsco.isAvailable) {
      badge = 'ebsco';
    }
    else if(oahelper.freeAccess.isFree != undefined && oahelper.freeAccess.isFree) {
      badge = 'green';
    }
    else if (oahelper.addOnFeatures.opencitations != undefined && oahelper.addOnFeatures.opencitations.citationCount > 0) {
      badge = 'purple';
    }
    else if (oahelper.alternativeAccess.ill != undefined && oahelper.alternativeAccess.ill.url != undefined && oahelper.alternativeAccess.ill.url != '') {
      badge = 'blue';
    }
    return badge
  }


  /**
   * Returns a localized string, checking institute-specific translation overrides before
   * falling back to the standard chrome.i18n message catalogue.
   * @param {string} key - The i18n message key.
   * @param {string[]|null} variableArray - Optional substitution values for $1$, $2$, etc.
   * @returns {string} The localized string.
   */
  function translateOAHelper(key, variableArray = null) {
    const language = chrome.i18n.getUILanguage().substring(0,2);
    if(oahelper.configuration != undefined
      && oahelper.configuration.translations != undefined
      && oahelper.configuration.translations[key] != undefined
      && oahelper.configuration.translations[key][language] != undefined)
    {
        let textToReturn = oahelper.configuration.translations[key][language];
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

  /** Hides all OA Helper badge elements on the current page (called when user clicks "hide badges" in popup). */
  function hideBadgeRequest() {
    const elementsToHide = ['oahelper_doifound_outer', 'oahelper_opencitations_outer', 'oahelper_retractionwatch_outer'];
    elementsToHide.forEach((element) => {
      if (document.getElementById(element) != null) {
        document.getElementById(element).style.display = 'none';
      }
    });
  }



  /******
   *
   *  additional helpers
   *
   */

  /** Removes all injected OA Helper badge elements from the DOM before an SPA re-check. */
  function removeMyself() {
    // DOI found - multiple services
    const element = document.getElementById('oahelper_doifound_outer');
    if (element != null) {
      element.parentNode.removeChild(element);
    }
    // citation count - multiple services
    const elementOpenCitation = document.getElementById('oahelper_opencitations_outer');
    if (elementOpenCitation != null) {
      elementOpenCitation.parentNode.removeChild(elementOpenCitation);
    }
    // retraction watch
    const elementRetractionWatch = document.getElementById('oahelper_retractionwatch_outer');
    if (elementRetractionWatch != null) {
      elementRetractionWatch.parentNode.removeChild(elementRetractionWatch);
    }
  }

  /******
   *
   * Dedetec OAHELPER Proxy Site
   *
   */

  /**
   * When on the OA Helper proxy search page, injects "Add to OpenSaysMe" buttons
   * next to each institute result to allow one-click configuration.
   */
  function isOAHelperProxyPage(){
    const location = document.location;
    return location.protocol === 'https:' &&
      location.hostname === 'www.oahelper.org' &&
      (location.pathname === '/proxy' || location.pathname.indexOf('/proxy/') === 0);
  }

  function findOAHelperWebsite(){
    if(isOAHelperProxyPage()) {
      const results = document.getElementsByClassName('oahelper_institute_result');
      if(results.length != 0){
        for (let item of results) {
          let element = document.createElement('button')
          element.classList = 'oahelper_add_config';
          element.dataset.id = item.dataset.id;
          element.textContent = 'Add to OpenSaysMe';
          item.appendChild(element);
        }
        const buttons = document.getElementsByClassName('oahelper_add_config')
        Array.from(buttons).forEach(function(element) {
          element.addEventListener('click', addConfigFromButton);
        });
      }
    }
  }

  /** Click handler for "Add to OpenSaysMe" buttons on the OA Helper website. */
  function addConfigFromButton(){
    var id = this.dataset.id;
    chrome.runtime.sendMessage({ mode: 'saveSettingsFromWeb', id }, (response) => {
      this.classList = 'oahelper_add_config_success';
      this.textContent = 'Added to OpenSaysMe';
    });
  }

  /**
   * Checks if the current domain is in the list of disabled domains.
   * @param {string[]} onDisabledDomains - The list of disabled domains.
   * @param {string} currentDomain - The current domain to check.
   * @returns {boolean} True if the current domain is disabled.
  */

  function onDisabledDomain(onDisabledDomains, currentDomain) {
    let onDisabled = false;
    onDisabledDomains.forEach((domain) => {
      if (currentDomain.indexOf(domain) > -1) {
        onDisabled = true;
      }
    });
    return onDisabled;
  }

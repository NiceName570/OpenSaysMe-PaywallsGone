/** Persists the add-on feature toggles (ILL, citations, etc.) to storage. */
function saveOptions() {
  oaStorage.local.set({
    ezproxy: document.getElementById('ezproxy').checked,
    ill: document.getElementById('ill').checked,
    ebscouc: document.getElementById('ebscouc').checked,
    search: document.getElementById('selectsearch').value,
    opencitation: document.getElementById('opencitation').checked,
    openalexcitation: document.getElementById('openalexcitation').checked,
    retractionwatch: document.getElementById('retractionwatch').checked,
    nobadge: document.getElementById('nobadge').checked,
  }, () => {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    showStatus(status, 'options_options_saved', 'success');
    clearStatus();
    sendMessageToOtherPages();
  });
}

/**
 * Enforces mutual exclusivity between OpenCitations and OpenAlex citation sources, then saves.
 * Only one citation source can be active at a time.
 * @param {Event} event - The change event from either citation checkbox.
 */
function citationChange(event) {
  if(event.target.id == 'opencitation' && event.target.checked){
    document.getElementById('openalexcitation').checked = false;
  }
  else if(event.target.id == 'openalexcitation' && event.target.checked){
    document.getElementById('opencitation').checked = false;
  }
  saveOptions();
}


/**
 * Saves institute proxy/ILL settings to storage and triggers a domain list reload.
 * Sets lastload to 8 days ago so the background immediately re-fetches domain config on next run.
 * @param {string} id - Institute ID.
 * @param {string} name - Institute display name.
 * @param {string} url - EZProxy/OpenAthens base URL.
 * @param {string} illurl - ILL request form URL prefix.
 * @param {string} domainurl - URL of the institute's supported-domain list JSON.
 * @param {string} discovery - Discovery system URL.
 * @param {string} ebsco_cgp - EBSCO CustomGroup profile ID.
 */
function saveInstitute(id, name, url, illurl, domainurl, discovery, ebsco_cgp) {
  //document.getElementById('institute').value = `${name} (${id})`;
  let lastload = Math.floor(Date.now() / 1000) - (8*24*60*60);
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
    // Update status to let user know options were saved.
    restoreOptions();
    restoreDropDown();
    const status = document.getElementById('status');
    showStatus(status, 'options_options_proxy_saved', 'success', { id, name });
    const proxyurl = document.getElementById('proxyurl');
    proxyurl.textContent = url;
    const illurlText = document.getElementById('illurl');
    illurlText.textContent = illurl;
    clearStatus();
    if (domainurl != '') {
      chrome.runtime.sendMessage({ mode: 'getProxyDomains', id, domainurl }, (response) => {
        // console.log(response);
      });
    }
    document.getElementById("selectedinstitute").style.display = 'block';
    document.getElementById("autoComplete_wrapper").style.display = 'none';
    showHideEbscoOption();
  });
}

/**
 * Unused background message handler stub.
 * @param {*} message - The message from the background script.
 */
function handleResponse(message) {
  //console.log(`Message from the background script:  ${message}`);
}

/**
 * Logs a storage or messaging error to the console.
 * @param {*} error - The error to log.
 */
function handleError(error) {
  console.log(`Error: ${error}`);
}

/** Notifies content scripts and other extension pages that options have been updated. */
function sendMessageToOtherPages(){
  chrome.runtime.sendMessage({ mode: "optionsUpdated" }, (response) => {
    // console.log(response);
  });
}

/** Restores add-on feature checkbox states from storage. */
function restoreOptions() {
  oaStorage.local.get(['ezproxy', 'ill', 'opencitation', 'openalexcitation', 'retractionwatch', 'nobadge', 'ebscouc'], (items) => {
    for (const [key, value] of Object.entries(items)) {
      //console.log(`${key} - ${value}`);
      document.getElementById(key).checked = value;
    }
    if(items['ebscouc'] === undefined) {
      document.getElementById('ebscouc').checked = true;
    }
  });

}

/** Restores the search engine dropdown selection and shows/hides the institute discovery option. */
function restoreDropDown() {
  oaStorage.local.get(['search'], (items) => {
    for (const [key, value] of Object.entries(items)) {
      const select = document.getElementById('selectsearch');
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value == value) {
          select.options[i].selected = true;
        }
      }
    }
    oaStorage.local.get(['discovery'], (discoveryItems) => {
      if(Object.keys(discoveryItems).length != 0) {
        for (const [key, value] of Object.entries(discoveryItems)) {
          if(value == undefined || value == ""){
            document.getElementById('selectsearch_institute').selected = false;
            document.getElementById('selectsearch_institute').style.display = 'none';
            document.getElementById('selectsearch_institute').disabled = true;
          }
          else{
            document.getElementById('selectsearch_institute').style.display = 'block';
            document.getElementById('selectsearch_institute').disabled = false;
          }
        }
      }
      else {
        document.getElementById('selectsearch_institute').selected = false;
        document.getElementById('selectsearch_institute').style.display = 'none';
        document.getElementById('selectsearch_institute').disabled = true;
      }
    });
  });
}

/** Displays the currently saved institute name, proxy URL, and ILL URL in the UI. */
function restoreInstitute() {
  oaStorage.local.get(['id', 'name', 'url', 'illurl'], (items) => {
    if(items.id > 0) {
      document.getElementById("selectedinstitute").style.display = 'inherit';
      document.getElementById("autoComplete_wrapper").style.display = 'none';
      document.getElementById("selectedinstitute").setAttribute("data-institute", items.id);
      document.getElementById("selectedinstitute").textContent = `${items.name ? items.name : ''} (${items.id})`;
      const proxyurl = document.getElementById('proxyurl');
      proxyurl.textContent = items.url;
      const illurl = document.getElementById('illurl');
      illurl.textContent = items.illurl;
    }
    else {
      document.getElementById("selectedinstitute").style.display = 'none';
      document.getElementById("autoComplete_wrapper").style.display = 'block';
    }

  });
}

/**
 * Entry point for the options page: checks managed storage for a forced institute ID
 * before delegating to setup1. Enterprise-managed settings take precedence over user values.
 */
function setup() {
  if (typeof chrome.storage.managed != 'undefined') {
    chrome.storage.managed.get(null, function(items) {
      if (typeof items != 'undefined' && typeof items.institute != 'undefined' && items.institute != '') {
        // hide the search box to set another institute
        document.getElementById("autoComplete_wrapper").style.display = 'none';
        document.getElementById("instituteupdate").style.display = 'none';
        document.getElementById("institutelist").style.minHeight = "2rem";
        const managedInfo = document.getElementById("settings_managed_info");
        managedInfo.textContent = '';
        managedInfo.appendChild(renderSafeTemplate(chrome.i18n.getMessage("options_settings_managed_info"), null));
        managedInfo.style.display = 'block';
        // check if we have this institute configured
        oaStorage.local.get(['id', 'issetup'], (myItems) => {
          if (myItems.id != undefined && myItems.id == items.institute) {
            // we have a managed institueId and it matches what we've got stored
            setup1();
          }
          else if (myItems.issetup != undefined && myItems.issetup) {
            // save instituteId and move on
            oaStorage.local.set({
              id: items.institute
            }, () => {
              reloadSettings();
              setup1();
            });
          }
          else {
            // do basic setup, plus institute ID
            oaStorage.local.set({
              id: items.institute,
              ebscouc: true,
              opencitation: true,
              openalexcitation: false,
              retractionwatch: false,
              ezproxy: false,
              ill: false,
              issetup: true,
              search: 'google',
              consolelog: false,
              nobadge: false,
              lastLog: Math.floor(Date.now() / 1000),
              uuid: uuidv4()
            }, () => {
              reloadSettings();
              setup1();
            });
          }
        });
      }
      else {
        //chrome.storage.managed exists, but no institute set
        setup1();
      }
    });
  }
  else {
    // no chrome.storage.managed
    setup1();
  }

}

/** Checks the issetup flag and routes to either a full UI restore or the first-run setup flow. */
function setup1() {
  oaStorage.local.get(['issetup'], (items) => {
    if (items.issetup != undefined && items.issetup) {
      restoreOptions();
      restoreInstitute();
      restoreDropDown();
      getListOfDisabledDomains();
      showHideUpdateInstitute();
      showHideEbscoOption();
    } else {
      doInitialSetup();
    }
  });
}

/**
 * Writes default options to storage for a first-run or post-clear install.
 * @param {string} [uuid] - UUID to preserve across storage clears; generated if omitted.
 */
function doInitialSetup(uuid = uuidv4()) {
  oaStorage.local.set({
    ebscouc: true,
    opencitation: true,
    openalexcitation: false,
    retractionwatch: false,
    ezproxy: false,
    ill: false,
    issetup: true,
    search: 'google',
    consolelog: false,
    nobadge: false,
    lastLog: Math.floor(Date.now() / 1000),
    uuid: uuid
  }, () => {
    restoreOptions();
    restoreDropDown();
    showHideUpdateInstitute();
  });
}

/**
 * Generates a random UUID v4.
 * @returns {string} A UUID v4 string.
 */
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

/** Shows the "Update Institute" button only when a valid institute ID is saved. */
function showHideUpdateInstitute() {
  oaStorage.local.get(['id'], (items) => {
    if(items.id != undefined && items.id > 0){
      document.getElementById('instituteupdate').style.display = "inline-block";
    }
    else{
      document.getElementById('instituteupdate').style.display = "none";
    }
  });
}

/** Shows or hides the EBSCO Universal Connector checkbox and its nav breadcrumb based on whether an EBSCO CGP is configured. */
function showHideEbscoOption() {
  oaStorage.local.get(['ebsco_cgp'], (items) => {
    if(items['ebsco_cgp'] === undefined || items['ebsco_cgp'] == 'unset' || items['ebsco_cgp'] == ''){
      document.getElementById('ebscouc').style.display = "none";
      document.getElementById('ebscouclabel').style.display = "none";
      document.getElementById('breadcrumb3').style.display = "none";
      document.getElementById('settingssection').style.display = "none";
    }
    else{
      document.getElementById('ebscouc').style.display = "inline-block";
      document.getElementById('ebscouclabel').style.display = "inline-block";
      document.getElementById('breadcrumb3').style.display = "";
    }
  })
}

/**
 * Searches the OA Helper institute API by domain or name (minimum 5 characters).
 * @returns {Promise<object>} API response object with code and data array.
 */
async function doProxySearch() {
  const searchTerm = document.getElementById('institute').value;
  if (searchTerm.length < 5) {
    //console.log('too short');
    const response = { code: 203, data: [] };
    return response;
  }
  const url = 'https://www.oahelper.org/backend/institutes/api.php';
  const apiKey = 'l6sNUJ3Knh';
  const formData = new URLSearchParams();
  let searchtype = 'domain';
  if (document.getElementById('query').checked) {
    searchtype = document.getElementById('query').value;
  }
  formData.append(searchtype, searchTerm);
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

/** Clears the results list, runs doProxySearch, and renders results or appropriate status messages. */
function proxySearch() {
  document.getElementById('institutelist').textContent = '';
  doProxySearch().then((response) => {
    if (response != undefined && (response.code >= 200 && response.code <= 299)) {
      if (response.code == 203) {
        const status = document.getElementById('status');
        showStatus(status, 'options_proxy_searchtooshort', 'warning');
        clearStatus();
      } else if (response.data.length == 0) {
        // we found nothing
        const status = document.getElementById('status');
        showStatus(status, 'options_no_institutes', 'warning');
        clearStatus();
      } else if (response.data.length == 1) {
        // we found one
        saveInstitute(response.data[0].id, response.data[0].institution, response.data[0].proxyUrl.replace('{targetUrl}', ''), response.data[0].ill.replace('{doi}', ''), response.data[0].domainUrl, response.data[0].discovery, response.data[0].ebsco_cgp);
        // don't need a message, as that will be provided by saveInstitute function
      } else {
        // we found multiple
        const status = document.getElementById('status');
        showStatus(status, 'options_multi_institutes', 'warning');
        renderInstituteTable(document.getElementById('institutelist'), response.data);
        clearStatus();
      }
    } else {
      const status = document.getElementById('status');
      showStatus(status, 'options_error_institutes', 'danger');
      clearStatus();
    }
  });
}

/**
 * Fetches institute details from the OA Helper API by numeric ID.
 * @param {string|number} searchTerm - The institute ID to look up.
 * @returns {Promise<object>} API response object with code and data array.
 */
async function doProxySearchById(searchTerm) {
  const url = 'https://www.oahelper.org/backend/institutes/api.php';
  const apiKey = 'l6sNUJ3Knh';
  const formData = new URLSearchParams();
  let searchtype = 'id';
  formData.append(searchtype, searchTerm);
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


/** Re-fetches institute settings from the API using the stored ID and re-saves them. */
function reloadSettings() {
  oaStorage.local.get(['id'], (items) => {
    doProxySearchById(items.id).then((response) => {
      if (response != undefined && (response.code >= 200 && response.code <= 299)) {
        if (response.data.length == 0) {
          // we found nothing
          const status = document.getElementById('status');
          showStatus(status, 'options_no_institutes', 'warning');
          clearStatus();
        } else{
          // we found one, as we search by id there can only be one result
          saveInstitute(response.data[0].id, response.data[0].institution, response.data[0].proxyUrl.replace('{targetUrl}', ''), response.data[0].ill.replace('{doi}', ''), response.data[0].domainUrl, response.data[0].discovery, response.data[0].ebsco_cgp);
          // don't need a message, as that will be provided by saveInstitute function
        }
      } else {
        const status = document.getElementById('status');
        showStatus(status, 'options_error_institutes', 'danger');
        clearStatus();
      }
    });
  });
}

/**
 * Fetches and saves institute settings by ID; used when loading from managed storage config.
 * @param {string|number} id - The institute ID to load.
 */
function loadAndStoreSettingsById(id) {
  doProxySearchById(id).then((response) => {
    if (response != undefined && (response.code >= 200 && response.code <= 299)) {
      if (response.data.length == 0) {
        // we found nothing
        const status = document.getElementById('status');
        showStatus(status, 'options_no_institutes', 'warning');
        clearStatus();
      } else{
        // we found one, as we search by id there can only be one result
        saveInstitute(response.data[0].id, response.data[0].institution, response.data[0].proxyUrl.replace('{targetUrl}', ''), response.data[0].ill.replace('{doi}', ''), response.data[0].domainUrl, response.data[0].discovery, response.data[0].ebsco_cgp);
        // don't need a message, as that will be provided by saveInstitute function
      }
    } else {
      const status = document.getElementById('status');
      showStatus(status, 'options_error_institutes', 'danger');
      clearStatus();
    }
  });
}

/** Renders the list of user-disabled domains, or hides the section if the list is empty. */
function getListOfDisabledDomains() {

  oaStorage.local.get(['disabledOn'], (items) => {
    const disabledOn = items['disabledOn'];
    const container = document.getElementById('disabledondomain_list');
    container.textContent = '';
    if(disabledOn != undefined && disabledOn.length > 0){
      const list = document.createElement('ul');
      list.id = 'disableddomain_list_items';
      disabledOn.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      container.appendChild(list);
      document.getElementById("breadcrumb6").style.display = '';
    }
    else {
      document.getElementById("breadcrumb6").style.display = 'none';
      document.getElementById("disabledondomain").style.display = 'none';
    }
  });

}

/** Click handler for institute search result table rows; saves the clicked institute. */
function itemToAddClicked() {
  saveInstitute(this.dataset.id, this.dataset.institute, this.dataset.url, this.dataset.ill, this.dataset.domainurl, this.dataset.discovery, this.dataset.ebsco_cgp);
}

/**
 * Renders the "multiple institutes found" results table via DOM APIs (never innerHTML),
 * since institute fields come directly from a remote API response.
 * @param {HTMLElement} container - The element to render the table into (its contents are replaced).
 * @param {Array<object>} instituteRows - Institute records from the institutes API.
 */
function renderInstituteTable(container, instituteRows) {
  container.textContent = '';

  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['ID', 'Institute', 'URL', 'ILL'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  instituteRows.forEach((data) => {
    const proxyUrl = data.proxyUrl.replace('{targetUrl}', '');
    const illUrl = data.ill.replace('{doi}', '');

    const row = document.createElement('tr');
    row.className = 'institutetoadd';
    row.dataset.id = data.id;
    row.dataset.institute = data.institution;
    row.dataset.url = proxyUrl;
    row.dataset.ill = illUrl;
    row.dataset.domainurl = data.domainurl;
    row.dataset.discovery = data.discovery;
    row.dataset.ebsco_cgp = data.ebsco_cgp;

    [data.id, data.institution, proxyUrl, illUrl].forEach((cellValue) => {
      const td = document.createElement('td');
      td.textContent = cellValue;
      row.appendChild(td);
    });

    row.addEventListener('click', itemToAddClicked);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  container.appendChild(table);
}

/** Clears the status message element after a short delay. */
function clearStatus() {
  setTimeout(() => {
    document.getElementById('status').textContent = '';
  }, 3500);
}

/** Shows the settings section and swaps the show/hide button visibility. */
function showsettings() {
  document.getElementById('settingssection').style.display = 'block';
  document.getElementById('showsettings').style.display = 'none';
  document.getElementById('hidesettings').style.display = 'inline-block';
}

/** Hides the settings section and swaps the show/hide button visibility. */
function hidesettings() {
  document.getElementById('settingssection').style.display = 'none';
  document.getElementById('showsettings').style.display = 'inline-block';
  document.getElementById('hidesettings').style.display = 'none';
}

/** Opens the tutorial page in a new tab. */
function viewtutorial() {
  chrome.tabs.create({ url: 'https://www.oahelper.org/tutorial-open-access-helper-for-chrome/' }, (tab) => {
    // console.log('tutorial has been opened');
  });
}

/** Opens the support page in a new tab. */
function getsupport() {
  chrome.tabs.create({ url: 'https://www.oahelper.org/support/' }, (tab) => {
    // console.log('support has been opened');
  });
}

/** Opens the example page in a new tab. */
function showexample() {
  chrome.tabs.create({ url: 'https://www.oahelper.org/example/' }, (tab) => {
    // console.log('example has been opened');
  });
}

/**
 * Detects touch screen capability and hides context-menu settings sections on mobile devices.
 * @returns {boolean} True if a touch screen is detected.
 */
function isTouchScreen() {
    var hasTouchScreen = false;
    if ("maxTouchPoints" in navigator) {
        hasTouchScreen = navigator.maxTouchPoints > 0;
    } else if ("msMaxTouchPoints" in navigator) {
        hasTouchScreen = navigator.msMaxTouchPoints > 0;
    } else {
        var mQ = window.matchMedia && matchMedia("(pointer:coarse)");
        if (mQ && mQ.media === "(pointer:coarse)") {
            hasTouchScreen = !!mQ.matches;
        } else if ('orientation' in window) {
            hasTouchScreen = true; // deprecated, but good fallback
        } else {
            // Only as a last resort, fall back to user agent sniffing
            var UA = navigator.userAgent;
            hasTouchScreen = (
                /\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) ||
                /\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA)
            );
        }
    }

    if(hasTouchScreen){
        document.getElementById('contextMenuSettingsGroup').style.display = 'none';
        document.getElementById('intro002').style.display = 'none';
        document.getElementById('breadcrumb2').style.display = 'none';
    }

    return hasTouchScreen;
}




/**
 * Replaces __MSG_key__ placeholders in the page with localized strings, via a TreeWalker over
 * text nodes plus a walk of every element's attributes - never innerHTML, so this can't reparse
 * (and drop event listeners from) the whole document. Locale strings may themselves contain
 * inline markup/entities (e.g. options_intro_001's <a> links, options_h2_select_search's
 * "&amp;"), so each substituted text node is rendered through renderSafeTemplate()'s
 * allowlisted DOMParser-based renderer rather than assigned as raw text.
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


/** Shows the Institute section, hiding all other nav sections. */
function breadcrumb1() {
  removeAllActiveBreadCrumbs();
  document.getElementById('breadcrumb1').classList.add('is-active');
  document.getElementById('settingssection').style.display = 'none';
  document.getElementById('similarsection').style.display = 'none';
  document.getElementById('contextmenusection').style.display = 'none';
  document.getElementById('institutesection').style.display = 'block';
  document.getElementById('nobadgesection').style.display = 'none';
  document.getElementById('disabledondomain').style.display = 'none';
}

/** Shows the Context Menu section, hiding all other nav sections. */
function breadcrumb2() {
  removeAllActiveBreadCrumbs();
  document.getElementById('breadcrumb2').classList.add('is-active');
  document.getElementById('settingssection').style.display = 'none';
  document.getElementById('similarsection').style.display = 'none';
  document.getElementById('contextmenusection').style.display = 'block';
  document.getElementById('institutesection').style.display = 'none';
  document.getElementById('nobadgesection').style.display = 'none';
  document.getElementById('disabledondomain').style.display = 'none';
}

/** Shows the Settings section, hiding all other nav sections. */
function breadcrumb3() {
  removeAllActiveBreadCrumbs();
  document.getElementById('breadcrumb3').classList.add('is-active');
  document.getElementById('settingssection').style.display = 'block';
  document.getElementById('similarsection').style.display = 'none';
  document.getElementById('contextmenusection').style.display = 'none';
  document.getElementById('institutesection').style.display = 'none';
  document.getElementById('nobadgesection').style.display = 'none';
  document.getElementById('disabledondomain').style.display = 'none';
}

/** Shows the Similar Articles section, hiding all other nav sections. */
function breadcrumb4() {
  removeAllActiveBreadCrumbs();
  document.getElementById('breadcrumb4').classList.add('is-active');
  document.getElementById('settingssection').style.display = 'none';
  document.getElementById('similarsection').style.display = 'block';
  document.getElementById('contextmenusection').style.display = 'none';
  document.getElementById('institutesection').style.display = 'none';
  document.getElementById('nobadgesection').style.display = 'none';
  document.getElementById('disabledondomain').style.display = 'none';
}

/** Shows the No Badge section, hiding all other nav sections. */
function breadcrumb5() {
  removeAllActiveBreadCrumbs();
  document.getElementById('breadcrumb5').classList.add('is-active');
  document.getElementById('settingssection').style.display = 'none';
  document.getElementById('similarsection').style.display = 'none';
  document.getElementById('contextmenusection').style.display = 'none';
  document.getElementById('institutesection').style.display = 'none';
  document.getElementById('nobadgesection').style.display = 'block';
  document.getElementById('disabledondomain').style.display = 'none';
}

/** Shows the Disabled Domains section, hiding all other nav sections. */
function breadcrumb6() {
  removeAllActiveBreadCrumbs();
  document.getElementById('breadcrumb6').classList.add('is-active');
  document.getElementById('settingssection').style.display = 'none';
  document.getElementById('similarsection').style.display = 'none';
  document.getElementById('contextmenusection').style.display = 'none';
  document.getElementById('institutesection').style.display = 'none';
  document.getElementById('nobadgesection').style.display = 'none';
  document.getElementById('disabledondomain').style.display = 'block';
}

/** Removes the is-active class from all breadcrumb navigation items. */
function removeAllActiveBreadCrumbs() {
  document.getElementById('breadcrumb1').classList.remove('is-active');
  document.getElementById('breadcrumb2').classList.remove('is-active');
  document.getElementById('breadcrumb3').classList.remove('is-active');
  document.getElementById('breadcrumb4').classList.remove('is-active');
  document.getElementById('breadcrumb5').classList.remove('is-active');
  document.getElementById('breadcrumb6').classList.remove('is-active');
}

/** Clears all storage (preserving the UUID) and resets the extension to the initial setup state. */
function removeinstitute() {

  // get UUID
  oaStorage.local.get(['uuid'], (items) => {
    const uuidv4 = items['uuid'];
    // clear Storage
    oaStorage.local.clear(function() {
      document.getElementById("selectedinstitute").setAttribute("institute", '');
      document.getElementById("selectedinstitute").textContent = '';
      document.getElementById("selectedinstitute").style.display = 'none';
      document.getElementById("autoComplete_wrapper").style.display = "block";
      // do initial setup, set old uuid
      if (typeof uuidv4 != 'undefined') {
        doInitialSetup(uuidv4);
      }
      else {
        doInitialSetup();
      }

    });
  })
}


localizeHtmlPage();


document.addEventListener('DOMContentLoaded', setup);
document.addEventListener('DOMContentLoaded', isTouchScreen);
// document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('save_additionalsources').addEventListener('click', saveOptions);
document.getElementById('save_similar').addEventListener('click', saveOptions);
document.getElementById('save_contextmenu').addEventListener('click', saveOptions);
document.getElementById('save_institute').addEventListener('click', saveOptions);
document.getElementById('save_badge').addEventListener('click', saveOptions);
// document.getElementById('proxysearch').addEventListener('click', proxySearch);
// document.getElementById('institute').addEventListener("keyup", function(event) {
//   if (event.key === "Enter") {
//       proxySearch();
//   }
// });
document.getElementById('instituteupdate').addEventListener('click', reloadSettings);
document.getElementById('breadcrumb1a').addEventListener('click', breadcrumb1);
document.getElementById('breadcrumb2a').addEventListener('click', breadcrumb2);
document.getElementById('breadcrumb3a').addEventListener('click', breadcrumb3);
document.getElementById('breadcrumb4a').addEventListener('click', breadcrumb4);
document.getElementById('breadcrumb5a').addEventListener('click', breadcrumb5);
document.getElementById('breadcrumb6a').addEventListener('click', breadcrumb6);
document.getElementById('selectedinstitute').addEventListener('click', removeinstitute);
document.getElementById('selectsearch').addEventListener('change', saveOptions);
document.getElementById('opencitation').addEventListener('change', citationChange);
document.getElementById('openalexcitation').addEventListener('change', citationChange);
document.getElementById('retractionwatch').addEventListener('change', saveOptions);
document.getElementById('nobadge').addEventListener('change', saveOptions);
document.getElementById('ebscouc').addEventListener('change', saveOptions);

// disabledOn is written asynchronously by background.js after an institute's domain config
// is fetched (well after saveInstitute()'s own callback returns), so re-render this section
// whenever it changes rather than only on initial page load.
oaStorage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.disabledOn) {
    getListOfDisabledDomains();
  }
});


document.addEventListener('DOMContentLoaded', () => {

  // Get all "navbar-burger" elements
  const $navbarBurgers = Array.prototype.slice.call(document.querySelectorAll('.navbar-burger'), 0);

  // Add a click event on each of them
  $navbarBurgers.forEach( el => {
    el.addEventListener('click', () => {
      // Get the target from the "data-target" attribute
      const target = el.dataset.target;
      const $target = document.getElementById(target);

      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      el.classList.toggle('is-active');
      $target.classList.toggle('is-active');

    });
  });

});

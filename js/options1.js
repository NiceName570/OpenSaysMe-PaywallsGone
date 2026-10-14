/** Saves the consolelog toggle to storage. */
function saveOptions() {
  const consolelog = document.getElementById('consolelog').checked;
  oaStorage.local.set({ consolelog }, (result) => {
    const status = document.getElementById('status');
    showStatus(status, 'options_options_saved', 'success');
    clearStatus();
  });
}


/** Restores the consolelog checkbox state from storage. */
function restoreOptions() {
  oaStorage.local.get({
    consolelog: false,
  }, (items) => {
    for (const [key, value] of Object.entries(items)) {
      document.getElementById(key).checked = value;
    }
  });
}

/**
 * Validates and saves a manual proxy/ILL configuration used when no institute is found via search.
 * ID 99999 is a reserved placeholder for manually-entered configurations.
 */
function saveProxyOption() {
  const id = 99999;
  const name = document.getElementById('proxyname').value;
  const url = document.getElementById('proxyprefix').value;
  const illurl = document.getElementById('illurl1').value;
  const status = document.getElementById('status');
  if (name === '' || url === '') {
    showStatus(status, 'options1_proxy_empty_error', 'warning');
    clearStatus();
    return;
  }
  oaStorage.local.set({
    id,
    name,
    url,
    ezproxy: true,
    ill: true,
    illurl
  }, () => {
    // Update status to let user know options were saved.
    restoreOptions();
    showStatus(status, 'options_options_proxy_saved', 'success', { id, name });
    clearStatus();
  });
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


/** Clears the status message element after a short delay. */
function clearStatus() {
  setTimeout(() => {
    document.getElementById('status').textContent = '';
  }, 2500);
}

/**
 * Shows and wires up the telemetry-consent checkbox, but only on Firefox versions that
 * implement the data_collection permission type (Firefox 139+ desktop / 141+ Android).
 * Detected purely by capability (browser.permissions.getAll() exposing a `data_collection`
 * key), not by browser name, so this stays a no-op - checkbox hidden, nothing wired up - on
 * Chrome, Edge, Safari, and older Firefox. Uses browser.permissions rather than
 * chrome.permissions deliberately: this feature is Firefox-exclusive, and browser.* is
 * Firefox's native promise-based namespace, whereas chrome.* there is just a
 * Chrome-compatibility shim not guaranteed to support the promise-calling-convention for a
 * brand-new API surface like this one. Consent state lives in the browser's own permission
 * store, not oaStorage.local, so it can't collide with saveOptions()/restoreOptions() above.
 */
async function initTelemetryConsent() {
  if (typeof browser === 'undefined' || typeof browser.permissions === 'undefined') {
    return;
  }
  let current;
  try {
    current = await browser.permissions.getAll();
  } catch (err) {
    return;
  }
  if (current == undefined || !('data_collection' in current)) {
    return;
  }

  const group = document.getElementById('telemetryconsentgroup');
  const checkbox = document.getElementById('telemetryconsent');
  const DATA_COLLECTION_PERMS = { data_collection: ['technicalAndInteraction'] };

  group.style.display = 'block';
  checkbox.checked = current.data_collection.includes('technicalAndInteraction');

  checkbox.addEventListener('change', async () => {
    try {
      if (checkbox.checked) {
        checkbox.checked = await browser.permissions.request(DATA_COLLECTION_PERMS);
      } else {
        await browser.permissions.remove(DATA_COLLECTION_PERMS);
      }
    } catch (err) {
      // request()/remove() unexpectedly rejected (e.g. an early/partial implementation) -
      // re-sync the checkbox from the actual permission state rather than leave it showing
      // something the browser didn't actually grant.
      checkbox.checked = await browser.permissions.contains(DATA_COLLECTION_PERMS).catch(() => false);
    }
  });

  // Keeps the checkbox in sync if the user instead manages this permission from
  // about:addons while this page happens to be open.
  browser.permissions.onAdded.addListener((perms) => {
    if (perms.data_collection && perms.data_collection.includes('technicalAndInteraction')) {
      checkbox.checked = true;
    }
  });
  browser.permissions.onRemoved.addListener((perms) => {
    if (perms.data_collection && perms.data_collection.includes('technicalAndInteraction')) {
      checkbox.checked = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.addEventListener('DOMContentLoaded', initTelemetryConsent);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('proxysave').addEventListener('click', saveProxyOption);
document.getElementById('consolelog').addEventListener('change', saveOptions);

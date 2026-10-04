var ext_api = chrome || browser;

var useragent_options = ['', 'googlebot', 'bingbot'];
var referer_options = ['', 'facebook', 'google', 'twitter'];
var random_ip_options = ['', 'all', 'eu'];

function capitalize(str) {
  return (typeof str === 'string') ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function sortJson(json) {
  return Object.keys(json)
  .sort().reduce(function (Obj, key) {
    Obj[key] = json[key];
    return Obj;
  }, {});
}

// Saves options to ext_api.storage
function save_options() {
  var textareaEl = document.querySelector('#bypass_sites textarea');
  var sites_custom = {};
  if (textareaEl.value !== '')
    var sites_custom = JSON.parse(textareaEl.value);
  ext_api.storage.local.set({
    sites_custom: sites_custom
  }, function () {
    // Update status to let user know custom sites were saved.
    var status = document.getElementById('status');
    status.textContent = 'Custom sites saved.';
    setTimeout(function () {
      status.textContent = '';
      location.href = 'options.html';
      //window.close();
    }, 800);
  });
}

// Sort json by key in textarea
function sort_options() {
  var textareaEl = document.querySelector('#bypass_sites textarea');
  var sites_custom = {};
  if (textareaEl.value !== '') {
    var sites_custom = JSON.parse(textareaEl.value);
    var sites_custom_sorted = sortJson(sites_custom);
    textareaEl.value = JSON.stringify(sites_custom_sorted);
  }
  
}

// Export custom sites to file
function export_options() {
  ext_api.storage.local.get({
    sites_custom: {}
  }, function (items) {
    var result = JSON.stringify(items.sites_custom);
    var a = document.createElement("a");
    var file = new Blob([result], {type: "text/plain"});
    a.href = window.URL.createObjectURL(file);
    let date = new Date();
    let dateStr = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
    a.download = 'bypass_paywalls_clean_custom_' + dateStr + '.txt';
    a.click();
  });
}

// Import custom sites from file
function import_options(e) {
  var files = e.target.files;
  var reader = new FileReader();
  reader.onload = _imp;
  reader.readAsText(files[0]);
}

function _imp() {
  var result = this.result;
  ext_api.storage.local.get({
    sites_custom: {}
  }, function (items) {
    var sites_custom = items.sites_custom;
    var sites_custom_new = JSON.parse(result);
    for (let site in sites_custom_new)
      sites_custom[site] = sites_custom_new[site];
    ext_api.storage.local.set({
      sites_custom: sites_custom
    }, function () {
      // Update status to let user know custom sites were imported.
      var status = document.getElementById('status');
      status.textContent = 'Custom sites imported.';
      setTimeout(function () {
        //status.textContent = '';
        importInput.value = '';
        renderOptions();
      }, 800);
    });
  });
}

// Add custom site to ext_api.storage
function add_options() {
  var inputEls = document.querySelectorAll('#add_site input, #add_site select');
  var rule = {};
  var title = '';

  for (let elem of inputEls) {
    if (elem.dataset.key === 'title') {
      title = capitalize(elem.value.trim());
    } else if (elem.type === 'checkbox') {
      if (elem.checked)
        rule[elem.dataset.key] = elem.dataset.on ? elem.dataset.on : parseInt(elem.dataset.value);
    } else if (elem.value.trim()) {
      rule[elem.dataset.key] = elem.value.trim();
    }
  }

  var status_add = document.getElementById('status_add');
  if (!rule.domain) {
    status_add.textContent = 'Enter the site (domain) first.';
    return;
  }
  rule.domain = rule.domain.replace(/(http(s)?:\/\/|\/.*$)/g, '').replace(/^(www|amp(html)?|m|wap)(\d)?\./, '').toLowerCase();
  if (!title) {
    title = capitalize(rule.domain.split('.').slice(-2, -1)[0] || rule.domain);
  }

  // add new site to local storage
  ext_api.storage.local.get({
    sites_custom: {}
  }, function (items) {
    var sites_custom = items.sites_custom;
    sites_custom[title] = rule;
    ext_api.storage.local.set({
      sites_custom: sites_custom
    }, function () {
      // Update status to let user know new custom site was added.
      status_add.textContent = 'Site added.';
      setTimeout(function () {
        renderOptions();
      }, 800);
    });
  });
}

// Delete custom site from ext_api.storage
function delete_options() {
  var selectEl = document.querySelector('#custom_sites select');
  var sites_custom = {};
  var remove_key = selectEl.value;
  
  // delete site from local storage
  ext_api.storage.local.get({
    sites_custom: {}
  }, function (items) {
    var sites_custom_old = items.sites_custom;
    delete sites_custom_old[remove_key];
    
    ext_api.storage.local.set({
      sites_custom: sites_custom_old
    }, function () {
      // Update status to let user know custom site was deleted.
      var status_delete = document.getElementById('status_delete');
      status_delete.textContent = 'Site deleted.';
      setTimeout(function () {
        //status.textContent = '';
        renderOptions();
      }, 800);
    });
  });
}

// Edit custom site (copy to add)
function edit_options() {
  var selectEl = document.querySelector('#custom_sites select');
  var sites_custom = {};
  var title = selectEl.value;
  
  // copy site to add-fields
  ext_api.storage.local.get({
    sites_custom: {}
  }, function (items) {
    sites_custom = items.sites_custom;
    var edit_site = sites_custom[title];
    var q = (sel) => document.querySelector('#add_site ' + sel);
    q('input[data-key="title"]').value = title;
    q('input[data-key="domain"]').value = edit_site.domain;
    q('input[data-key="useragent"]').checked = (edit_site.googlebot > 0 || edit_site.useragent === 'googlebot');
    q('input[data-key="allow_cookies"]').checked = (edit_site.allow_cookies > 0);
    q('input[data-key="block_javascript"]').checked = (edit_site.block_javascript > 0);
    q('input[data-key="block_javascript_ext"]').checked = (edit_site.block_javascript_ext > 0);
    q('input[data-key="amp_unhide"]').checked = (edit_site.amp_unhide > 0);
    q('input[data-key="block_regex"]').value = edit_site.block_regex ? edit_site.block_regex : '';
    q('input[data-key="amp_redirect"]').value = edit_site.amp_redirect ? edit_site.amp_redirect : '';
    q('input[data-key="ld_json"]').value = edit_site.ld_json ? edit_site.ld_json : '';
    q('select[data-key="referer"]').selectedIndex = Math.max(0, referer_options.indexOf(edit_site.referer));
    q('select[data-key="random_ip"]').selectedIndex = Math.max(0, random_ip_options.indexOf(edit_site.random_ip));
    if (edit_site.block_javascript_ext > 0 || edit_site.block_regex || edit_site.amp_redirect || edit_site.ld_json || edit_site.referer || edit_site.random_ip)
      document.querySelector('#add_site details').open = true;
  });
}

// request permissions for custom sites (in list only)
function request_permissions() {
  var perm_custom = document.getElementById('perm-custom');
  ext_api.permissions.request({
    origins: perm_origins
  }, function (granted) {
    if (granted) {
      perm_custom.innerText = 'YES';
    } else {
      perm_custom.innerText = 'NO';
    }
  });
}

// remove permissions for custom sites
function remove_permissions() {
  var perm_custom = document.getElementById('perm-custom');
  ext_api.permissions.remove({
    origins: perm_origins
  }, function (removed) {
    if (removed) {
      perm_custom.innerText = 'NO';
    }
  });
}

var perm_origins;
// Restores checkbox input states using the preferences stored in ext_api.storage.
function renderOptions() {
  ext_api.storage.local.get({
    sites_custom: {},
    sites_updated: {}
  }, function (items) {
    var sites_custom = items.sites_custom;
    var sites_updated = items.sites_updated;
    var sites_updated_domains_new = Object.values(sites_updated).filter(x => (x.domain && !defaultSites_domains.includes(x.domain) || x.group)).map(x => x.group ? x.group.filter(y => !defaultSites_domains.includes(y)) : x.domain).flat();
    var sitesEl = document.getElementById('bypass_sites');
    sitesEl.innerHTML = '';
    var labelEl = document.createElement('label');
    var textareaEl = document.createElement('textarea');
    textareaEl.value = JSON.stringify(sites_custom);
    textareaEl.rows = 12;
    textareaEl.cols = 40;
    labelEl.appendChild(textareaEl);
    sitesEl.appendChild(labelEl);
    
    // add site
    var add_sitesEl = document.getElementById('add_site');
    add_sitesEl.innerHTML = '';

    function textField(key, label, placeholder, parent) {
      var l = document.createElement('label');
      l.className = 'field';
      var span = document.createElement('span');
      span.textContent = label;
      var i = document.createElement('input');
      i.type = 'text';
      i.dataset.key = key;
      if (placeholder)
        i.placeholder = placeholder;
      l.appendChild(span);
      l.appendChild(i);
      parent.appendChild(l);
    }

    function toggle(key, label, hint, parent, on) {
      var l = document.createElement('label');
      l.className = 'toggle';
      var i = document.createElement('input');
      i.type = 'checkbox';
      i.dataset.key = key;
      if (on)
        i.dataset.on = on;
      else
        i.dataset.value = 1;
      var s = document.createElement('span');
      s.className = 'slider round';
      var t = document.createElement('span');
      t.className = 'toggle-text';
      t.textContent = label;
      if (hint) {
        var h = document.createElement('small');
        h.textContent = hint;
        t.appendChild(h);
      }
      var sw = document.createElement('span');
      sw.className = 'switch';
      sw.appendChild(i);
      sw.appendChild(s);
      l.appendChild(sw);
      l.appendChild(t);
      parent.appendChild(l);
    }

    function selectField(key, label, options, parent) {
      var l = document.createElement('label');
      l.className = 'field';
      var span = document.createElement('span');
      span.textContent = label;
      var sel = document.createElement('select');
      sel.dataset.key = key;
      for (let elem of options) {
        let option = document.createElement('option');
        option.value = elem;
        option.text = elem === '' ? 'Off' : elem;
        sel.appendChild(option);
      }
      l.appendChild(span);
      l.appendChild(sel);
      parent.appendChild(l);
    }

    // title is optional (taken from the domain when empty)
    textField('domain', 'Site', 'example.com', add_sitesEl);
    textField('title', 'Name (optional)', 'Example', add_sitesEl);

    var togglesEl = document.createElement('div');
    togglesEl.className = 'toggle-list';
    toggle('useragent', 'Pretend to be Googlebot', 'Often unlocks articles for search engines', togglesEl, 'googlebot');
    toggle('block_javascript', 'Block JavaScript', 'Stops the paywall script from running', togglesEl);
    toggle('amp_unhide', 'Unhide article text (AMP)', 'Shows hidden text on the AMP version', togglesEl);
    toggle('allow_cookies', 'Keep cookies', 'Stay logged in; cookies are cleared by default', togglesEl);
    add_sitesEl.appendChild(togglesEl);

    var advEl = document.createElement('details');
    advEl.className = 'advanced';
    var sum = document.createElement('summary');
    sum.textContent = 'Advanced';
    advEl.appendChild(sum);
    var advGrid = document.createElement('div');
    advGrid.className = 'adv-grid';
    toggle('block_javascript_ext', 'Block external scripts', 'Blocks paywall scripts from other domains', advGrid);
    selectField('referer', 'Fake referer', referer_options, advGrid);
    selectField('random_ip', 'Random IP address', random_ip_options, advGrid);
    textField('block_regex', 'Block URLs matching (regex)', '\\.example\\.com\\/js\\/', advGrid);
    textField('amp_redirect', 'AMP redirect selector', 'div.paywall', advGrid);
    textField('ld_json', 'Load text from json (selector)', 'div.paywall|div.article', advGrid);
    advEl.appendChild(advGrid);
    add_sitesEl.appendChild(advEl);

    // list of custom sites
    var custom_sitesEl = document.getElementById('custom_sites');
    custom_sitesEl.innerHTML = '';
    labelEl = document.createElement('label');
    var selectEl = document.createElement('select');
    selectEl.id = 'sites';
    selectEl.size = 6;
    var optionEl;
    perm_origins = [];
    for (let key in sites_custom) {
      optionEl = document.createElement('option');
      let domain = sites_custom[key]['domain'];
      perm_origins.push(domain);
      let isDefaultSite = defaultSites_domains.includes(domain);
      optionEl.text = isDefaultSite ? '*' : '';
      optionEl.text += key + ': ' + domain +
      (sites_custom[key]['googlebot'] > 0 ? ' | googlebot' : '') +
      (sites_custom[key]['allow_cookies'] > 0 ? ' | allow_cookies' : '') +
      (sites_custom[key]['block_javascript'] > 0 ? ' | block javascript' : '') +
      (sites_custom[key]['block_javascript_ext'] > 0 ? ' | block javascript ext' : '') +
      (sites_custom[key]['block_regex'] ? ' | block regex' : '') +
      (sites_custom[key]['useragent'] ? ' | useragent: ' + sites_custom[key]['useragent'] : '') +
      (sites_custom[key]['referer'] ? ' | referer: ' + sites_custom[key]['referer'] : '') +
      (sites_custom[key]['random_ip'] ? ' | random_ip: ' + sites_custom[key]['random_ip'] : '') +
      (sites_custom[key]['amp_unhide'] > 0 ? ' | amp_unhide' : '') +
      (sites_custom[key]['amp_redirect'] ? ' | amp_redirect' : '') +
      (sites_custom[key]['ld_json'] ? ' | ld_json' : '');
      optionEl.value = key;
      selectEl.add(optionEl);
    }
    labelEl.appendChild(selectEl);
    custom_sitesEl.appendChild(labelEl);
    
    if (sites_updated_domains_new.length > 0) {
      labelEl = document.createElement('p');
      labelEl.appendChild(document.createElement('label'));
      labelEl.appendChild(document.createTextNode('Updated sites: ' + sites_updated_domains_new.join()));
      custom_sitesEl.appendChild(labelEl);
    }
    
    perm_origins = perm_origins.concat(sites_updated_domains_new).map(x => '*://*.' + x + '/*');
    var perm_custom = document.getElementById('perm-custom');
    ext_api.permissions.contains({
      origins: perm_origins
    }, function (result) {
      if (result) {
        perm_custom.innerText = 'YES';
      } else {
        perm_custom.innerText = 'NO';
      }
    });
  });
  
  var custom_enabled = document.getElementById('custom-enabled');
  ext_api.permissions.contains({
    origins: ["*://*/*"]
  }, function (result) {
    if (result) {
      custom_enabled.innerText = 'YES';
    } else {
      custom_enabled.innerText = 'NO';
    }
  });
}

function filterCustomSites() {
  var q = document.getElementById('custom_search').value.trim().toLowerCase();
  document.querySelectorAll('#custom_sites option').forEach(function (opt) {
    opt.hidden = !!q && !opt.text.toLowerCase().includes(q);
  });
}

document.addEventListener('DOMContentLoaded', renderOptions);
document.getElementById('custom_search').addEventListener('input', filterCustomSites);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('sort').addEventListener('click', sort_options);
document.getElementById('export').addEventListener('click', export_options);
document.getElementById('import').onclick = function () {importInput.click()}
document.getElementById('importInput').addEventListener("change", import_options, false);
document.getElementById('add').addEventListener('click', add_options);
document.getElementById('delete').addEventListener('click', delete_options);
document.getElementById('edit').addEventListener('click', edit_options);
document.getElementById('perm_request').addEventListener('click', request_permissions);
document.getElementById('perm_remove').addEventListener('click', remove_permissions);
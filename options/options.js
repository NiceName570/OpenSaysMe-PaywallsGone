// defaultSites are loaded from sites.js at installation extension (and are saved to local storage)
// var defaultSites = {};
var ext_api = chrome || browser;

// Saves options to ext_api.storage
function save_options() {
  var gh_url = document.getElementById('bypass_sites').value;
  var inputEls = document.querySelectorAll('#bypass_sites input');
  var sites = {};

  var sites = Array.from(inputEls).reduce(function(memo, inputEl) {
    if (inputEl.checked) {
      memo[inputEl.dataset.key] = inputEl.dataset.value;
    }
    return memo;
  }, {});

  bpcStorage.local.set({
    sites: sites
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function () {
      status.textContent = '';
    }, 800);
  });
}

// Restores checkbox input states using the preferences stored in bpcStorage.
function renderOptions() {
  var labelEl;
  bpcStorage.local.get({
    sites: {},
    sites_updated: {},
    sites_custom: {},
    sites_excluded: []
  }, function (items) {
    var sites = items.sites;
    var sites_updated = items.sites_updated;
    var sites_updated_domains_new = Object.values(sites_updated).filter(x => x.domain && !defaultSites_domains.includes(x.domain)).map(x => x.domain);
    var sites_custom = items.sites_custom;
    var sites_custom_domains = Object.values(sites_custom).filter(x => x.domain).map(x => x.domain);

    var perm_origins = sites_custom_domains.concat(sites_updated_domains_new).map(x => '*://*.' + x + '/*');
    var perm_custom = document.getElementById('perm-custom');
    ext_api.permissions.contains({
      origins: perm_origins
    }, function (result) {
      if (result) {
        perm_custom.innerText = '';
      } else {
        perm_custom.textContent = ">> check permissions for custom/updated sites";
      }
    });

    var sites_excluded = items.sites_excluded;
    var sitesEl = document.getElementById('bypass_sites');
    var site_types = {
      "updated": {
        sites: sites_updated,
        title: '* Updated (new) Sites (opt-in to custom sites)',
        default_sites: false
      },
      "default": {
        sites: defaultSites,
        title: '* Default Sites',
        default_sites: true
      },
      "custom": {
        sites: sites_custom,
        title: '* Custom (new) Sites',
        default_sites: false
      }
    };
    for (let site_type in site_types) {
      let sectionEl = document.createElement('section');
      sectionEl.className = 'site-section';
      let headEl = document.createElement('h3');
      let titleText = site_types[site_type].title.replace(/^\* /, '');
      headEl.appendChild(document.createTextNode(titleText));
      let countEl = document.createElement('span');
      countEl.className = 'badge';
      headEl.appendChild(countEl);
      sectionEl.appendChild(headEl);
      let gridEl = document.createElement('div');
      gridEl.className = 'site-grid';
      sectionEl.appendChild(gridEl);
      let sites_arr = site_types[site_type].sites;
      let count = 0;
      for (let key in sites_arr) {
        let domain = sites_arr[key]['domain'];
        if (!domain || (!site_types[site_type].default_sites && (defaultSites.hasOwnProperty(key) || defaultSites_domains.includes(domain))))
          continue;
        let labelEl = document.createElement('label');
        if (domain === '###') {
          labelEl.className = 'site-divider';
          labelEl.appendChild(document.createTextNode(key));
          gridEl.appendChild(labelEl);
          continue;
        }
        let inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        inputEl.dataset.key = key;
        inputEl.dataset.value = domain;
        inputEl.checked = Object.keys(sites).some(title => compareKey(title, key)) && !sites_excluded.includes(domain);
        labelEl.appendChild(inputEl);
        labelEl.appendChild(document.createTextNode(' ' + key));
        labelEl.dataset.search = (key + ' ' + domain).toLowerCase();
        labelEl.dataset.section = titleText;
        gridEl.appendChild(labelEl);
        count++;
      }
      countEl.textContent = count;
      if (count > 0 || site_type === 'default')
        sitesEl.appendChild(sectionEl);
    }
    // excluded
    let excludedEl = document.createElement('section');
    excludedEl.className = 'site-section';
    let excludedHead = document.createElement('h3');
    excludedHead.textContent = 'Excluded sites';
    excludedEl.appendChild(excludedHead);
    let excludedList = document.createElement('p');
    excludedList.className = 'muted';
    excludedList.textContent = sites_excluded.length ? sites_excluded.join(', ') : 'None (ignored when checked in list).';
    excludedEl.appendChild(excludedList);
    sitesEl.appendChild(excludedEl);
    filterSites();
    save_options();
  });
}

function selectAll() {
  var inputEls = Array.from(document.querySelectorAll('#bypass_sites input'));
  inputEls = inputEls.filter(function (input) {
      return (!input.dataset.value.match(/^#options_(disable|optin)_/));
    });
  inputEls.forEach(function (inputEl) {
    inputEl.checked = true;
  });
  // Update status to let user know all sites are selected.
  var status = document.getElementById('status');
  status.textContent = 'All sites selected.';
  setTimeout(function () {
    status.textContent = '';
  }, 800);
}

function selectNone() {
  var inputEls = Array.from(document.querySelectorAll('#bypass_sites input'));
  inputEls.forEach(function(inputEl) {
    inputEl.checked = false;
  });
}

// live search: shows only matching sites and tells if the site is already in the list
function filterSites() {
  var q = document.getElementById('site_search').value.trim().toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
  var labels = document.querySelectorAll('#bypass_sites label[data-search]');
  var matches = [];
  labels.forEach(function (el) {
    var hit = !q || el.dataset.search.includes(q);
    el.hidden = !hit;
    if (hit && q)
      matches.push(el);
  });
  document.querySelectorAll('#bypass_sites .site-divider').forEach(function (el) {
    el.hidden = !!q;
  });
  document.querySelectorAll('#bypass_sites .site-section').forEach(function (sec) {
    var grid = sec.querySelector('.site-grid');
    if (grid)
      sec.hidden = !!q && !grid.querySelector('label[data-search]:not([hidden])');
  });
  var result = document.getElementById('search_result');
  result.className = 'search-result';
  result.textContent = '';
  if (!q)
    return;
  if (matches.length) {
    var exact = matches.find(el => el.querySelector('input').dataset.value === q);
    var el = exact || matches[0];
    var enabled = el.querySelector('input').checked;
    result.textContent = '\u2713 ' + (exact ? q : matches.length + (matches.length > 1 ? ' matches' : ' match')) +
      ' already in list (' + el.dataset.section + ', ' + (enabled ? 'enabled' : 'not enabled') + ')';
    result.classList.add('found');
  } else {
    var link = document.createElement('a');
    link.href = 'options_custom.html';
    link.textContent = 'Add it as a custom site \u2192';
    result.appendChild(document.createTextNode('Not in list. '));
    result.appendChild(link);
    result.classList.add('missing');
  }
}

function closeButton() {
  window.close();
}

function check_sites_updated() {
  ext_api.runtime.sendMessage({request: 'check_sites_updated'});
  location.reload();
}

function compareKey(firstStr, secondStr) {
  return firstStr.toLowerCase().replace(/\s\(.*\)/, '') === secondStr.toLowerCase().replace(/\s\(.*\)/, '');
}

document.addEventListener('DOMContentLoaded', renderOptions);
document.getElementById('site_search').addEventListener('input', filterSites);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('select-all').addEventListener('click', selectAll);
document.getElementById('select-none').addEventListener('click', selectNone);
document.getElementById("button-close").addEventListener('click', closeButton);
document.getElementById('sites_updated').addEventListener('click', check_sites_updated);

var ext_api = (typeof browser === 'object') ? browser : chrome;

function popup_show_toggle(domain, enabled) {
  if (domain) {
    var site_switch_span = document.getElementById('site_switch_span');
    let labelEl = document.createElement('label');
    labelEl.setAttribute('class', 'switch');
    let inputEl = document.createElement('input');
    inputEl.setAttribute('id', 'site_switch');
    inputEl.setAttribute('type', 'checkbox');
    if (enabled)
      inputEl.setAttribute('checked', true);
    labelEl.appendChild(inputEl);
    let spanEl = document.createElement('span');
    spanEl.setAttribute('class', 'slider round');
    spanEl.setAttribute('title', 'Enable or disable this site in OpenSaysMe');
    labelEl.appendChild(spanEl);
    site_switch_span.appendChild(labelEl);
    document.getElementById("site_switch").addEventListener('click', function () {
      ext_api.runtime.sendMessage({
        request: 'site_switch'
      });
      //open(location).close();
    });
  }
};

ext_api.runtime.sendMessage({
  request: 'popup_show_toggle'
});
ext_api.runtime.onMessage.addListener(function (message, sender) {
  if (message.msg === 'popup_show_toggle' && message.data) {
    popup_show_toggle(message.data.domain, message.data.enabled)
  }
});

document.getElementById("clear_cookies").addEventListener('click', function () {
  ext_api.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
      let hostname = new URL(tabs[0].url).hostname;
      let cookie_domain = getCookiePermDomain(hostname);
      ext_api.permissions.contains({
        origins: ["*://*." + cookie_domain + "/*"]
      }, function (result) {
        if (result) {
          ext_api.runtime.sendMessage({
            request: 'clear_cookies'
          });
        } else {
          ext_api.permissions.request({
            origins: ["*://*." + cookie_domain + "/*"]
          }, function (granted) {
            if (granted) {
              ext_api.runtime.sendMessage({
                request: 'clear_cookies'
              });
            }
          });
        }
      });
    }
  });
});

function closeButton() {
  window.close();
}

function getCookiePermDomain(hostname) {
  let domain = hostname.replace(/^(www|amp(html)?|m|wap)(\d)?\./, '');
  let domain_split = domain.split('.');
  let num = 2;
  if (domain_split.length > 2 && domain.match(/(\w){2,4}\.(\w){2}$/))
    num = 3;
  domain = domain_split.slice(-num).join('.');
  return domain;
}

document.getElementById("button-close").addEventListener('click', closeButton);

// add current site to custom sites with one click
function setAddStatus(text, isError) {
  var el = document.getElementById('add_status');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}

function addCurrentSite() {
  ext_api.tabs.query({
    active: true,
    currentWindow: true
  }, function (tabs) {
    if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.startsWith('http')) {
      setAddStatus('Open a news site first.', true);
      return;
    }
    let domain = new URL(tabs[0].url).hostname.replace(/^(www|amp(html)?|m|wap)(\d)?\./, '').toLowerCase();
    let origins = ["*://*." + domain + "/*"];
    // permission request must start from the click
    ext_api.permissions.request({
      origins: origins
    }, function (granted) {
      if (!granted) {
        setAddStatus('Permission needed to add this site.', true);
        return;
      }
      bpcStorage.local.get({
        sites_custom: {}
      }, function (items) {
        let sites_custom = items.sites_custom;
        if (typeof defaultSites_domains !== 'undefined' && defaultSites_domains.includes(domain) ||
            Object.values(sites_custom).some(x => x.domain === domain)) {
          setAddStatus(domain + ' is already supported.');
          return;
        }
        let title = domain.split('.').slice(-2, -1)[0] || domain;
        title = title.charAt(0).toUpperCase() + title.slice(1);
        if (sites_custom[title])
          title = domain;
        setAddStatus('Detecting paywall type...');
        detectSiteRule(tabs[0].id, domain, function (res) {
          sites_custom[title] = res.rule;
          bpcStorage.local.set({
            sites_custom: sites_custom
          }, function () {
            setAddStatus('✓ Added ' + domain + ' (' + res.found.join(', ') + '). Reload the page.');
            document.getElementById('add_site_btn').disabled = true;
          });
        });
      });
    });
  });
}

document.getElementById("add_site_btn").addEventListener('click', addCurrentSite);

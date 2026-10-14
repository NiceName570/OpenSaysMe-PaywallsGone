const version = document.getElementById('version');
if (version) version.textContent = 'v' + chrome.runtime.getManifest().version;
const versionNotice = document.getElementById('version_new');
if (versionNotice) versionNotice.replaceChildren();

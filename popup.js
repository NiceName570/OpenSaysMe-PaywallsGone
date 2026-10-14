const frame = document.getElementById('tools');
const tabs = {news: {url: 'options/popup.html', title: 'News access tools'}, research: {url: 'html/popup.html', title: 'Open-access research tools'}};
function selectTool(name) {
  const tool = tabs[name] || tabs.news;
  frame.src = tool.url;
  frame.title = tool.title;
  for (const [id, button] of Object.entries(tabs)) document.getElementById(id).setAttribute('aria-pressed', String(button === tool));
  chrome.storage.local.set({'osm:popupTab': name});
}
for (const name of Object.keys(tabs)) document.getElementById(name).addEventListener('click', () => selectTool(name));
frame.addEventListener('load', () => {
  const body = frame.contentDocument?.body;
  if (!body) return;
  body.style.minWidth = '0';
  body.style.width = 'auto';
  const close = body.querySelector('#button-close');
  if (close) close.hidden = true;
  const resize = () => {
    const shellHeight = [...document.body.children].filter(element => element !== frame && element.tagName !== 'SCRIPT')
      .reduce((height, element) => height + element.getBoundingClientRect().height, 0);
    const available = Math.max(180, 590 - shellHeight);
    frame.style.height = Math.min(available, Math.max(180, body.scrollHeight + 4)) + 'px';
  };
  new ResizeObserver(resize).observe(body);
  resize();
});
chrome.storage.local.get(['osm:popupTab', 'osm:rules']).then(data => {
  if (data['osm:popupTab'] === 'research') selectTool('research');
  const status = data['osm:rules'];
  const message = document.getElementById('rule-status');
  if (status?.error) { message.hidden = false; message.textContent = 'News rules could not load: ' + status.error; }
  else if (status?.skipped?.length) { message.hidden = false; message.textContent = `${status.skipped.length} legacy rules need attention. See Settings.`; }
});
chrome.tabs.query({active: true, currentWindow: true}).then(([tab]) => {
  if (/^https?:/.test(tab?.url || '')) document.getElementById('current-site').textContent = new URL(tab.url).hostname;
});

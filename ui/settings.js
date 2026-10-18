function showStatus(data) {
  const rules = data['osm:rules'];
  const summary = document.getElementById('rule-summary');
  const list = document.getElementById('skipped-rules');
  list.replaceChildren();
  if (!rules) { summary.textContent = 'Preparing news rules…'; return; }
  if (rules.error) { summary.textContent = 'Rules could not load: ' + rules.error; return; }
  summary.textContent = `${rules.count} network rules active. ${rules.skipped.length} legacy rules need attention.`;
  for (const item of rules.skipped) {
    const row = document.createElement('li');
    row.textContent = `${item.domain}: ${item.reason}. Its page tools remain available.`;
    list.append(row);
  }
}
chrome.storage.local.get('osm:rules').then(showStatus);
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes['osm:rules']) showStatus({'osm:rules': changes['osm:rules'].newValue});
});

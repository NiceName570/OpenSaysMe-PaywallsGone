/* Port the finite, packaged script injections used by BPC. Never evaluate code. */
function osmExecuteScript(tabId, options, callback) {
  if (typeof tabId === 'object') { callback = options; options = tabId; tabId = undefined; }
  const run = async () => {
    if (tabId == null) tabId = (await chrome.tabs.query({active: true, currentWindow: true}))[0]?.id;
    if (tabId == null || tabId < 0) return [];
    const target = {tabId, allFrames: !!options.allFrames};
    let injection;
    if (options.file) injection = {files: [options.file]};
    else if (options.code?.startsWith('var bg2csData = ')) {
      const data = JSON.parse(options.code.slice('var bg2csData = '.length).replace(/;\s*$/, ''));
      injection = {func: value => { globalThis.bg2csData = value; }, args: [data]};
    } else throw new Error('An unported script injection was requested.');
    const results = await chrome.scripting.executeScript({target, injectImmediately: true, ...injection});
    return results.map(item => item.result);
  };
  const promise = run();
  if (callback) { promise.then(callback).catch(() => callback([])); return; }
  return promise;
}

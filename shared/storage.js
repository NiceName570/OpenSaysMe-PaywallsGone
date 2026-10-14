/* Keep each upstream component's preferences and reset operation independent. */
function osmScopedStorage(prefix) {
  const area = chrome.storage.local;
  const listeners = new Map();
  const unpack = data => Object.fromEntries(Object.entries(data)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value]));
  function finish(promise, callback) {
    if (callback) { promise.then(callback).catch(error => console.error(error)); return; }
    return promise;
  }
  return {
    local: {
      get(keys, callback) {
        if (typeof keys === 'function') { callback = keys; keys = null; }
        const mapped = keys == null ? null : typeof keys === 'string' ? prefix + keys
          : Array.isArray(keys) ? keys.map(key => prefix + key)
          : Object.fromEntries(Object.entries(keys).map(([key, value]) => [prefix + key, value]));
        return finish(area.get(mapped).then(unpack), callback);
      },
      set(data, callback) {
        return finish(area.set(Object.fromEntries(Object.entries(data)
          .map(([key, value]) => [prefix + key, value]))), callback);
      },
      remove(keys, callback) {
        return finish(area.remove([keys].flat().map(key => prefix + key)), callback);
      },
      clear(callback) {
        return finish(area.get(null).then(data => area.remove(Object.keys(data)
          .filter(key => key.startsWith(prefix)))), callback);
      }
    },
    onChanged: {
      addListener(listener) {
        if (listeners.has(listener)) return;
        const wrapped = (changes, namespace) => {
          if (namespace !== 'local') return;
          const scoped = unpack(changes);
          if (Object.keys(scoped).length) listener(scoped, namespace);
        };
        listeners.set(listener, wrapped);
        chrome.storage.onChanged.addListener(wrapped);
      },
      removeListener(listener) {
        const wrapped = listeners.get(listener);
        if (wrapped) chrome.storage.onChanged.removeListener(wrapped);
        listeners.delete(listener);
      },
      hasListener(listener) { return listeners.has(listener); }
    }
  };
}
var bpcStorage = osmScopedStorage('bpc:');
var oaStorage = osmScopedStorage('oa:');

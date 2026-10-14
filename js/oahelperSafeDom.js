/**
 * Shared DOM-construction helpers used in place of innerHTML string-building.
 * Loaded as a plain global-scope script before any file that calls these functions
 * (see content_scripts in manifest.json/manifest_v2.json, and the <script> order in
 * options.html / popup.html).
 */

/** Escapes HTML-special characters for the rare case a string must still be built by hand. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes a value for safe insertion into an HTML attribute. */
function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * Builds a DOM element from a declarative spec using createElement/setAttribute/textContent
 * only - never innerHTML - so interpolated values can never be parsed as markup.
 * @param {{tag: string, id?: string, className?: string, attrs?: Object<string,string>,
 *   dataset?: Object<string,string>, text?: string, children?: HTMLElement[]}} spec
 * @returns {HTMLElement}
 */
function buildElement(spec) {
  const el = document.createElement(spec.tag);
  if (spec.id != null) el.id = spec.id;
  if (spec.className != null) el.className = spec.className;
  if (spec.attrs) {
    Object.keys(spec.attrs).forEach((name) => {
      el.setAttribute(name, spec.attrs[name]);
    });
  }
  if (spec.dataset) {
    Object.keys(spec.dataset).forEach((key) => {
      el.dataset[key] = spec.dataset[key];
    });
  }
  if (spec.text != null) el.textContent = spec.text;
  if (spec.children) {
    spec.children.forEach((child) => el.appendChild(child));
  }
  return el;
}

/**
 * Builds the `<div class="oahelper_..."><img/><span/></div><span LiveRegion/>` content shared
 * by every content.js badge-injection function, and returns it as a DocumentFragment ready to
 * be appended into the caller's outer wrapper div.
 * @param {{innerId?: string, innerClass: string, innerTitle: string, innerDataset?: Object,
 *   imgId: string, imgSrc: string, imgTitle: string, imgDataset?: Object,
 *   msgId: string, msgText: string, liveRegionId: string}} spec
 * @returns {DocumentFragment}
 */
function buildBadgeContent(spec) {
  const img = buildElement({
    tag: 'img',
    id: spec.imgId,
    attrs: { src: spec.imgSrc, align: 'left', title: spec.imgTitle },
    dataset: spec.imgDataset || {},
  });

  const msg = buildElement({ tag: 'span', id: spec.msgId, text: spec.msgText });

  const inner = buildElement({
    tag: 'div',
    id: spec.innerId,
    className: spec.innerClass,
    attrs: { title: spec.innerTitle },
    dataset: spec.innerDataset || {},
    children: [img, msg],
  });

  const liveRegion = buildElement({
    tag: 'span',
    id: spec.liveRegionId,
    attrs: { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' },
  });

  const fragment = document.createDocumentFragment();
  fragment.appendChild(inner);
  fragment.appendChild(liveRegion);
  return fragment;
}

const SAFE_TEMPLATE_TAGS = new Set(['br', 'em', 'strong', 'span', 'button', 'img', 'p', 'a', 'mark']);
const SAFE_TEMPLATE_ATTRS = new Set(['id', 'class', 'data-url', 'href', 'src', 'target', 'rel']);
const SAFE_TEMPLATE_PLACEHOLDER = /\{(\w+)\}/g;

function substituteTemplatePlaceholders(text, values) {
  if (!values) return text;
  return String(text).replace(SAFE_TEMPLATE_PLACEHOLDER, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function sanitizeTemplateNode(node, values, targetParent) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = substituteTemplatePlaceholders(node.textContent, values);
    if (text !== '') targetParent.appendChild(document.createTextNode(text));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.tagName.toLowerCase();
  if (!SAFE_TEMPLATE_TAGS.has(tag)) return;

  const el = document.createElement(tag);
  Array.from(node.attributes).forEach((attr) => {
    if (SAFE_TEMPLATE_ATTRS.has(attr.name)) {
      el.setAttribute(attr.name, substituteTemplatePlaceholders(attr.value, values));
    }
  });
  Array.from(node.childNodes).forEach((child) => sanitizeTemplateNode(child, values, el));
  targetParent.appendChild(el);
}

/**
 * Renders a constrained HTML-with-{placeholder} template (e.g. from _locales/*.json or a
 * remote institute's `configuration.translations` override) into a DocumentFragment.
 *
 * The template markup itself is parsed and filtered against a fixed tag/attribute allowlist
 * BEFORE any placeholder values are substituted, and values are then inserted via
 * setAttribute/textContent rather than re-parsed - so untrusted `values` can never introduce
 * new elements/attributes, and an untrusted `template` (e.g. a compromised remote override)
 * can never render anything outside the allowlist, regardless of what either contains.
 * @param {string} template
 * @param {Object<string,string>} values
 * @returns {DocumentFragment}
 */
function renderSafeTemplate(template, values) {
  const parsed = new DOMParser().parseFromString(String(template), 'text/html').body;
  const fragment = document.createDocumentFragment();
  Array.from(parsed.childNodes).forEach((node) => sanitizeTemplateNode(node, values, fragment));
  return fragment;
}

/**
 * Replaces container's content with a Bulma notification wrapping the given i18n message,
 * rendered via renderSafeTemplate (never innerHTML). Used for the options pages' status area,
 * whose locale strings only carry inline markup (links, <strong>, <br>) - not the notification
 * wrapper itself, since the wrapper's class depends on `type`, which the caller picks.
 * @param {HTMLElement} container
 * @param {string} key - _locales message key.
 * @param {'success'|'warning'|'danger'} type
 * @param {Object<string,string>} [values] - Placeholder values for {name}-style tokens.
 */
const STATUS_TYPE_IDS = { success: 'optionssaved', warning: 'optionswarning', danger: 'optionserror' };

function showStatus(container, key, type, values) {
  container.textContent = '';
  const notification = document.createElement('div');
  notification.id = STATUS_TYPE_IDS[type];
  notification.className = `notification is-${type} mt-5`;
  notification.appendChild(renderSafeTemplate(chrome.i18n.getMessage(key), values));
  container.appendChild(notification);
}

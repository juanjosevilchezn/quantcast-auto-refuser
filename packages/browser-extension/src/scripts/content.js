/**
 * @typedef {Object} ExtensionData
 * @property {string[] | undefined} commonWords
 * @property {string[] | undefined} fixes
 * @property {{ domains: string[] | undefined, tags: string[] | undefined } | undefined} skips
 * @property {{ classes: string[] | undefined, selectors: string[] | undefined } | undefined} tokens
 */

if (typeof browser === 'undefined') {
  browser = chrome;
}

/**
 * @description Matched elements count
 * @type {number}
 */
let count = 0;

/**
 * @description Data properties
 * @type {ExtensionData}
 */
let { commonWords, fixes = [], skips, tokens } = {};

/**
 * @description Attribute name
 */
const dataAttributeName = 'data-cookie-dialog-monster';

/**
 * @description Shortcut to send messages to background script
 */
const dispatch = browser.runtime.sendMessage;

/**
 * @description Current hostname
 * @type {string}
 */
const hostname = getHostname();

/**
 * @description Initial visibility state
 * @type {boolean}
 */
let initiallyVisible = document.visibilityState === 'visible';

/**
 * @description Options provided to observer
 * @type {MutationObserverInit}
 */
const options = { childList: true, subtree: true };

/**
 * @description Is consent preview page?
 */
const preview = hostname.startsWith('consent.') || hostname.startsWith('myprivacy.');

/**
 * @description Elements that were already matched and are removable
 * @type {HTMLElement[]}
 */
const removables = [];

/**
 * @description Elements that were already seen
 * @type {HTMLElement[]}
 */
const seen = [];

/**
 * @description Extension state
 * @type {{ enabled: boolean }}
 */
let state = { enabled: true };

/**
 * @description Event name to trigger the cleaning process
 */
const triggerEventName = 'cookie-dialog-monster';

/**
 * @description Clean DOM
 * @param {Element[]} elements
 * @param {boolean?} skipMatch
 * @returns {void}
 */
function clean(elements, skipMatch) {
  for (const element of elements) {
    if (match(element, skipMatch)) {
      const observer = new MutationObserver(forceElementStyles);
      const options = { attributes: true, attributeFilter: [dataAttributeName, 'class', 'style'] };

      element.setAttribute(dataAttributeName, 'true');
      element.style.setProperty('display', 'none', 'important');
      observer.observe(element, options);

      count += 1;
      dispatch({ type: 'SET_BADGE', value: `${count}` });

      if (!removables.includes(element)) {
        removables.push(element);
      }
    }

    seen.push(element);
  }
}

/**
 * @description Force a DOM clean in the specific element
 * @param {HTMLElement} element
 * @returns {void}
 */
function forceClean(element) {
  const elements = [...element.querySelectorAll(tokens.selectors)];

  if (elements.length) {
    fix();
    clean(elements, true);
  }
}

/**
 * @description Force element to have these styles
 * @type {MutationCallback}
 */
function forceElementStyles(mutations, observer) {
  for (const mutation of mutations) {
    const element = mutation.target;
    const value = element.getAttribute(dataAttributeName);

    if (value === null) {
      observer.disconnect();
      element.removeAttribute(dataAttributeName);
      element.style.removeProperty('display');
    } else {
      element.style.setProperty('display', 'none', 'important');
    }
  }
}

/**
 * @description Calculate current hostname
 * @returns {string}
 */
function getHostname() {
  let hostname = document.location.hostname;
  const referrer = document.referrer;

  if (referrer && window.self !== window.top) {
    hostname = new URL(referrer).hostname;
  }

  return hostname.split('.').slice(-3).join('.').replace('www.', '');
}

/**
 * @description Check if an element is visible in the viewport
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isInViewport(element) {
  const height = window.innerHeight || document.documentElement.clientHeight;
  const position = element.getBoundingClientRect();
  const scroll = window.scrollY;

  return (
    position.bottom === position.top ||
    (scroll + position.top <= scroll + height && scroll + position.bottom >= scroll)
  );
}

/**
 * @description Check if element element is removable
 * @param {Element} element
 * @param {boolean?} skipMatch
 * @returns {boolean}
 */
function match(element, skipMatch) {
  if (
    !commonWords.length ||
    !tokens?.classes?.length ||
    !tokens?.selectors?.length ||
    !skips?.tags?.length
  ) {
    return false;
  }

  if (!(element instanceof HTMLElement) || !element.tagName) {
    return false;
  }

  if (element.getAttribute(dataAttributeName)) {
    return false;
  }

  if (seen.includes(element)) {
    return false;
  }

  const tagName = element.tagName?.toUpperCase?.();

  if (skips.tags.includes(tagName)) {
    return false;
  }

  if (element.hasAttributes()) {
    // 2023-06-10: fix twitch.tv temporarily
    if (element.classList.contains('chat-line__message')) {
      return false;
    }

    const isDialog = tagName === 'DIALOG' && element.getAttribute('open') === 'true';
    const isFakeDialog = tagName === 'DIV' && element.className.includes('cmp');

    return (
      (isDialog || isFakeDialog || isInViewport(element)) &&
      (skipMatch || element.matches(tokens.selectors))
    );
  } else {
    // 2023-06-10: fix edge case force cleaning on children if no attributes
    if (commonWords && element.outerHTML.match(new RegExp(commonWords.join('|')))) {
      forceClean(element);
    }
  }

  return false;
}

/**
 * @description Fix data, middle consent page and scroll issues
 * @returns {void}
 */
function fix() {
  const backdrops = document.getElementsByClassName('modal-backdrop');
  const domains = (skips?.domains ?? []).map((x) => (x.split('.').length < 3 ? `*${x}` : x));

  for (const backdrop of backdrops) {
    if (backdrop.children.length === 0 && backdrop.style.display !== 'none') {
      backdrop.style.setProperty('display', 'none');
      count += 1;
      dispatch({ type: 'SET_BADGE', value: `${count}` });
    }
  }

  // 2024-08-02: fix #644 temporarily
  document.getElementsByTagName('ion-router-outlet')[0]?.removeAttribute('inert');

  for (const fix of fixes) {
    const [match, selector, action, property] = fix.split('##');

    if (hostname.includes(match)) {
      switch (action) {
        case 'click': {
          const element = document.querySelector(selector);
          element?.click();
          break;
        }
        case 'remove': {
          const element = document.querySelector(selector);
          element?.style?.removeProperty(property);
          break;
        }
        case 'reset': {
          const element = document.querySelector(selector);
          element?.style?.setProperty(property, 'initial', 'important');
          break;
        }
        case 'resetAll': {
          const elements = document.querySelectorAll(selector);
          elements.forEach((e) => e?.style?.setProperty(property, 'initial', 'important'));
          break;
        }
      }
    }
  }

  if (domains.every((x) => !hostname.match(x.replaceAll(/\*/g, '[^ ]*')))) {
    for (const element of [document.body, document.documentElement]) {
      element?.classList.remove(...(tokens?.classes ?? []));
      element?.style.setProperty('position', 'initial', 'important');
      element?.style.setProperty('overflow-y', 'initial', 'important');
    }
  }
}

/**
 * @description Calculate reading time for the current page to avoid lags in large pages
 * @returns {number}
 */
function readingTime() {
  const text = document.body.innerText;
  const wpm = 225;
  const words = text.trim().split(/\s+/).length;
  const time = Math.ceil(words / wpm);

  return time;
}

/**
 * @description Restore DOM to its previous state
 * @returns {void}
 */
function restoreDOM() {
  const backdrop = document.getElementsByClassName('modal-backdrop')[0];

  if (backdrop?.children.length === 0) {
    backdrop.style.removeProperty('display');
  }

  const elements = [...document.querySelectorAll(`[${dataAttributeName}]`)];

  for (const element of elements) {
    element.removeAttribute(dataAttributeName);
  }

  for (const element of [document.body, document.documentElement]) {
    element?.style.removeProperty('position');
    element?.style.removeProperty('overflow-y');
  }

  count = 0;
  seen.splice(0, seen.length);
}

/**
 * @async
 * @description Set up everything
 */
async function setup() {
  state = (await dispatch({ hostname, type: 'GET_HOSTNAME_STATE' })) ?? state;
  dispatch({ type: 'ENABLE_POPUP' });

  if (state.enabled) {
    const data = await dispatch({ hostname, type: 'GET_DATA' });

    commonWords = data?.commonWords;
    fixes = data?.fixes;
    skips = data?.skips;
    tokens = data?.tokens;

    if (count > 0) {
      dispatch({ type: 'SET_BADGE', value: `${count}` });
    }

    dispatch({ type: 'ENABLE_ICON' });
    observer.observe(document.body ?? document.documentElement, options);
  } else {
    dispatch({ type: 'DISABLE_ICON' });
    observer.disconnect();
  }
}

/**
 * @description Mutation Observer instance
 * @type {MutationObserver}
 */
const observer = new MutationObserver((mutations) => {
  if (preview || !state.enabled || !tokens?.selectors.length) {
    return;
  }

  const elements = mutations.flatMap((mutation) => Array.from(mutation.addedNodes));

  window.dispatchEvent(new Event(triggerEventName, { detail: { elements } }));
});

/**
 * @description Listen to messages from any other scripts
 * @listens browser.runtime#onMessage
 */
browser.runtime.onMessage.addListener(async (message) => {
  switch (message.type) {
    case 'RESTORE': {
      restoreDOM();
      break;
    }
    case 'RUN': {
      if (removables.length) clean(removables, true);
      break;
    }
  }

  fix();
  await setup();
});

/**
 * @async
 * @description Fix still existing elements when page loads
 * @listens window#DOMContentLoaded
 * @returns {void}
 */
window.addEventListener('DOMContentLoaded', async () => {
  if (document.visibilityState === 'visible') {
    await setup();
    window.dispatchEvent(new Event(triggerEventName));
  }
});

/**
 * @description Fix bfcache issues
 * @listens window#pageshow
 * @returns {void}
 */
window.addEventListener('pageshow', async (event) => {
  if (document.visibilityState === 'visible' && event.persisted) {
    await setup();
    window.dispatchEvent(new Event(triggerEventName));
  }
});

/**
 * @description Force clean when this event is fired
 * @listens window#cookie-dialog-monster
 * @returns {void}
 */
window.addEventListener(triggerEventName, (event) => {
  if (document.body?.children.length && !preview && state.enabled && tokens?.selectors?.length) {
    fix();

    if (event.detail?.elements) {
      clean(event.detail.elements);
    } else {
      if (readingTime() < 4) {
        forceClean(document.body);
      } else {
        // 2023-06-13: look into the first level of the document body, there are dialogs there very often
        clean([...document.body.children]);
      }
    }
  }
});

/**
 * @async
 * @description Run setup if the page wasn't visible yet
 * @listens window#visibilitychange
 * @returns {void}
 */
window.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !initiallyVisible) {
    initiallyVisible = true;
    await setup();
    window.dispatchEvent(new Event(triggerEventName));
  }
});

/**
 * DOM Mutation Observer + Click Interceptor
 * Injected into the live page to record all interactions and DOM changes.
 * Runs entirely in the browser context and exposes __ANALYZER__ on window.
 */
(function () {
  if (window.__ANALYZER__) return; // Already injected

  const SESSION = {
    events:       [],   // ordered interaction log
    snapshots:    {},   // keyed by event_id → before/after DOM snapshots
    domIndex:     {},   // selector → element metadata cache
    mutationLog:  [],   // raw MutationObserver records
    eventCounter: 0,
  };

  // ─── Utility: Generate a robust CSS selector for any element ────────────────

  function getSelector(el) {
    if (!el || el.nodeType !== 1) return null;

    // Prefer data attributes (most stable)
    for (const attr of ['data-id', 'data-key', 'data-row-id', 'data-index', 'id']) {
      const val = el.getAttribute(attr);
      if (val) {
        const sel = attr === 'id' ? `#${CSS.escape(val)}` : `[${attr}="${CSS.escape(val)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }

    // Build path walking up the tree
    const parts = [];
    let node = el;

    while (node && node !== document.body) {
      let part = node.tagName.toLowerCase();

      // Add meaningful classes (skip utility/state classes)
      const classes = Array.from(node.classList)
        .filter(c => !c.match(/^(active|open|closed|expanded|selected|hover|focus|visible|hidden|js-|is-)/))
        .slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');

      // Add nth-child only if needed for disambiguation
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter(s => s.tagName === node.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1;
        part += `:nth-of-type(${idx})`;
      }

      parts.unshift(part);
      node = node.parentElement;

      // Stop if selector is already unique
      const candidate = parts.join(' > ');
      if (document.querySelectorAll(candidate).length === 1) break;
    }

    return parts.join(' > ');
  }

  // ─── Utility: Capture a lightweight snapshot of an element's subtree ────────

  function snapshotElement(el, depth = 3) {
    if (!el || depth === 0) return null;
    return {
      tag:        el.tagName?.toLowerCase(),
      id:         el.id || null,
      classes:    Array.from(el.classList || []),
      attrs:      Object.fromEntries(
                    Array.from(el.attributes || [])
                      .filter(a => !['class','style'].includes(a.name))
                      .map(a => [a.name, a.value])
                  ),
      text:       el.innerText?.trim().slice(0, 120) || null,
      selector:   getSelector(el),
      childCount: el.children?.length || 0,
      children:   Array.from(el.children || []).slice(0, 8).map(c => snapshotElement(c, depth - 1)),
    };
  }

  // ─── Utility: Find all tables in a container ────────────────────────────────

  function findTables(container) {
    return Array.from(container.querySelectorAll('table, [role="grid"], [role="table"]'))
      .map(t => ({
        selector:   getSelector(t),
        rowCount:   t.querySelectorAll('tbody tr, [role="row"]').length,
        colCount:   t.querySelector('thead tr, [role="columnheader"]')
                      ?.children?.length || 0,
        hasExpanders: !!t.querySelector('[class*="expand"], [class*="toggle"], [class*="arrow"], details'),
        headers:    Array.from(t.querySelectorAll('th, [role="columnheader"]'))
                      .map(th => th.innerText.trim()).filter(Boolean),
      }));
  }

  // ─── MutationObserver: Track all DOM changes ────────────────────────────────

  const observer = new MutationObserver(records => {
    for (const rec of records) {
      const entry = {
        timestamp:    Date.now(),
        type:         rec.type,
        targetSel:    getSelector(rec.target),
        targetTag:    rec.target.tagName?.toLowerCase(),
        targetClasses: Array.from(rec.target.classList || []),
      };

      if (rec.type === 'childList') {
        entry.addedNodes    = Array.from(rec.addedNodes)
          .filter(n => n.nodeType === 1)
          .map(n => snapshotElement(n, 2));
        entry.removedNodes  = Array.from(rec.removedNodes)
          .filter(n => n.nodeType === 1)
          .map(n => ({ tag: n.tagName?.toLowerCase(), classes: Array.from(n.classList || []) }));
        entry.newTables     = Array.from(rec.addedNodes)
          .filter(n => n.nodeType === 1)
          .flatMap(n => findTables(n));
      }

      if (rec.type === 'attributes') {
        entry.attributeName = rec.attributeName;
        entry.oldValue      = rec.oldValue;
        entry.newValue      = rec.target.getAttribute(rec.attributeName);
      }

      // Only store if meaningful
      if (
        entry.addedNodes?.length ||
        entry.removedNodes?.length ||
        entry.newTables?.length ||
        (entry.type === 'attributes' && ['class','aria-expanded','style','hidden'].includes(entry.attributeName))
      ) {
        SESSION.mutationLog.push(entry);
      }
    }
  });

  observer.observe(document.body, {
    childList:      true,
    subtree:        true,
    attributes:     true,
    attributeOldValue: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'aria-hidden', 'data-expanded'],
  });

  // ─── Click Interceptor ──────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    const el = e.target;
    const id = ++SESSION.eventCounter;

    // Snapshot DOM state BEFORE any mutations process
    const preTables = findTables(document.body);

    const event = {
      id,
      type:      'click',
      timestamp: Date.now(),
      selector:  getSelector(el),
      tag:       el.tagName?.toLowerCase(),
      text:      el.innerText?.trim().slice(0, 80),
      classes:   Array.from(el.classList),
      href:      el.href || el.closest('a')?.href || null,
      // Will be filled after mutations settle
      mutations: [],
      newElements: [],
      newTables:   [],
    };

    SESSION.events.push(event);

    // Capture post-mutation state after a tick
    setTimeout(() => {
      const mutationsSinceClick = SESSION.mutationLog.filter(
        m => m.timestamp >= event.timestamp && m.timestamp <= Date.now()
      );

      event.mutations    = mutationsSinceClick;
      event.newTables    = findTables(document.body).filter(
        t => !preTables.find(pt => pt.selector === t.selector)
      );

      // Find newly visible containers
      event.newElements = mutationsSinceClick
        .flatMap(m => m.addedNodes || [])
        .filter(Boolean)
        .map(n => ({
          selector: n.selector,
          tag:      n.tag,
          classes:  n.classes,
          tables:   n.children?.filter(c => c.tag === 'table') || [],
        }));

      SESSION.snapshots[id] = {
        clickedElement: snapshotElement(el, 3),
        newTables:      event.newTables,
        newElements:    event.newElements,
        mutationCount:  mutationsSinceClick.length,
      };

    }, 600); // Wait for animations/XHR

  }, true); // Capture phase — before any framework handlers

  // ─── Form Field Tracker ─────────────────────────────────────────────────────

  document.addEventListener('change', function (e) {
    const el = e.target;
    SESSION.events.push({
      id:        ++SESSION.eventCounter,
      type:      el.type === 'checkbox' ? 'checkbox' : el.tagName === 'SELECT' ? 'select' : 'input',
      timestamp: Date.now(),
      selector:  getSelector(el),
      tag:       el.tagName?.toLowerCase(),
      name:      el.name || el.id || null,
      label:     document.querySelector(`label[for="${el.id}"]`)?.innerText?.trim() || null,
      value:     el.type === 'checkbox' ? el.checked : el.value,
      inputType: el.type,
    });
  }, true);

  // ─── Navigation Tracker ─────────────────────────────────────────────────────

  const origPushState    = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    SESSION.events.push({ id: ++SESSION.eventCounter, type: 'navigate', url: args[2], timestamp: Date.now() });
    return origPushState(...args);
  };
  history.replaceState = function (...args) {
    SESSION.events.push({ id: ++SESSION.eventCounter, type: 'replace_state', url: args[2], timestamp: Date.now() });
    return origReplaceState(...args);
  };

  // ─── Initial Page Snapshot ──────────────────────────────────────────────────

  SESSION.initialSnapshot = {
    url:    window.location.href,
    title:  document.title,
    tables: findTables(document.body),
    forms:  Array.from(document.querySelectorAll('form')).map(f => ({
      selector: getSelector(f),
      fields:   Array.from(f.querySelectorAll('input,select,textarea')).map(el => ({
        selector: getSelector(el),
        type:     el.type || el.tagName.toLowerCase(),
        name:     el.name || el.id || null,
        label:    document.querySelector(`label[for="${el.id}"]`)?.innerText?.trim() || null,
      })),
    })),
  };

  // ─── Public API (called from Python via page.evaluate) ──────────────────────

  window.__ANALYZER__ = {
    getSession:  () => JSON.parse(JSON.stringify(SESSION)),
    clearEvents: () => { SESSION.events = []; SESSION.mutationLog = []; SESSION.snapshots = {}; },
    snapshot:    (selector) => {
      const el = document.querySelector(selector);
      return el ? snapshotElement(el, 4) : null;
    },
    findExpandPatterns: () => {
      // Heuristic scan for expand/collapse elements before any interaction
      const candidates = [];
      const triggers = document.querySelectorAll(
        '[class*="expand"], [class*="toggle"], [class*="arrow"], [class*="caret"], ' +
        'details summary, tr[class*="parent"], td button, td a[class*="icon"]'
      );
      for (const t of triggers) {
        candidates.push({
          selector:       getSelector(t),
          tag:            t.tagName.toLowerCase(),
          classes:        Array.from(t.classList),
          text:           t.innerText?.trim().slice(0, 40),
          parentRow:      getSelector(t.closest('tr')),
          parentTable:    getSelector(t.closest('table')),
        });
      }
      return candidates;
    },
  };

  console.log('[ANALYZER] Injected. Session ID started.');
})();

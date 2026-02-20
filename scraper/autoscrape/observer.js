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
    captureHints: [],   // user-tagged "capture this for DB" { field, selector, attr, valueSample, condition? }
  };

  let captureMode = false;
  let captureBanner = null;

  function logEventCount() {
    try { console.log('[Recorder] events:', SESSION.events.length); } catch (e) {}
  }

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

  // ─── Capture mode: click element → get selector + value → tag for DB ─────────

  function getValueSample(el) {
    if (!el || el.nodeType !== 1) return { attr: 'text', value: '' };
    if (el.tagName === 'A' && el.href) return { attr: 'href', value: (el.href || '').slice(0, 200) };
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      const v = el.type === 'checkbox' ? el.checked : (el.value || '');
      return { attr: 'value', value: String(v).slice(0, 200) };
    }
    return { attr: 'text', value: (el.innerText || el.textContent || '').trim().slice(0, 200) };
  }

  function showCaptureBanner(on) {
    if (captureBanner) {
      captureBanner.remove();
      captureBanner = null;
    }
    if (!on) return;
    captureBanner = document.createElement('div');
    captureBanner.id = '__analyzer_capture_banner__';
    captureBanner.innerHTML = '🎯 <strong>Capture mode</strong>: click an element to add it as a field for the DB. Turn off via the button in the instructions panel (bottom-right).';
    captureBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#eee;padding:8px 12px;font-size:13px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    document.body.appendChild(captureBanner);
  }

  function toggleCaptureMode() {
    captureMode = !captureMode;
    showCaptureBanner(captureMode);
    var btn = document.getElementById('__analyzer_capture_btn__');
    if (btn) btn.textContent = captureMode ? '✓ Capture mode ON' : 'Capture mode OFF';
    console.log('[ANALYZER] Capture mode:', captureMode ? 'ON' : 'OFF');
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) || (e.altKey && e.shiftKey && (e.key === 'c' || e.key === 'C'))) {
      e.preventDefault();
      e.stopPropagation();
      toggleCaptureMode();
    }
  }, true);

  // In-page modal (works in iframes). Closes immediately on Add so you can keep selecting.
  function showCaptureModal(selector, attr, valueSample, onDone) {
    var existing = document.getElementById('__analyzer_capture_modal__');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = '__analyzer_capture_modal__';
    overlay.setAttribute('data-analyzer', 'capture-modal');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;visibility:visible;opacity:1;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#1e293b;color:#f1f5f9;padding:20px;border-radius:12px;min-width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.6);border:2px solid #475569;';
    box.setAttribute('data-analyzer', 'capture-box');
    box.innerHTML = [
      '<p style="margin:0 0 12px;font-weight:600;color:#f1f5f9;">Tag this element</p>',
      '<p style="margin:0 0 6px;font-size:12px;color:#cbd5e1;">Use for:</p>',
      '<select id="__analyzer_role__" style="width:100%;padding:8px 10px;margin-bottom:12px;border:2px solid #64748b;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:13px;box-sizing:border-box;">',
      '<option value="filter">Filter/Candidate — store in memory for criteria</option>',
      '<option value="target">Target data — store in Supabase</option>',
      '<option value="pdf">PDF/Resource — link or button for PDF/text</option>',
      '</select>',
      '<p style="margin:0 0 6px;font-size:12px;color:#cbd5e1;">Field name (e.g. case_status, case_number, pdf_url):</p>',
      '<input id="__analyzer_field__" type="text" placeholder="case_status" style="width:100%;padding:8px 10px;margin-bottom:12px;border:2px solid #64748b;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:14px;box-sizing:border-box;">',
      '<p style="margin:0 0 6px;font-size:12px;color:#cbd5e1;">Condition (optional): e.g. Active — leave empty to capture all.</p>',
      '<input id="__analyzer_condition__" type="text" placeholder="Leave empty to capture all" style="width:100%;padding:8px 10px;margin-bottom:16px;border:2px solid #64748b;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:14px;box-sizing:border-box;">',
      '<div style="display:flex;gap:8px;justify-content:flex-end;">',
      '<button type="button" id="__analyzer_modal_cancel__" style="padding:8px 16px;background:#475569;color:#fff;border:2px solid #64748b;border-radius:6px;cursor:pointer;">Cancel</button>',
      '<button type="button" id="__analyzer_modal_ok__" style="padding:8px 16px;background:#0e7490;color:#fff;border:2px solid #0e7490;border-radius:6px;cursor:pointer;font-weight:600;">Add &amp; close</button>',
      '</div>',
    ].join('');
    if (overlay.attachShadow) {
      var shadow = overlay.attachShadow({ mode: 'open' });
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);';
      wrap.appendChild(box);
      shadow.appendChild(wrap);
      shadow.appendChild((function () {
        var s = document.createElement('style');
        s.textContent = '*{box-sizing:border-box}';
        return s;
      })());
    } else {
      overlay.appendChild(box);
    }
    document.body.appendChild(overlay);
    // Prevent clicks inside the form (including native select dropdown) from closing the overlay
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    var roleSelect = box.querySelector('#__analyzer_role__');
    var fieldInput = box.querySelector('#__analyzer_field__');
    var condInput = box.querySelector('#__analyzer_condition__');
    if (fieldInput) fieldInput.focus();
    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function submit() {
      var fieldName = (fieldInput.value || '').trim();
      var role = (roleSelect && roleSelect.value) ? roleSelect.value : 'target';
      var condition = (condInput && condInput.value) ? condInput.value.trim() : '';
      close();
      if (fieldName) onDone(fieldName, condition, role);
    }
    var okBtn = box.querySelector('#__analyzer_modal_ok__');
    var cancelBtn = box.querySelector('#__analyzer_modal_cancel__');
    if (okBtn) okBtn.onclick = submit;
    if (cancelBtn) cancelBtn.onclick = close;
    if (fieldInput) fieldInput.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') close();
    };
    if (condInput) condInput.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') close();
    };
    overlay.onclick = function (e) {
      // Clicks inside the form (including via shadow) must not close — use composedPath for shadow DOM
      if (e.composedPath && e.composedPath().indexOf(box) !== -1) return;
      if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION')) return;
      if (e.target === overlay) close();
      if (overlay.shadowRoot && overlay.shadowRoot.contains(e.target) && !box.contains(e.target)) close();
    };

    overlay.offsetHeight; // force layout so it paints
  }

  // Don't treat clicks on our own UI as "tag this element" — so Add, dropdown, panel, and tab work
  function isOurUI(el) {
    if (!el) return false;
    if (el.id === '__analyzer_recorder_tab__' || el.id === '__analyzer_tag_next_btn__') return true;
    // Elements inside capture modal's shadow root: closest() doesn't cross shadow, so check host
    var root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
    if (root && root.host && root.host.id === '__analyzer_capture_modal__') return true;
    if (!el.closest) return false;
    return el.closest('#__analyzer_capture_modal__') ||
           el.closest('#__analyzer_instructions_panel__') ||
           el.closest('#__analyzer_instructions_body__') ||
           el.closest('#__analyzer_capture_banner__') ||
           el.closest('#__analyzer_recorder_tab__');
  }

  // Use window + capture phase so we run before __doPostBack / form submit (table sort links)
  window.addEventListener('click', function captureModeClick(e) {
    if (!captureMode) return;
    if (isOurUI(e.target)) return; // Let modal/panel/banner handle the click (Add, dropdown, etc.)
    // If modal is open and user clicked outside, just close it (don't open new tag for that element)
    var openModal = document.getElementById('__analyzer_capture_modal__');
    if (openModal) {
      openModal.remove();
      return;
    }

    var el = e.target;
    // When clicking inside a table cell, tag the cell so margin vs text click both work
    if (el.closest && (el.closest('td') || el.closest('th')))
      el = el.closest('td') || el.closest('th');
    // Always record the click so we never lose navigation/first click (then open tag form if in capture mode)
    var id = ++SESSION.eventCounter;
    SESSION.events.push({
      id:        id,
      type:      'click',
      timestamp: Date.now(),
      selector:  getSelector(el),
      tag:       el.tagName ? el.tagName.toLowerCase() : '',
      text:      (el.innerText || el.textContent || '').trim().slice(0, 80),
      classes:   Array.from(el.classList || []),
      href:      el.href || (el.closest && el.closest('a') ? el.closest('a').href : null) || null,
      capturedForTag: true,
    });
    logEventCount();

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    try {
      var selector = getSelector(el);
      var valueSample = getValueSample(el);
      var attr = valueSample.attr;
      var value = valueSample.value;
      showCaptureModal(selector, attr, value, function (fieldName, condition, role) {
      SESSION.captureHints.push({
        field:       fieldName,
        selector:    selector,
        attr:        attr,
        valueSample: value,
        condition:   condition || undefined,
        role:        role || 'target',
      });
      showCaptureBanner(true);
      console.log('[ANALYZER] Added:', fieldName, 'role:', role);
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:2147483646;background:#0e7490;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-family:system-ui;box-shadow:0 4px 12px rgba(0,0,0,.3);';
      toast.textContent = 'Added: ' + fieldName + ' (' + role + ') — form closed, click next element';
      document.body.appendChild(toast);
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2800);
    });
    } catch (err) {
      if (typeof showToast === 'function') showToast('Tag form error: ' + (err && err.message ? err.message : String(err)));
      console.error('[ANALYZER] captureModeClick', err);
    }
  }, true);

  // ─── Click Interceptor ──────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    if (captureMode) return; // Let captureModeClick handle it
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
    logEventCount();

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
    logEventCount();
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

  // ─── Persist events before unload (survives form postback / full reload) ─────
  function persistEventsBeforeUnload() {
    try {
      var existing = [];
      var raw = sessionStorage.getItem('__analyzer_events_backup');
      if (raw) try { existing = JSON.parse(raw); } catch (e) {}
      existing.push.apply(existing, SESSION.events);
      sessionStorage.setItem('__analyzer_events_backup', JSON.stringify(existing));
    } catch (e) {}
  }
  window.addEventListener('beforeunload', persistEventsBeforeUnload);
  window.addEventListener('pagehide', persistEventsBeforeUnload);

  // ─── In-browser instructions panel + persistent tab to open it ───────────────

  function createInstructionsPanel() {
    var existing = document.getElementById('__analyzer_instructions_panel__');
    if (existing) {
      existing.style.display = '';
      var body = document.getElementById('__analyzer_instructions_body__');
      if (body) body.style.display = 'block';
      var toggle = document.getElementById('__analyzer_panel_toggle__');
      if (toggle) toggle.textContent = '\u2212';
      return;
    }

    var panel = document.createElement('div');
    panel.id = '__analyzer_instructions_panel__';
    panel.style.cssText = [
      'position:fixed;bottom:16px;right:16px;z-index:2147483646;',
      'max-width:320px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.45;',
      'background:#1a1a2e;color:#e8e8e8;border:1px solid #333;border-radius:10px;',
      'box-shadow:0 4px 20px rgba(0,0,0,.4);overflow:hidden;',
    ].join(' ');

    var header = document.createElement('div');
    header.style.cssText = 'padding:10px 12px;background:#16213e;cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;';
    header.innerHTML = '<strong>\u1f4cb Session recorder</strong> <span style="font-size:11px;opacity:.8" id="__analyzer_panel_toggle__">\u2212</span>';
    var bodyVisible = true;

    var body = document.createElement('div');
    body.id = '__analyzer_instructions_body__';
    body.style.cssText = 'padding:12px;border-top:1px solid #333;max-height:280px;overflow-y:auto;';
    body.innerHTML = [
      '<p style="margin:0 0 8px;font-weight:600;color:#7dd3fc;">Tag fields</p>',
      '<p style="margin:0 0 8px;"><button id="__analyzer_capture_btn__" type="button" style="background:#0e7490;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Capture mode OFF</button> <span style="font-size:11px;color:#94a3b8;"> or click tab to open + start tagging</span></p>',
      '<p style="margin:0 0 10px;"><button id="__analyzer_tag_next_btn__" type="button" style="background:#334155;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;">Tag next element \u2192 then click a cell</button></p>',
      '<p style="margin:0 0 6px;font-size:11px;color:#94a3b8;">All clicks are always recorded. Capture mode ON = your click also opens the tag form.</p>',
      '<p style="margin:0 0 6px;font-size:11px;color:#94a3b8;"><strong>Flow:</strong> Load URL \u2192 filter \u2192 targets \u2192 store target data + PDF retrieval.</p>',
      '<p style="margin:0 0 8px;font-size:12px;"><strong>1.</strong> Turn Capture mode <strong>ON</strong>, then click a <strong>data cell</strong> (not the header).</p>',
      '<p style="margin:0 0 8px;font-size:12px;"><strong>2.</strong> In the form choose <strong>Use for</strong>: <em>Filter/Candidate</em> (value for criteria), <em>Target data</em> (save to Supabase), or <em>PDF/Resource</em> (link or action to get PDF/text).</p>',
      '<p style="margin:0 0 8px;font-size:12px;"><strong>3.</strong> Add closes the form so you can click the next element. Turn Capture mode OFF when done.</p>',
      '<ul style="margin:0 0 10px;padding-left:18px;font-size:12px;">',
      '<li>If a PDF opens in a new tab, keep this tab open</li>',
      '</ul>',
      '<p style="margin:0 0 6px;font-weight:600;color:#7dd3fc;">In the terminal</p>',
      '<ul style="margin:0;padding-left:18px;">',
      '<li><kbd style="background:#333;padding:2px 6px;border-radius:4px;">Enter</kbd> \u2192 save snapshot</li>',
      '<li><kbd style="background:#333;padding:2px 6px;border-radius:4px;">s</kbd> \u2192 show event count</li>',
      '<li><kbd style="background:#333;padding:2px 6px;border-radius:4px;">q</kbd> \u2192 quit and save session.json</li>',
      '</ul>',
    ].join(' ');

    header.addEventListener('click', function () {
      bodyVisible = !bodyVisible;
      body.style.display = bodyVisible ? 'block' : 'none';
      var t = document.getElementById('__analyzer_panel_toggle__');
      if (t) t.textContent = bodyVisible ? '\u2212' : '+';
    });

    panel.appendChild(header);
    panel.appendChild(body);
    panel.addEventListener('click', function (ev) {
      if (!ev.target || !ev.target.id) return;
      if (ev.target.id === '__analyzer_capture_btn__') {
        ev.preventDefault();
        ev.stopPropagation();
        toggleCaptureMode();
      } else if (ev.target.id === '__analyzer_tag_next_btn__') {
        ev.preventDefault();
        ev.stopPropagation();
        captureMode = true;
        showCaptureBanner(true);
        var btn = document.getElementById('__analyzer_capture_btn__');
        if (btn) btn.textContent = '\u2713 Capture mode ON';
        showToast('Click a data cell on the page to open the tag form.');
      }
    });
    document.body.appendChild(panel);

    var captureBtn = document.getElementById('__analyzer_capture_btn__');
    if (captureBtn) captureBtn.addEventListener('click', function (e) { e.preventDefault(); toggleCaptureMode(); });
  }

  function showToast(msg, ms) {
    ms = ms || 3500;
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0e7490;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-family:system-ui;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, ms);
  }

  function injectRecorderTab() {
    if (document.getElementById('__analyzer_recorder_tab__')) return;
    var tab = document.createElement('button');
    tab.id = '__analyzer_recorder_tab__';
    tab.type = 'button';
    tab.title = 'Open panel and start tagging (Capture mode ON)';
    tab.textContent = '\u1f4cb Recorder';
    tab.style.cssText = [
      'position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:2147483647;',
      'writing-mode:vertical-rl;text-orientation:mixed;padding:10px 8px;border:1px solid #333;border-right:none;border-radius:8px 0 0 8px;',
      'background:#1a1a2e;color:#e8e8e8;font-size:12px;font-family:system-ui,sans-serif;cursor:pointer;',
      'box-shadow:-2px 0 8px rgba(0,0,0,.2);',
    ].join(' ');
    tab.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      createInstructionsPanel();
      captureMode = true;
      showCaptureBanner(true);
      var btn = document.getElementById('__analyzer_capture_btn__');
      if (btn) btn.textContent = '\u2713 Capture mode ON';
      showToast('Panel open. Click a data cell on the page to open the tag form.');
    });
    document.body.appendChild(tab);
  }

  function injectInstructionsPanel() {
    createInstructionsPanel();
  }

  function injectUI() {
    injectRecorderTab();
    injectInstructionsPanel();
  }

  if (document.body) {
    injectUI();
  } else {
    document.addEventListener('DOMContentLoaded', injectUI);
  }

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

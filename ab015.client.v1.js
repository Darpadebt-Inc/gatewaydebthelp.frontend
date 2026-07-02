(function () {
  "use strict";

  // ab015 render-time A/B client (v1). UI-only: the crawlable canonical copy is
  // server-rendered; this script swaps [data-ab-slot] textContent after a
  // deterministic 015 /variant assignment and degrades to the canonical copy
  // whenever JS, the network, or 015 is unavailable. No PII — random ids only.

  var SITE_LABEL = "GDH";
  var VISITOR_KEY = "gfsr_vid"; // shared with eng038.sitewide.js (single join key)
  var VARIANT_ENDPOINT = "/api/mesh/015-a-b-test-accelerator/variant";
  var TRACK_ENDPOINT = "/api/mesh/015-a-b-test-accelerator/track";
  var FETCH_TIMEOUT_MS = 2500;

  function safeGetStorage(storage, key) {
    try {
      return storage ? storage.getItem(key) || "" : "";
    } catch (err) {
      return "";
    }
  }

  function safeSetStorage(storage, key, value) {
    try {
      if (storage) storage.setItem(key, value);
    } catch (err) {
      return;
    }
  }

  function randomId(prefix) {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var buf = new Uint32Array(4);
        window.crypto.getRandomValues(buf);
        return prefix + Array.prototype.map
          .call(buf, function (n) { return n.toString(16); })
          .join("");
      }
    } catch (err) {
      // ignore
    }
    return prefix + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function getVisitorId() {
    var vid = safeGetStorage(window.localStorage, VISITOR_KEY);
    if (!vid) {
      vid = randomId("vid_");
      safeSetStorage(window.localStorage, VISITOR_KEY, vid);
    }
    return vid;
  }

  function fetchWithTimeout(url, options) {
    if (typeof window.fetch !== "function") return Promise.reject(new Error("no fetch"));
    if (typeof window.AbortController !== "function") return window.fetch(url, options);
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    var merged = options || {};
    merged.signal = controller.signal;
    return window.fetch(url, merged).then(
      function (res) { window.clearTimeout(timer); return res; },
      function (err) { window.clearTimeout(timer); throw err; }
    );
  }

  function slotElements() {
    try {
      return Array.prototype.slice.call(document.querySelectorAll("[data-ab-slot]"));
    } catch (err) {
      return [];
    }
  }

  function markCta(slotEl, slot, variantId, testId) {
    try {
      var target = null;
      if (slotEl.hasAttribute("data-cta")) {
        target = slotEl;
      } else {
        var container = slotEl.closest ? slotEl.closest("[data-ab-slot-container]") : null;
        if (container) target = container.querySelector("[data-cta]");
      }
      if (target) {
        target.setAttribute("data-variant-id", variantId);
        if (testId) target.setAttribute("data-ab-test-id", testId);
        target.setAttribute("data-ab-scope", slot);
      }
    } catch (err) {
      // canonical markup stands
    }
  }

  function applyVariant(slot, data) {
    if (!data || data.in_test !== true) return;
    var text = data.meta && typeof data.meta.text === "string" ? data.meta.text : "";
    if (!text) return;
    var variantId = typeof data.variant === "string" ? data.variant : "";
    var testId = typeof data.test_id === "string" ? data.test_id : "";
    var els = slotElements();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute("data-ab-slot") !== slot) continue;
      try {
        el.textContent = text; // textContent only — never innerHTML
        if (variantId) markCta(el, slot, variantId, testId);
      } catch (err) {
        // leave canonical copy in place
      }
    }
  }

  function trackClick(el, visitorId) {
    try {
      var variantId = el.getAttribute("data-variant-id");
      var scope = el.getAttribute("data-ab-scope");
      if (!variantId || !scope) return;
      var payload = JSON.stringify({
        event: "click",
        scope: scope,
        variant: variantId,
        bucket: visitorId,
        site: SITE_LABEL,
        correlation_id: visitorId,
        page_type: "blog",
        page_path: window.location.pathname
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(TRACK_ENDPOINT, new Blob([payload], { type: "application/json" }));
        return;
      }
      fetchWithTimeout(TRACK_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        credentials: "same-origin",
        keepalive: true
      }).catch(function () {});
    } catch (err) {
      // never interfere with navigation
    }
  }

  function init() {
    var els = slotElements();
    if (!els.length) return;

    var visitorId = getVisitorId();
    var slots = {};
    for (var i = 0; i < els.length; i++) {
      var slot = els[i].getAttribute("data-ab-slot");
      if (slot) slots[slot] = true;
    }

    Object.keys(slots).forEach(function (slot) {
      var params =
        "scope=" + encodeURIComponent(slot) +
        "&site=" + encodeURIComponent(SITE_LABEL) +
        "&bucket=" + encodeURIComponent(visitorId) +
        "&correlation_id=" + encodeURIComponent(visitorId) +
        "&page_type=blog" +
        "&page_path=" + encodeURIComponent(window.location.pathname);
      fetchWithTimeout(VARIANT_ENDPOINT + "?" + params, { credentials: "same-origin" })
        .then(function (res) { return res && res.ok ? res.json() : null; })
        .then(function (data) { applyVariant(slot, data); })
        .catch(function () { /* canonical copy stands */ });
    });

    document.addEventListener(
      "click",
      function (event) {
        try {
          var node = event.target;
          while (node && node !== document) {
            if (node.getAttribute && node.getAttribute("data-variant-id")) {
              trackClick(node, visitorId);
              return;
            }
            node = node.parentNode;
          }
        } catch (err) {
          // never interfere with navigation
        }
      },
      { capture: true, passive: true }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

/*! PMRFP website widgets · https://pmrfp.com/widgets
 *
 * Usage:
 *   <div data-pmrfp="feed/snow-removal/toronto" data-theme="light" data-limit="5"></div>
 *   <script async src="https://pmrfp.com/embed.js"></script>
 *
 * Turns each [data-pmrfp] element into an iframe of pmrfp.com/embed/<path>
 * that resizes itself to fit. Safe to include more than once.
 */
(function () {
  "use strict";
  if (window.__pmrfpWidgets) {
    window.__pmrfpWidgets.scan();
    return;
  }

  var origin = "https://pmrfp.com";
  try {
    var me = document.currentScript;
    if (me && me.src) origin = new URL(me.src).origin;
  } catch {
    // keep the default origin
  }

  // Keep in sync with WIDGET_PATH_RE in src/lib/embed/widgets.ts.
  var PATH = /^(feed\/[a-z0-9-]+\/[a-z0-9-]+|bids\/[a-z0-9-]+\/[a-z0-9]+|(jobs|company|trusted)\/[a-z0-9-]+)$/;
  var frames = [];

  function mount(el) {
    if (el.getAttribute("data-pmrfp-ready")) return;
    var path = (el.getAttribute("data-pmrfp") || "").replace(/^\/+|\/+$/g, "").toLowerCase();
    if (!PATH.test(path)) return;
    var theme = el.getAttribute("data-theme") === "dark" ? "dark" : "light";
    var limit = parseInt(el.getAttribute("data-limit") || "", 10);
    var hash = "theme=" + theme + (limit > 0 ? "&limit=" + Math.min(10, limit) : "");
    var label = (el.textContent || "").replace(/\s+/g, " ").trim() || "PMRFP";

    var frame = document.createElement("iframe");
    frame.src = origin + "/embed/" + path + "#" + hash;
    frame.title = label;
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("scrolling", "no");
    frame.style.cssText =
      "display:block;width:100%;max-width:640px;border:0;overflow:hidden;background:transparent;height:" +
      (path.indexOf("company/") === 0 ? 250 : 460) +
      "px";

    el.setAttribute("data-pmrfp-ready", "1");
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(frame);
    frames.push(frame);
  }

  function fromUs(o) {
    if (o === origin) return true;
    try {
      return /(^|\.)pmrfp\.com$/.test(new URL(o).hostname);
    } catch {
      return false;
    }
  }

  function scan() {
    var els = document.querySelectorAll("[data-pmrfp]");
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  window.addEventListener("message", function (e) {
    // The message must come from one of our frames (checked below), served by us.
    if (!e.data || e.data.type !== "pmrfp:height" || !fromUs(e.origin)) return;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var h = Math.round(Number(e.data.height) || 0);
        if (h > 40) frames[i].style.height = Math.min(h, 4000) + "px";
      }
    }
  });

  window.__pmrfpWidgets = { scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();

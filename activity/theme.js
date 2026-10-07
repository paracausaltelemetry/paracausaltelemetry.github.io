/* Operation Heatmap theme: dark by default, light only when chosen.
   Loaded synchronously as the first thing in <body> so the class lands before
   first paint. It is a file rather than an inline script so the CSP needs no
   new hash. The choice is shared with the main site through the same pt_theme
   cookie (scoped to .paracausaltelemetry.com) and localStorage key that
   js/theme.js uses. */
(function () {
  var body = document.body;

  function saved() {
    var m = document.cookie.match(/(?:^|;\s*)pt_theme=(light|dark)/);
    if (m) return m[1];
    try { return localStorage.getItem("theme"); } catch (e) { return null; }
  }

  function apply(theme) {
    body.classList.toggle("light-mode", theme === "light");
  }

  function store(theme) {
    var onSite = /(^|\.)paracausaltelemetry\.com$/.test(location.hostname);
    document.cookie = "pt_theme=" + theme + "; path=/; max-age=31536000; samesite=lax" + (onSite ? "; domain=.paracausaltelemetry.com" : "");
    try { localStorage.setItem("theme", theme); } catch (e) { /* the cookie still carries it */ }
  }

  apply(saved() === "light" ? "light" : "dark");

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    function label() {
      btn.setAttribute("aria-label", body.classList.contains("light-mode") ? "Switch to dark mode" : "Switch to light mode");
    }
    label();
    btn.addEventListener("click", function () {
      var next = body.classList.contains("light-mode") ? "dark" : "light";
      apply(next);
      store(next);
      label();
    });
  });
})();

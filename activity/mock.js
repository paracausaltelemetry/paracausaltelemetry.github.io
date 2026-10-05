"use strict";
/* Shared behaviour for the mock platforms: a small dialog for controls that
   would need a real account or would leave the exercise, plus a toast.
   Any element with data-mock="message" (and optional data-mock-title)
   opens the dialog. Nothing here sends or stores anything. */
(function () {
  let dlg, titleEl, bodyEl, toastEl, toastTimer, lastFocus;

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "mockdlg";
    dlg.setAttribute("aria-labelledby", "mockdlg-t");
    const h = document.createElement("h2"); h.id = "mockdlg-t";
    const p = document.createElement("p");
    const note = document.createElement("p"); note.className = "mockdlg-note";
    note.textContent = "Training mock. Everything you need is on this page.";
    const row = document.createElement("div"); row.className = "mockdlg-row";
    const ok = document.createElement("button"); ok.type = "button"; ok.textContent = "OK";
    ok.addEventListener("click", close);
    row.append(ok);
    dlg.append(h, p, note, row);
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
    dlg.addEventListener("close", () => { if (lastFocus) lastFocus.focus(); });
    document.body.appendChild(dlg);
    titleEl = h; bodyEl = p;
  }
  function open(title, body) {
    if (!dlg) build();
    lastFocus = document.activeElement;
    titleEl.textContent = title || "Not available";
    bodyEl.textContent = body || "";
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    dlg.querySelector("button").focus();
  }
  function close() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "mocktoast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-mock]");
    if (!el) return;
    e.preventDefault();
    open(el.getAttribute("data-mock-title"), el.getAttribute("data-mock"));
  });

  window.mock = { open, toast };
})();

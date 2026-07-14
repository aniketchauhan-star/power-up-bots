/* ============================================================================
   align.js — LOCAL DEV-ONLY visual alignment tool for the flipbook.
   ----------------------------------------------------------------------------
   • Runs ONLY on localhost (127.0.0.1 / ::1 / *.local / file://). On the
     deployed site every line below early-returns, so kids never see any of it
     and the production flipbook behaves 100% normally.
   • Turn ON with  ?align=true  in the URL, or the shortcut  Ctrl + Alt + A.
   • Drag any [data-align-id] element. Position is measured as a % of the
     #flipScale 16:9 stage (NOT the browser window) so the numbers are identical
     on every laptop after deployment.
   • Toolbar: selected name, X/Y/W/H %, z-index, Save, Reset, Copy JSON, Close,
     snap-to-grid, and page-nav buttons (so you can reach page 5 / 7 / 8 hands).
   • Keyboard: arrow keys nudge 1 stage-px, Shift+arrow nudges 10 stage-px.
   • Save writes to localStorage (dev preview only). Copy JSON gives you the
     config to paste into your source. NOTHING here is applied in production.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- localhost gate: hard stop on the deployed site --------------------- */
  function isLocalHost() {
    var h = location.hostname;
    return location.protocol === "file:" ||
           h === "localhost" || h === "127.0.0.1" || h === "::1" ||
           h === "" || h.endsWith(".local");
  }
  if (!isLocalHost()) return;   // production → completely inert

  /* The book's fixed internal coordinate space (see .flip-scale in styles.css). */
  var STAGE_W = 1280, STAGE_H = 720;
  var LS_KEY = "flipbookAlignPositions.v1";

  /* Where each id lives in the source — shown in the toolbar so you know where
     to paste the number for a PERMANENT change. */
  var SOURCE_HINT = {
    playButton:  "styles.css → .play-btn (left / top / width)",
    prevArrow:   "styles.css → .corner-arrow / .corner-arrow.back",
    nextArrow:   "styles.css → .corner-arrow / .corner-arrow.fwd",
    handNudge:   "script.js → P5_STEPS[].hand (per shape: rectangle/green/circle)"
  };
  function sourceHint(id) {
    if (SOURCE_HINT[id]) return SOURCE_HINT[id];
    if (id.indexOf("revealHand") === 0) return "script.js → pages[].reveal.hand";
    return "—";
  }

  var active = false;
  var selected = null;
  var dragging = null;      // { el, grabDX, grabDY } while a drag is in progress
  var snap = false;
  var ui = {};              // toolbar element refs

  var stage = null;
  function getStage() {
    if (!stage) stage = document.getElementById("flipScale");
    return stage;
  }
  function stageRect() {
    var s = getStage();
    return s ? s.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  function targets() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-align-id]"));
  }
  function round(n) { return Math.round(n * 100) / 100; }

  /* ---- measure an element as a % of the 16:9 stage ------------------------ */
  function metrics(el) {
    var r = el.getBoundingClientRect(), s = stageRect();
    if (!s.width || !s.height) return { x: 0, y: 0, w: 0, h: 0, z: "auto" };
    var z = getComputedStyle(el).zIndex;
    return {
      x: (r.left + r.width / 2 - s.left) / s.width * 100,
      y: (r.top + r.height / 2 - s.top) / s.height * 100,
      w: r.width / s.width * 100,
      h: r.height / s.height * 100,
      z: (z === "auto" || z === "") ? "auto" : parseInt(z, 10)
    };
  }

  /* ---- move an element so its CENTRE sits at (xPct,yPct) of the stage ------
     Works for both in-stage elements and viewport-fixed ones (corner arrows):
     we convert the desired stage-% into a screen point, then express it in the
     element's own offset-parent coordinates. Live preview only. */
  function setPos(el, xPct, yPct) {
    var s = stageRect();
    if (snap) { xPct = Math.round(xPct); yPct = Math.round(yPct); }
    var screenCX = s.left + xPct / 100 * s.width;
    var screenCY = s.top + yPct / 100 * s.height;
    var isFixed = getComputedStyle(el).position === "fixed";
    el.style.animation = "none";                 // stop breathing/nudge transform fights
    el.style.margin = "0";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "translate(-50%, -50%)";
    if (isFixed) {
      el.style.left = round(screenCX) + "px";
      el.style.top = round(screenCY) + "px";
    } else {
      var p = (el.offsetParent || getStage()).getBoundingClientRect();
      el.style.left = round((screenCX - p.left) / p.width * 100) + "%";
      el.style.top = round((screenCY - p.top) / p.height * 100) + "%";
    }
  }

  function setWidthPct(el, wPct) {
    if (wPct == null || wPct === "" || isNaN(wPct)) return;
    var isFixed = getComputedStyle(el).position === "fixed";
    // in-stage elements live in the unscaled 1280-wide space; fixed ones in screen px
    el.style.width = isFixed
      ? round(wPct / 100 * stageRect().width) + "px"
      : round(wPct / 100 * STAGE_W) + "px";
    el.style.height = "auto";
  }
  function setZ(el, z) {
    if (z === "" || z == null) return;
    el.style.zIndex = String(parseInt(z, 10) || 0);
  }

  /* ---- selection ---------------------------------------------------------- */
  function select(el) {
    if (selected) selected.removeAttribute("data-align-sel");
    selected = el;
    if (el) el.setAttribute("data-align-sel", "");
    refreshToolbar();
  }

  /* ---- toolbar ------------------------------------------------------------ */
  function field(labelText) {
    var wrap = document.createElement("label");
    wrap.className = "algn-field";
    var lab = document.createElement("span"); lab.textContent = labelText;
    var inp = document.createElement("input");
    inp.type = "number"; inp.step = "0.1"; inp.className = "algn-input";
    wrap.appendChild(lab); wrap.appendChild(inp);
    return { wrap: wrap, input: inp };
  }
  function button(txt, cls) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = txt; b.className = "algn-btn " + (cls || "");
    return b;
  }

  function buildToolbar() {
    var bar = document.createElement("div");
    bar.className = "algn-bar";
    bar.addEventListener("pointerdown", function (e) { e.stopPropagation(); });

    var head = document.createElement("div");
    head.className = "algn-head";
    head.innerHTML = "<b>ALIGN MODE</b> <span class='algn-dim'>(dev only)</span>";
    var close = button("✕", "algn-x");
    close.title = "Close alignment mode";
    close.addEventListener("click", deactivate);
    head.appendChild(close);
    bar.appendChild(head);

    // page navigation (so you can reach the page-5 / reveal hands while aligning)
    var nav = document.createElement("div");
    nav.className = "algn-row";
    var bOpen = button("Open book", "algn-nav");
    var bPrev = button("◀ Prev", "algn-nav");
    var bNext = button("Next ▶", "algn-nav");
    bOpen.addEventListener("click", function () { if (typeof openBook === "function") { openBook(); setTimeout(renderNav, 6300); } });
    bPrev.addEventListener("click", function () { if (typeof goPrev === "function") { goPrev(); setTimeout(renderNav, 1300); } });
    bNext.addEventListener("click", function () { if (typeof goNext === "function") { goNext(); setTimeout(renderNav, 1300); } });
    nav.appendChild(bOpen); nav.appendChild(bPrev); nav.appendChild(bNext);
    bar.appendChild(nav);

    // "Jump to screen" navigator — chips to hop straight to ANY page (and the
    // page-5 shape steps) without flipping/tapping through. Filled by renderNav().
    var navLabel = document.createElement("div");
    navLabel.className = "algn-navlabel";
    navLabel.textContent = "Jump to screen";
    bar.appendChild(navLabel);
    var chips = document.createElement("div");
    chips.className = "algn-chips";
    bar.appendChild(chips);

    var name = document.createElement("div");
    name.className = "algn-name";
    name.textContent = "Nothing selected — click an outlined item";
    bar.appendChild(name);

    var src = document.createElement("div");
    src.className = "algn-src";
    bar.appendChild(src);

    var grid = document.createElement("div");
    grid.className = "algn-grid";
    var fx = field("X %"), fy = field("Y %"), fw = field("W %"), fz = field("Z");
    grid.appendChild(fx.wrap); grid.appendChild(fy.wrap);
    grid.appendChild(fw.wrap); grid.appendChild(fz.wrap);
    bar.appendChild(grid);

    [fx.input, fy.input].forEach(function (inp) {
      inp.addEventListener("input", function () {
        if (!selected) return;
        setPos(selected, parseFloat(fx.input.value) || 0, parseFloat(fy.input.value) || 0);
        refreshToolbar(true);
      });
    });
    fw.input.step = "0.1";
    fw.input.addEventListener("input", function () {
      if (!selected) return; setWidthPct(selected, parseFloat(fw.input.value)); refreshToolbar(true);
    });
    fz.input.step = "1";
    fz.input.addEventListener("input", function () {
      if (!selected) return; setZ(selected, fz.input.value); refreshToolbar(true);
    });

    var snapRow = document.createElement("label");
    snapRow.className = "algn-snap";
    var snapChk = document.createElement("input"); snapChk.type = "checkbox";
    snapChk.addEventListener("change", function () { snap = snapChk.checked; });
    snapRow.appendChild(snapChk);
    snapRow.appendChild(document.createTextNode(" Snap to 1% grid"));
    bar.appendChild(snapRow);

    var actions = document.createElement("div");
    actions.className = "algn-row";
    var bSave = button("Save", "algn-save");
    var bReset = button("Reset", "algn-reset");
    var bCopy = button("Copy JSON", "algn-copy");
    bSave.addEventListener("click", saveLS);
    bReset.addEventListener("click", resetAll);
    bCopy.addEventListener("click", copyJSON);
    actions.appendChild(bSave); actions.appendChild(bReset); actions.appendChild(bCopy);
    bar.appendChild(actions);

    var msg = document.createElement("div");
    msg.className = "algn-msg";
    bar.appendChild(msg);

    document.body.appendChild(bar);
    ui = { bar: bar, name: name, src: src, fx: fx.input, fy: fy.input,
           fw: fw.input, fz: fz.input, msg: msg, chips: chips };
  }

  function toast(t) {
    if (!ui.msg) return;
    ui.msg.textContent = t;
    ui.msg.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { ui.msg.classList.remove("show"); }, 2200);
  }

  function refreshToolbar(skipInputs) {
    if (!ui.bar) return;
    if (!selected) {
      ui.name.textContent = "Nothing selected — click an outlined item";
      ui.src.textContent = "";
      ui.fx.value = ui.fy.value = ui.fw.value = ui.fz.value = "";
      return;
    }
    var id = selected.getAttribute("data-align-id");
    var m = metrics(selected);
    ui.name.textContent = id;
    ui.src.textContent = "→ " + sourceHint(id);
    if (!skipInputs) {
      ui.fx.value = round(m.x);
      ui.fy.value = round(m.y);
      ui.fw.value = round(m.w);
      ui.fz.value = (m.z === "auto") ? "" : m.z;
    }
  }

  /* ---- "Jump to screen" navigator ---------------------------------------- */
  function chip(txt, on) {
    var c = document.createElement("button");
    c.type = "button"; c.className = "algn-chip"; c.textContent = txt;
    c.addEventListener("click", function (e) { e.stopPropagation(); on(); });
    return c;
  }
  function jumpTo(idx) {
    if (typeof gotoPage !== "function") return;
    if (gotoPage(idx)) { renderNav(); refreshToolbar(); return; }   // already open → snap
    if (typeof openBook === "function") openBook();                 // else open, then jump
    var tries = 0;
    var iv = setInterval(function () {
      if (gotoPage(idx)) { clearInterval(iv); renderNav(); refreshToolbar(); }
      else if (++tries > 140) clearInterval(iv);                    // ~14s safety net
    }, 100);
  }
  function renderNav() {
    if (!ui.chips) return;
    ui.chips.innerHTML = "";
    var st = (typeof flipState === "function") ? flipState() : null;
    var total = st ? st.total : 0;
    for (var i = 0; i < total; i++) {
      (function (idx) {
        var c = chip("P" + (idx + 1), function () { jumpTo(idx); });
        if (st && st.ready && st.page === idx) c.classList.add("cur");
        ui.chips.appendChild(c);
      })(i);
    }
    if (st && st.page5) {                                           // page-5 shape steps
      ["▭ rect", "▤ green", "● circle"].forEach(function (lbl, s) {
        var c = chip(lbl, function () {
          if (typeof gotoPage5Step === "function") { gotoPage5Step(s); renderNav(); refreshToolbar(); }
        });
        if (st.step === s) c.classList.add("cur");
        ui.chips.appendChild(c);
      });
    }
  }

  /* ---- drag (pointer events cover mouse + touch) -------------------------- */
  function onPointerDown(e) {
    if (!active) return;
    if (ui.bar && ui.bar.contains(e.target)) return;   // toolbar clicks handled separately
    var t = targetFrom(e);                             // the [data-align-id] under the pointer
    if (!t) { select(null); return; }
    e.preventDefault();
    e.stopPropagation();                                // suppress native click (openBook / goNext…)
    select(t);
    var m = metrics(t), s = stageRect();
    var pointerX = (e.clientX - s.left) / s.width * 100;
    var pointerY = (e.clientY - s.top) / s.height * 100;
    dragging = { el: t, grabDX: pointerX - m.x, grabDY: pointerY - m.y };
    try { document.documentElement.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    var s = stageRect();
    var pointerX = (e.clientX - s.left) / s.width * 100;
    var pointerY = (e.clientY - s.top) / s.height * 100;
    setPos(dragging.el, pointerX - dragging.grabDX, pointerY - dragging.grabDY);
    refreshToolbar();
  }
  function onPointerUp(e) {
    if (!dragging) return;
    try { document.documentElement.releasePointerCapture(e.pointerId); } catch (_) {}
    dragging = null;
    refreshToolbar();
  }

  /* ---- keyboard: nudge selected by 1 / 10 stage-px ------------------------ */
  function onKeyDown(e) {
    // global toggle — use e.code (layout-independent; AltGr/e.key can differ).
    // Ctrl+Alt+A  OR  Ctrl+Alt+1  (either works).
    if ((e.ctrlKey && e.altKey) &&
        (e.code === "KeyA" || e.code === "Digit1" || e.key === "a" || e.key === "A" || e.key === "1")) {
      e.preventDefault(); toggle(); return;
    }
    if (!active || !selected) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;   // let the toolbar fields work
    var stepX = (e.shiftKey ? 10 : 1) / STAGE_W * 100;
    var stepY = (e.shiftKey ? 10 : 1) / STAGE_H * 100;
    var m = metrics(selected), nx = m.x, ny = m.y, hit = true;
    if (e.key === "ArrowLeft") nx -= stepX;
    else if (e.key === "ArrowRight") nx += stepX;
    else if (e.key === "ArrowUp") ny -= stepY;
    else if (e.key === "ArrowDown") ny += stepY;
    else hit = false;
    if (hit) { e.preventDefault(); setPos(selected, nx, ny); refreshToolbar(); }
  }

  /* ---- save / reset / export --------------------------------------------- */
  function collectConfig() {
    var seen = {}, out = {};
    targets().forEach(function (el) {
      var id = el.getAttribute("data-align-id");
      var key = id;
      if (seen[id] != null) { seen[id]++; key = id + "_" + seen[id]; } else { seen[id] = 0; }
      var m = metrics(el);
      out[key] = { x: round(m.x), y: round(m.y), width: round(m.w), height: "auto", zIndex: m.z };
    });
    return out;
  }
  function saveLS() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(collectConfig()));
      toast("Saved to localStorage ✓");
    } catch (_) { toast("Could not save"); }
  }
  function applyLS() {
    var raw;
    try { raw = localStorage.getItem(LS_KEY); } catch (_) { return; }
    if (!raw) return;
    var cfg; try { cfg = JSON.parse(raw); } catch (_) { return; }
    targets().forEach(function (el) {
      var id = el.getAttribute("data-align-id");
      var c = cfg[id];
      if (!c) return;
      setPos(el, c.x, c.y);
      if (c.width != null && c.width !== "auto") setWidthPct(el, c.width);
      if (c.zIndex != null && c.zIndex !== "auto") setZ(el, c.zIndex);
    });
  }
  function resetAll() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    targets().forEach(clearInline);
    refreshToolbar();
    toast("Reset — reload to be 100% clean");
  }
  function configText() {
    var cfg = collectConfig(), lines = [];
    Object.keys(cfg).forEach(function (k) {
      var c = cfg[k];
      lines.push("  " + k + ": { x: " + c.x + ", y: " + c.y +
                 ", width: " + c.width + ", height: \"auto\", zIndex: " +
                 (c.zIndex === "auto" ? "\"auto\"" : c.zIndex) + " }");
    });
    return "export const layoutPositions = {\n" + lines.join(",\n") + "\n};\n";
  }
  function copyJSON() {
    var txt = configText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        function () { toast("Config copied to clipboard ✓"); },
        function () { fallbackCopy(txt); }
      );
    } else { fallbackCopy(txt); }
    console.log("[align] layoutPositions:\n" + txt);
  }
  function fallbackCopy(txt) {
    var ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Config copied ✓"); }
    catch (_) { toast("Copy failed — see console"); }
    document.body.removeChild(ta);
  }

  /* Resolve the draggable target under a pointer event. The hand nudge is made
     grabbable in align mode via CSS (pointer-events:auto on the .p5-hand wrapper,
     pointer-events:none on its inner <img>), so the wrapper is the event target. */
  function targetFrom(e) {
    return e.target && e.target.closest ? e.target.closest("[data-align-id]") : null;
  }

  /* Strip the inline styles this tool applies (position/transform/animation…). */
  function clearInline(el) {
    el.style.left = el.style.top = el.style.right = el.style.bottom = "";
    el.style.transform = el.style.margin = el.style.width = el.style.height = "";
    el.style.zIndex = el.style.animation = "";
  }

  /* ---- activate / deactivate --------------------------------------------- */
  function activate() {
    if (active) return;
    active = true;
    injectCSS();
    document.body.classList.add("algn-on");
    if (!ui.bar) buildToolbar();
    ui.bar.style.display = "";
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    applyLS();
    refreshToolbar();
    renderNav();
    console.log("[align] ON — drag outlined items. Ctrl+Alt+A to toggle.");
  }
  function deactivate() {
    if (!active) return;
    active = false;
    dragging = null;
    // Clear the inline animation override we may have set while dragging so the
    // hand nudge (and anything else) resumes its normal tutorial animation when
    // align mode is off. Position/size previews are left as-is; a reload is fully
    // clean, and Reset removes everything.
    targets().forEach(function (el) { el.style.animation = ""; });
    document.body.classList.remove("algn-on");
    if (ui.bar) ui.bar.style.display = "none";
    if (selected) selected.removeAttribute("data-align-sel");
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    console.log("[align] OFF");
  }
  function toggle() { active ? deactivate() : activate(); }

  /* ---- styles for outlines + toolbar (scoped, dev only) ------------------- */
  function injectCSS() {
    if (document.getElementById("algn-style")) return;
    var css = "" +
      "body.algn-on [data-align-id]{ outline:2px dashed #ff3db4 !important; outline-offset:1px; cursor:grab; }" +
      "body.algn-on [data-align-id]:hover{ outline-color:#00e0ff !important; }" +
      "body.algn-on [data-align-id][data-align-sel]{ outline:3px solid #ffd400 !important; }" +
      /* Hand nudge: force it visible, pause its transform animation, and make the
         WRAPPER grabbable (its inner <img> is pointer-events:none so events land
         on the wrapper). All scoped to align mode → normal behaviour when off. */
      "body.algn-on .p5-hand[data-align-id]{ opacity:1 !important; visibility:visible !important;" +
        " animation:none !important; pointer-events:auto !important; cursor:grab; touch-action:none; }" +
      "body.algn-on .p5-hand[data-align-id]:active{ cursor:grabbing; }" +
      "body.algn-on .p5-hand[data-align-id] *{ pointer-events:none !important; }" +
      "body.algn-on [data-align-id]::after{ content:attr(data-align-id); position:absolute; left:0; top:-16px;" +
        "font:700 10px/1.2 monospace; color:#fff; background:#ff3db4; padding:1px 4px; border-radius:3px;" +
        "white-space:nowrap; pointer-events:none; z-index:2147483000; }" +
      ".algn-bar{ position:fixed; top:10px; right:10px; width:230px; z-index:2147483600;" +
        "font:12px/1.35 system-ui,sans-serif; color:#eef; background:#1c1030; border:1px solid #6E4FB8;" +
        "border-radius:10px; padding:10px; box-shadow:0 10px 30px rgba(0,0,0,.5); user-select:none; }" +
      ".algn-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }" +
      ".algn-dim{ color:#a99; font-weight:400; font-size:10px; }" +
      ".algn-x{ margin:0; }" +
      ".algn-name{ font-weight:700; color:#ffd400; margin:4px 0 2px; word-break:break-all; }" +
      ".algn-src{ font-size:10px; color:#9fd; margin-bottom:6px; min-height:12px; }" +
      ".algn-grid{ display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:6px; }" +
      ".algn-field{ display:flex; align-items:center; gap:4px; }" +
      ".algn-field span{ width:26px; color:#bcd; }" +
      ".algn-input{ width:100%; background:#0f0820; color:#fff; border:1px solid #6E4FB8; border-radius:5px; padding:3px 5px; }" +
      ".algn-snap{ display:flex; align-items:center; gap:6px; margin:2px 0 8px; color:#cde; }" +
      ".algn-row{ display:flex; gap:5px; margin-bottom:6px; }" +
      ".algn-btn{ flex:1; cursor:pointer; border:none; border-radius:6px; padding:6px 4px; font-weight:700; color:#fff; background:#4a3a7a; }" +
      ".algn-btn:hover{ filter:brightness(1.15); }" +
      ".algn-save{ background:#2e9e5b; } .algn-reset{ background:#a23; } .algn-copy{ background:#2b6cb0; }" +
      ".algn-nav{ background:#3a2f5e; font-weight:600; }" +
      ".algn-navlabel{ font-size:10px; color:#bcd; margin:2px 0 3px; }" +
      ".algn-chips{ display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; max-height:118px; overflow:auto; }" +
      ".algn-chip{ cursor:pointer; border:1px solid #6E4FB8; background:#0f0820; color:#dcd6f5;" +
        " border-radius:6px; padding:3px 7px; font:600 11px/1 system-ui,sans-serif; }" +
      ".algn-chip:hover{ background:#2b1e50; }" +
      ".algn-chip.cur{ background:#ffd400; color:#1c1030; border-color:#ffd400; }" +
      ".algn-msg{ min-height:14px; font-size:11px; color:#7CFF9B; opacity:0; transition:opacity .2s; }" +
      ".algn-msg.show{ opacity:1; }";
    var st = document.createElement("style");
    st.id = "algn-style"; st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---- boot --------------------------------------------------------------- */
  function boot() {
    document.addEventListener("keydown", onKeyDown, true);   // Ctrl+Alt+A always listens (localhost only)
    console.log("[align] ready (localhost). Open ?align=true, or press Ctrl+Alt+A (or Ctrl+Alt+1). Click the page first.");
    var qs = new URLSearchParams(location.search);
    if (qs.get("align") === "true" || qs.get("align") === "1") activate();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();

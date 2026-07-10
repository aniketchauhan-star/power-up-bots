/* ============================================================================
   THE STORY NIGHT — flipbook behaviour.
   Diagnostic first: surface any REAL JavaScript error on screen (a silent error
   would stop the click handlers from ever attaching). Image / video / network
   load failures are ignored — they have no .message and are handled per-element.
   ============================================================================ */
window.addEventListener("error", function (ev) {
  if (!ev || !ev.message) return;                 // ignore resource-load errors
  var b = document.getElementById("__jsErr");
  if (!b) {
    b = document.createElement("div");
    b.id = "__jsErr";
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:100000;" +
      "background:#b00020;color:#fff;font:13px/1.5 monospace;padding:10px;white-space:pre-wrap";
    (document.body || document.documentElement).appendChild(b);
  }
  b.textContent = "⚠ JavaScript error (this is likely why the book won't open):\n" +
    ev.message + "\n" + (ev.filename || "") + " : line " + ev.lineno;
});

// If you can read this line in the console, the script parsed with NO syntax
// error and you are running the CURRENT file (not a cached copy).
console.log("%c✅ [The Story Night] loaded — 3D flipbook · full-bleed pages · speech bubbles.",
            "font-weight:bold;color:#7d5fd0;font-size:13px");

/* ============================================================================
   ██  EDIT YOUR CONTENT HERE  ██
   ----------------------------------------------------------------------------
   Every entry below is ONE page of the book, shown in order after the cover.

     • type   : "video"  → a full-page video (e.g. assets/1 page video.mp4)
                "image"  → a full-page picture (e.g. assets/2 page.png)
     • src    : the media file for that page.
     • bubble : (optional) a speech bubble that POPS IN once the reader has
                FULLY landed on the page. Set:
                   kind     : "neel" (pink) or "everywhere" (glowing) — picks
                              which bubble artwork + crop to use.
                   text     : the words shown inside the bubble.
                   box      : where + how big — { top/left/right/bottom, w }.
                              positions are CSS lengths (e.g. "3%"); w is the
                              bubble WIDTH in book-space px (book is 1280x720).
                   flip     : true → mirror the bubble so its tail points the
                              other way.
                   textLeft / textTop / fontSize : fine-tune the words inside.

   Add / remove / reorder pages freely — the flip engine and the "Page X / N"
   counter update automatically.
   ============================================================================ */
const pages = [
  { type: "video", src: "assets/page-01.mp4" },   // Page 1
  { type: "video", src: "assets/page-02.mp4" },   // Page 2
  { type: "video", src: "assets/page-03.mp4" },   // Page 3
  { type: "video", src: "assets/page-04.mp4" },   // Page 4
  { type: "video", src: "assets/page-05.mp4" },   // Page 5
  { type: "video", src: "assets/page-06.mp4" },   // Page 6
  { type: "video", src: "assets/page-07.mp4" },   // Page 7
  { type: "video", src: "assets/page-08.mp4" },   // Page 8
  { type: "video", src: "assets/page-09.mp4" },   // Page 9
  { type: "video", src: "assets/page-10.mp4" },   // Page 10
  { type: "image", src: "assets/the-end.webp" },  // Page 11 — the end
];

/* ============================================================================
   ██  END OF EDITABLE CONTENT — engine below (no need to change) ██
   ============================================================================ */

/* ---- Build one page face's media (image OR video) ----------------------- */
function makeMedia(page) {
  const media = page.type === "video"
    ? document.createElement("video")
    : document.createElement("img");
  media.className = "page-media";
  media.src = page.src;
  if (page.type === "video") {
    media.loop = false;
    media.playsInline = true;
    media.setAttribute("playsinline", "");            // iOS Safari inline playback
    media.setAttribute("webkit-playsinline", "");
    media.preload = "auto";
    // Tap the video to (re)start it WITH sound — a guaranteed user gesture, so
    // browsers that blocked the auto-start's audio will now allow it.
    media.addEventListener("click", function () {
      media.muted = false;
      try { if (media.ended) media.currentTime = 0; } catch (_) {}
      const p = media.play(); if (p && p.catch) p.catch(function () {});
    });
  } else {
    media.decoding = "async";
    media.alt = page.alt || "story page";
  }
  return media;
}

/* ---- Build one speech bubble (hidden until the page fully lands) ---------
   The bubble artwork + crop live in styles.css (.bubble.neel / .bubble.everywhere).
   Here we only apply the per-page geometry (position, width, flip) + the text. */
function makeBubble(bubble) {
  const wrap = document.createElement("div");
  wrap.className = "bubble" + (bubble.kind ? " " + bubble.kind : "");

  const box = bubble.box || {};
  ["top", "left", "right", "bottom"].forEach(function (k) {
    if (box[k] != null) wrap.style[k] = box[k];
  });
  if (box.w != null) wrap.style.setProperty("--w", box.w + "px");

  const bg = document.createElement("div");
  bg.className = "bubble-bg" + (bubble.flip ? " flip" : "");
  wrap.appendChild(bg);

  if (bubble.text) {
    const t = document.createElement("div");
    t.className = "bubble-text";
    t.textContent = bubble.text;
    if (bubble.textLeft) t.style.left = bubble.textLeft;
    if (bubble.textTop)  t.style.top  = bubble.textTop;
    if (bubble.fontSize) t.style.fontSize = bubble.fontSize;
    wrap.appendChild(t);
  }
  return wrap;
}

/* ---- Build the pages (one CSS 3D "leaf" per entry) ---------------------- */
const flipbookEl  = document.getElementById("flipbook");
const flipScaleEl = document.getElementById("flipScale");
const coverScene  = document.getElementById("coverScene");
// ONE full 16:9 page per view (single display). page 1 = entry 1. The themed
// book frame forms the left spine/cover edge (always visible when open); pages
// flip normally. No two-page spread.
const totalPages = pages.length;

// Each leaf is a full 16:9 page hinged on the LEFT spine:
//   • FRONT = the page's full-bleed image / video (+ its speech bubble, if any).
//   • BACK  = a BLANK parchment sheet (seen edge-on while the page turns).
const leaves = [];
pages.forEach(function (page, i) {
  const leaf = document.createElement("div");
  leaf.className = "leaf";

  const front = document.createElement("div");
  front.className = "face front";
  front.appendChild(makeMedia(page));                       // full-bleed image / video
  if (page.bubble) front.appendChild(makeBubble(page.bubble)); // speech bubble (revealed on land)
  const curl = document.createElement("div");               // moving page-curl shading
  curl.className = "curl";
  front.appendChild(curl);

  const back = document.createElement("div");
  back.className = "face back";                             // blank reverse side (no content)

  leaf.appendChild(front);
  leaf.appendChild(back);
  flipbookEl.appendChild(leaf);
  leaves.push(leaf);
});

/* ---- State + element references ----------------------------------------- */
const bookStage  = document.getElementById("bookStage");
const book       = document.getElementById("book");
const bookPop    = document.getElementById("bookPop");
const bookFloat  = document.getElementById("bookFloat");
const cover      = document.getElementById("cover");
const hint       = document.getElementById("hint");
const progressEl = document.getElementById("progress");
const prevBtn    = document.getElementById("prev");
const nextBtn    = document.getElementById("next");
const cornerPrev  = document.getElementById("cornerPrev");
const cornerNext  = document.getElementById("cornerNext");

let opened = false;      // has the cover been opened?
let ready  = false;      // has the cover FINISHED opening? (flips allowed only then)
let flipped = 0;         // how many leaves are currently turned to the left
let animating = false;   // guard so a new turn can't start mid-flip
const FLIP_MS = 1150;    // keep in sync with --flip-ms in styles.css
const COVER_OPEN_MS = 6000;  // keep in sync with the coverOpen animation in styles.css

/* ---- Responsive: scale the FIXED 1280x720 book to fit the viewport --------
   only this CSS transform scale changes, so the paper curl is never distorted. */
function fitScale() {
  const s = Math.min((window.innerWidth  * 0.96) / 1280,
                     (window.innerHeight * 0.84) / 720);
  flipScaleEl.style.setProperty("--book-scale", s.toFixed(4));
}

/* ---- Render / stacking for the CSS leaf flip ---------------------------- */
// A TURNED leaf sits to the left (rotateY -180deg, showing its blank back over
// the cover); an UN-turned leaf lies flat on top of the cover. z-index keeps the
// current (top un-turned) page in front, and stacks more-recently turned leaves
// above earlier ones on the left pile.
function updateZ() {
  leaves.forEach(function (leaf, i) {
    leaf.style.zIndex = (i < flipped) ? (200 + i) : (100 - i);
  });
}
function renderLeaves() {
  leaves.forEach(function (leaf, i) {
    if (i < flipped) leaf.classList.add("flipped");
    else             leaf.classList.remove("flipped");
  });
  updateZ();
}

/* ---- Per-page media -----------------------------------------------------
   Play the CURRENT page's video (pause every other), and pop the current page's
   speech bubble in ONCE, only after the page has fully settled. Called after
   each flip completes and once the cover has finished opening. */
function refreshMedia() {
  const idx = flipped;                         // the front-most page right now
  leaves.forEach(function (leaf, i) {
    const v = leaf.querySelector("video.page-media");
    if (!v) return;
    if (i === idx) {
      try {
        if (v.ended) v.currentTime = 0;
        v.muted = false;                        // try WITH sound (sticky activation from Play)
        const p = v.play();
        if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); });
      } catch (_) {}
    } else {
      try { v.pause(); } catch (_) {}
    }
  });
  const cur = leaves[idx];
  const bub = cur && cur.querySelector(".bubble");
  if (bub && !bub.dataset.revealed) {           // reveal once — "for one time"
    bub.dataset.revealed = "1";
    bub.classList.add("revealed");
  }
}

/* ---- Navigation (drives the CSS leaf flip) ------------------------------ */
function turnLeaf(leaf) {                 // shared flip visuals + timing
  leaf.style.zIndex = 300;               // lift the turning sheet above everything
  leaf.classList.add("flipping");        // enables the moving curl shading
  renderLeaves();
  pauseAllPageMedia();                    // silence every page video WHILE flipping, so the
                                          // target video + voice don't start mid-turn
  playFlip();
  updateProgress();
  setTimeout(function () {
    leaf.classList.remove("flipping");
    animating = false; updateZ(); updateProgress();
    refreshMedia();                      // START the landed page's video + bubble ONLY now
  }, FLIP_MS + 40);
}
function goNext() {
  if (!opened || !ready || animating) return;   // wait until the cover has fully opened
  if (isGameOverlayOpen && !isProgrammaticNavigation) return;  // frozen while a game is open
  if (flipped >= totalPages - 1) return;  // already on the last page
  if (maybeLaunchGameLeaving(flipped)) return;  // a learning game took over — do NOT turn
  animating = true;
  const leaf = leaves[flipped];
  flipped++;
  turnLeaf(leaf);
}
function goPrev() {
  if (!opened || !ready || animating) return;   // wait until the cover has fully opened
  if (isGameOverlayOpen) return;          // no navigation while a game is open
  if (flipped <= 0) return;               // already on the first page
  animating = true;
  flipped--;
  turnLeaf(leaves[flipped]);
}

/* ---- Progress read-out ("Page X / N") ----------------------------------- */
function updateProgress() {
  if (!opened) { progressEl.textContent = ""; progressEl.style.visibility = "hidden"; return; }
  const cur = flipped + 1;
  progressEl.style.visibility = "visible";
  progressEl.textContent = "Page " + cur + " / " + totalPages;
  prevBtn.disabled = flipped <= 0;
  nextBtn.disabled = flipped >= totalPages - 1;
  if (cornerPrev) cornerPrev.disabled = !ready || flipped <= 0;                // grey the corner
  if (cornerNext) cornerNext.disabled = !ready || flipped >= totalPages - 1;   // arrows at the ends
}

/* ---- Open the 3D cover, then hand off to the page-turning book ---------- */
function openBook() {
  console.log("[The Story Night] openBook() called — opened was:", opened);
  if (opened) return;
  opened = true;
  document.body.classList.add("is-open");
  // The whole open motion IS the cover's own hinge — NO zoom / camera move.
  book.classList.add("open");          // cover hinges open on the LEFT spine
                                        // + the cover-cast shadow sweeps the page
  bookFloat.classList.add("rest");     // stop the idle bob
  // Reveal the REAL page right away (it sits beneath the cover, masked by it) so
  // as the cover lifts, the actual first page is what shows underneath.
  flipbookEl.classList.add("show");
  // Tapping PLAY is a user gesture, so we can start audio here: turn sound ON and
  // play the dedicated COVER-flip sound (sfx/cover page flip.mp3).
  soundOn();
  playCoverFlip();
  // PRIME every video INSIDE this tap gesture: a quick muted play()→pause() unlocks
  // the media element so it can start instantly (and with sound) the moment its
  // page is shown — no first-play lag, no autoplay block. Reset to frame 0 after.
  primeVideos();
  // Start the page-1 video RIGHT NOW — instantly, within the tap gesture (so it has
  // sound) — so it is already playing as the (slow) cover swings open, instead of
  // sitting frozen until the open finishes.
  refreshMedia();
  // Once the cover has FULLY opened (the slow, dramatic hinge-open), park the cover,
  // lift the pages ABOVE it, hand over pointer events, and mark the book READY.
  setTimeout(function () {
    coverScene.classList.add("parked");
    flipbookEl.style.zIndex = "5";        // pages now sit ABOVE the parked cover (z3)
    tapCatcher.style.pointerEvents = "none";
    flipbookEl.style.pointerEvents = "auto";
    ready = true;
    updateProgress();
    refreshMedia();                       // re-assert (idempotent safety net)
  }, COVER_OPEN_MS + 50);                 // just after the cover-open animation
  updateProgress();
}

/* Unlock all <video> elements within a user gesture so a later programmatic
   play() starts instantly and is allowed to have sound. */
function primeVideos() {
  leaves.forEach(function (leaf) {
    const v = leaf.querySelector("video.page-media");
    if (!v) return;
    try {
      v.muted = true;
      const p = v.play();                 // start within the gesture → element is now "activated"
      if (p && p.catch) p.catch(function () {});
      v.pause();                          // pause SYNCHRONOUSLY (no async race that could
      v.currentTime = 0;                  // pause the video right after it really starts)
    } catch (_) {}
  });
}

/* ==========================================================================
   INPUT  —  tap PLAY to OPEN the cover; once open, drag + corner arrows +
   keyboard drive the page flip.
   ========================================================================== */
const tapCatcher = document.getElementById("tapCatcher");

// The book opens ONLY from the play button. The tap-catcher still sits on top to
// block page gestures before opening, but it opens the book only when the tap
// lands inside the play button's (breathing) hit-circle — taps elsewhere on the
// cover do nothing.
function tapHitsPlay(e) {
  const r = hint.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const rad = Math.max(r.width, r.height) / 2;
  return Math.hypot(e.clientX - cx, e.clientY - cy) <= rad;
}
if (tapCatcher) tapCatcher.addEventListener("click", function (e) { if (!opened && tapHitsPlay(e)) openBook(); });

// The play button itself (also covers keyboard: Enter/Space on the focused button).
hint.addEventListener("click", function (e) { e.stopPropagation(); if (!opened) openBook(); });

prevBtn.addEventListener("click", function (e) { e.stopPropagation(); goPrev(); });
nextBtn.addEventListener("click", function (e) { e.stopPropagation(); goNext(); });

// Bottom-corner flip arrows (outside the book): back = left, forward = right.
cornerPrev.addEventListener("click", function (e) { e.stopPropagation(); goPrev(); });
cornerNext.addEventListener("click", function (e) { e.stopPropagation(); goNext(); });

// Page interaction — DRAG TO TURN: grab the page and it follows your cursor,
// rotating about the spine, then SNAPS to the nearest state when you let go.
//   • drag LEFT  → turn the current page forward (it comes to rest on the cover)
//   • drag RIGHT → turn the previous page back
// A plain tap does nothing; the corner arrows + keyboard still work.
(function () {
  let startX = 0, startY = 0, pw = 1;
  let leaf = null, dir = 0, decided = false, dragging = false, curlEl = null;
  let lastX = 0, lastT = 0, vx = 0;                   // for flick (velocity) detection
  const DECIDE = 6;                                   // px before we commit to a drag
  const FLICK = 0.45;                                 // px/ms — a quick flick completes the turn
  const FINISH_DEG = 45;                              // turned this far (deg) → completes on release

  // how many degrees the drag has turned the page (0..180)
  function degFromDx(dx) { return Math.max(0, Math.min(180, Math.abs(dx) / pw * 180)); }
  // the live angle for the active leaf, given the raw horizontal travel
  function liveAngle(dx) {
    return (dir === 1) ? degFromDx(Math.min(0, dx))          // forward: leftward turns 0→180
                       : 180 - degFromDx(Math.max(0, dx));   // back: starts at 180, rightward → 0
  }

  flipbookEl.addEventListener("pointerdown", function (e) {
    if (!opened || !ready || animating) return;
    if (isGameOverlayOpen) return;                  // book is frozen while a game runs
    startX = e.clientX; startY = e.clientY;
    lastX = e.clientX; lastT = e.timeStamp || performance.now(); vx = 0;
    decided = false; dragging = true; leaf = null; dir = 0; curlEl = null;
    pw = flipbookEl.getBoundingClientRect().width || 1;
  });

  flipbookEl.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const now = e.timeStamp || performance.now();
    const dt = now - lastT;
    if (dt > 0) vx = (e.clientX - lastX) / dt;         // running horizontal velocity
    lastX = e.clientX; lastT = now;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < DECIDE || Math.abs(dx) <= Math.abs(dy)) return;   // wait for a clear horizontal drag
      if (dx < 0 && flipped < totalPages - 1) {           // turn forward
        // Central guard FIRST: a forward swipe off page 6 / 8 opens a game
        // instead of turning. Abort the drag cleanly (no leaf touched yet).
        if (maybeLaunchGameLeaving(flipped)) { dragging = false; decided = false; return; }
        dir = 1;  leaf = leaves[flipped];
      }
      else if (dx > 0 && flipped > 0)          { dir = -1; leaf = leaves[flipped - 1]; } // turn back
      else { dragging = false; return; }                  // nothing to turn that way
      decided = true;
      leaf.style.transition = "none";                     // follow the finger exactly
      leaf.style.zIndex = 300;
      curlEl = leaf.querySelector(".curl");
      try { flipbookEl.setPointerCapture(e.pointerId); } catch (_) {}
    }
    const ang = Math.max(0, Math.min(180, liveAngle(dx)));
    leaf.style.transform = "rotateY(" + (-ang) + "deg)";
    if (curlEl) curlEl.style.opacity = (ang <= 90 ? ang / 90 : (180 - ang) / 90) * 0.9;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const L = leaf, D = dir, C = curlEl;
    leaf = null; curlEl = null;
    if (!decided || !L) return;                           // a plain tap → nothing

    const ang = Math.max(0, Math.min(180, liveAngle(e.clientX - startX)));
    // Complete the turn if it's been dragged far enough OR flicked quickly in
    // the turn's direction — no need to drag all the way past halfway.
    const flick = (D === 1) ? (vx < -FLICK) : (vx > FLICK);
    const complete   = (D === 1) ? (ang > FINISH_DEG || flick)
                                 : (ang < 180 - FINISH_DEG || flick);
    const endFlipped = (D === 1) ? complete   : !complete;    // does this leaf end up turned?

    animating = true;
    if (C) C.style.opacity = "";
    if (complete) { playFlip(); flipped += (D === 1) ? 1 : -1; }
    // Lock in the resting classes + z-index NOW (so nothing pops in later), then
    // animate the inline transform from the dragged angle to the target. The
    // .flipped class already holds the same final angle underneath.
    L.style.transition = "";                              // restore the CSS flip transition
    void L.offsetWidth;                                   // reflow so it animates FROM the dragged angle
    L.classList.add("flipping");                          // curl shading during the snap
    renderLeaves();                                       // apply .flipped + z-index immediately
    pauseAllPageMedia();                                  // keep all page video/voice silent during the snap
    L.style.transform = endFlipped ? "rotateY(-180deg)" : "rotateY(0deg)";
    updateProgress();

    setTimeout(function () {
      L.classList.remove("flipping");
      // Drop the inline transform WITHOUT re-animating: the .flipped class already
      // holds the final angle, so disabling the transition for this swap prevents
      // the leaf from briefly swinging back (the "page reappears on the left" glitch).
      L.style.transition = "none";
      L.style.transform = "";
      void L.offsetWidth;                                 // commit with no transition
      L.style.transition = "";                            // restore for the next turn
      animating = false; updateProgress();
      refreshMedia();                                     // START the landed page's video + voice ONLY now
    }, FLIP_MS + 40);
  }
  flipbookEl.addEventListener("pointerup", endDrag);
  flipbookEl.addEventListener("pointercancel", endDrag);
})();

window.addEventListener("keydown", function (e) {
  if (e.key === "ArrowRight") { e.preventDefault(); opened ? goNext() : openBook(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
  else if ((e.key === " " || e.key === "Enter") && !opened) { e.preventDefault(); openBook(); }
});

// Keep the canvas scaled to fit on resize / rotate.
window.addEventListener("resize", fitScale);
window.addEventListener("orientationchange", fitScale);

/* ---- Block ALL zoom (pinch, double-tap, ctrl+wheel, ctrl +/-) ------------
   The book is fixed-layout, so zoom would only break it. */
(function () {
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) {   // iOS pinch
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
  window.addEventListener("wheel", function (e) {                          // desktop ctrl+wheel
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
  window.addEventListener("keydown", function (e) {                        // ctrl/⌘ +/-/0
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].indexOf(e.key) !== -1) e.preventDefault();
  });
  document.addEventListener("touchmove", function (e) {                    // 2-finger pinch
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();

/* ==========================================================================
   SOUND  —  two real audio files: sfx/Page flip.mp3 (every page flip) and
   sfx/cover page flip.mp3 (only the cover opening). Muted until the book is
   opened (a user gesture), then on.
   ========================================================================== */
let muted = true;

// Page-flip sound = the mp3 in the sfx/ folder (space in the name → %20), played
// snappy on every flip. Preloaded so it fires instantly.
const flipSound = new Audio("sfx/Page%20flip.mp3");
flipSound.preload = "auto";
function playFlip() {
  if (muted) return;                        // sound turns on when the book opens
  try {
    flipSound.currentTime = 0;
    flipSound.playbackRate = 1.5;           // fast / snappy flip
    const p = flipSound.play();
    if (p && p.catch) p.catch(function () {});   // ignore autoplay rejections
  } catch (_) {}
}
// COVER-page flip sound = its OWN mp3, played ONLY when the cover opens/flips —
// never on ordinary page flips (those use flipSound above).
const coverFlipSound = new Audio("sfx/cover%20page%20flip.mp3");
coverFlipSound.preload = "auto";
coverFlipSound.volume = 0.35;              // quieter than the page-flip sound
function playCoverFlip() {
  if (muted) return;
  try {
    coverFlipSound.currentTime = 0;
    const p = coverFlipSound.play();
    if (p && p.catch) p.catch(function () {});   // ignore autoplay rejections
  } catch (_) {}
}
// Turn sound ON when the book is opened (a clear user gesture). Safe to call
// repeatedly.
function soundOn() {
  muted = false;                     // opening the book turns sound on
}


/* ==========================================================================
   LBD LEARNING-GAME INTEGRATION
   --------------------------------------------------------------------------
   Two learning games open FULL-SCREEN between specific VISIBLE pages:
     • Leaving visible page 6 → open LBD 1 → on completion auto-advance to 7.
     • Leaving visible page 8 → open LBD 2 → on completion auto-advance to 9.
   Works for EVERY forward method (next arrow, right corner, swipe/drag,
   keyboard) because all of them funnel through goNext() OR the drag handler,
   and both consult maybeLaunchGameLeaving() before committing the turn.
   ========================================================================== */

// Which VISIBLE (1-based) page each game gates — configurable, not a raw index.
const LBD_1_AFTER_VISIBLE_PAGE = 6;
const LBD_2_AFTER_VISIBLE_PAGE = 8;

// Game entry files. Folder names contain SPACES → encodeURI() keeps the URL
// valid without renaming anything. (Verified entry points on disk.)
const LBD_GAMES = {
  lbd1: { src: "LBD 1/fish rescue game/index.html", afterPage: LBD_1_AFTER_VISIBLE_PAGE },
  lbd2: { src: "LBD 2/FishResue2/index.html",       afterPage: LBD_2_AFTER_VISIBLE_PAGE },
};

/* Page-number mapping -------------------------------------------------------
   This flipbook is SINGLE-PAGE (one leaf per view) and has NO cover leaf in the
   `pages` array — the 3D hardcover is a separate element. So `flipped` (leaves
   turned to the left) equals the current page's ZERO-BASED index:
        visible page number = flipped + 1
        flipped index        = visiblePage - 1
   Centralised here so a future cover / blank / two-page-spread change is a
   one-line edit rather than scattered hard-coded numbers. */
function visiblePageFromFlipped(f) { return f + 1; }
function flippedFromVisiblePage(p) { return p - 1; }

// ---- session state (module-scoped → resets on a full reload = fresh reading)
let activeGameId = null;             // 'lbd1' | 'lbd2' while a game is open
let pendingDestinationPage = null;   // visible page to land on after the game
let isGameOverlayOpen = false;
let lbd1Completed = false;
let lbd2Completed = false;
let isProgrammaticNavigation = false; // true only while WE auto-advance (skips guard)
let lbdLoadWatchdog = null;

const lbdOverlay = document.getElementById("lbdOverlay");
const lbdFrame   = document.getElementById("lbdFrame");
const lbdLoading = document.getElementById("lbdLoading");
const lbdError   = document.getElementById("lbdError");
const lbdRetry   = document.getElementById("lbdRetry");

// Which game (if any) should launch when leaving this flipped index? Honours
// the per-game completed flag so a finished game never re-launches this session.
function gameLeavingPage(f) {
  const visible = visiblePageFromFlipped(f);
  if (visible === LBD_1_AFTER_VISIBLE_PAGE && !lbd1Completed) return "lbd1";
  if (visible === LBD_2_AFTER_VISIBLE_PAGE && !lbd2Completed) return "lbd2";
  return null;
}

/* THE CENTRAL FORWARD GUARD. Every forward path calls this BEFORE turning.
   Returns true  → a game took over; the caller must NOT turn the page.
           false → no game; the caller proceeds with the normal flip. */
function maybeLaunchGameLeaving(f) {
  if (isProgrammaticNavigation) return false;  // our own auto-advance never re-triggers a game
  if (isGameOverlayOpen) return true;          // a game is already open → block any turn
  const id = gameLeavingPage(f);
  if (!id) return false;
  openGame(id, visiblePageFromFlipped(f) + 1); // destination = the next visible page
  return true;
}

/* ---- Open / load the full-screen game ----------------------------------- */
function openGame(id, destinationPage) {
  if (isGameOverlayOpen || activeGameId) return;   // guard against double launches
  const game = LBD_GAMES[id];
  if (!game) { console.error("[LBD] Unknown game id:", id); return; }

  activeGameId = id;
  pendingDestinationPage = destinationPage;
  isGameOverlayOpen = true;

  // Freeze + hide the book: block scroll, pause its media, cover the viewport.
  document.body.classList.add("lbd-game-open");
  pauseAllPageMedia();

  lbdError.hidden = true;
  lbdLoading.hidden = false;
  lbdOverlay.classList.add("open");
  lbdOverlay.setAttribute("aria-hidden", "false");

  loadGameFrame(game.src);
}

function loadGameFrame(src) {
  clearTimeout(lbdLoadWatchdog);
  lbdError.hidden = true;
  lbdLoading.hidden = false;

  lbdFrame.onload = function () {            // game document loaded → hide spinner
    clearTimeout(lbdLoadWatchdog);
    lbdLoading.hidden = true;
  };
  lbdFrame.onerror = function () { showGameError(); };
  // Watchdog: if onload never fires, surface a friendly retry (never a hard lock).
  lbdLoadWatchdog = setTimeout(function () {
    if (isGameOverlayOpen && !lbdLoading.hidden) showGameError();
  }, 15000);

  lbdFrame.src = encodeURI(src);            // encodeURI → spaces in folder names stay valid
}

function showGameError() {
  clearTimeout(lbdLoadWatchdog);
  console.error("[LBD] Game failed to load:", lbdFrame && lbdFrame.getAttribute("src"),
    "\n  Expected entry files:\n    LBD 1/fish rescue game/index.html\n    LBD 2/FishResue2/index.html");
  lbdLoading.hidden = true;
  lbdError.hidden = false;                   // Retry button keeps the user unstuck
}

if (lbdRetry) {
  lbdRetry.addEventListener("click", function () {
    if (!activeGameId) return;
    loadGameFrame(LBD_GAMES[activeGameId].src);
  });
}

/* ---- Close the overlay + fully unload the game -------------------------- */
function closeGameOverlay() {
  clearTimeout(lbdLoadWatchdog);
  lbdFrame.onload = null; lbdFrame.onerror = null;
  lbdOverlay.classList.remove("open");
  lbdOverlay.setAttribute("aria-hidden", "true");
  lbdFrame.src = "about:blank";              // unload → stops the game's audio + timers
  lbdLoading.hidden = false;                 // reset layers for next time
  lbdError.hidden = true;
  document.body.classList.remove("lbd-game-open");
  isGameOverlayOpen = false;
}

/* ---- Game reported completion → advance the book exactly once ----------- */
function completeGame(id) {
  if (id !== activeGameId) return;           // ignore stray / duplicate messages
  if (id === "lbd1") lbd1Completed = true;
  if (id === "lbd2") lbd2Completed = true;

  const dest = pendingDestinationPage;
  activeGameId = null;
  pendingDestinationPage = null;

  closeGameOverlay();
  advanceToVisiblePage(dest);                // auto-advance to page 7 / 9 (once)
}

/* One programmatic forward turn, with the guard bypassed so the SAME action
   can't re-open a game or skip a page. No-ops if we're already at/after the
   destination (prevents accidental double advance / skipped pages). */
function advanceToVisiblePage(destPage) {
  if (destPage == null) return;
  const target = flippedFromVisiblePage(destPage);
  if (target <= flipped) return;             // already there → do nothing

  isProgrammaticNavigation = true;
  goNext();                                  // guard is skipped while the flag is set
  setTimeout(function () { isProgrammaticNavigation = false; }, FLIP_MS + 160);
}

/* Pause any page video/audio so nothing plays behind an open game. */
function pauseAllPageMedia() {
  leaves.forEach(function (leaf) {
    const v = leaf.querySelector("video.page-media");
    if (v) { try { v.pause(); } catch (_) {} }
  });
}

/* ---- Message bridge: listen for a game's real completion event ----------
   Games post: { type:'LBD_GAME_COMPLETE', gameId:'lbd1'|'lbd2' }. We validate
   origin (strict same-origin in production; local file:// dev reports "null"/
   "file://" and is tolerated WITHOUT weakening the production rule), the type,
   the gameId, and that it matches the CURRENTLY active game (ignores dupes). */
window.addEventListener("message", function (e) {
  const sameOrigin = (e.origin === window.location.origin);
  const localFile  = (e.origin === "null" || e.origin === "file://");   // file:// dev only
  if (!sameOrigin && !localFile) return;

  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type !== "LBD_GAME_COMPLETE") return;                 // ignore unknown message types
  if (d.gameId !== "lbd1" && d.gameId !== "lbd2") return;     // ignore unknown game ids
  if (!isGameOverlayOpen || d.gameId !== activeGameId) return; // must be the active game (dedupe)

  completeGame(d.gameId);
});

/* ---- Boot ---------------------------------------------------------------- */
fitScale();                              // scale the fixed 1280x720 book to fit first
renderLeaves();                          // lay out the leaves (all on page 1 to start)
updateProgress();

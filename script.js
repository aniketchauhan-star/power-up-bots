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
  { type: "video", src: "assets/1.mp4" },   // Page 1
  { type: "video", src: "assets/2.mp4" },   // Page 2
  { type: "video", src: "assets/3.mp4" },   // Page 3
  { type: "video", src: "assets/4.mp4" },   // Page 4
  { type: "image", src: "assets/5.png", activity: "shapes" },   // Page 5 — static shelf + hand nudge
  { type: "video", src: "assets/6.mp4" },   // Page 6
  // Page 7 — COMBINED (was old pages 7 + 8) for smoother flow: 7.mp4 plays FIRST;
  // the moment it ENDS the shelf scene 7(1).png appears AUTOMATICALLY (no flip)
  // and a hand nudges the PINK RECTANGLE. Tapping it reveals 7(2).mp4 full-page.
  //   intro:true → play THIS page's own video (7.mp4) first, keep the reveal
  //                locked until it ends, then fade in `image` and start the tap.
  { type: "video", src: "assets/7.mp4", activity: "reveal",
    reveal: { intro: true, image: "assets/7(1).png", video: "assets/7(2).mp4",
              spot: { left: "3%", top: "11%", width: "29%", height: "17%" },
              hand: { left: "11.14%", top: "21.5%" } } },
  // Page 8 (was Page 9) — the 8.mp4 scene plays; a hand nudges the PINK RECTANGLE.
  // Tapping it plays 9.mp4 full-page ON TOP (holds on its last frame). Next → 10.mp4.
  { type: "video", src: "assets/8.mp4", activity: "reveal",
    reveal: { video: "assets/9.mp4",
              spot: { left: "1.5%", top: "22%", width: "21%", height: "13%" },
              hand: { left: "12.33%", top: "32%" } } },
  { type: "video", src: "assets/10.mp4" },  // Page 9  (was Page 10)
  { type: "video", src: "assets/11.mp4" },  // Page 10 (was Page 11)
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
    // POSTER = the video's first-frame still (assets/posters/<n>.jpg). The <video>
    // shows this image instead of a BLACK box while it buffers/decodes on a flip,
    // so a page never flashes black. Replaced automatically once the clip plays.
    media.setAttribute("poster",
      page.poster || page.src.replace(/^assets\//, "assets/posters/").replace(/\.mp4$/i, ".jpg"));
    // Lazy by default: DON'T download every page video up front (that made the
    // initial load crawl). Only the current + next page are promoted to "auto"
    // (see prefetchAround), so the book is ready fast and flips stay instant.
    media.preload = "none";
    // Tap the video to (re)start it WITH sound — a guaranteed user gesture, so
    // browsers that blocked the auto-start's audio will now allow it.
    media.addEventListener("click", function () {
      media.muted = false;
      try { if (media.ended) media.currentTime = 0; } catch (_) {}
      const p = media.play(); if (p && p.catch) p.catch(function () {});
      updateNextCue();                                  // replaying → hide the "next" cue until it ends again
    });
    // A plain page's video ENDING is its "interaction complete" — cue the next arrow.
    media.addEventListener("ended", function () { updateNextCue(); });
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

/* ==========================================================================
   PAGE 5 — GUIDED SHELF SEQUENCE (hand nudge → tap → video → next shape)
   --------------------------------------------------------------------------
   Visible page 5 (internal leaf index 4) is the static shelf image (assets/5.png).
   On top of it we lay THREE invisible clickable hotspots — one per shelf row of
   shapes — plus a tutorial HAND that nudges the shape you should tap next, and a
   full-page video overlay that plays that shape's clip.

   The guided flow (one shape at a time):
     step 0 → hand nudges the PINK RECTANGLES (top shelf); tap → assets/5(rectangle).mp4
     step 1 → hand nudges the GREEN BLOCKS  (middle shelf); tap → assets/5(green).mp4
     step 2 → hand nudges the YELLOW CIRCLES (bottom shelf); tap → assets/5(circle).mp4
     step 3 → all done: no more hand, nothing left to tap.
   Each clip plays as a full-page overlay; when it ENDS we return to the static
   page and nudge the next shape. Only the current step's hotspot is tappable.

   Flipping the page (left OR right) RESETS the whole sequence back to step 0, so
   returning to page 5 always starts fresh at the rectangles.

   The engine calls two hooks:
     • page5Sync()        — from refreshMedia() when a page settles (enter/leave)
     • page5OnTurnStart() — from pauseAllPageMedia() when a flip begins
   ========================================================================== */
const P5_VISIBLE_PAGE = 5;                       // the visible page the sequence lives on
let p5Root = null, p5Hand = null, p5Overlay = null, p5Video = null;
let p5Hotspots = [];                              // the three clickable shape zones
let p5HandTimer = null;                           // delayed "show the hand" timer
let p5IsActive = false;                           // is page 5 the settled, active front page?
let p5Step = 0;                                   // 0=rectangle, 1=green, 2=circle, 3=done
let p5Playing = false;                            // is a shape's clip currently on screen?

// Tutorial HAND nudge — user-supplied asset (transparent .webp). object-fit:contain
// keeps its natural aspect ratio inside the .p5-hand box (no stretch / crop / distort).
const P5_HAND_SVG =
  '<img src="assets/handNudge.webp" alt="" aria-hidden="true" draggable="false" ' +
  'style="display:block;width:100%;height:100%;object-fit:contain;object-position:center;">';

/* The sequence, in order. Positions are % of the 1280×720 page:
   • spot — the invisible clickable rectangle over that shelf's shapes.
   • hand — where the pointing hand sits (fingertip points UP into the shapes). */
const P5_STEPS = [
  { key: "rectangle", video: "assets/5(rectangle).mp4",
    spot: { left: "33%", top: "21%", width: "36%", height: "20%" },
    hand: { left: "51.95%", top: "34.01%" } },   // centred on the pink rectangles
  { key: "green",     video: "assets/5(green).mp4",
    spot: { left: "35%", top: "45%", width: "30%", height: "21%" },
    hand: { left: "50.58%", top: "57.56%" } },   // centred on the green blocks
  { key: "circle",    video: "assets/5(circle).mp4",
    spot: { left: "34%", top: "69%", width: "32%", height: "20%" },
    hand: { left: "50.26%", top: "81.68%" } },   // centred on the yellow circles
];

/* Build the page-5 activity DOM. Called ONCE while the page-5 leaf is built. */
function buildPage5Activity() {
  const root = document.createElement("div");
  root.className = "p5-activity";
  root.setAttribute("data-page5", "");

  // One invisible clickable hotspot per shelf row of shapes.
  p5Hotspots = P5_STEPS.map(function (step, i) {
    const spot = document.createElement("button");
    spot.type = "button";
    spot.className = "p5-spot";
    spot.setAttribute("aria-label", "Play the " + step.key + " shapes video");
    ["left", "top", "width", "height"].forEach(function (k) { spot.style[k] = step.spot[k]; });
    spot.addEventListener("click", function (e) { e.stopPropagation(); onPage5SpotClick(i); });
    // A tap on the hotspot must never start a page-flip drag.
    spot.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    root.appendChild(spot);
    return spot;
  });

  // The nudging hand (repositioned per step in showPage5Hand()).
  const hand = document.createElement("div");
  hand.className = "p5-hand";
  hand.setAttribute("data-page5-hand", "");
  hand.setAttribute("data-align-id", "handNudge");   // dev alignment tool hook
  hand.setAttribute("aria-hidden", "true");
  hand.innerHTML = P5_HAND_SVG;
  root.appendChild(hand);

  // Full-page video overlay that plays the tapped shape's clip, then auto-advances.
  const overlay = document.createElement("div");
  overlay.className = "p5-video-overlay";
  const vid = document.createElement("video");
  vid.className = "p5-video";
  vid.playsInline = true;
  vid.setAttribute("playsinline", "");
  vid.setAttribute("webkit-playsinline", "");
  vid.preload = "auto";
  vid.addEventListener("ended", onPage5VideoEnded);
  // Block page-flip drags while the clip is on screen.
  overlay.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  overlay.appendChild(vid);
  root.appendChild(overlay);

  p5Root = root; p5Hand = hand; p5Overlay = overlay; p5Video = vid;
  return root;
}

/* Is visible page 5 the current, settled front page? */
function isVisiblePage5Active() {
  return !!(opened && ready && !isGameOverlayOpen &&
            flipped === flippedFromVisiblePage(P5_VISIBLE_PAGE));
}

/* Only the CURRENT step's hotspot is tappable (and never while a clip plays). */
function updatePage5Spots() {
  p5Hotspots.forEach(function (spot, i) {
    const active = !p5Playing && p5Step < P5_STEPS.length && i === p5Step;
    spot.classList.toggle("active", active);
    spot.style.pointerEvents = active ? "auto" : "none";
    spot.disabled = !active;
  });
}

/* Move the hand onto the current step's shape and reveal it. */
function showPage5Hand() {
  if (!p5Hand || p5Step >= P5_STEPS.length) return;   // nothing left to nudge
  const h = P5_STEPS[p5Step].hand;
  p5Hand.style.left = h.left;
  p5Hand.style.top  = h.top;
  p5Hand.classList.add("show");
}
function hidePage5Hand() {
  clearTimeout(p5HandTimer); p5HandTimer = null;
  if (p5Hand) p5Hand.classList.remove("show");
}

/* Stop + tear down the video overlay (used on flip / leave / after it ends). */
function stopPage5Video() {
  if (p5Overlay) p5Overlay.classList.remove("show");
  if (p5Video) {
    try { p5Video.pause(); p5Video.removeAttribute("src"); p5Video.load(); } catch (_) {}
  }
  p5Playing = false;
}

/* Reader tapped a shape's hotspot → play that shape's clip full-page. */
function onPage5SpotClick(i) {
  if (p5Playing || i !== p5Step || p5Step >= P5_STEPS.length) return;
  if (!isVisiblePage5Active()) return;
  const step = P5_STEPS[i];
  if (!step || !p5Video || !p5Overlay) return;

  p5Playing = true;
  hidePage5Hand();
  updatePage5Spots();                         // freeze hotspots while it plays
  p5Overlay.classList.add("show");
  try {
    p5Video.src = step.video;
    p5Video.currentTime = 0;
    p5Video.muted = false;                    // the tap is a user gesture → sound allowed
    const p = p5Video.play();
    if (p && p.catch) p.catch(function () { p5Video.muted = true; p5Video.play().catch(function () {}); });
  } catch (_) {}
}

/* A shape's clip finished → hide the overlay, advance, nudge the next shape. */
function onPage5VideoEnded() {
  stopPage5Video();
  p5Step++;                                   // move to the next shape (or "done")
  updatePage5Spots();
  updateNextCue();                            // all shapes done → cue the next arrow
  if (isVisiblePage5Active() && p5Step < P5_STEPS.length) {
    clearTimeout(p5HandTimer);
    p5HandTimer = setTimeout(function () {
      if (isVisiblePage5Active() && !p5Playing) showPage5Hand();
    }, 500);
  }
}

/* Lifecycle -----------------------------------------------------------------
   • initialize — page 5 just settled: start FRESH at step 0, nudge the rectangles.
   • reset      — page 5 left: tear everything down and rewind to step 0.
   • turnStart  — a flip began: hide the hand + kill any playing clip. */
function initializePage5Activity() {
  hidePage5Hand();
  stopPage5Video();
  p5Step = 0;                                 // flipping in always restarts the sequence
  updatePage5Spots();
  p5HandTimer = setTimeout(function () {
    if (isVisiblePage5Active() && !p5Playing) showPage5Hand();
  }, 600);
}
function resetPage5Activity() {
  hidePage5Hand();
  stopPage5Video();
  p5Step = 0;
  updatePage5Spots();
}
function page5OnTurnStart() { hidePage5Hand(); stopPage5Video(); }
function page5Sync() {
  const active = isVisiblePage5Active();
  if (active && !p5IsActive) { p5IsActive = true; initializePage5Activity(); }
  else if (!active && p5IsActive) { p5IsActive = false; resetPage5Activity(); }
  else if (active && p5IsActive && !p5Playing && p5Step < P5_STEPS.length &&
           p5Hand && !p5Hand.classList.contains("show")) {
    clearTimeout(p5HandTimer);
    p5HandTimer = setTimeout(function () {
      if (isVisiblePage5Active() && !p5Playing) showPage5Hand();
    }, 350);
  }
}

/* ==========================================================================
   VIDEO-REVEAL PAGES  (static image whose hand-nudged hotspot reveals a video)
   --------------------------------------------------------------------------
   ANY number of page entries can be flagged `activity: "reveal"`. Each shows its
   static image with ONE hand nudge over a hotspot (`reveal.spot`); tapping it
   plays `reveal.video` full-page ON TOP of the image. When the clip ENDS it
   HOLDS on its last frame (no reset, no replay) for as long as the reader stays.
   Flipping away and back rewinds it to the static image + fresh hand nudge.

   Each reveal page gets its own independent controller (state + DOM), so several
   can coexist (e.g. 7(1).png→7(2).mp4 and 8(1).png→8.mp4). Reuses page 5's
   generic CSS (.p5-activity / .p5-spot / .p5-hand / .p5-video-overlay /
   .p5-video). Engine hooks: revealSync() (on settle) and revealOnTurnStart().
   ========================================================================== */
const revealControllers = [];                      // one controller per reveal leaf

function isCtrlActive(c) {
  return !!(opened && ready && !isGameOverlayOpen && flipped === c.leafIndex);
}
function ctrlShowHand(c) { if (c.hand) c.hand.classList.add("show"); }
function ctrlHideHand(c) { clearTimeout(c.handTimer); c.handTimer = null; if (c.hand) c.hand.classList.remove("show"); }
function ctrlSpotEnabled(c, on) {
  if (!c.spot) return;
  c.spot.style.pointerEvents = on ? "auto" : "none";
  c.spot.disabled = !on;
}
function ctrlStopVideo(c) {
  if (c.overlay) c.overlay.classList.remove("show");
  if (c.video) { try { c.video.pause(); c.video.removeAttribute("src"); c.video.load(); } catch (_) {} }
  c.playing = false;
}
/* Preload the reveal clip and paint its first frame NOW, so tapping plays it
   instantly instead of flashing the black overlay while the clip decodes. */
function ctrlPreload(c) {
  if (!c.video || !c.cfg.video) return;
  try {
    if (c.video.getAttribute("src") !== c.cfg.video) c.video.src = c.cfg.video;
    c.video.preload = "auto";
    c.video.load();
    const v = c.video;
    const paint = function () { try { if (v.currentTime < 0.01) v.currentTime = 0.04; } catch (_) {} };
    if (v.readyState >= 2) paint();                 // data ready → decode frame 0 now
    else v.addEventListener("loadeddata", paint, { once: true });
  } catch (_) {}
}
/* Tap → play the clip full-page ON TOP of the static image. */
function ctrlClick(c) {
  if (c.playing || c.finished || !isCtrlActive(c)) return;    // one play per visit; no replay
  if (c.cfg.intro && !c.introDone) return;                    // intro video still playing → not tappable yet
  if (!c.video || !c.overlay || !c.cfg.video) return;
  c.playing = true;
  ctrlHideHand(c);
  ctrlSpotEnabled(c, false);                       // freeze the hotspot while it plays
  // If this page's base is itself a video (e.g. 8.mp4), pause it so its audio
  // doesn't play under the revealed clip.
  const base = leaves[c.leafIndex] && leaves[c.leafIndex].querySelector("video.page-media");
  if (base) { try { base.pause(); } catch (_) {} }
  c.overlay.classList.add("show");
  try {
    if (c.video.getAttribute("src") !== c.cfg.video) c.video.src = c.cfg.video;   // usually preloaded already
    c.video.currentTime = 0;
    c.video.muted = false;                         // the tap is a user gesture → sound allowed
    const p = c.video.play();
    if (p && p.catch) p.catch(function () { c.video.muted = true; c.video.play().catch(function () {}); });
  } catch (_) {}
}
/* Clip finished → HOLD on the last frame. Only a flip away+back rewinds it. */
function ctrlEnded(c) {
  c.playing = false;
  c.finished = true;
  ctrlHideHand(c);
  if (c.video) { try { c.video.pause(); } catch (_) {} }      // stay paused on the final frame
  updateNextCue();                                            // reveal done → cue the next arrow
}
/* INTRO pages only: the page's own base video (e.g. 7.mp4) just ENDED → fade in
   the still shelf image (7(1).png) and START the tap-to-reveal interaction. */
function ctrlIntroEnded(c) {
  if (!c.cfg.intro || c.introDone) return;
  if (!isCtrlActive(c)) return;                    // reader flipped away before it ended
  c.introDone = true;
  if (c.still) c.still.classList.add("show");      // freeze on the interactive shelf scene
  ctrlSpotEnabled(c, true);                        // the pink rectangle is now tappable
  ctrlPreload(c);                                  // buffer + paint the reveal clip's first frame
  clearTimeout(c.handTimer);
  c.handTimer = setTimeout(function () {
    if (isCtrlActive(c) && !c.playing && !c.finished) ctrlShowHand(c);
  }, 500);
}
function ctrlInit(c) {                              // page just settled → fresh start
  ctrlHideHand(c); ctrlStopVideo(c);
  c.finished = false;
  if (c.cfg.intro) {
    // Phase 1: the base video plays first (started by refreshMedia). Keep the
    // reveal locked + the still hidden until that video ends (ctrlIntroEnded).
    c.introDone = false;
    if (c.still) c.still.classList.remove("show");
    ctrlSpotEnabled(c, false);
    // Wire the base video's "ended" → start the reveal phase (once per controller).
    if (!c.introWired) {
      const base = leaves[c.leafIndex] && leaves[c.leafIndex].querySelector("video.page-media");
      if (base) { base.addEventListener("ended", function () { ctrlIntroEnded(c); }); c.introWired = true; }
    }
  } else {
    ctrlSpotEnabled(c, true);
    ctrlPreload(c);                                // buffer + paint the reveal clip's first frame
    c.handTimer = setTimeout(function () { if (isCtrlActive(c) && !c.playing) ctrlShowHand(c); }, 600);
  }
}
function ctrlReset(c) {
  ctrlHideHand(c); ctrlStopVideo(c); c.finished = false;
  if (c.cfg.intro) {                               // rewind so a revisit replays the intro video
    c.introDone = false;
    if (c.still) c.still.classList.remove("show");
    ctrlSpotEnabled(c, false);
  } else {
    ctrlSpotEnabled(c, true);
  }
}
function ctrlSync(c) {
  const active = isCtrlActive(c);
  if (active && !c.isActive) { c.isActive = true; ctrlInit(c); }
  else if (!active && c.isActive) { c.isActive = false; ctrlReset(c); }
  else if (active && c.isActive && !c.playing && !c.finished &&
           (!c.cfg.intro || c.introDone) &&        // don't nudge until the intro video is done
           c.hand && !c.hand.classList.contains("show")) {
    clearTimeout(c.handTimer);
    c.handTimer = setTimeout(function () { if (isCtrlActive(c) && !c.playing) ctrlShowHand(c); }, 350);
  }
}

/* Global hooks the engine calls (fan out to every reveal page). */
function revealSync() { revealControllers.forEach(ctrlSync); }
function revealOnTurnStart() { revealControllers.forEach(function (c) { ctrlHideHand(c); ctrlStopVideo(c); }); }

/* Build ONE reveal page's DOM + register its controller. */
function buildRevealActivity(page, leafIndex) {
  const c = {
    leafIndex: leafIndex, cfg: page.reveal || {},
    hand: null, spot: null, overlay: null, video: null, still: null,
    isActive: false, playing: false, finished: false, handTimer: null,
    introDone: false, introWired: false,
  };
  const root = document.createElement("div");
  root.className = "p5-activity";                  // reuse the generic click-through container

  // INTRO pages: a still image (e.g. 7(1).png) that fades in over the base video
  // once it ends, giving the tap-to-reveal interaction a stable scene to sit on.
  if (c.cfg.intro && c.cfg.image) {
    const still = document.createElement("img");
    still.className = "reveal-still";
    still.src = c.cfg.image;
    still.alt = "";
    still.setAttribute("aria-hidden", "true");
    still.addEventListener("pointerdown", function (e) { e.stopPropagation(); }); // don't start a flip-drag
    root.appendChild(still);
    c.still = still;
  }

  // Single clickable hotspot over the target shape (starts tappable).
  const spot = document.createElement("button");
  spot.type = "button";
  spot.className = "p5-spot active";
  spot.setAttribute("aria-label", "Play the video");
  const s = c.cfg.spot || {};
  ["left", "top", "width", "height"].forEach(function (k) { if (s[k]) spot.style[k] = s[k]; });
  spot.style.pointerEvents = "auto";
  spot.addEventListener("click", function (e) { e.stopPropagation(); ctrlClick(c); });
  spot.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  root.appendChild(spot);

  // The nudging hand, parked over the hotspot (fixed position for this page).
  const hand = document.createElement("div");
  hand.className = "p5-hand";
  hand.setAttribute("data-align-id", "revealHand-" + leafIndex);   // dev alignment tool hook
  hand.setAttribute("aria-hidden", "true");
  hand.innerHTML = P5_HAND_SVG;
  const hp = c.cfg.hand || {};
  if (hp.left) hand.style.left = hp.left;
  if (hp.top)  hand.style.top  = hp.top;
  root.appendChild(hand);

  // Full-page video overlay revealed on tap.
  const overlay = document.createElement("div");
  overlay.className = "p5-video-overlay";
  const vid = document.createElement("video");
  vid.className = "p5-video";
  vid.playsInline = true;
  vid.setAttribute("playsinline", "");
  vid.setAttribute("webkit-playsinline", "");
  vid.preload = "auto";
  // Poster = the reveal clip's first frame, so the overlay never flashes black
  // between the tap and the clip painting its first frame.
  if (c.cfg.video) {
    vid.setAttribute("poster",
      c.cfg.video.replace(/^assets\//, "assets/posters/").replace(/\.mp4$/i, ".jpg"));
  }
  vid.addEventListener("ended", function () { ctrlEnded(c); });
  overlay.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  overlay.appendChild(vid);
  root.appendChild(overlay);

  c.hand = hand; c.spot = spot; c.overlay = overlay; c.video = vid;
  revealControllers.push(c);
  return root;
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
  if (page.activity === "shapes") front.appendChild(buildPage5Activity()); // Page 5 hand-nudge cue
  if (page.activity === "reveal") {                          // tap-to-reveal-video page (e.g. 7(1).png)
    front.appendChild(buildRevealActivity(page, i));
  }
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
const VIDEO_START_DELAY_MS = 3000;  // after a page lands, wait this long before its video (+audio) starts
let videoStartTimer = null;  // pending "start the landed page's video" timeout (cancelled on re-flip)

/* ---- Responsive: scale the FIXED 1280x720 book to fit the viewport --------
   only this CSS transform scale changes, so the paper curl is never distorted. */
let bookScale = 0.5;
function fitScale() {
  const s = Math.min((window.innerWidth  * 0.96) / 1280,
                     (window.innerHeight * 0.84) / 720);
  bookScale = s;
  flipScaleEl.style.setProperty("--book-scale", s.toFixed(4));
  // Also publish the scale on :root so the viewport-FIXED corner arrows (which
  // live OUTSIDE #flipScale) can scale by the SAME factor as the book + play
  // button. This keeps the arrow↔book↔play-button ratio identical on every
  // screen / resolution / zoom instead of the arrows drifting bigger on small
  // screens and smaller on large ones.
  document.documentElement.style.setProperty("--book-scale", s.toFixed(4));
  layoutArrows();
}

/* ---- Fit the corner flip-arrows into the clear band BELOW the book --------
   The arrows are viewport-fixed in the bottom corners. Sizing them purely by
   --book-scale made them balloon on tall 16:9 screens (big scale) where the gap
   below the book is small, so their tops overlapped the book's bottom corners.
   Instead we MEASURE the book's on-screen box and fit each arrow's glyph into
   the gap between the book's bottom edge and the viewport bottom — guaranteeing
   the arrow always clears the book, while staying as large as the gap allows so
   it never looks tiny. Recomputed on every fitScale (load / resize / rotate). */
function layoutArrows() {
  if (!flipScaleEl) return;
  const r = flipScaleEl.getBoundingClientRect();
  if (!r.height) return;

  const RATIO         = 0.58;              // the <svg> is 58% of the button (see CSS)
  const BOTTOM_MARGIN = 12;                // glyph → viewport bottom
  const CLEARANCE     = 12;                // min space between glyph top and book bottom
  const overhang      = 16 * bookScale;    // .book-frame sits inset:-16px in the scaled layer
  const bookBottom    = r.bottom + overhang;
  const gap           = Math.max(0, window.innerHeight - bookBottom);

  // Keep the old arrow↔book proportion, but never taller than the gap allows.
  let glyph = Math.min(RATIO * 150 * bookScale, gap - CLEARANCE - BOTTOM_MARGIN);
  glyph = Math.max(glyph, 44);             // stay tappable even in a shallow gap
  const button = glyph / RATIO;

  // The glyph is vertically centred in the button, so offset the button's
  // `bottom` to land the glyph BOTTOM_MARGIN above the viewport bottom.
  const buttonBottom = BOTTOM_MARGIN - (button - glyph) / 2;
  const inset        = Math.round(Math.max(12, 16 * bookScale));

  const root = document.documentElement.style;
  root.setProperty("--arrow-size",   button.toFixed(1) + "px");
  root.setProperty("--arrow-bottom", buttonBottom.toFixed(1) + "px");
  root.setProperty("--arrow-inset",  inset + "px");
}

/* ---- Render / stacking for the CSS leaf flip ---------------------------- */
// A TURNED leaf sits to the left (rotateY -180deg, showing its blank back over
// the cover); an UN-turned leaf lies flat on top of the cover. z-index keeps the
// current (top un-turned) page in front, and stacks more-recently turned leaves
// above earlier ones on the left pile.
function updateZ() {
  leaves.forEach(function (leaf, i) {
    leaf.style.zIndex = (i < flipped) ? (200 + i) : (100 - i);
    // Only the CURRENT front page should catch taps. The book's 3D context is
    // flattened (the preserve-3d rule targets #leaves, but the container is
    // #flipbook), so a "flipped" leaf still overlaps the page and would steal
    // clicks meant for page-5's shape hotspots / a video. Make every non-current
    // leaf click-through: page-flip DRAGS still work (they bubble to #flipbook),
    // but taps now land on the current page's own content.
    leaf.style.pointerEvents = (i === flipped) ? "auto" : "none";
  });
}
function renderLeaves() {
  leaves.forEach(function (leaf, i) {
    if (i < flipped) leaf.classList.add("flipped");
    else             leaf.classList.remove("flipped");
  });
  updateZ();
}

/* Paint a page video's FIRST FRAME while it's paused, so the page shows a real
   picture the instant it turns into view instead of a blank paper sheet (the
   video's cream background) until it finally plays after the flip lands.
   A tiny seek forces the browser to decode + paint frame 0 even while paused. */
function primeFirstFrame(v) {
  if (!v || v.dataset.primed) return;
  v.dataset.primed = "1";
  const nudge = function () {
    try { if (v.currentTime < 0.01) v.currentTime = 0.04; } catch (_) {}
  };
  if (v.readyState >= 2) nudge();                              // data ready → paint now
  else v.addEventListener("loadeddata", nudge, { once: true }); // …else the moment it is
}

/* Lazily buffer the current page's video plus its immediate neighbours (both
   directions), and paint the NEIGHBOURS' first frame ahead of time so a
   forward OR backward flip reveals a real picture, not a blank page. This keeps
   the initial load fast (we never download all videos at once). Idempotent. */
function prefetchAround(idx) {
  [idx - 1, idx, idx + 1].forEach(function (i) {
    const leaf = leaves[i];
    if (!leaf) return;
    const v = leaf.querySelector("video.page-media");
    if (!v) return;
    if (!v.dataset.prefetched) {
      v.dataset.prefetched = "1";
      try { v.preload = "auto"; v.load(); } catch (_) {}
    }
    if (i !== idx) primeFirstFrame(v);   // neighbours: show frame 0 before they turn in
  });
}

/* ---- Per-page media -----------------------------------------------------
   Play the CURRENT page's video (pause every other), and pop the current page's
   speech bubble in ONCE, only after the page has fully settled. Called after
   each flip completes and once the cover has finished opening. */
function refreshMedia(delayMs) {
  // How long to wait after the page settles before its video plays. Defaults to
  // VIDEO_START_DELAY_MS (a normal flip); openBook passes 0 for the first page.
  if (delayMs == null) delayMs = VIDEO_START_DELAY_MS;
  const idx = flipped;                         // the front-most page right now
  prefetchAround(idx);                          // make sure this + the next page are buffered
  // Pause every OTHER page's video right away; the current page's video is started
  // below, after a short delay so the page has a beat to settle first.
  leaves.forEach(function (leaf, i) {
    if (i === idx) return;
    const v = leaf.querySelector("video.page-media");
    if (v) { try { v.pause(); } catch (_) {} }
  });
  // Cancel any start still pending from a previous flip, then (re)arm this page's.
  clearTimeout(videoStartTimer);
  const startCurrentVideo = function () {
    if (flipped !== idx) return;                // reader flipped away during the delay → skip
    if (isGameOverlayOpen) return;              // a game took over → do not play behind it
    const v = leaves[idx] && leaves[idx].querySelector("video.page-media");
    if (!v) return;
    try {
      if (v.ended) v.currentTime = 0;
      v.muted = false;                          // try WITH sound (sticky activation from Play)
      const p = v.play();
      if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); });
    } catch (_) {}
  };
  if (delayMs > 0) videoStartTimer = setTimeout(startCurrentVideo, delayMs);
  else startCurrentVideo();
  const cur = leaves[idx];
  const bub = cur && cur.querySelector(".bubble");
  if (bub && !bub.dataset.revealed) {           // reveal once — "for one time"
    bub.dataset.revealed = "1";
    bub.classList.add("revealed");
  }
  page5Sync();     // show/hide the Page-5 hand nudge as the front page settles
  revealSync();    // show/hide the reveal-page (7(1).png) hand nudge as it settles
  updateNextCue(); // re-evaluate the "next" cue for the freshly-settled page
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
    refreshMedia(0);                     // START the landed page's video + bubble NOW (no delay on flips)
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

/* ---- DEV tooling hooks (used by align.js's screen navigator) -------------
   Additive, unused by normal gameplay: let a tester jump straight to any page
   — and to any page-5 shape step — without flipping/tapping through. */
window.gotoPage = function (n) {
  if (!opened || !ready) return false;                    // book must be open + settled
  n = Math.max(0, Math.min(totalPages - 1, n | 0));
  animating = false;                                      // drop any in-flight flip guard
  flipped = n;
  renderLeaves();                                         // snap flipped / z-index / pointer state
  pauseAllPageMedia();
  refreshMedia(0);                                        // play landed media + run page5/reveal sync
  updateProgress();
  return true;
};
window.gotoPage5Step = function (s) {
  if (!isVisiblePage5Active()) return false;              // only while page 5 is the front page
  p5Step = Math.max(0, Math.min(P5_STEPS.length - 1, s | 0));
  updatePage5Spots();
  showPage5Hand();
  return true;
};
window.flipState = function () {
  return {
    page:  (typeof flipped === "number" ? flipped : 0),
    total: totalPages,
    step:  p5Step,
    page5: isVisiblePage5Active(),
    ready: !!(opened && ready)
  };
};

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
  updateNextCue();                                                             // pulse "next" when the page is done
}

/* ---- "Next page" cue -----------------------------------------------------
   Has the reader FINISHED everything the current page asks of them?
     • page 5 (shapes) → all three shapes have played (p5Step past the last).
     • reveal pages    → the revealed clip has finished (controller.finished).
     • plain video     → the page video has played to its end.
     • plain image     → nothing to do → ready immediately.
   On the last page there's nowhere to go, so it never cues. */
function currentPageComplete() {
  if (!opened || !ready || isGameOverlayOpen || animating) return false;
  if (flipped >= totalPages - 1) return false;          // last page → no next
  const page = pages[flipped];
  if (!page) return false;
  if (page.activity === "shapes") return p5Step >= P5_STEPS.length;
  if (page.activity === "reveal") {
    const c = revealControllers.find(function (rc) { return rc.leafIndex === flipped; });
    return !!(c && c.finished);
  }
  if (page.type === "video") {
    const v = leaves[flipped] && leaves[flipped].querySelector("video.page-media");
    return !!(v && v.ended);
  }
  return true;                                           // static image, no interaction
}

/* Toggle the pulsating "tap next" cue on the forward corner arrow. */
function updateNextCue() {
  if (!cornerNext) return;
  cornerNext.classList.toggle("pulse", currentPageComplete() && !cornerNext.disabled);
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
  // The arrows only become visible now (body.is-open); re-fit them to the book's
  // settled position (the entrance animation has finished by the time PLAY is hit).
  requestAnimationFrame(layoutArrows);
  // Tapping PLAY is a user gesture, so we can start audio here: turn sound ON and
  // play the dedicated COVER-flip sound (sfx/cover page flip.mp3).
  soundOn();
  playCoverFlip();
  // PRIME every video INSIDE this tap gesture: a quick muted play()→pause() unlocks
  // the media element so it can start instantly (and with sound) the moment its
  // page is shown — no first-play lag, no autoplay block. Reset to frame 0 after.
  primeVideos();
  // The ONLY place we hold before playing: after the Start (Play) button is
  // clicked, wait 1.5s (still within the tap's sticky activation, so audio is
  // allowed) then start the page-1 video as the cover swings open. Ordinary page
  // flips have NO delay — only this initial start-button play does.
  refreshMedia(1500);
  // Once the cover has FULLY opened (the slow, dramatic hinge-open), park the cover,
  // lift the pages ABOVE it, hand over pointer events, and mark the book READY.
  setTimeout(function () {
    coverScene.classList.add("parked");
    flipbookEl.style.zIndex = "5";        // pages now sit ABOVE the parked cover (z3)
    tapCatcher.style.pointerEvents = "none";
    flipbookEl.style.pointerEvents = "auto";
    ready = true;
    updateProgress();
    refreshMedia(0);                      // re-assert page 1 (idempotent safety net)
  }, COVER_OPEN_MS + 50);                 // just after the cover-open animation
  updateProgress();
}

/* Unlock video playback within the opening tap gesture. We only prime the FIRST
   page's video: a single play() gives the document "sticky activation", after
   which every later page video is allowed to play WITH sound too — so we no
   longer force all 10 videos to download up front (that was the slow load). */
function primeVideos() {
  const first = leaves[0] && leaves[0].querySelector("video.page-media");
  if (!first) return;
  try {
    first.preload = "auto";               // ensure the opening page buffers now
    first.muted = true;
    const p = first.play();               // start within the gesture → document is now "activated"
    if (p && p.catch) p.catch(function () {});
    first.pause();                        // pause synchronously right after it really starts
    first.currentTime = 0;
  } catch (_) {}
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
      refreshMedia(0);                                    // START the landed page's video + voice NOW (no delay on flips)
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
// DISABLED: the LBD game folders were removed and this is now a pure video
// flipbook. Pages are 1-based, so 0 never matches → no game ever launches and
// the book flips straight through. Set these back to 6 / 8 to re-enable.
const LBD_1_AFTER_VISIBLE_PAGE = 0;
const LBD_2_AFTER_VISIBLE_PAGE = 0;

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
  page5OnTurnStart();                     // a page is turning → hide the Page-5 hand nudge
  revealOnTurnStart();                    // …and the reveal-page nudge / stop its video
  if (cornerNext) cornerNext.classList.remove("pulse");  // a flip started → drop the "next" cue
  clearTimeout(videoStartTimer);          // drop any pending "start the landed video" timer
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

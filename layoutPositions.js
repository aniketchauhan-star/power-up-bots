/* ============================================================================
   layoutPositions.js — REFERENCE / EXPORT TARGET for the dev alignment tool.
   ----------------------------------------------------------------------------
   This file is NOT imported by the app at runtime. It is where you paste the
   output of the alignment tool's "Copy JSON" button so your good positions are
   recorded in the repo.

   All values are a PERCENTAGE of the 16:9 flipbook stage (#flipScale, the fixed
   1280×720 book layer), so they stay identical on 1366×768, 1440×900,
   1536×864, 1920×1080 and at any zoom.

       x, y   = the element's CENTRE, as % of the stage
       width  = element width as % of the stage (height usually "auto")
       zIndex = stacking order

   HOW TO APPLY A VALUE PERMANENTLY (paste the number into the real source):
     • playButton  → styles.css  .play-btn   left:<x>%  top:<y>%  width:<w-as-px>
     • prevArrow   → styles.css  .corner-arrow(.back)
     • nextArrow   → styles.css  .corner-arrow(.fwd)
     • handNudge   → script.js   P5_STEPS[i].hand  (rectangle / green / circle)
     • revealHand… → script.js   pages[i].reveal.hand  (pages 7 & 8)

   The values below are the CURRENT defaults, as a starting reference. Overwrite
   this whole block with what "Copy JSON" gives you.
   ========================================================================== */
export const layoutPositions = {
  // Cover / start button (styles.css .play-btn). width 122px ≈ 9.53% of 1280.
  playButton: { x: 51.5, y: 68, width: 9.53, height: "auto", zIndex: 2 },

  // Page-5 hand nudge has THREE positions (one per shelf shape) — these live in
  // script.js P5_STEPS[].hand. Recorded here for reference only:
  handNudge_rectangle: { x: 48, y: 27, width: 5,  height: "auto", zIndex: 3 },
  handNudge_green:     { x: 47, y: 53, width: 5,  height: "auto", zIndex: 3 },
  handNudge_circle:    { x: 47, y: 80, width: 5,  height: "auto", zIndex: 3 },

  // Corner nav arrows are viewport-fixed (styles.css .corner-arrow). Their
  // on-screen % shifts with window size; capture with the tool if you move them.
  prevArrow: { x: 4,  y: 96, width: 8, height: "auto", zIndex: 700 },
  nextArrow: { x: 96, y: 96, width: 8, height: "auto", zIndex: 700 }
};

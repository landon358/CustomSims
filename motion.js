/* Custom Sims LLC — motion layer (GSAP scroll reveals).
 *
 * Scrolling is deliberately native. Lenis was removed: it preventDefault()s
 * wheel events and re-drives scroll from rAF on the main thread, which takes
 * scrolling off the compositor. Every main-thread hiccup (a reveal tween
 * starting, a JPEG decoding) then shows up as scroll stutter, and on macOS it
 * double-eases the momentum scrolling the OS already provides. Native scroll
 * is smoother here and 16KB lighter.
 *
 * Progressive enhancement, by design:
 *   - Nothing is hidden by plain CSS. The `.js-motion` class that hides
 *     [data-reveal] blocks is only added by the inline guard in <head>, and
 *     only once gsap + ScrollTrigger are confirmed loaded. If a vendor file
 *     fails, the class is never added and the page renders as before.
 *   - prefers-reduced-motion skips the reveals entirely.
 *
 * Note on timing: support.js (dc-runtime) re-renders the body after
 * DOMContentLoaded, which replaces nodes and kills any ScrollTrigger bound to
 * them. So reveals are wired on window.load, then re-swept when the DOM
 * changes — the same pattern the page's own inline footer script uses.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  function unhide() { root.classList.remove('js-motion'); }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { unhide(); return; }

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) { unhide(); return; }

  gsap.registerPlugin(ScrollTrigger);

  /* ---- Reveals ------------------------------------------------------- */
  function wire(el) {
    if (el.__csWired) return false;
    el.__csWired = true;

    // Stagger the block's own children when it has several, so headings, copy
    // and buttons arrive in sequence rather than as one slab.
    var kids = el.children.length > 1 ? Array.prototype.slice.call(el.children) : [el];

    // Start state goes on the real targets first, then the parent is un-hidden
    // — both in this frame, so there is no flash either way.
    gsap.set(kids, { opacity: 0, y: 22 });
    if (kids[0] !== el) gsap.set(el, { opacity: 1 });

    gsap.to(kids, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power2.out',
      stagger: 0.09,
      // force3D keeps the tween on a GPU layer, so the reveal composites
      // instead of repainting on the main thread — which matters because
      // Lenis is already driving scroll from the main thread.
      force3D: true,
      // Drop the layer again once the reveal is done; leaving dozens of
      // promoted layers alive costs GPU memory for the rest of the page.
      clearProps: 'transform',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true }
    });
    return true;
  }

  // Only refresh when something was actually wired. Refresh() is a full
  // re-measure of every trigger; calling it on each poll tick and each
  // mutation burned ~16 refreshes per load for no benefit.
  function sweep() {
    var found = document.querySelectorAll('[data-reveal]');
    var added = 0;
    for (var i = 0; i < found.length; i++) { if (wire(found[i])) added++; }
    if (added) ScrollTrigger.refresh();
    return added;
  }

  /* ---- Hero video: stop decoding once it is off-screen ---------------- *
   * The hero is a 4K clip. Left alone it keeps decoding every frame for the
   * whole page, which competes with scrolling — badly on machines with no
   * AV1 hardware decoder, where the decode is done on the CPU. Pause it as
   * soon as it leaves the viewport and resume when it comes back.          */
  function wireHeroVideo() {
    var v = document.querySelector('video');
    if (!v || v.__csVis || !window.IntersectionObserver) return;
    v.__csVis = true;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          if (v.paused && !v.ended) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else if (!v.paused) {
          v.pause();
        }
      }
    }, { threshold: 0 });
    io.observe(v);
  }

  function boot() {
    sweep();
    wireHeroVideo();

    // dc-runtime can re-render after we wire up; re-sweep replacements.
    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function () {
        clearTimeout(pending);
        pending = setTimeout(function () { sweep(); wireHeroVideo(); }, 120);
      }).observe(document.body, { childList: true, subtree: true });
    }

    // Bounded poll as a belt-and-braces backstop for the same re-render.
    var tries = 0;
    var poll = setInterval(function () {
      sweep();
      wireHeroVideo();
      if (++tries > 20) clearInterval(poll);
    }, 200);

    // Late webfonts shift layout; re-measure trigger positions when they land.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  // Failsafe: never leave content stuck invisible if something above threw.
  setTimeout(function () {
    var stuck = document.querySelectorAll('[data-reveal]');
    for (var i = 0; i < stuck.length; i++) {
      if (!stuck[i].__csWired) { unhide(); return; }
    }
  }, 5000);
})();

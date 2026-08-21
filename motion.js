/* Custom Sims LLC — motion layer (GSAP reveals + Lenis smooth scroll).
 *
 * Progressive enhancement, by design:
 *   - Nothing is hidden by plain CSS. The `.js-motion` class that hides
 *     [data-reveal] blocks is only added by the inline guard in <head>, and
 *     only once gsap + ScrollTrigger + Lenis are confirmed loaded. If a vendor
 *     file fails, the class is never added and the page renders as before.
 *   - prefers-reduced-motion skips both the reveals and the smooth scroll.
 *   - Touch scrolling stays native (syncTouch: false).
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

  /* ---- Lenis smooth scroll ------------------------------------------ */
  var lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      syncTouch: false
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---- Reveals ------------------------------------------------------- */
  function wire(el) {
    if (el.__csWired) return;
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
      scrollTrigger: { trigger: el, start: 'top 85%', once: true }
    });
  }

  function sweep() {
    var found = document.querySelectorAll('[data-reveal]');
    for (var i = 0; i < found.length; i++) wire(found[i]);
    ScrollTrigger.refresh();
  }

  function boot() {
    sweep();

    // dc-runtime can re-render after we wire up; re-sweep replacements.
    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function () {
        clearTimeout(pending);
        pending = setTimeout(sweep, 120);
      }).observe(document.body, { childList: true, subtree: true });
    }

    // Bounded poll as a belt-and-braces backstop for the same re-render.
    var tries = 0;
    var poll = setInterval(function () {
      sweep();
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

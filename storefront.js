/* Custom Sims LLC — Shopify Storefront API core.
 *
 * Shared by shop.html (grid) and product.html (product pages). Holds the API
 * client, formatting and HTML-sanitising helpers, and the cart drawer.
 * Exposed as window.CSStore.
 *
 * Plug and play: everything shown on the site comes straight from what is
 * entered in Shopify (title, description, photos and videos, options, price,
 * compare-at price, SEO fields). No metafields, no code changes per product.
 *
 * Setup (Shopify admin):
 *   - The token below is the PUBLIC Storefront token from the Headless sales
 *     channel. It is designed to be visible in browser code. Never put the
 *     private token or any Admin API token here.
 *   - A product only appears once it is published to that Headless channel.
 *
 * Pages using this file must not load support.js (dc-runtime): that runtime
 * re-renders the body after load and would wipe what these scripts build.
 */
(function () {
  'use strict';

  var CONFIG = {
    domain: 'p84cah-2k.myshopify.com',
    token: 'b9f2003ae7ae7008e0962829eea99220', // PUBLIC Storefront token (Headless channel) — safe in browser code
    apiVersion: '2026-07',                     // latest stable as of Sept 2026; supported until July 2027
    siteUrl: 'https://customsimsgolf.com',
    collection: ''                             // optional collection handle; empty = every product on the channel
  };

  var PHONE = '(989) 714-1364';
  var PHONE_HREF = 'tel:+19897141364';
  var CART_KEY = 'cs_cart_id';

  var CART_FIELDS =
    'fragment C on Cart {' +
    '  id checkoutUrl totalQuantity' +
    '  cost { subtotalAmount { amount currencyCode } }' +
    '  lines(first: 50) { nodes { id quantity' +
    '    cost { totalAmount { amount currencyCode } }' +
    '    merchandise { ... on ProductVariant { id title' +
    '      image { url(transform: {maxWidth: 200}) altText }' +
    '      product { title vendor handle } } } } }' +
    '}';

  /* ---- API ------------------------------------------------------------ */

  function gql(query, variables) {
    var url = 'https://' + CONFIG.domain + '/api/' + CONFIG.apiVersion + '/graphql.json';
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': CONFIG.token
      },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (res) {
      if (!res.ok) throw new Error('Storefront API HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      if (json.errors && json.errors.length) {
        throw new Error('Storefront API: ' + json.errors.map(function (e) { return e.message; }).join('; '));
      }
      return json.data;
    });
  }

  function configured() { return !!(CONFIG.domain && CONFIG.token); }

  // Mutations return { cart, userErrors }. Surface userErrors as failures.
  function mutate(name, query, variables) {
    return gql(CART_FIELDS + ' ' + query, variables).then(function (d) {
      var r = d[name];
      if (r.userErrors && r.userErrors.length) {
        var err = new Error(r.userErrors.map(function (e) { return e.message; }).join('; '));
        err.userErrors = r.userErrors;
        throw err;
      }
      return r.cart;
    });
  }

  var cartApi = {
    fetch: function (id) {
      return gql(CART_FIELDS + ' query($id: ID!) { cart(id: $id) { ...C } }', { id: id })
        .then(function (d) { return d.cart; });
    },
    create: function (variantId, qty) {
      return mutate('cartCreate',
        'mutation($input: CartInput) { cartCreate(input: $input) { cart { ...C } userErrors { field message } } }',
        { input: { lines: [{ merchandiseId: variantId, quantity: qty }] } });
    },
    add: function (cartId, variantId, qty) {
      return mutate('cartLinesAdd',
        'mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { ...C } userErrors { field message } } }',
        { id: cartId, lines: [{ merchandiseId: variantId, quantity: qty }] });
    },
    update: function (cartId, lineId, qty) {
      return mutate('cartLinesUpdate',
        'mutation($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { ...C } userErrors { field message } } }',
        { id: cartId, lines: [{ id: lineId, quantity: qty }] });
    },
    remove: function (cartId, lineId) {
      return mutate('cartLinesRemove',
        'mutation($id: ID!, $ids: [ID!]!) { cartLinesRemove(cartId: $id, lineIds: $ids) { cart { ...C } userErrors { field message } } }',
        { id: cartId, ids: [lineId] });
    }
  };

  /* ---- Helpers -------------------------------------------------------- */

  function money(m) {
    if (!m) return '';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currencyCode }).format(Number(m.amount));
    } catch (e) {
      return '$' + Number(m.amount).toFixed(2);
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'className') node.className = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* private mode or blocked storage: cart just won't persist */ }
  }
  function recall(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function productUrl(handle) { return '/products/' + encodeURIComponent(handle); }

  // Shopify's plain `description` strips tags without leaving whitespace, so a
  // heading runs straight into the next paragraph ("…Any RoomThe BenQ…").
  // Parse descriptionHtml in an inert document (DOMParser runs no scripts and
  // loads no images) and join block-level text with spaces.
  function plainText(html) {
    if (!html) return '';
    var doc = new DOMParser().parseFromString(html, 'text/html');
    // Text inside these is code or markup, never readable copy.
    Array.prototype.forEach.call(doc.body.querySelectorAll('script, style, noscript, template, svg, math, form, iframe, object, embed'),
      function (n) { n.remove(); });
    var blocks = doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br, div, tr, td, th, blockquote, figcaption');
    Array.prototype.forEach.call(blocks, function (b) { b.appendChild(doc.createTextNode(' ')); });
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* ---- Description sanitiser ------------------------------------------ *
   * Renders the product description exactly as formatted in Shopify's editor
   * (headings, lists, bold, links, tables, images, embedded YouTube/Vimeo),
   * while refusing anything that could run code. The HTML is parsed in an
   * inert document and rebuilt node by node from an allowlist, so nothing from
   * Shopify is ever assigned to innerHTML on the live page.                  */
  var ALLOWED = {
    P: 1, BR: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1,
    SUB: 1, SUP: 1, SPAN: 1, DIV: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1, A: 1, IMG: 1, HR: 1,
    TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TH: 1, TD: 1, CAPTION: 1,
    FIGURE: 1, FIGCAPTION: 1, CODE: 1, PRE: 1, IFRAME: 1
  };
  // Removed together with their contents, not unwrapped.
  var DROP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, OBJECT: 1, EMBED: 1, FORM: 1,
               INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, SVG: 1, MATH: 1, LINK: 1, META: 1, BASE: 1 };
  var VIDEO_EMBED = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/|^https:\/\/player\.vimeo\.com\/video\//;

  function safeHref(v) {
    v = (v || '').trim();
    // Protocol-relative ("//host" or "/\\host") is an external link in disguise.
    if (/^[\/\\]{2}/.test(v)) return 'https://' + v.replace(/^[\/\\]+/, '');
    return /^(https?:|mailto:|tel:|\/|#)/i.test(v) ? v : null;
  }

  function sanitize(html) {
    var frag = document.createDocumentFragment();
    if (!html) return frag;
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function build(src, dest) {
      Array.prototype.forEach.call(src.childNodes, function (n) {
        if (n.nodeType === 3) { dest.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName.toUpperCase();
        if (DROP[tag]) return;
        // The product title is the page's only <h1>; demote description h1s.
        if (tag === 'H1') tag = 'H2';
        if (!ALLOWED[tag]) { build(n, dest); return; } // unknown wrapper: keep its content

        if (tag === 'IFRAME') {
          var src_ = n.getAttribute('src') || '';
          if (!VIDEO_EMBED.test(src_)) return;
          var frame = el('iframe', {
            src: src_, title: n.getAttribute('title') || 'Product video', loading: 'lazy',
            allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen',
            referrerpolicy: 'strict-origin-when-cross-origin'
          });
          dest.appendChild(el('div', { className: 'cs-embed' }, [frame]));
          return;
        }

        var out = document.createElement(tag);
        if (tag === 'A') {
          var href = safeHref(n.getAttribute('href'));
          if (href) {
            out.setAttribute('href', href);
            if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0) {
              out.setAttribute('target', '_blank');
              out.setAttribute('rel', 'noopener noreferrer');
            }
          }
        } else if (tag === 'IMG') {
          var s = n.getAttribute('src') || '';
          if (s.indexOf('//') === 0) s = 'https:' + s;
          if (!/^https:\/\//i.test(s)) return;
          out.setAttribute('src', s);
          out.setAttribute('alt', n.getAttribute('alt') || '');
          out.setAttribute('loading', 'lazy');
          out.setAttribute('decoding', 'async');
          ['width', 'height'].forEach(function (a) { if (/^\d+$/.test(n.getAttribute(a) || '')) out.setAttribute(a, n.getAttribute(a)); });
        } else if (tag === 'TD' || tag === 'TH') {
          ['colspan', 'rowspan'].forEach(function (a) { if (/^\d+$/.test(n.getAttribute(a) || '')) out.setAttribute(a, n.getAttribute(a)); });
        }
        // Keep alignment from the editor; drop colours/fonts that could turn
        // unreadable on the site's black background.
        var align = /text-align\s*:\s*(left|right|center|justify)/i.exec(n.getAttribute('style') || '');
        if (align) out.style.textAlign = align[1].toLowerCase();

        build(n, out);
        dest.appendChild(out);
      });
    }
    build(doc.body, frag);
    return frag;
  }

  function notice(title, body, extra) {
    var p = el('p', { className: 'cs-notice__body' });
    p.appendChild(document.createTextNode(body + ' Call Randy at '));
    p.appendChild(el('a', { href: PHONE_HREF, text: PHONE }));
    p.appendChild(document.createTextNode('.'));
    return el('div', { className: 'cs-notice', role: 'status' }, [
      el('div', { className: 'cs-notice__title', text: title }), p, extra || null
    ]);
  }

  /* ---- Cart ----------------------------------------------------------- */

  var cart = null;
  var busy = false;
  var ui = {};
  var lastFocus = null;

  function announce(msg) { if (ui.live) ui.live.textContent = msg; }

  function setBusy(on) {
    busy = on;
    if (!ui.panel) return;
    ui.panel.setAttribute('aria-busy', on ? 'true' : 'false');
    Array.prototype.forEach.call(ui.drawer.querySelectorAll('[data-line-action]'), function (b) { b.disabled = on; });
  }

  // Quantity of one variant across a cart's lines.
  function qtyOf(c, variantId) {
    if (!c) return 0;
    return c.lines.nodes.reduce(function (n, l) {
      return n + (l.merchandise && l.merchandise.id === variantId ? l.quantity : 0);
    }, 0);
  }

  /* Adds `qty` of a variant. Resolves with { added, requested } so callers can
   * reflect a sell-out on their own button. Shopify does not error when stock
   * runs out or is short: it silently clamps the line (to 0 if none left). */
  function addToCart(variantId, title, qty, opener) {
    qty = Math.max(1, qty || 1);
    if (busy) return Promise.resolve({ added: 0, requested: qty, busy: true });
    setBusy(true);

    var existing = cart && cart.id;
    var before = qtyOf(cart, variantId);
    var op = existing ? cartApi.add(existing, variantId, qty) : cartApi.create(variantId, qty);

    return op.catch(function (err) {
      // A stored cart can expire or be completed at checkout; Shopify reports
      // that as a userError on the `cartId` field. Only then start a fresh cart.
      // Any other failure (network, a bad item) must not throw away a live cart
      // with the shopper's other items in it.
      var cartGone = existing && err.userErrors && err.userErrors.some(function (e) {
        return e.field && e.field[0] === 'cartId';
      });
      if (cartGone) {
        store(CART_KEY, null);
        cart = null;
        before = 0;
        return cartApi.create(variantId, qty);
      }
      throw err;
    }).then(function (c) {
      cart = c;
      store(CART_KEY, c.id);
      renderCart();
      var added = qtyOf(c, variantId) - before;
      if (added <= 0) {
        announce(title + ' just sold out and was not added.');
      } else {
        ui.msg.textContent = added < qty ? 'Only ' + added + ' more could be added — that is all that is in stock.' : '';
        announce(title + ' added to cart.' + (added < qty ? ' Only ' + added + ' were available.' : ''));
        openCart(opener);
      }
      return { added: Math.max(0, added), requested: qty };
    }).catch(function (err) {
      console.error('[shop] add to cart failed:', err);
      announce('Could not add ' + title + ' to the cart. Please try again.');
      alert('Sorry, that could not be added to the cart. Please try again, or call ' + PHONE + '.');
      return { added: 0, requested: qty, error: err };
    }).then(function (result) {
      setBusy(false);
      return result;
    });
  }

  function changeLine(lineId, qty) {
    if (busy || !cart) return;
    setBusy(true);
    var op = qty > 0 ? cartApi.update(cart.id, lineId, qty) : cartApi.remove(cart.id, lineId);
    op.then(function (c) {
      cart = c;
      renderCart();
      // Shopify silently caps a line at the available stock.
      var line = c.lines.nodes.filter(function (l) { return l.id === lineId; })[0];
      var msg = qty > 0 && line && line.quantity < qty ? 'Only ' + line.quantity + ' available.' : '';
      ui.msg.textContent = msg;
      if (msg) announce(msg);
    }).catch(function (err) {
      console.error('[shop] cart update failed:', err);
      ui.msg.textContent = 'Could not update the cart. Please try again.';
      announce(ui.msg.textContent);
    }).then(function () { setBusy(false); });
  }

  function renderCart() {
    if (!ui.drawer) return;
    var count = cart ? cart.totalQuantity : 0;
    var lines = cart ? cart.lines.nodes.filter(function (l) { return l.quantity > 0; }) : [];

    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-count], [data-cart-count-header]'), function (n) {
      n.textContent = count;
    });
    if (ui.pill) ui.pill.hidden = count === 0;

    ui.lines.textContent = '';
    if (!lines.length) {
      ui.lines.appendChild(el('p', { className: 'cs-cart__empty', text: 'Your cart is empty.' }));
    }

    lines.forEach(function (line) {
      var m = line.merchandise;
      var thumb = el('div', { className: 'cs-line__thumb' });
      if (m.image) thumb.appendChild(el('img', { src: m.image.url, alt: m.image.altText || m.product.title, loading: 'lazy' }));

      var minus = el('button', { type: 'button', className: 'cs-qty__btn', 'data-line-action': '', 'aria-label': 'Decrease quantity of ' + m.product.title, text: '−' });
      var plus = el('button', { type: 'button', className: 'cs-qty__btn', 'data-line-action': '', 'aria-label': 'Increase quantity of ' + m.product.title, text: '+' });
      var remove = el('button', { type: 'button', className: 'cs-line__remove', 'data-line-action': '', text: 'Remove' });
      minus.addEventListener('click', function () { changeLine(line.id, line.quantity - 1); });
      plus.addEventListener('click', function () { changeLine(line.id, line.quantity + 1); });
      remove.addEventListener('click', function () { changeLine(line.id, 0); });

      ui.lines.appendChild(el('div', { className: 'cs-line' }, [
        thumb,
        el('div', { className: 'cs-line__info' }, [
          el('a', { className: 'cs-line__title', href: productUrl(m.product.handle), text: m.product.title }),
          m.title !== 'Default Title' ? el('div', { className: 'cs-line__variant', text: m.title }) : null,
          el('div', { className: 'cs-line__controls' }, [
            el('div', { className: 'cs-qty', role: 'group', 'aria-label': 'Quantity' }, [
              minus, el('span', { className: 'cs-qty__n', text: String(line.quantity) }), plus
            ]),
            remove
          ])
        ]),
        el('div', { className: 'cs-line__total', text: money(line.cost.totalAmount) })
      ]));
    });

    ui.subtotal.textContent = cart && lines.length ? money(cart.cost.subtotalAmount) : '—';
    if (cart && lines.length && /^https:\/\//.test(cart.checkoutUrl || '')) {
      ui.checkout.setAttribute('href', cart.checkoutUrl);
      ui.checkout.removeAttribute('aria-disabled');
    } else {
      ui.checkout.removeAttribute('href');
      ui.checkout.setAttribute('aria-disabled', 'true');
      ui.msg.textContent = '';
    }
  }

  var closeTimer = null;

  function openCart(opener) {
    if (!ui.drawer) return;
    // Reopening within the close animation must cancel the pending hide, or
    // the drawer vanishes while the page scroll stays locked.
    clearTimeout(closeTimer);
    lastFocus = opener || document.activeElement;
    ui.drawer.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { ui.drawer.classList.add('is-open'); }, 10);
    ui.close.focus();
  }

  function closeCart() {
    ui.drawer.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { ui.drawer.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function trapFocus(e) {
    if (e.key === 'Escape') { closeCart(); return; }
    if (e.key !== 'Tab') return;
    var f = ui.panel.querySelectorAll('button:not([disabled]), a[href], select, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  function initCart() {
    var drawer = document.getElementById('cs-cart');
    if (!drawer) return;
    ui = {
      drawer: drawer,
      panel: drawer.querySelector('.cs-cart__panel'),
      lines: drawer.querySelector('.cs-cart__lines'),
      subtotal: drawer.querySelector('[data-cart-subtotal]'),
      checkout: drawer.querySelector('[data-cart-checkout]'),
      msg: drawer.querySelector('[data-cart-msg]'),
      close: drawer.querySelector('[data-cart-close-btn]'),
      pill: document.getElementById('cs-cart-pill'),
      live: document.getElementById('cs-shop-live')
    };

    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-open]'), function (b) {
      b.addEventListener('click', function () { openCart(b); });
    });
    Array.prototype.forEach.call(drawer.querySelectorAll('[data-cart-close], [data-cart-close-btn]'), function (b) {
      b.addEventListener('click', closeCart);
    });
    drawer.addEventListener('keydown', trapFocus);
    ui.checkout.addEventListener('click', function (e) {
      if (ui.checkout.getAttribute('aria-disabled') === 'true') e.preventDefault();
    });

    renderCart();

    var savedId = configured() && recall(CART_KEY);
    if (savedId) {
      cartApi.fetch(savedId).then(function (c) {
        // If the shopper already added something while this was loading, that
        // newer cart wins; restoring the old one would orphan their new item.
        if (cart) return;
        if (!c || !c.lines.nodes.length) { store(CART_KEY, null); return; }
        cart = c;
        renderCart();
      }).catch(function () { store(CART_KEY, null); });
    }
  }

  window.CSStore = {
    CONFIG: CONFIG, PHONE: PHONE, PHONE_HREF: PHONE_HREF,
    gql: gql, configured: configured,
    money: money, el: el, plainText: plainText, sanitize: sanitize, notice: notice,
    productUrl: productUrl, addToCart: addToCart, announce: announce
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCart);
  else initCart();
})();

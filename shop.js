/* Custom Sims LLC — Shop grid. Requires storefront.js (window.CSStore). */
(function () {
  'use strict';

  var S = window.CSStore;
  var el = S.el;

  var PRODUCT_FIELDS =
    'fragment P on Product {' +
    '  id title handle vendor descriptionHtml availableForSale' +
    '  priceRange { minVariantPrice { amount currencyCode } }' +
    '  featuredImage { url(transform: {maxWidth: 900}) altText width height }' +
    '  variants(first: 2) { nodes { id title availableForSale' +
    '    price { amount currencyCode } compareAtPrice { amount currencyCode } } }' +
    '}';

  function loadProducts() {
    if (S.CONFIG.collection) {
      return S.gql(PRODUCT_FIELDS +
        ' query($h: String!) { collection(handle: $h) { products(first: 50) { nodes { ...P } } } }',
        { h: S.CONFIG.collection }
      ).then(function (d) { return d.collection ? d.collection.products.nodes : []; });
    }
    return S.gql(PRODUCT_FIELDS +
      ' query { products(first: 50, sortKey: TITLE) { nodes { ...P } } }'
    ).then(function (d) { return d.products.nodes; });
  }

  function card(p) {
    var variants = p.variants.nodes;
    // More than one variant means the shopper has choices to make: send them to
    // the product page rather than guessing an option from the grid.
    var hasChoice = variants.length > 1 || (variants[0] && variants[0].title !== 'Default Title');
    var v = variants.filter(function (x) { return x.availableForSale; })[0] || variants[0];
    var href = S.productUrl(p.handle);

    var media = el('a', { className: 'cs-card__media', href: href, tabindex: '-1', 'aria-hidden': 'true' });
    if (p.featuredImage) {
      media.appendChild(el('img', {
        src: p.featuredImage.url, alt: '',
        width: p.featuredImage.width, height: p.featuredImage.height,
        loading: 'lazy', decoding: 'async'
      }));
    }

    var price = el('div', { className: 'cs-card__price' }, [
      // "From" must be the cheapest option, not whichever variant is listed first.
      el('span', { className: 'cs-card__price-now', text: hasChoice ? 'From ' + S.money(p.priceRange.minVariantPrice) : S.money(v.price) })
    ]);
    if (!hasChoice && v.compareAtPrice && Number(v.compareAtPrice.amount) > Number(v.price.amount)) {
      price.appendChild(el('s', { className: 'cs-card__price-was', text: S.money(v.compareAtPrice) }));
    }

    var body = el('div', { className: 'cs-card__body' }, [
      p.vendor ? el('span', { className: 'cs-card__eyebrow', text: p.vendor }) : null,
      el('h3', { className: 'cs-card__title' }, [el('a', { href: href, text: p.title })]),
      price
    ]);
    var desc = S.plainText(p.descriptionHtml);
    if (desc) body.appendChild(el('p', { className: 'cs-card__desc', text: desc }));

    var cta = el('div', { className: 'cs-card__cta' });
    if (hasChoice) {
      cta.appendChild(el('a', { className: 'cs-btn cs-btn--block', href: href, text: p.availableForSale ? 'Choose options' : 'View details' }));
    } else {
      var button = el('button', { type: 'button', className: 'cs-btn cs-btn--block' });
      var available = v.availableForSale;
      button.textContent = available ? 'Add to cart' : 'Sold out';
      button.disabled = !available;
      button.addEventListener('click', function () {
        var label = button.textContent;
        button.disabled = true;
        button.textContent = 'Adding…';
        S.addToCart(v.id, p.title, 1, button).then(function (r) {
          var soldOut = !r.error && !r.busy && r.added === 0;
          button.textContent = soldOut ? 'Sold out' : label;
          button.disabled = soldOut;
        });
      });
      cta.appendChild(button);
    }
    body.appendChild(cta);

    return el('article', { className: 'cs-card' }, [media, body]);
  }

  function boot() {
    var grid = document.getElementById('cs-shop-grid');
    if (!grid) return;
    function show(node) { grid.textContent = ''; grid.removeAttribute('aria-busy'); grid.appendChild(node); }

    if (!S.configured()) {
      console.warn('[shop] Storefront API not configured: set CONFIG in storefront.js');
      show(S.notice('The shop is almost ready', 'Projectors will be listed here shortly.'));
      return;
    }
    loadProducts().then(function (products) {
      if (!products.length) { show(S.notice('No projectors listed right now', 'Stock changes often.')); return; }
      grid.textContent = '';
      grid.removeAttribute('aria-busy');
      products.forEach(function (p) { grid.appendChild(card(p)); });
    }).catch(function (err) {
      console.error('[shop] could not load products:', err);
      show(S.notice('Products could not be loaded', 'Something went wrong on our end.'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

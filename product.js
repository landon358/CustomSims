/* Custom Sims LLC — product page. Requires storefront.js (window.CSStore).
 *
 * One template serves every product: /products/{handle} (Netlify rewrites it
 * to product.html). Everything shown comes from the product as entered in
 * Shopify — title, vendor, photos and videos in their Shopify order, options
 * and variants, price and compare-at price, stock, formatted description, and
 * the "Search engine listing" SEO title/description. Adding a product in
 * Shopify is all it takes; there is nothing to configure here.
 */
(function () {
  'use strict';

  var S = window.CSStore;
  var el = S.el;

  var QUERY =
    'query($handle: String!) { product(handle: $handle) {' +
    '  id title handle vendor productType descriptionHtml availableForSale' +
    '  seo { title description }' +
    '  options { name optionValues { name } }' +
    '  media(first: 30) { nodes { mediaContentType alt' +
    '    previewImage { url(transform: {maxWidth: 1600}) thumb: url(transform: {maxWidth: 240}) width height altText }' +
    '    ... on MediaImage { image { src: url url(transform: {maxWidth: 1600}) thumb: url(transform: {maxWidth: 240}) width height altText } }' +
    '    ... on Video { sources { url mimeType width height } }' +
    '    ... on ExternalVideo { embedUrl host }' +
    '  } }' +
    '  variants(first: 100) { nodes { id title sku availableForSale' +
    '    selectedOptions { name value }' +
    '    image { url }' +
    '    price { amount currencyCode } compareAtPrice { amount currencyCode } } }' +
    '} }';

  var EMBED = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/|^https:\/\/player\.vimeo\.com\/video\//;

  function handleFromUrl() {
    var m = location.pathname.match(/\/products\/([^\/?#]+)\/?$/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { return null; } // malformed %-escape → "not found", not a blank page
    }
    return new URLSearchParams(location.search).get('handle');
  }

  function filePath(url) { return (url || '').split('?')[0]; }

  function numericId(gid) { var m = /(\d+)(\?|$)/.exec(gid || ''); return m ? m[1] : ''; }

  /* ---- <head>: title, description, canonical, social, structured data -- */

  function setMeta(attr, key, value) {
    var node = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!node) { node = document.createElement('meta'); node.setAttribute(attr, key); document.head.appendChild(node); }
    node.setAttribute('content', value);
  }

  function applyHead(p, variants) {
    var canonical = S.CONFIG.siteUrl + S.productUrl(p.handle);
    var title = ((p.seo && p.seo.title) || p.title) + ' | Custom Sims';
    var desc = (p.seo && p.seo.description) || S.plainText(p.descriptionHtml).slice(0, 160);
    var images = p.media.nodes.map(function (m) { return (m.image || m.previewImage || {}).url; }).filter(Boolean);

    document.title = title;
    setMeta('name', 'description', desc);
    var link = document.head.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute('href', canonical);
    setMeta('property', 'og:type', 'product');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', desc);
    if (images[0]) { setMeta('property', 'og:image', images[0]); setMeta('name', 'twitter:image', images[0]); }

    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.title,
      description: S.plainText(p.descriptionHtml),
      url: canonical,
      image: images,
      offers: variants.map(function (v) {
        var offer = {
          '@type': 'Offer',
          price: Number(v.price.amount).toFixed(2),
          priceCurrency: v.price.currencyCode,
          availability: v.availableForSale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: variants.length > 1 ? canonical + '?variant=' + numericId(v.id) : canonical,
          seller: { '@type': 'Organization', name: 'Custom Sims LLC' }
        };
        if (v.sku) offer.sku = v.sku;
        return offer;
      })
    };
    if (p.vendor) ld.brand = { '@type': 'Brand', name: p.vendor };
    if (variants.length === 1 && variants[0].sku) ld.sku = variants[0].sku;
    var script = document.getElementById('cs-product-ld');
    if (!script) { script = el('script', { type: 'application/ld+json', id: 'cs-product-ld' }); document.head.appendChild(script); }
    script.textContent = JSON.stringify(ld);
  }

  function noindex() { setMeta('name', 'robots', 'noindex, follow'); }

  /* ---- Gallery -------------------------------------------------------- */

  function buildGallery(p) {
    var media = p.media.nodes.filter(function (m) { return m.image || m.previewImage || m.sources || m.embedUrl; });
    var stage = el('div', { className: 'cs-stage', 'aria-live': 'polite' });
    var thumbs = el('div', { className: 'cs-thumbs', role: 'group', 'aria-label': 'Product media' });
    var index = 0;

    function label(m, i) {
      var kind = m.mediaContentType === 'IMAGE' ? 'image' : (m.mediaContentType === 'MODEL_3D' ? '3D preview' : 'video');
      return 'Show ' + kind + ' ' + (i + 1) + ' of ' + media.length;
    }

    function node(m, i) {
      var alt = (m.image && m.image.altText) || m.alt || p.title;
      if (m.mediaContentType === 'VIDEO' && m.sources && m.sources.length) {
        var video = el('video', { controls: '', playsinline: '', preload: 'metadata',
          poster: m.previewImage ? m.previewImage.url : null, 'aria-label': alt });
        m.sources.slice().sort(function (a, b) { return (b.mimeType === 'video/mp4') - (a.mimeType === 'video/mp4'); })
          .forEach(function (s) { video.appendChild(el('source', { src: s.url, type: s.mimeType })); });
        return video;
      }
      if (m.mediaContentType === 'EXTERNAL_VIDEO' && EMBED.test(m.embedUrl || '')) {
        return el('iframe', { src: m.embedUrl, title: alt, loading: 'lazy',
          allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen',
          referrerpolicy: 'strict-origin-when-cross-origin' });
      }
      var img = m.image || m.previewImage;
      if (!img) return el('div', { className: 'cs-stage__empty', text: 'Preview unavailable' });
      return el('img', { src: img.url, alt: alt, width: img.width, height: img.height,
        loading: i === 0 ? 'eager' : 'lazy', fetchpriority: i === 0 ? 'high' : null, decoding: 'async' });
    }

    function show(i) {
      if (!media.length) return;
      index = (i + media.length) % media.length;
      // Stop any playing video before swapping it out.
      Array.prototype.forEach.call(stage.querySelectorAll('video'), function (v) { v.pause(); });
      Array.prototype.forEach.call(stage.querySelectorAll('.cs-stage__media'), function (n) { n.remove(); });
      stage.insertBefore(el('div', { className: 'cs-stage__media' }, [node(media[index], index)]), stage.firstChild);
      Array.prototype.forEach.call(thumbs.children, function (t, ti) {
        if (ti === index) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
      });
    }

    if (!media.length) {
      stage.appendChild(el('div', { className: 'cs-stage__empty', text: 'No photos yet' }));
      return { root: el('div', { className: 'cs-gallery' }, [stage]), showImageUrl: function () {} };
    }

    if (media.length > 1) {
      var prev = el('button', { type: 'button', className: 'cs-stage__nav cs-stage__nav--prev', 'aria-label': 'Previous', text: '‹' });
      var next = el('button', { type: 'button', className: 'cs-stage__nav cs-stage__nav--next', 'aria-label': 'Next', text: '›' });
      prev.addEventListener('click', function () { show(index - 1); });
      next.addEventListener('click', function () { show(index + 1); });
      stage.appendChild(prev);
      stage.appendChild(next);

      media.forEach(function (m, i) {
        var pic = m.image || m.previewImage;
        var t = el('button', { type: 'button', className: 'cs-thumb' + (m.mediaContentType !== 'IMAGE' ? ' cs-thumb--video' : ''), 'aria-label': label(m, i) });
        if (pic) t.appendChild(el('img', { src: pic.thumb || pic.url, alt: '', loading: 'lazy', decoding: 'async' }));
        t.addEventListener('click', function () { show(i); });
        thumbs.appendChild(t);
      });
    }

    show(0);
    return {
      root: el('div', { className: 'cs-gallery' }, [stage, media.length > 1 ? thumbs : null]),
      // Jump to the photo attached to a variant in Shopify, if there is one.
      // Match on the original file path: a variant's image and the same photo
      // in product media carry different IDs (ProductImage vs ImageSource).
      showImageUrl: function (url) {
        if (!url) return;
        var want = filePath(url);
        for (var i = 0; i < media.length; i++) {
          if (media[i].image && filePath(media[i].image.src) === want) { if (i !== index) show(i); return; }
        }
      }
    };
  }

  /* ---- Buy box -------------------------------------------------------- */

  function buildBuyBox(p, gallery) {
    var variants = p.variants.nodes;
    var options = p.options;
    var isDefault = options.length === 1 && options[0].optionValues.length === 1 &&
                    options[0].optionValues[0].name === 'Default Title';

    function variantFor(sel) {
      return variants.filter(function (v) {
        return v.selectedOptions.every(function (o) { return sel[o.name] === o.value; });
      })[0] || null;
    }

    // Start from ?variant= if present, else the first variant in stock.
    var wanted = new URLSearchParams(location.search).get('variant');
    var current = (wanted && variants.filter(function (v) { return numericId(v.id) === wanted; })[0]) ||
                  variants.filter(function (v) { return v.availableForSale; })[0] || variants[0];
    var selected = {};
    current.selectedOptions.forEach(function (o) { selected[o.name] = o.value; });

    var priceNow = el('span', { className: 'cs-pdp__price-now' });
    var priceWas = el('s', { className: 'cs-pdp__price-was' });
    var stock = el('p', { className: 'cs-pdp__stock' });
    var sku = el('p', { className: 'cs-pdp__sku' });
    var qtyN = el('input', { type: 'number', className: 'cs-pdp__qty-n', id: 'cs-pdp-qty', min: '1', max: '99', value: '1', inputmode: 'numeric' });
    var add = el('button', { type: 'button', className: 'cs-btn cs-btn--block cs-pdp__add' });
    var optionButtons = [];

    function readQty() {
      var n = parseInt(qtyN.value, 10);
      if (!(n >= 1)) n = 1;
      if (n > 99) n = 99;
      qtyN.value = n;
      return n;
    }

    function sync() {
      current = variantFor(selected);
      optionButtons.forEach(function (b) {
        var trial = Object.assign({}, selected);
        trial[b.dataset.option] = b.dataset.value;
        var v = variantFor(trial);
        var chosen = selected[b.dataset.option] === b.dataset.value;
        b.setAttribute('aria-pressed', chosen ? 'true' : 'false');
        // Never disable a value: picking one that doesn't pair with the current
        // selection snaps the other options to the closest real variant.
        // Only flag it, so shoppers can see what's in stock at a glance.
        var inStockSomewhere = variants.some(function (x) {
          return x.availableForSale && x.selectedOptions.some(function (o) { return o.name === b.dataset.option && o.value === b.dataset.value; });
        });
        b.classList.toggle('is-unavailable', v ? !v.availableForSale : !inStockSomewhere);
        b.setAttribute('aria-label', b.dataset.value +
          (v ? (v.availableForSale ? '' : ' (sold out)') : (inStockSomewhere ? ' (changes other options)' : ' (sold out)')));
      });

      if (!current) {
        priceNow.textContent = '';
        priceWas.hidden = true;
        stock.textContent = 'That combination is not available.';
        stock.className = 'cs-pdp__stock is-out';
        add.disabled = true;
        add.textContent = 'Unavailable';
        return;
      }

      priceNow.textContent = S.money(current.price);
      var was = current.compareAtPrice;
      var onSale = was && Number(was.amount) > Number(current.price.amount);
      priceWas.textContent = onSale ? S.money(was) : '';
      priceWas.hidden = !onSale;
      stock.textContent = current.availableForSale ? 'In stock' : 'Sold out';
      stock.className = 'cs-pdp__stock ' + (current.availableForSale ? 'is-in' : 'is-out');
      add.disabled = !current.availableForSale;
      add.textContent = current.availableForSale ? 'Add to cart' : 'Sold out';
      sku.textContent = current.sku ? 'SKU ' + current.sku : '';
      sku.hidden = !current.sku;

      if (current.image) gallery.showImageUrl(current.image.url);
      if (!isDefault && history.replaceState) {
        var url = new URL(location.href);
        url.searchParams.set('variant', numericId(current.id));
        history.replaceState(null, '', url);
      }
    }

    var optionsBox = null;
    if (!isDefault) {
      optionsBox = el('div', { className: 'cs-pdp__options' });
      options.forEach(function (o) {
        var group = el('div', { className: 'cs-pdp__values' });
        o.optionValues.forEach(function (ov) {
          var b = el('button', { type: 'button', className: 'cs-opt', 'data-option': o.name, 'data-value': ov.name, text: ov.name });
          b.addEventListener('click', function () {
            selected[o.name] = ov.name;
            if (!variantFor(selected)) {
              // Keep this choice, and change as few of the other options as possible.
              var best = null, bestScore = -1;
              variants.forEach(function (v) {
                var has = v.selectedOptions.some(function (x) { return x.name === o.name && x.value === ov.name; });
                if (!has) return;
                var score = v.selectedOptions.filter(function (x) { return selected[x.name] === x.value; }).length * 2 +
                            (v.availableForSale ? 1 : 0);
                if (score > bestScore) { best = v; bestScore = score; }
              });
              if (best) best.selectedOptions.forEach(function (x) { selected[x.name] = x.value; });
            }
            sync();
          });
          optionButtons.push(b);
          group.appendChild(b);
        });
        optionsBox.appendChild(el('fieldset', { className: 'cs-pdp__fieldset' }, [
          el('legend', { className: 'cs-label', text: o.name }), group
        ]));
      });
    }

    var minus = el('button', { type: 'button', className: 'cs-qty__btn', 'aria-label': 'Decrease quantity', text: '−' });
    var plus = el('button', { type: 'button', className: 'cs-qty__btn', 'aria-label': 'Increase quantity', text: '+' });
    minus.addEventListener('click', function () { qtyN.value = Math.max(1, readQty() - 1); });
    plus.addEventListener('click', function () { qtyN.value = Math.min(99, readQty() + 1); });
    qtyN.addEventListener('change', readQty);

    add.addEventListener('click', function () {
      if (!current || !current.availableForSale) return;
      var label = add.textContent;
      add.disabled = true;
      add.textContent = 'Adding…';
      var v = current;
      S.addToCart(v.id, p.title, readQty(), add).then(function (r) {
        if (!r.error && !r.busy && r.added === 0) v.availableForSale = false; // sold out since page load
        add.textContent = label;
        sync();
      });
    });

    var help = el('p', { className: 'cs-pdp__help' });
    help.appendChild(document.createTextNode('Not sure it suits your room? Call Randy at '));
    help.appendChild(el('a', { href: S.PHONE_HREF, text: S.PHONE }));
    help.appendChild(document.createTextNode('.'));

    var box = el('div', { className: 'cs-pdp__info' }, [
      p.vendor ? el('span', { className: 'cs-card__eyebrow', text: p.vendor }) : null,
      el('h1', { className: 'cs-pdp__title', text: p.title }),
      el('div', { className: 'cs-pdp__price' }, [priceNow, priceWas]),
      stock,
      optionsBox,
      el('div', { className: 'cs-pdp__buy' }, [
        el('label', { className: 'cs-label', for: 'cs-pdp-qty', text: 'Quantity' }),
        el('div', { className: 'cs-pdp__buy-row' }, [
          el('div', { className: 'cs-qty cs-qty--lg' }, [minus, qtyN, plus]),
          add
        ])
      ]),
      help,
      sku
    ]);

    sync();
    return box;
  }

  /* ---- Boot ----------------------------------------------------------- */

  function boot() {
    var root = document.getElementById('cs-pdp');
    if (!root) return;
    var crumb = document.querySelector('[data-crumb]');
    var descWrap = document.getElementById('cs-pdp-desc');

    function fail(title, body) {
      root.textContent = '';
      root.removeAttribute('aria-busy');
      if (crumb) crumb.textContent = 'Not found';
      var back = el('p', { className: 'cs-notice__body' }, [el('a', { href: 'shop.html', text: '← Back to the shop' })]);
      root.appendChild(S.notice(title, body, back));
    }

    var handle = handleFromUrl();
    if (!S.configured()) { fail('The shop is almost ready', 'Products will be listed here shortly.'); return; }
    if (!handle) { noindex(); fail('Product not found', 'That product link looks incomplete.'); return; }

    S.gql(QUERY, { handle: handle }).then(function (d) {
      var p = d.product;
      if (!p) {
        noindex();
        document.title = 'Product not found | Custom Sims';
        fail('Product not found', 'It may have sold out for good or moved.');
        return;
      }
      applyHead(p, p.variants.nodes);
      if (crumb) crumb.textContent = p.title;

      var gallery = buildGallery(p);
      root.textContent = '';
      root.removeAttribute('aria-busy');
      root.appendChild(gallery.root);
      root.appendChild(buildBuyBox(p, gallery));

      var prose = descWrap && descWrap.querySelector('.cs-prose');
      if (prose && p.descriptionHtml) {
        prose.appendChild(S.sanitize(p.descriptionHtml));
        descWrap.hidden = false;
      }
    }).catch(function (err) {
      console.error('[product] could not load product:', err);
      fail('This product could not be loaded', 'Something went wrong on our end.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

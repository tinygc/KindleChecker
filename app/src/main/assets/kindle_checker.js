(() => {
  if (window.__kindleCheckerAndroidRunning) return;
  window.__kindleCheckerAndroidRunning = true;

  const ASIN_PATTERN = /\/dp\/([A-Z0-9]{10})/;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const yen = (value) => `¥${Number(value).toLocaleString()}`;

  const style = document.getElementById('kc-android-style') || document.createElement('style');
  style.id = 'kc-android-style';
  style.textContent = `
    .kc-android-host{display:block;margin:6px 0;font-family:Arial,sans-serif}.kc-android-badge{display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:5px;color:#fff;font-size:12px;font-weight:700;line-height:1.5}.kc-android-point{background:#f0a500}.kc-android-discount{background:#c0392b}.kc-android-coupon{background:#27ae60}.kc-android-ku{background:#0073b1}.kc-android-none{background:#777}.kc-android-error{background:#e74c3c}.kc-android-value{display:block;width:fit-content;font-size:14px;padding:5px 12px}.kc-android-value-b{background:#2980b9}.kc-android-value-s{background:#8e44ad}.kc-android-value-a{background:#e67e22}.kc-android-value-sp{background:#e74c3c}.kc-android-sub{display:block;font-size:10px;font-weight:400;opacity:.9}#kc-android-progress{position:fixed;right:12px;top:12px;z-index:2147483647;background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;font-family:Arial,sans-serif}`;
  document.head.appendChild(style);

  function parsePrice(text) {
    const cleaned = (text || '').replace(/[¥￥,\s]/g, '');
    const value = parseInt(cleaned, 10);
    return Number.isNaN(value) ? null : value;
  }

  function extractAsin(element) {
    for (const link of element.querySelectorAll('a[href*="/dp/"]')) {
      const match = link.href.match(ASIN_PATTERN);
      if (match) return match[1];
    }
    return /^[A-Z0-9]{10}$/.test(element.dataset.asin || '') ? element.dataset.asin : null;
  }

  function collectItems() {
    return [...document.querySelectorAll('[data-id]')]
      .map((element) => ({ element, asin: extractAsin(element) }))
      .filter((item) => item.asin && item.element.textContent.includes('Kindle'));
  }

  function textFrom(doc, selectors) {
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) return element.textContent;
    }
    return '';
  }

  function parsePoints(text) {
    const full = (text || '').match(/\+?(\d+)\s*pt\s*\((\d+(?:\.\d+)?)%\)/i);
    if (full) return { pointAmount: parseInt(full[1], 10), pointRate: parseFloat(full[2]) };
    const short = (text || '').match(/\(?(\d+)pt\)?/i);
    if (short) return { pointAmount: parseInt(short[1], 10), pointRate: 0 };
    return null;
  }

  async function fetchProductInfo(asin) {
    const response = await fetch(`https://www.amazon.co.jp/dp/${asin}`, { credentials: 'include', headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bodyText = doc.body?.textContent || '';

    const currentPrice = parsePrice(textFrom(doc, ['#buybox .kindle-price .a-price .a-offscreen','#kindle-instant-order-update .a-price .a-offscreen','#corePrice_feature_div .a-price .a-offscreen','.ebook-price-value','#kindle-price']));
    let listPrice = parsePrice(textFrom(doc, ['.print-list-price .a-offscreen','.basisPrice .a-offscreen','#basis-price','.apex-basisprice-value .a-offscreen','#buybox .a-text-price .a-offscreen']));
    if (listPrice === null) {
      const match = bodyText.match(/(?:Print List Price|参考価格)[:\s：]*¥([\d,]+)/);
      if (match) listPrice = parseInt(match[1].replace(',', ''), 10);
    }

    let points = null;
    for (const selector of ['#aip-buybox-display-text','#buybox .loyalty-points span','#buybox [id*="loyalty"] span','.priceBadging-point-text']) {
      for (const element of doc.querySelectorAll(selector)) points ||= parsePoints(element.textContent);
    }
    points ||= (() => {
      const match = bodyText.match(/Amazon Points[:\s]+\+?(\d+)\s*pt\s*\((\d+)%\)/i);
      return match ? { pointAmount: parseInt(match[1], 10), pointRate: parseFloat(match[2]) } : { pointAmount: 0, pointRate: 0 };
    })();

    let couponRate = null;
    let couponAmount = null;
    const couponText = textFrom(doc, ['#couponFeature','#couponBadge','.couponBadge','.couponLabelText','[id^="couponText"]']);
    const rateMatch = couponText.match(/(\d+)%\s*(?:off|割引|OFF)/i) || html.match(/(\d+)%\s*OFF適用済/);
    const amountMatch = couponText.match(/¥\s*([\d,]+)\s*(?:off|割引|OFF)/i);
    if (rateMatch) couponRate = parseInt(rateMatch[1], 10);
    else if (amountMatch) couponAmount = parseInt(amountMatch[1].replace(',', ''), 10);

    return { currentPrice, listPrice, pointAmount: points.pointAmount, pointRate: points.pointRate, couponRate, couponAmount, isKindleUnlimited: !!(doc.querySelector('#borrow-button') || doc.querySelector('.ku-promo-message')) };
  }

  function calculate(raw) {
    let discountAmount;
    let discountRate;
    if (raw.currentPrice !== null && raw.listPrice !== null && raw.listPrice > raw.currentPrice) {
      discountAmount = raw.listPrice - raw.currentPrice;
      discountRate = Math.round((discountAmount / raw.listPrice) * 1000) / 10;
    }
    let pointRate = raw.pointRate;
    if (raw.pointAmount > 0 && pointRate === 0 && raw.currentPrice > 0) pointRate = Math.round((raw.pointAmount / raw.currentPrice) * 1000) / 10;
    let effectivePrice = null;
    let effectiveDiscountRate = null;
    if (raw.currentPrice !== null) {
      let afterCoupon = raw.currentPrice;
      if (raw.couponRate !== null) afterCoupon = Math.round(raw.currentPrice * (1 - raw.couponRate / 100));
      else if (raw.couponAmount !== null) afterCoupon = raw.currentPrice - raw.couponAmount;
      effectivePrice = Math.max(0, Math.round(afterCoupon - raw.pointAmount));
      const base = raw.listPrice || raw.currentPrice;
      effectiveDiscountRate = Math.round((1 - effectivePrice / base) * 1000) / 10;
    }
    return { ...raw, discountAmount, discountRate, pointRate, effectivePrice, effectiveDiscountRate };
  }

  function anchorFor(element) { return element.querySelector('h3,.g-title,[id*="itemName"],.a-link-normal span,a[class*="title"]') || element; }
  function render(element, data) {
    element.querySelector('.kc-android-host')?.remove();
    const host = document.createElement('div');
    host.className = 'kc-android-host';
    if (data.effectiveDiscountRate !== null) {
      const cls = data.effectiveDiscountRate >= 70 ? 'kc-android-value-sp' : data.effectiveDiscountRate >= 50 ? 'kc-android-value-a' : data.effectiveDiscountRate >= 30 ? 'kc-android-value-s' : 'kc-android-value-b';
      host.insertAdjacentHTML('beforeend', `<span class="kc-android-badge kc-android-value ${cls}">実質${data.effectiveDiscountRate}%引き (${yen(data.effectivePrice)})</span>`);
    }
    if (data.isKindleUnlimited) host.insertAdjacentHTML('beforeend', '<span class="kc-android-badge kc-android-ku">📚 読み放題対象</span>');
    host.insertAdjacentHTML('beforeend', data.pointAmount > 0 ? `<span class="kc-android-badge kc-android-point">🪙 +${data.pointAmount}pt (${data.pointRate}%)</span>` : '<span class="kc-android-badge kc-android-none">🪙 ポイントなし</span>');
    if (data.discountRate !== undefined) host.insertAdjacentHTML('beforeend', `<span class="kc-android-badge kc-android-discount">🏷️ ${data.discountRate}%OFF (-${data.discountAmount}円)</span>`);
    if (data.couponRate !== null) host.insertAdjacentHTML('beforeend', `<span class="kc-android-badge kc-android-coupon">🎟️ クーポン${data.couponRate}%OFF</span>`);
    else if (data.couponAmount !== null) host.insertAdjacentHTML('beforeend', `<span class="kc-android-badge kc-android-coupon">🎟️ クーポン${data.couponAmount}円OFF</span>`);
    anchorFor(element).insertAdjacentElement('afterend', host);
  }
  function renderError(element) {
    element.querySelector('.kc-android-host')?.remove();
    const host = document.createElement('div');
    host.className = 'kc-android-host';
    host.innerHTML = '<span class="kc-android-badge kc-android-error">⚠️ 情報取得失敗</span>';
    anchorFor(element).insertAdjacentElement('afterend', host);
  }
  function progress(text) {
    let element = document.getElementById('kc-android-progress');
    if (!element) { element = document.createElement('div'); element.id = 'kc-android-progress'; document.body.appendChild(element); }
    element.textContent = text;
  }

  (async () => {
    const items = collectItems();
    let done = 0, ok = 0;
    progress(`⏳ チェック中... 0/${items.length}件`);
    for (const item of items) {
      try { render(item.element, calculate(await fetchProductInfo(item.asin))); ok++; }
      catch (error) { console.warn('[KindleChecker Android]', item.asin, error); renderError(item.element); }
      done++; progress(`⏳ チェック中... ${done}/${items.length}件`);
      await sleep(500);
    }
    progress(`✅ チェック完了 ${ok}/${items.length}件`);
    setTimeout(() => document.getElementById('kc-android-progress')?.remove(), 3000);
    window.__kindleCheckerAndroidRunning = false;
  })();
})();

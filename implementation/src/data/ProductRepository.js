/**
 * ProductRepository
 * 個別Kindle商品ページから価格・ポイント情報を抽出する
 *
 * 実ページ確認済みの表示パターン:
 *   - Kindle価格: ¥906 (28pt) 形式（buyboxエリア）
 *   - 定価: Print List Price: ¥924 / 参考価格: ¥924
 *   - ポイント: Amazon Points: +28 pt (3%) Time Limited Points
 */

/**
 * 価格文字列（例: "¥1,234"）から数値に変換する
 * @param {string} text
 * @returns {number|null}
 */
function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[¥,￥\s]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * DocumentからKindle現在価格を取得する
 * @param {Document} doc
 * @returns {number|null}
 */
function extractCurrentPrice(doc) {
  const selectors = [
    '#buybox .kindle-price .a-price .a-offscreen',
    '#buybox .kindle-price .a-price-whole',
    '#kindle-instant-order-update .a-price .a-offscreen',
    '#buybox [data-action="show-all-offers-display"] .a-price .a-offscreen',
    '#corePrice_desktop .a-price .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '.ebook-price-value',                        // Kindle ALC形式: <span class="ebook-price-value"> ￥418 </span>
    '#kindle-price',                             // KU/Prime対象書: <span id="kindle-price"> ￥1,200 </span>
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) {
      const price = parsePrice(el.textContent);
      if (price !== null) return price;
    }
  }

  return null;
}

/**
 * Documentから定価（Paper版参考価格）を取得する
 * @param {Document} doc
 * @returns {number|null}
 */
function extractListPrice(doc) {
  const selectors = [
    '.print-list-price .a-price .a-offscreen',
    '.print-list-price .a-offscreen',
    '.basisPrice .a-offscreen',
    '#basis-price',                              // Kindle ALC形式: <td id="basis-price">￥836</td>
    '.apex-basisprice-value .a-offscreen',        // 紙の本の価格（apexウィジェット形式）
    '.centralizedApexBasisPriceCSS .apex-basisprice-value .a-offscreen',
    // buybox内にスコープを限定（他エディション価格の誤検出防止）
    '#corePrice_feature_div .a-text-price .a-offscreen',
    '#corePrice_desktop .a-text-price .a-offscreen',
    '#buybox .a-text-price .a-offscreen',
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) {
      const price = parsePrice(el.textContent);
      if (price !== null) return price;
    }
  }

  // テキスト検索でフォールバック: "Print List Price: ¥924" / "参考価格: ¥924"
  const bodyText = doc.body?.textContent ?? '';
  const listPriceMatch = bodyText.match(/(?:Print List Price|参考価格)[:\s：]*¥([\d,]+)/);
  if (listPriceMatch) {
    const price = parseInt(listPriceMatch[1].replace(',', ''), 10);
    if (!isNaN(price)) return price;
  }

  return null;
}

/**
 * Documentからポイント情報を取得する
 * @param {Document} doc
 * @returns {{ pointAmount: number, pointRate: number }}
 */
function extractPoints(doc) {
  const selectors = [
    '#aip-buybox-display-text',          // 期間限定ポイント含む AllInclusivePoints 表示 (+84 pt (3%) 形式)
    '#buybox .loyalty-points span',
    '#buybox [id*="loyalty"] span',
    '#corePrice_desktop [class*="loyalty"] span',
    '#corePrice_feature_div [class*="loyalty"] span',
    '.priceBadging-point-text'
  ];

  for (const selector of selectors) {
    const els = doc.querySelectorAll(selector);
    for (const el of els) {
      const text = el.textContent;
      const result = parsePointText(text);
      if (result) return result;
    }
  }

  // テキスト検索でフォールバック: "Amazon Points: +28 pt (3%)"
  const bodyText = doc.body?.textContent ?? '';
  const pointsMatch = bodyText.match(/Amazon Points[:\s]+\+?(\d+)\s*pt\s*\((\d+)%\)/i);
  if (pointsMatch) {
    return {
      pointAmount: parseInt(pointsMatch[1], 10),
      pointRate: parseFloat(pointsMatch[2])
    };
  }

  return { pointAmount: 0, pointRate: 0 };
}

/**
 * Documentからクーポン情報を取得する
 * 例: "Coupon:        39% off Terms" や "クーポン：39%OFF"
 *
 * 誤検出防止の戦略:
 * 1. クーポン専用の既知セレクタ（#couponFeature 等）はdoc全体から安全に検索
 * 2. クーポン取得済み状態: .promotions-unified-label の Shadow DOM template 内の "XX% OFF適用済" を検索
 * 3. テキスト検索フォールバックは "Coupon:" (コロン必須) パターンのみ使用
 *    → "✨ 50% OFF Coupon Festival" は "Coupon:" 形式ではないため誤検出しない
 * @param {Document} doc
 * @returns {{ couponRate: number|null, couponAmount: number|null }}
 */
function extractCoupon(doc) {
  // クーポン専用の既知セレクタはdoc全体から検索（誤検出リスクなし）
  const couponSelectors = [
    '#couponFeature',
    '#couponBadge',
    '.couponBadge',
    '#sns-spp-coupon-badge-id',
    '.couponLabelText',      // 動的ID形式 (id="couponTextpctch...") のクーポンテキスト: "39% OFF"
    '[id^="couponText"]'     // 上記のIDプレフィックス指定（クラスがない場合のフォールバック）
  ];

  for (const selector of couponSelectors) {
    const el = doc.querySelector(selector);
    if (el) {
      const text = el.textContent;
      const rateMatch = text.match(/(\d+)%\s*(?:off|割引|OFF)/i);
      if (rateMatch) {
        return { couponRate: parseInt(rateMatch[1], 10), couponAmount: null };
      }
      const amountMatch = text.match(/¥\s*([\d,]+)\s*(?:off|割引|OFF)/i);
      if (amountMatch) {
        return { couponRate: null, couponAmount: parseInt(amountMatch[1].replace(',', ''), 10) };
      }
    }
  }

  // クーポン取得済み状態: "XX% OFF適用済" が Shadow DOM (template) 内に表示される
  // クーポン未取得 → [id^="couponText"] に "50% off" が存在
  // クーポン取得済み → .promotions-unified-label coupon の <template shadowrootmode="open"> 内に "50% OFF適用済" が移動
  const promoEl = doc.querySelector('.promotions-unified-label');
  if (promoEl) {
    const tmpl = promoEl.querySelector('template');
    // template.content (DOMParser が shadowrootmode をサポートする場合) → innerHTML にフォールバック
    const tmplText = (tmpl?.content?.textContent ?? '') || (tmpl?.innerHTML ?? '') || promoEl.innerHTML;
    const claimedMatch = tmplText.match(/(\d+)%\s*OFF適用済/);
    if (claimedMatch) {
      return { couponRate: parseInt(claimedMatch[1], 10), couponAmount: null };
    }
  }

  // フォールバック: body全体から "Coupon: 39% off" 形式を検索
  // "Coupon:" のコロンを必須にすることで "Coupon Festival" 等のバナーを誤検出しない
  const bodyText = doc.body?.textContent ?? '';
  const couponRateMatch = bodyText.match(/Coupon:\s+(\d+)%\s*(?:off|割引|OFF)/i);
  if (couponRateMatch) {
    return { couponRate: parseInt(couponRateMatch[1], 10), couponAmount: null };
  }
  const couponAmountMatch = bodyText.match(/Coupon:\s+¥\s*([\d,]+)\s*(?:off|割引|OFF)/i);
  if (couponAmountMatch) {
    return { couponRate: null, couponAmount: parseInt(couponAmountMatch[1].replace(',', ''), 10) };
  }

  return { couponRate: null, couponAmount: null };
}

/**
 * KindleUnlimited / Prime Reading 対象かどうかを判定する
 * @param {Document} doc
 * @returns {boolean}
 */
function extractIsKindleUnlimited(doc) {
  if (doc.querySelector('#borrow-button')) return true;
  if (doc.querySelector('.ku-promo-message')) return true;
  return false;
}

/**
 * ポイントテキストを解析する
 * 例: "+28 pt (3%)" or "28 pt (3%)" or "28pt"
 * @param {string} text
 * @returns {{ pointAmount: number, pointRate: number }|null}
 */
function parsePointText(text) {
  if (!text) return null;

  // "+28 pt (3%)" パターン
  const fullMatch = text.match(/\+?(\d+)\s*pt\s*\((\d+)%\)/i);
  if (fullMatch) {
    return {
      pointAmount: parseInt(fullMatch[1], 10),
      pointRate: parseFloat(fullMatch[2])
    };
  }

  // "(28pt)" パターン（Kindleタイトル横表示）
  const shortMatch = text.match(/\(?(\d+)pt\)?/i);
  if (shortMatch) {
    return {
      pointAmount: parseInt(shortMatch[1], 10),
      pointRate: 0 // 率は別途計算
    };
  }

  return null;
}

/**
 * 商品ページをfetchして価格・ポイント情報を返す
 * @param {string} asin
 * @returns {Promise<{ currentPrice: number|null, listPrice: number|null, pointAmount: number, pointRate: number }>}
 */
export async function fetchProductInfo(asin) {
  const url = `https://www.amazon.co.jp/dp/${asin}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept': 'text/html'
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const currentPrice = extractCurrentPrice(doc);
  const listPrice = extractListPrice(doc);
  const { pointAmount, pointRate } = extractPoints(doc);
  const { couponRate, couponAmount } = extractCoupon(doc);
  const isKindleUnlimited = extractIsKindleUnlimited(doc);

  console.log(`[KindleChecker] ASIN=${asin}`, { currentPrice, listPrice, pointAmount, pointRate, couponRate, couponAmount, isKindleUnlimited });

  return { currentPrice, listPrice, pointAmount, pointRate, couponRate, couponAmount, isKindleUnlimited };
}

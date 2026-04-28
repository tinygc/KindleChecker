/**
 * ItemRenderer
 * 各Kindle本アイテムへのバッジDOM挿入・エラー表示
 * Shadow DOMでAmazonのCSSから隔離する
 */

const BADGE_STYLES = `
  :host {
    display: block;
    margin: 4px 0;
  }
  .kc-badge-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .kc-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    line-height: 1.6;
    white-space: nowrap;
  }
  .kc-point {
    background-color: #f0a500;
    color: #fff;
  }
  .kc-discount {
    background-color: #c0392b;
    color: #fff;
  }
  .kc-none {
    background-color: #888;
    color: #fff;
    font-weight: normal;
  }
  .kc-coupon {
    background-color: #27ae60;
    color: #fff;
  }
  .kc-ku {
    background-color: #0073b1;
    color: #fff;
  }
  .kc-value-s {
    background-color: #8e44ad;
    color: #fff;
  }
  .kc-value-b {
    background-color: #2980b9;
    color: #fff;
  }
  .kc-value-a {
    background-color: #e67e22;
    color: #fff;
  }
  .kc-value-s-plus {
    background-color: #e74c3c;
    color: #fff;
  }
  .kc-value-block {
    display: block;
    width: fit-content;
    font-size: 14px;
    padding: 5px 14px;
    white-space: normal;
  }
  .kc-value-sub {
    display: block;
    font-size: 10px;
    opacity: 0.9;
    font-weight: normal;
    margin-top: 2px;
  }
  .kc-error {
    background-color: #e74c3c;
    color: #fff;
  }
`;

/**
 * バッジを挿入するアンカー要素を商品要素内から探す
 * @param {Element} itemElement
 * @returns {Element|null}
 */
function findInsertAnchor(itemElement) {
  // タイトル要素の候補
  const titleSelectors = [
    'h3',
    '.g-title',
    '[id*="itemName"]',
    '.a-link-normal span',
    'a[class*="title"]'
  ];

  for (const selector of titleSelectors) {
    const el = itemElement.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.parentElement ?? el;
    }
  }

  return itemElement;
}

/**
 * Shadow DOMを使ってバッジを挿入する
 * @param {Element} anchor - バッジを挿入する基準要素
 * @param {string} badgeHTML - バッジ内部のHTML文字列
 * @returns {Element} - 挿入されたホスト要素
 */
function insertBadge(anchor, badgeHTML) {
  // 既存バッジがあれば削除（重複防止）
  const existing = anchor.parentElement?.querySelector('.kc-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.className = 'kc-host';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = BADGE_STYLES;

  const container = document.createElement('div');
  container.className = 'kc-badge-container';

  // DOMParser経由で安全にバッジHTMLをパース
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${badgeHTML}</body>`, 'text/html');
  const badges = parsed.body.querySelectorAll('.kc-badge');
  badges.forEach(badge => container.appendChild(badge.cloneNode(true)));

  shadow.appendChild(style);
  shadow.appendChild(container);

  // anchorの直後に挿入
  anchor.insertAdjacentElement('afterend', host);

  return host;
}

/**
 * 計算結果をバッジとして商品要素に挿入する
 * @param {Element} itemElement
 * @param {{
 *   currentPrice: number|null,
 *   listPrice: number|null,
 *   discountAmount: number|undefined,
 *   discountRate: number|undefined,
 *   pointAmount: number,
 *   pointRate: number
 * }} calcData
 */
export function render(itemElement, calcData) {
  const { currentPrice, discountAmount, discountRate, pointAmount, pointRate, couponRate, couponAmount, effectivePrice, effectiveDiscountRate, effectiveBreakdownParts, isKindleUnlimited } = calcData;

  let badgeHTML = '';

  // お得度バッジ（割引＋クーポン＋ポイント込みの実質お得度）— 一番左に表示
  if (effectivePrice !== null && effectivePrice !== undefined
      && effectiveDiscountRate !== null && effectiveDiscountRate !== undefined) {
    const breakdownText = effectiveBreakdownParts && effectiveBreakdownParts.length > 1
      ? effectiveBreakdownParts.join(' + ')
      : '';
    const valueClass =
      effectiveDiscountRate >= 70 ? 'kc-value-s-plus' :
      effectiveDiscountRate >= 50 ? 'kc-value-a' :
      effectiveDiscountRate >= 30 ? 'kc-value-s' :
      'kc-value-b';
    const emoji =
      effectiveDiscountRate >= 70 ? '🔥' :
      effectiveDiscountRate >= 50 ? '⭐' :
      effectiveDiscountRate >= 30 ? '💰' :
      '🏷️';
    const subText = breakdownText
      ? `<span class="kc-value-sub">${breakdownText}</span>`
      : '';
    badgeHTML += `<span class="kc-badge kc-value-block ${valueClass}">${emoji} 実質${effectiveDiscountRate}%引き (¥${effectivePrice.toLocaleString()})${subText}</span>`;
  }

  // 読み放題バッジ
  if (isKindleUnlimited) {
    badgeHTML += `<span class="kc-badge kc-ku">📚 読み放題対象</span>`;
  }

  // ポイントバッジ
  if (pointAmount > 0) {
    const rateText = pointRate > 0 ? ` (${pointRate}%)` : '';
    badgeHTML += `<span class="kc-badge kc-point">🪙 +${pointAmount}pt${rateText}</span>`;
  } else {
    badgeHTML += `<span class="kc-badge kc-none">🪙 ポイントなし</span>`;
  }

  // 割引バッジ（定価がある場合のみ）
  if (discountAmount !== undefined && discountRate !== undefined) {
    badgeHTML += `<span class="kc-badge kc-discount">🏷️ ${discountRate}%OFF (-${discountAmount}円)</span>`;
  }

  // クーポンバッジ
  if (couponRate !== null && couponRate !== undefined) {
    badgeHTML += `<span class="kc-badge kc-coupon">🎟️ クーポン${couponRate}%OFF</span>`;
  } else if (couponAmount !== null && couponAmount !== undefined) {
    badgeHTML += `<span class="kc-badge kc-coupon">🎟️ クーポン${couponAmount}円OFF</span>`;
  }

  const anchor = findInsertAnchor(itemElement);
  insertBadge(anchor, badgeHTML);
}

/**
 * エラーバッジを商品要素に挿入する
 * @param {Element} itemElement
 */
export function renderError(itemElement) {
  const anchor = findInsertAnchor(itemElement);

  const existing = anchor.parentElement?.querySelector('.kc-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.className = 'kc-host';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = BADGE_STYLES;

  const container = document.createElement('div');
  container.className = 'kc-badge-container';

  const badge = document.createElement('span');
  badge.className = 'kc-badge kc-error';
  badge.textContent = '⚠️ 情報取得失敗';

  container.appendChild(badge);
  shadow.appendChild(style);
  shadow.appendChild(container);

  anchor.insertAdjacentElement('afterend', host);
}

/**
 * WishlistRepository
 * 欲しいものリストの全ページから商品要素とASINを収集する
 */

const ASIN_PATTERN = /\/dp\/([A-Z0-9]{10})/;

/**
 * 現在のDOMから商品アイテムを収集する
 * @param {Document} doc
 * @returns {{ asin: string, element: Element }[]}
 */
function extractItemsFromDocument(doc) {
  const results = [];

  // 欲しいものリストの各商品アイテムを取得
  const itemElements = doc.querySelectorAll('[data-id]');

  for (const el of itemElements) {
    const asin = extractAsin(el);
    if (asin) {
      results.push({ asin, element: el });
    }
  }

  return results;
}

/**
 * 商品要素からASINを抽出する
 * @param {Element} el
 * @returns {string|null}
 */
function extractAsin(el) {
  // hrefにASINが含まれるリンクを検索
  const links = el.querySelectorAll('a[href*="/dp/"]');
  for (const link of links) {
    const match = link.href.match(ASIN_PATTERN);
    if (match) return match[1];
  }

  // data-asin属性からも試みる
  const asinAttr = el.dataset.asin;
  if (asinAttr && /^[A-Z0-9]{10}$/.test(asinAttr)) {
    return asinAttr;
  }

  return null;
}

/**
 * 次ページのURLを取得する
 * @param {Document} doc
 * @returns {string|null}
 */
function getNextPageUrl(doc) {
  // ページネーションの「次へ」リンクを検索
  const nextLink = doc.querySelector(
    '#wishlistPagination a[href*="page="], ' +
    'li.a-last a[href*="wishlist"], ' +
    '[data-action="wishlist-next-page"] a'
  );

  if (nextLink && nextLink.href) {
    return nextLink.href;
  }

  return null;
}

/**
 * URLのページHTMLをfetchしてDocumentとして返す
 * @param {string} url
 * @returns {Promise<Document>}
 */
async function fetchDocument(url) {
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
  return parser.parseFromString(html, 'text/html');
}

/**
 * 欲しいものリストの現在のDOMから商品アイテムを収集する
 * ページネーションは index.js の MutationObserver で対応する
 * @returns {{ asin: string, element: Element }[]}
 */
export function getAllItems() {
  return extractItemsFromDocument(document);
}

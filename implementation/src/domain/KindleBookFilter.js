/**
 * KindleBookFilter
 * 商品リストからKindle本のみを抽出するフィルタリングロジック
 *
 * 判定基準:
 *   - タイトル文字列に "Kindle" が含まれる（例: "Kindle版"）
 *   - フォーマット表記に "Kindle" が含まれる（例: "Format : Kindle (Digital)"）
 */

/**
 * 商品要素がKindle本かどうか判定する
 * @param {Element} element
 * @returns {boolean}
 */
function isKindleItem(element) {
  const text = element.textContent;
  return text.includes('Kindle');
}

/**
 * 商品アイテムリストからKindle本のみを抽出する
 * @param {{ asin: string, element: Element }[]} items
 * @returns {{ asin: string, element: Element }[]}
 */
export function filter(items) {
  return items.filter(({ element }) => isKindleItem(element));
}

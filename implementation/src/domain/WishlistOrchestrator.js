/**
 * WishlistOrchestrator
 * Kindle本の並行スクレイピング制御（同時実行数制限・エラースキップ・進捗通知）
 *
 * このモジュールはindex.jsからDynamic importされる。
 * Dynamic importで読み込まれたES Module内ではStatic importが使えるため、
 * 相対パスで依存モジュールを参照している。
 */

import { fetchProductInfo } from '../data/ProductRepository.js';
import { calculate } from './PriceCalculator.js';

/** 同時実行数の上限（Amazon レート制限対策） */
const CONCURRENCY = 3;

/** フェッチ失敗時のリトライ回数 */
const MAX_RETRIES = 2;

/** リトライ前の待機時間（ミリ秒） */
const RETRY_DELAY_MS = 1500;

/**
 * 指定ミリ秒待機する
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Kindleアイテムリストを並行処理し、各アイテムに結果をレンダリングする
 * 同時実行数を CONCURRENCY に制限することで速度と安全性を両立する
 * @param {{ asin: string, element: Element }[]} kindleItems
 * @param {{
 *   onRender: (element: Element, calcData: object) => void,
 *   onError: (element: Element) => void,
 *   onProgress: (current: number, total: number) => void,
 *   onComplete: (success: number, total: number) => void
 * }} callbacks
 * @returns {Promise<void>}
 */
export async function run(kindleItems, { onRender, onError, onProgress, onComplete }) {
  const total = kindleItems.length;
  let successCount = 0;
  let completed = 0;

  async function processItem({ asin, element }) {
    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
        const rawData = await fetchProductInfo(asin);
        const calcData = calculate(rawData);
        console.log(`[KindleChecker] calcData ASIN=${asin}`, calcData);
        onRender(element, calcData);
        successCount++;
        onProgress(++completed, total);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    console.warn(`[KindleChecker] ASIN ${asin} の取得失敗 (${MAX_RETRIES}回リトライ済み):`, lastErr);
    onError(element);
    onProgress(++completed, total);
  }

  // ワーカープール方式: CONCURRENCY 個のワーカーが共有キューを処理
  const queue = [...kindleItems];
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, total) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await processItem(item);
      }
    }
  );

  await Promise.all(workers);
  onComplete(successCount, total);
}


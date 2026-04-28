/**
 * ProgressIndicator
 * 処理進捗テキストのDOM表示制御
 */

let indicatorEl = null;

/**
 * 進捗インジケーターを初期化・表示する
 * @param {number} total - 処理対象の総件数
 */
export function init(total) {
  if (indicatorEl) {
    indicatorEl.remove();
  }

  indicatorEl = document.createElement('div');
  indicatorEl.id = 'kc-progress';
  indicatorEl.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'z-index: 9999',
    'background: rgba(0,0,0,0.75)',
    'color: #fff',
    'padding: 8px 16px',
    'border-radius: 6px',
    'font-size: 13px',
    'font-family: sans-serif',
    'pointer-events: none'
  ].join(';');

  indicatorEl.textContent = `⏳ チェック中... 0/${total}件`;
  document.body.appendChild(indicatorEl);
}

/**
 * 進捗を更新する
 * @param {number} current - 処理済み件数
 * @param {number} total - 総件数
 */
export function update(current, total) {
  if (!indicatorEl) return;
  indicatorEl.textContent = `⏳ チェック中... ${current}/${total}件`;
}

/**
 * 処理完了を表示し、3秒後に自動的に非表示にする
 * @param {number} success - 成功件数
 * @param {number} total - 総件数
 */
export function complete(success, total) {
  if (!indicatorEl) return;
  indicatorEl.textContent = `✅ チェック完了 ${success}/${total}件`;

  setTimeout(() => {
    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }
  }, 3000);
}

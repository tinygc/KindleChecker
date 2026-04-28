/**
 * content/index.js
 * エントリポイント。ページ検出・各コンポーネント初期化・処理フロー制御
 *
 * Content ScriptではStatic importが使えないためDynamic importを使用する。
 * 各モジュールは web_accessible_resources に登録済み。
 */

(async () => {
  try {
    const base = chrome.runtime.getURL('implementation/src/');

    const [
      { getAllItems },
      { filter },
      { run },
      { render, renderError },
      ProgressIndicator
    ] = await Promise.all([
      import(base + 'data/WishlistRepository.js'),
      import(base + 'domain/KindleBookFilter.js'),
      import(base + 'domain/WishlistOrchestrator.js'),
      import(base + 'content/ItemRenderer.js'),
      import(base + 'content/ProgressIndicator.js')
    ]);

    // 処理済み要素を追跡（重複処理防止）
    const processedElements = new Set();

    async function processItems(items) {
      // 未処理のアイテムのみフィルタリング
      const newItems = items.filter(({ element }) => !processedElements.has(element));
      if (newItems.length === 0) return;

      // Kindle本のみを抽出
      const kindleItems = filter(newItems);
      if (kindleItems.length === 0) return;

      // 処理済みとしてマーク（開始前にマークして並走処理の重複を防ぐ）
      kindleItems.forEach(({ element }) => processedElements.add(element));

      // 進捗インジケーター初期化
      ProgressIndicator.init(kindleItems.length);

      // 逐次スクレイピング実行
      await run(kindleItems, {
        onRender: (element, calcData) => render(element, calcData),
        onError: (element) => renderError(element),
        onProgress: (current, total) => ProgressIndicator.update(current, total),
        onComplete: (success, total) => ProgressIndicator.complete(success, total)
      });
    }

    // 初回処理
    await processItems(getAllItems());

    // MutationObserver でページネーション（Ajax動的追加）を監視
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const allItems = getAllItems();
        await processItems(allItems);
      }, 600);
    });

    // 欲しいものリストのコンテナを監視対象とする
    const container =
      document.querySelector('#g-items') ??
      document.querySelector('[id*="wishlist-page-"]') ??
      document.querySelector('.g-list-grid') ??
      document.body;

    observer.observe(container, { childList: true, subtree: true });

  } catch (err) {
    console.error('[KindleChecker] 予期せぬエラー:', err);
  }
})();

# アーキテクチャ設計書 - Kindle Checker

## 1. 技術スタック

| 項目 | 採用技術 | 理由 |
|---|---|---|
| 拡張機能形式 | Chrome Extension Manifest V3 | 現行Chrome標準 |
| 言語 | Vanilla JavaScript (ES Modules) | 軽量・依存ゼロ |
| スクレイピング | Fetch API + DOMParser | Content Scriptから直接取得可、XSS安全 |
| スタイル | CSS（Shadow DOM） | AmazonのCSS汚染を防ぐ |

---

## 2. アーキテクチャ方針

Chrome拡張機能の制約上、Clean Architecture の各層を以下のファイル群にマッピングする。

```
Presentation Layer  →  src/content/（Content Script）
Domain Layer        →  src/domain/
Data Layer          →  src/data/
```

依存方向は必ず上から下（Presentation → Domain → Data）のみ。  
下位層は上位層を import しない。

---

## 3. レイヤ構成

### 3.1 Presentation Layer（`src/content/`）

DOM操作・表示に責務を持つ。Domainの結果を受け取り、AmazonページのDOMを書き換える。

| ファイル | 責務 | 対応要件 |
|---|---|---|
| `index.js` | エントリポイント。ページ検出・各コンポーネント初期化・処理フロー制御 | FR-01 |
| `ItemRenderer.js` | 各Kindle本アイテムへのバッジDOM挿入・エラー表示 | FR-05, FR-06 |
| `ProgressIndicator.js` | 進捗バー／テキストのDOM操作 | FR-07 |

### 3.2 Domain Layer（`src/domain/`）

ビジネスロジックを持つ。DOM・fetchに依存しない純粋な関数群。

| ファイル | 責務 | 対応要件 |
|---|---|---|
| `KindleBookFilter.js` | リスト商品からKindle本のみ抽出するフィルタリングロジック | FR-02 |
| `PriceCalculator.js` | 割引率・割引額・ポイント還元率の計算・補完 | FR-04 |
| `WishlistOrchestrator.js` | 逐次スクレイピングの制御（待機タイマー・エラースキップ・進捗通知） | FR-03, FR-06, FR-07, FR-08 |

### 3.3 Data Layer（`src/data/`）

外部（AmazonページHTML）へのアクセスをRepositoryパターンで隠蔽する。

| ファイル | 責務 | 対応要件 |
|---|---|---|
| `WishlistRepository.js` | 欲しいものリストページ（現在ページ＋全ページ先読み）から商品一覧のDOM要素・ASINを収集 | FR-01, FR-02, FR-08 |
| `ProductRepository.js` | 個別Kindle商品ページをfetchし、価格・ポイント情報を抽出して返す | FR-03 |

---

## 4. ファイル構成

```
KindleChecker/
├── manifest.json
├── implementation/
│   └── src/
│       ├── content/
│       │   ├── index.js
│       │   ├── ItemRenderer.js
│       │   └── ProgressIndicator.js
│       ├── domain/
│       │   ├── KindleBookFilter.js
│       │   ├── PriceCalculator.js
│       │   └── WishlistOrchestrator.js
│       └── data/
│           ├── WishlistRepository.js
│           └── ProductRepository.js
├── requirement/
│   └── requirements.md
├── architecture/
│   └── architecture.md
└── test/
```

---

## 5. データフロー

```
[ページロード完了]
        │
        ▼
 index.js (FR-01)
        │ WishlistRepository.getAllItems()
        ▼
 WishlistRepository (FR-08)
  ├─ 現在ページのDOM解析 → 商品要素リスト
  └─ ページネーション先読み（次ページURLがあれば fetch → DOMParser → 繰り返し）
        │ [{asin, element}, ...]
        ▼
 KindleBookFilter.filter(items) (FR-02)
  └─ タイトル/フォーマット文字列に "Kindle" を含むもののみ通過
        │ [{asin, element}, ...] (Kindleのみ)
        ▼
 ProgressIndicator.init(total) (FR-07)
        │
        ▼
 WishlistOrchestrator.run(kindleItems) (FR-03, FR-06, FR-07)
  ├─ for each item (逐次):
  │    ├─ ProductRepository.fetch(asin)    ← 商品ページfetch
  │    ├─ PriceCalculator.calculate(raw)  ← 計算・補完
  │    ├─ ItemRenderer.render(element, result)  ← バッジ挿入
  │    ├─ ProgressIndicator.update(n, total)
  │    └─ (エラー時) ItemRenderer.renderError(element)
  └─ 完了後: ProgressIndicator.complete(success, total)
```

---

## 6. Chrome拡張機能構成

### manifest.json の主要設定

```json
{
  "manifest_version": 3,
  "name": "Kindle Checker",
  "permissions": [],
  "host_permissions": [
    "https://www.amazon.co.jp/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://www.amazon.co.jp/hz/wishlist/*", "https://www.amazon.co.jp/wishlist/*"],
      "js": ["implementation/src/content/index.js"],
      "run_at": "document_idle"
    }
  ]
}
```

**ポイント**:
- Background Service Worker は使用しない（Content Scriptから直接fetchで十分）
- `host_permissions` に `amazon.co.jp` を指定することでContent Scriptから同一ドメインへのfetchが可能
- `run_at: document_idle` でDOM構築完了後に実行（FR-01）

---

## 7. 主要コンポーネント詳細

### 7.1 WishlistRepository（FR-01, FR-08）

**責務**: 欲しいものリストの全商品要素とASINを収集する

**ASIN抽出方法**（実ページ確認済み）:
- 各商品の `<a>` タグのhref属性に `/dp/{ASIN}/` 形式のURLが含まれる
- 正規表現 `/\/dp\/([A-Z0-9]{10})/` でASINを抽出

**Kindle判定方法**（実ページ確認済み）:
- 各商品アイテムに `Format : Kindle (Digital)` というテキストが含まれる（英語表示時）
- 日本語表示では `Kindle版` または `形式: Kindle版` として表示される可能性あり
- 両パターンを確認: `Kindle` を含むフォーマット表記を検索

**ページネーション戦略**:
1. 現在のページDOMから商品要素を収集
2. `#wishlistPagination` または `li[data-action="wishlist-next-page"]` 等の「次へ」リンクを検出
3. 次ページURLが存在すれば `fetch(url)` → `DOMParser` で解析 → 商品要素を追加収集
4. 次ページが存在しなくなるまで繰り返す（先読み完了）
5. 先読みが失敗した場合は現在ページの商品のみで処理開始（フォールバック）

**返り値**:
```js
[{ asin: "B0XXXXX", element: HTMLElement }, ...]
```

### 7.2 ProductRepository（FR-03）

**責務**: 個別商品ページから価格・ポイント情報を抽出する

**実装方針**:
- `fetch("https://www.amazon.co.jp/dp/{asin}")` でHTML取得
- `DOMParser` で安全にDOM化（innerHTML直接挿入は行わない）
- 複数のセレクタ候補を試行（NFR-02: DOM変更耐性）

**実ページ確認済みの価格表示パターン**:
- Kindle価格 + ポイント: `¥906 (28pt)` 形式（buyboxエリア）
- 定価: `Print List Price: ¥924`（または日本語: `参考価格: ¥924`）
- ポイント詳細: `Amazon Points: +28 pt (3%) Time Limited Points`
- 割引表示: `¥906 with 2 percent savings`

**取得対象セレクタ（候補）**:

| 情報 | セレクタ候補 |
|---|---|
| Kindle現在価格 | `#buybox .kindle-price .a-price .a-offscreen`, `#buybox [data-action="show-all-offers-display"] .a-price` |
| 定価（Paper版） | `.print-list-price .a-price .a-offscreen`, `.basisPrice .a-offscreen`, `.a-text-price .a-offscreen` |
| ポイント還元額 | `#buybox .loyalty-points span`, `#buybox [id*="loyalty"] span`, `#corePrice_desktop` 内のポイントテキスト |
| ポイント還元率 | ポイントテキスト内の `%` を正規表現で抽出 |

**返り値**:
```js
{
  currentPrice: 906,        // 円（null: 取得失敗）
  listPrice: 924,           // 円（null: 定価なし）
  pointAmount: 28,          // pt（0: ポイントなし）
  pointRate: 3.0            // %（0: ポイントなし）
}
```

### 7.3 KindleBookFilter（FR-02）

**判定ロジック**:
```
titleText.includes("Kindle") || formatText.includes("Kindle")
```
- `titleText`: 商品タイトルのテキスト
- `formatText`: フォーマット表記（"Kindle版", "Kindle Unlimited" 等）のテキスト

### 7.4 PriceCalculator（FR-04）

**計算ルール**:
- `discountAmount = listPrice - currentPrice`（listPrice が null なら undefined）
- `discountRate = (discountAmount / listPrice) * 100`（小数点第1位）
- `pointRate` が 0 かつ `pointAmount > 0` なら `pointRate = (pointAmount / currentPrice) * 100`

**返り値**:
```js
{
  currentPrice: 980,
  listPrice: 1400,
  discountAmount: 420,      // undefined: 定価なし
  discountRate: 30.0,       // undefined: 定価なし
  pointAmount: 98,
  pointRate: 10.0
}
```

### 7.5 ItemRenderer（FR-05, FR-06）

**バッジ挿入先**: 各商品要素のタイトル要素（`h3`, `.g-title`, 等）の直後

**バッジHTML構造**（Shadow DOMで隔離）:
```html
<div class="kc-badge-container">
  <span class="kc-badge kc-point">🪙 10.0%還元 / +98pt</span>
  <span class="kc-badge kc-discount">🏷️ 30.0%OFF / −420円</span>
</div>
```
- 定価なし時: `kc-discount` バッジは非表示
- エラー時: `<span class="kc-badge kc-error">⚠️ 情報取得失敗</span>`

### 7.6 WishlistOrchestrator（FR-03, FR-06, FR-07, FR-08）

**逐次処理ループ**:
```
for item of kindleItems:
  try:
    rawData = await ProductRepository.fetch(item.asin)
    calcData = PriceCalculator.calculate(rawData)
    ItemRenderer.render(item.element, calcData)
  catch:
    ItemRenderer.renderError(item.element)
  finally:
    ProgressIndicator.update(++n, total)
    await sleep(500ms)  // レート制限対策（NFR-01）
```

---

## 8. 要件との対応確認

| 要件ID | 担当コンポーネント | 実現方法 |
|---|---|---|
| FR-01 | `index.js` | `document_idle` で自動起動 |
| FR-02 | `KindleBookFilter` | タイトル/フォーマット文字列で "Kindle" 判定 |
| FR-03 | `ProductRepository`, `WishlistOrchestrator` | 逐次fetch + 500ms sleep |
| FR-04 | `PriceCalculator` | 計算・補完ロジック |
| FR-05 | `ItemRenderer` | タイトル直後にバッジDOM挿入 |
| FR-06 | `ItemRenderer`, `WishlistOrchestrator` | catch でエラーバッジ表示・継続 |
| FR-07 | `ProgressIndicator` | カウンタ更新・完了メッセージ表示 |
| FR-08 | `WishlistRepository` | 次ページ先読みfetch（フォールバックあり） |
| NFR-01 | `WishlistOrchestrator` | 500ms sleep |
| NFR-02 | `ProductRepository` | 複数セレクタ候補を試行 |
| NFR-03 | `ProductRepository` | DOMParser使用・外部送信なし |
| NFR-04 | `manifest.json` | MV3・amazon.co.jp限定 |
| NFR-05 | `manifest.json`, `ItemRenderer` | インストールのみで動作・Shadow DOMでレイアウト保護 |

---

## 9. 実ページ確認結果サマリー（2026/04/26）

| 確認項目 | 確認結果 |
|---|---|
| WishlistページのURL形式 | `https://www.amazon.co.jp/hz/wishlist/ls/{listId}` |
| ASIN取得方法 | 商品リンクURL `/dp/{ASIN}/` から正規表現で抽出 |
| Kindle判定テキスト | `Format : Kindle (Digital)`（英語表示）/ `Kindle版`（日本語） |
| 商品ページの価格表示 | `¥906 (28pt)` 形式（buyboxエリア） |
| 定価表示 | `Print List Price: ¥924` |
| ポイント表示 | `Amazon Points: +28 pt (3%) Time Limited Points` |
| Wishlistに値下がり情報 | `Price dropped 2% (was ¥924 when added to List)` ← リスト追加時比較であり定価との比較ではない |
| 要・実ページDOMセレクタ検証 | `#buybox` エリア内の価格要素（実装時にDevToolsで確認必須） |

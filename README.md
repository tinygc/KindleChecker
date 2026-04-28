# Kindle Checker

Amazonの欲しいものリストに登録したKindle本の **割引率・ポイント還元・クーポン** をまとめてチェックし、実質お得度をバッジで表示するChrome拡張機能。

![badge example](https://img.shields.io/badge/Manifest-V3-blue) ![license](https://img.shields.io/badge/license-MIT-green)

---

## 機能

- 欲しいものリストを開くだけで全Kindle本を自動スキャン
- **実質割引率**（割引 + クーポン + ポイント還元を合算）をバッジで表示
- Kindle Unlimited / Prime Reading 対象の識別表示
- 並行処理（最大3並行）で高速スキャン、失敗時は自動リトライ
- AjaxページネーションをMutationObserverで追跡

## バッジの見方

| バッジ | 意味 |
|---|---|
| 🔥 実質XX%引き（赤） | 実質70%以上OFF |
| ⭐ 実質XX%引き（オレンジ） | 実質50〜69%OFF |
| 💰 実質XX%引き（紫） | 実質30〜49%OFF |
| 🏷️ 実質XX%引き（青） | 実質30%未満OFF |
| 📚 読み放題対象 | Kindle Unlimited / Prime Reading 対象 |
| 🪙 +XXpt (X%) | ポイント還元 |
| 🏷️ XX%OFF | 定価比の割引 |
| 🎟️ クーポンXX%OFF | クーポン適用可 |

実質割引率の内訳（例：`割引20% + クーポン30% + pt3%`）はバッジ下部に小さく表示されます。

## インストール方法

Chrome拡張機能はChrome Web Storeに非公開のため、開発者モードで読み込みます。

1. このリポジトリをZIPでダウンロードして解凍（または `git clone`）
2. Chromeで `chrome://extensions` を開く
3. 右上の「**デベロッパーモード**」をONにする
4. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
5. ダウンロード・解凍したフォルダを選択

## 使い方

1. Amazonにログインした状態で欲しいものリストを開く
   - `https://www.amazon.co.jp/hz/wishlist/ls/XXXXXXXX`
2. ページ読み込み後、自動的にKindle本のスキャンが始まる
3. 各商品タイトルの下にバッジが表示される

> **注意**: スキャンはAmazon各商品ページへのfetchで行うため、ページ数が多い場合は数秒かかります。

## 技術スタック

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES Modules)
- Fetch API + DOMParser（各商品ページのスクレイピング）
- Shadow DOM（AmazonのCSSから隔離したバッジ表示）
- MutationObserver（Ajaxページネーション対応）

## プロジェクト構造

```
manifest.json
implementation/src/
├── content/
│   ├── index.js              # エントリポイント・MutationObserver
│   ├── ItemRenderer.js       # バッジDOM挿入（Shadow DOM）
│   └── ProgressIndicator.js  # 進捗表示
├── data/
│   ├── ProductRepository.js  # 商品ページfetch・価格抽出
│   └── WishlistRepository.js # 欲しいものリストのASIN収集
└── domain/
    ├── KindleBookFilter.js   # Kindle本の判定フィルタ
    ├── PriceCalculator.js    # 実質割引率の計算
    └── WishlistOrchestrator.js # 並行スクレイピング制御
```

## 注意事項

- Amazon.co.jp のみ対応
- AmazonのHTML構造変更により動作しなくなる場合があります
- 個人利用目的で作成しています

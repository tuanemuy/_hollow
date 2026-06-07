# ブラウザ検証結果 — Issue #536

**実施日:** 2026-06-08
**ツール:** agent-browser 0.27.1（Chromium, `file://` 直接オープン）
**対象:** `spec/design/pages/*-mobile.html`（全49本）

## 1. overflow 検証（受け入れ基準 AC2 / AC5）

各 mobile モックを 320 / 390 / 430px で開き、`document.documentElement.scrollWidth - window.innerWidth` を実測。

- **結果: 49/49 PASS（横スクロール非発生）** — 詳細は `overflow-results.txt`。
- 唯一 P22-settings-security が初回 320px で +15px overflow → `.main { min-width: 0 }` を追加して解消（`.layout` grid item の min-content blowout）。修正後 320/360/390/430px すべて 0。

判定方針: テーブル・コードブロック・FilterBar チップ列・bulk-bar の**単体内部スクロールは許可**（`index.md §3`）。ページ全体の `scrollWidth <= innerWidth` のみを合否基準とした。

## 2. モバイル固有導線の目視（AC3）

390px のスクリーンショットで確認（`screenshots/`）:

| 画面 | 確認したモバイル導線 |
|---|---|
| P10-home / P10-home-drawer | ハンバーガー→サイドバー drawer（オーバーレイ + バックドロップ）、下端 bulk-bar、フィルタチップ横スクロール、ヘッダー縮約 |
| P11-note-detail | 読み物単一カラム、メタ/バックリンク本文下、ヘッダーアクションのアイコン化 + 下部固定「編集」CTA |
| P12-editor | ツールバー横スクロール、メタ折りたたみ、下部 save-bar |
| P40-admin-dashboard | nav strip 横スクロール、メトリクス1カラムカード |
| P45-admin-users | 高密度テーブル→カード化（登録日/ロール/状態のラベル付き行 + フルワイド行アクション） |
| P10-move-note-dialog | ボトムシート（上端グラバー・下部フルワイドCTA） |
| P13a-upload-modal | 8ステートをボトムシート見えで縦積み + 最上部ライブ実モーダル |
| P21-settings-profile | 設定セクションカード、フォーム1カラム、下部CTA（保存/リセット） |
| P07-landing | 各セクション縦積み、CTAフルワイド |

すべてデスクトップのデザイン言語（トークン・コンポーネント）と一貫しており、出荷済みモックと並べて違和感なし。

## 3. ファイル存在（AC1）

49画面すべてに `-mobile.html` が存在（PR #518 追加分 P13a / P18-merge-tag-dialog / P20-view-form-dialog / P47 を含む）。`common-toast` はスコープ外。

## 4. トークン準拠（AC4）

各 mobile の `:root` は対応 desktop から逐語コピー（生成時に diff 一致を確認）。新規モバイルトークンなし。`index.md §3` にモバイルモック併置方針を SSOT 追記済み。

## 結論

全受け入れ基準を満たす。FAIL は P22 の1件のみで、その場で修正・再検証済み。起票が必要な未解決の失敗はなし。

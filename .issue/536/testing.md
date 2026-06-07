# 動作確認計画 — Issue #536: 全画面のモバイル向けモックを作成する

**Issue:** #536
**作成日:** 2026-06-08

---

## 確認環境

成果物は `spec/design/pages/*-mobile.html` の静的 HTML モック（依存なし単一ファイル）。`app/` のサーバー起動・マイグレーション・シードは**不要**。agent-browser で `file://` 直接オープンして検証する。

### 検証環境の起動

アプリサーバー起動は不要。agent-browser（manual-test スキル基盤）で各 HTML を直接開く:

```
file:///Users/hikaru/github.com/tuanemuy/hollow/spec/design/pages/{画面名}-mobile.html
```

viewport 幅: 主検証 **390px**、境界 **320px / 430px**、横長要素保有画面は実機代表 **360px / 414px** も追加。

### デプロイ方法

なし（検証環境＝静的ファイルの目視のみで完結）。

## 確認項目

### 1. 全49本のモバイルモックが存在する

- **目的:** Issue の対象49画面すべてに `-mobile.html` が作られたことを確認（PR #518 追加分含む）。
- **手順:**
  1. `ls spec/design/pages/*-mobile.html | wc -l` で本数を数える。
  2. plan.md バッチA〜H の49画面リストと `ls` 出力を機械照合する。
  3. PR #518 追加分（P13a-upload-modal / P18-merge-tag-dialog / P20-view-form-dialog / P47-admin-metrics）の `-mobile.html` 存在を個別確認。
- **期待結果:** 49本すべて存在。過不足ゼロ。
- **確認ポイント:** `common-toast` はスコープ外（mobile 版を作らない）。

### 2. 320〜430px で横スクロールが発生しない

- **目的:** 受け入れ基準の中核。ページ全体の横スクロール非発生。
- **手順:**
  1. agent-browser で各 `-mobile.html` を開く。
  2. viewport を 320 / 390 / 430px に設定し、各幅で `document.documentElement.scrollWidth - window.innerWidth` を評価。
  3. 横長要素を持つ画面（admin テーブル, P12 ツールバー, FilterBar チップ列, bulk-bar, コードブロック, P33 長URL）は 360 / 414px も追加点検。
- **期待結果:** 全幅で `scrollWidth <= innerWidth`（差分0）。
- **確認ポイント:** テーブル・コードブロック・横メディアの**単体内部スクロールは許可**（`index.md §3`）。禁止対象はページ全体の overflow。両者を区別して判定する。

### 3. モバイル固有の導線が表現されている

- **目的:** 「デスクトップの縮小版でない」モバイル設計になっているか。
- **手順:**
  1. アプリ系代表（P10-home-mobile）で サイドバー drawer の開閉（menuBtn → オーバーレイ + backdrop）を確認。
  2. 設定系代表（P21-settings-profile-mobile）で 設定ナビ drawer・セクションカード縦積み・フォーム1カラムを確認。
  3. admin 代表（P40-admin-dashboard-mobile）で nav strip 横スクロール・テーブル→カード変換・メトリクス1カラムを確認。
  4. ダイアログ代表（P10-move-note-dialog-mobile, common-confirm-dialog-mobile, P13a-upload-modal-mobile）で ボトムシート表現（下端立ち上がり・上端角丸・下部フルワイドCTA）を確認。
- **期待結果:** 各シェルでモバイル固有パターンが visible。drawer・シート化が機能。
- **確認ポイント:** タップ領域44px、icon-only ボタンの `aria-label`、ステータスピルのSRテキスト併記。

### 4. デザイントークン準拠 / index.md SSOT

- **目的:** 既存 desktop モックと並べて違和感がないトークン運用。
- **手順:**
  1. 各 `-mobile.html` の `:root` ブロックを、対応する desktop ファイルの `:root` と照合（逐語コピーか）。
  2. ローカル短縮名（`--bg` 等）が使われていないことを grep 確認。
  3. `index.md §3` にモバイルモック併置方針が追記されているか確認。
- **期待結果:** `:root` が対応 desktop と一致、正式トークン名のみ、index.md 追記あり。

## エッジケース・異常系

### 1. 長文・長語のオーバーフロー

- **目的:** 日本語長文・長URL・長いタグ名が 390px 内で破綻しないか。
- **手順:** P11-note-detail-mobile / P33-share-link-mobile / P18-tags-mobile を 320px で開き、長文・長URL の折り返しを確認。
- **期待結果:** `overflow-wrap` で折り返し、ページ overflow なし。

### 2. 下端固定要素の競合

- **目的:** bulk-bar と下部固定CTA が同一下端で競合しないか。
- **手順:** P10-home-mobile で選択状態（bulk-bar 表示）にし、下部固定CTAとの重なり・safe-area を確認。
- **期待結果:** CTA がバーに隠れない。`env(safe-area-inset-bottom)` 確保。

## 既存機能への影響確認

- **desktop モックの非改変:** `git diff` で既存 `spec/design/pages/*.html`（`-mobile` を除く）に変更が入っていないことを確認（このIssueは新規ファイル追加のみが原則）。
- **index.md の差分:** 追記は §3 の1〜2文のみで、既存方針を改変していないこと。

## 確認チェックリスト

- [ ] 49本の `-mobile.html` がすべて存在（PR #518 追加分含む）
- [ ] 全画面 320 / 390 / 430px で `scrollWidth <= innerWidth`
- [ ] 横長要素保有画面を 360 / 414px でも点検
- [ ] drawer 開閉・ダイアログのボトムシート化が機能
- [ ] admin テーブル→カード変換・メトリクス1カラム
- [ ] タップ領域44px / icon-only aria-label / SRテキスト併記
- [ ] `:root` が対応 desktop と一致・正式トークン名のみ
- [ ] index.md §3 にモバイルモック方針が SSOT 化
- [ ] 長文・長URL が 320px で破綻しない
- [ ] 既存 desktop モックが非改変（git diff で確認）

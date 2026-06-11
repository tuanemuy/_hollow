# 動作確認計画 — Issue #631: デザインモックの可視ロゴ Vesica ロックアップ追従

**Issue:** #631
**作成日:** 2026-06-11

---

## 確認環境

このIssueの変更は `spec/design/pages/` 配下の自己完結HTMLモックのみ。アプリコードの変更はない。

### 検証環境の起動

- モックの表示確認: 各HTMLは自己完結なので、ファイルを直接ブラウザで開く（`file://` で可）。HTTP配信したい場合は `npx serve spec/design/pages`（serve は npx 経由のワンショット実行）。
- 実装側との比較が必要な場合のみ: `pnpm dev` でアプリを起動し、ヘッダーの `BrandLockup` 表示と見比べる。

### デプロイ方法

なし（モックHTMLのみの変更で、検証環境のみで確認できる）。

## 確認項目

### 1. 受け入れ grep（機械判定）

- **目的:** プレーンテキストロゴの残存ゼロを確認する。
- **手順:**
  1. `grep -rn 'class="logo">Hollow' spec/design/pages/`
  2. `grep -rn '>Hollow<' spec/design/pages/`（補助。ヒットは目視判定し、本文テキストは書き換えない）
  3. `grep -rln 'cta-bar' spec/design/pages/mobile/`
- **期待結果:** 1 と 3 が 0 件。2 のヒットはロゴ以外の本文のみ。

### 2. ロゴの視覚一致

- **目的:** モックのロックアップが実装 `BrandLockup` と視覚一致すること。
- **手順:**
  1. `spec/design/pages/P11-note-detail.html` 等の代表ページをブラウザで開く
  2. `pnpm dev` のアプリヘッダーと並べて比較
- **期待結果:** Vesica マーク（2円）＋ wordmark が同じプロポーション・色（currentColor 追従）・高さ16pxで表示される。マークのストロークが欠けていない（viewBox クリップなし）。
- **確認ポイント:** ダーク背景のページ（あれば）で currentColor 追従、フッターロゴ（P07-landing）も水平ロックアップ。

### 3. ヘッダー sweep（desktop A群）

- **目的:** header-right が #628 確定形（アップロード primary 先頭＋新規作成 text、アバターなし）になっている。
- **手順:** P11-note-detail.html / P15-export.html / P18-tags.html / P21-settings-profile.html を開き、P10-home.html（確定形）と見比べる。
- **期待結果:** header-right の構成・36px 操作行・サイドバー最下部のユーザー行が確定形と一致。ヘッダーにアバターがない。

### 4. ヘッダー sweep（mobile B群＋cta-bar 廃止）

- **目的:** mobile モックの 36px 例外コメント反映と cta-bar 廃止。
- **手順:** mobile/P11-note-detail.html / mobile/P15-export.html / mobile/P20-views.html を 360px 幅で開く。
- **期待結果:** 下部固定 CTA バーが存在せず、同等の導線がページ内に残っている。ヘッダー操作行は 36px。

### 5. レスポンシブ挙動の維持

- **目的:** `.logo { display:none }` 等の既存挙動が無傷。
- **手順:** P10-home.html を 360px 幅に縮めて確認（実装は `max-sm:hidden` 相当）。
- **期待結果:** 既存どおりの表示/非表示が変わらない。SVG がはみ出してレイアウトを崩さない。

## エッジケース・異常系

### 1. 非対象領域が変更されていないこと

- **目的:** スコープ外の保全確認。
- **手順:**
  1. admin モック（P40 系）の header-right に AD アバターが残っていること
  2. drafts/ のヘッダーが旧形のまま（ロゴだけ差し替え）であること
  3. public（P30〜P34）/ auth の header-right（login/signup リンク）が無変更であること
- **期待結果:** いずれも維持。

## 既存機能への影響確認

- アプリコード変更なし。`pnpm typecheck && pnpm lint:fix && pnpm format` が通ること（モックHTMLは Biome 対象外想定だが、format で差分が出ないことを確認）。

## 確認チェックリスト

- [ ] 受け入れ grep 3本クリア
- [ ] ロゴが BrandLockup と視覚一致（desktop / mobile / footer）
- [ ] desktop A群 header-right が確定形と一致、アバター撤去
- [ ] mobile B群 36px 操作行、cta-bar 廃止＋代替導線あり
- [ ] レスポンシブ挙動維持
- [ ] admin / drafts / public / auth の非対象領域が無変更

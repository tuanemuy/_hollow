# 動作確認計画 — Issue #620: ホーム画面（P10）表示モードスイッチの segmented 統一

**Issue:** #620
**作成日:** 2026-06-10

---

## 確認環境

このIssueはホーム画面（P10）のフロントエンド見た目（表示モードスイッチ）の変更と、デザインモック・設計ドキュメントの追従。バックエンド/DB 変更はなく、ローカル起動とブラウザ確認で完結する。

### 検証環境の起動

```
pnpm dev
```

`vite dev`（Cloudflare 構成）でローカルサーバーが起動する。表示された URL でホーム画面（`/`、`_app` 配下）にログイン状態でアクセスして確認する。

ユニットテスト:

```
pnpm test:unit
```

（少なくとも `app/components/note/list/__tests__/` 配下の `DisplayModeSwitch.test.tsx` / `NoteListToolbar.test.tsx` / `NoteListRowClick.test.tsx` が緑であること。）

デザインモックの確認はブラウザで HTML を直接開く:
- `spec/design/pages/P10-home.html`
- `spec/design/pages/mobile/P10-home.html`
- 参照（SSOT）: `spec/design/pages/P30-user-public-top.html`

### デプロイ方法

検証環境（ローカル）で確認可能なため必須ではない。ステージング反映が必要な場合:

```
pnpm deploy:staging
```

---

## 確認項目

### 1. P10 表示モードスイッチが segmented control で表示される

- **目的:** デスクトップ実装の表示モードスイッチが、pill タブ群ではなく segmented control（白カード+shadow+アイコン付き）になっていること。
- **手順:**
  1. `pnpm dev` で起動し、ログイン状態でホーム（`/`）を開く。
  2. ツールバー左の表示モードスイッチを観察する。
  3. ブラウザを十分広い幅（デスクトップ）にする。
- **期待結果:** 「リスト / タイル / カレンダー」が 1 つの segmented コンテナ（surface 背景・角丸 9px・内側 padding 2px）に収まり、各ボタンに lucide アイコン（List / LayoutGrid / Calendar）+ ラベルが並ぶ。アクティブなセグメントは白カード + `shadow-xs` で浮き上がる。
- **確認ポイント:** P30 個人公開ページ（`/u/{username}`）の表示モードスイッチと寸法・トーン・アイコンが一致していること。旧 pill（accent 塗り・アイコンなし）が残っていないこと。

### 2. 表示モード切替が機能する（挙動は不変）

- **目的:** segmented 化後も list/tile/calendar の切替が従来どおり動くこと（URL-only swap、`replace: true`）。
- **手順:**
  1. ホームで「タイル」をクリック → 一覧がタイル表示に変わる。
  2. 「カレンダー」をクリック → カレンダー表示に変わる。
  3. ブラウザの戻るボタンを押す。
  4. アクティブセグメントと URL の `display` を見比べる。
- **期待結果:** 各クリックで表示が切り替わり、アクティブセグメントが視覚的に移動する。戻るボタンで表示モード遷移が履歴に積まれていない（`replace: true` のため、表示モード切替は戻る対象にならない）。URL は `?display=tile` 等に更新される（list はデフォルトで省略され得る）。
- **確認ポイント:** 切替時にページ全体の再フェッチ/再ストリームによるちらつきが起きないこと（従来挙動の維持）。

### 3. アクティブ表現の a11y 一致

- **目的:** `aria-selected` が視覚的アクティブと一致すること。
- **手順:**
  1. DevTools でアクティブなセグメント `<button>` を検査する。
  2. 別のモードに切り替え、再度検査する。
- **期待結果:** アクティブな button に `aria-selected="true"`、非アクティブに `aria-selected="false"`。コンテナに `role="tablist" aria-label="表示形式"`、各 button に `role="tab"`。アクティブ button にのみ `data-active` 属性が付き、非アクティブには付かない（`data-active={active || undefined}`）。
- **確認ポイント:** アイコンの SVG が `aria-hidden="true"` で、accessible name はラベルテキストが担っていること（二重化していない）。

### 4. ツールバーボタン・保存ビュー文言の確認

- **目的:** 「選択」「ビューとして保存」ボタンと保存ビュー select が想定どおり表示されること。
- **手順:**
  1. ホームで保存済みビューが 1 件以上ある状態にする（必要なら「ビューとして保存」から作成）。
  2. ツールバーの保存ビュー select を開く。
  3. 「選択」「ビューとして保存」「新規作成」「アップロード」の各ボタンを観察する。
- **期待結果:** 保存ビュー select のプレースホルダ option が「保存ビューを選択」。「選択」「ビューとして保存」は現行の `pillBtn`（surface 塗り pill）のまま機能し、新規作成/アップロードのアイコンのみ CTA（#382 契約）が維持されている。
- **確認ポイント:** ボタンの機能（選択モード切替、保存ダイアログ表示）が回帰していないこと。実装は本 Issue で変更しない（ADR-003）。

### 5. デザインモックの整合確認（ブラウザで HTML を開く）

- **目的:** デスクトップ/モバイルモックの表示モードスイッチが segmented で一致し、コメント・文言が更新されていること。
- **手順:**
  1. `spec/design/pages/P10-home.html` をブラウザで開き、ツールバーを確認する。
  2. `spec/design/pages/mobile/P10-home.html` を開き、同じく確認する。
  3. 両ファイルのソースで、保存ビュー select の option 文言を確認する。
- **期待結果:** デスクトップモックの表示モードスイッチが `.segmented > button`（アイコン+ラベル、白カードでアクティブ表現）になっている。`.display-tabs`/`.display-tab` の CSS・マークアップが残っていない。436–439 行付近および 454 行のコメントが segmented 統一に更新され、`#292 ADR-002` 参照が #620 上書きに差し替わっている。両モックの保存ビュー option が「保存ビューを選択」で一致している。両モックの「選択」「ビューとして保存」ボタンが `.pill-btn`（surface 塗り）トーンで一致している（mobile の旧 `.tool-btn` ghost が残っていない）。
- **確認ポイント:** P30 モック（`P30-user-public-top.html`）の `.segmented` と寸法・トーンが一致していること。

## エッジケース・異常系

### 1. 保存済みビューが 0 件のとき

- **目的:** 保存ビュー select が出ない状態でもツールバー（segmented + 各ボタン）が崩れないこと。
- **手順:**
  1. 保存済みビューが無いユーザー/状態でホームを開く。
- **期待結果:** 保存ビュー select は非表示、segmented と「選択」「ビューとして保存」「新規作成」「アップロード」は通常どおり並ぶ。

### 2. `prefers-reduced-motion` 有効時

- **目的:** segmented の `transition-all` がモーション低減設定で無効化されること。
- **手順:**
  1. OS/ブラウザでモーション低減を有効化し、表示モードを切り替える。
- **期待結果:** アクティブセグメントの遷移アニメーションが起きない（`motion-reduce:transition-none`）。表示自体は正しく切り替わる。

## 既存機能への影響確認

- **P30 個人公開ページ（`/u/{username}`）の表示モードスイッチ**: 本 Issue では `PublicTopControls` / `public/styles.ts` を変更しないため見た目・挙動が不変であることを確認（SSOT 側の回帰がないこと）。
- **タグ一覧ツールバー（`TagListToolbar`）の SEGMENTED**: 別値の独自定数のため影響なし。念のため見た目が変わっていないことを確認。
- **ノート行クリック / 一覧操作**: `NoteListRowClick` 等、ツールバー以外の一覧操作が回帰していないこと。

## 確認チェックリスト

- [ ] `pnpm test:unit` が緑（note/list 配下のテスト含む）
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がパス
- [ ] P10 デスクトップで表示モードスイッチが segmented（白カード+shadow+アイコン）で表示される
- [ ] list/tile/calendar の切替が機能し、`replace: true` の履歴挙動が維持される
- [ ] `role="tablist"`/`role="tab"`/`aria-selected`/`data-active`/アイコン `aria-hidden` が正しい
- [ ] 保存ビュー option 文言が「保存ビューを選択」で両モック一致
- [ ] デスクトップモックから `.display-tabs`/`.display-tab` が消え segmented に置換、コメントも更新済み
- [ ] `spec/design/index.md` §7.1（行 157/170）が segmented 採用に整合
- [ ] P30 表示モードスイッチ・タグ SEGMENTED に視覚回帰がない

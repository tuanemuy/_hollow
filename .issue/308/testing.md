# 動作確認計画 — Issue #308: ボタン形態ガイドライン (#292) 適用: domain別の行アクション・フォーム送信ボタン

**Issue:** #308
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm dev
```

`vite dev --config vite.config.cloudflare.ts` が走り、ローカル開発サーバーが起動する。

### デプロイ方法

なし（本 Issue は UI 層のみの変更で、検証環境のみで確認できる）。

### 整合性検証コマンド

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test:unit
```

### 静的 guard (rule 1 保持確認)

```bash
# AccountDeleteForm に生 router.invalidate() と WHY コメントが残っていることを確認
grep -n "router.invalidate()" app/components/identity/AccountDeleteForm/index.tsx
grep -n "rule 1" app/components/identity/AccountDeleteForm/index.tsx
```

両方が 1 件以上ヒットすれば OK。`routerInvalidate(router)` への誤置換が混入していたら 0 件になる。

## 確認項目

### 1. TagActions の編集・統合・削除動線

- **目的:** TagActions 5 ボタンが §7.1 例外 (b) 構成（編集モード: 保存 = アイコン+ラベル / キャンセル = テキスト、非編集モード: 全アイコン+ラベル）で表示され、機能が継続することを確認
- **手順:**
  1. `/tags` （タグ一覧）にアクセス
  2. 任意のタグ行で「リネーム」「統合」（候補が無い場合は表示されない）「削除」が表示される
  3. 「リネーム」に `Pencil` アイコン + 「リネーム」、「統合」に `Merge` アイコン + 「統合」、「削除」に `Trash2` アイコン + 「削除」が表示
  4. 「リネーム」をクリック → 編集モード（input + 「保存」+ 「キャンセル」）に切り替わる
  5. 「保存」に `Check` アイコン + 「保存」が `data-primary` スタイル（accent 背景）で表示される
  6. 「キャンセル」はテキストのみで表示される
  7. 編集モードで input を空 or 元の名前のまま「保存」 → 編集モードが閉じる（リネームなし、エラー無し）
  8. 編集モードで input を変更 → 「保存」 → リネーム成功、編集モードが閉じる
  9. 編集モードで「キャンセル」 → 編集モードが閉じる、input は元の値に戻る
  10. 「削除」 → `ConfirmDialog` が開き、confirm ボタンが `Trash2` アイコン + 「削除」で表示
  11. dialog の「削除」 → タグ削除成功
- **期待結果:** 上記の各段階でアイコンが期待通り表示され、操作が成功する
- **確認ポイント:** アイコンサイズが `size={16}`（デフォルト）で他の行アクション群（TrashRowActions / NoteActions / IngestionJobRow）と視覚的に揃っている

### 2. AccountDeleteForm の ConfirmDialog 化

- **目的:** AccountDeleteForm が `ConfirmDialog` パターンに移行し、削除フロー全経路が機能継続することを確認
- **手順:**
  1. ログイン状態で `/settings/account-delete` にアクセス
  2. 「続けて削除する」ボタンが `PILL_BTN` + `data-danger=""`（赤系トーン）+ `Trash2` アイコン + 「続けて削除する」のテキストで表示される
  3. ボタン押下 → `ConfirmDialog` が開く
  4. dialog 内に:
     - タイトル「本当にアカウントを削除しますか？」
     - 説明文「確認のため、ユーザー名 `<code>{username}</code> をそのまま入力してください。」
     - `<label>` 「ユーザー名（確認）」+ `<input>`
     - ヒントテキスト「ユーザー名が一致すると削除が実行されます。Tab キーで入力欄に移動できます。」
     - 「キャンセル」（テキストのみ） + 「アカウントを完全に削除する」（`Trash2` アイコン + ラベル、`pillBtnDanger` スタイル）
  5. dialog 開いた直後 → focus は panel（ヒントテキスト読み上げ後 Tab 1 回で input に到達）
  6. Tab キー 1 回 → input にカーソルが移動
  7. input に間違ったユーザー名を入力 → 「アカウントを完全に削除する」を押下 → 何も起きない（dialog 残置、サーバー呼び出しなし）。Enter キー押下も同様に無反応
  8. input にユーザー名を空欄のまま → 同じく無反応
  9. input に正しいユーザー名を入力 → ボタン押下 → ローディング → ホーム `/` に遷移、Header の userDto も未ログイン状態に更新される（rule 1: cached `_app match` の userDto も invalidate されている）
  10. Esc キー → dialog が閉じる、入力値はクリアされる
  11. overlay クリック → dialog の `closeOnBackdropClick` 既定（false）のため閉じない（ConfirmDialog の現状仕様。Esc とキャンセルボタンが close path）
- **期待結果:** 全経路が機能継続、UX 退行（Enter 無反応）は description 末尾ヒントで意図が伝わる
- **確認ポイント:**
  - rule 1 動作確認: 削除後ホームに遷移したとき Header が未ログイン状態（`_app match` の userDto が破棄されている）
  - dialog 開閉時の focus trap、Esc クローズ、`aria-labelledby`/`aria-describedby` が壊れていない
  - 初期 focus が panel に当たることが期待値どおりであり、callback ref などで input に focus が当たろうとして失敗（panel に上書きされる）のチラつきがない

### 3. UsersTable のアイコン+ラベル化

- **目的:** UsersTable 4 アクション全種がアイコン+ラベル形態で表示され、機能が継続することを確認
- **手順:**
  1. admin としてログインし `/admin/users` にアクセス
  2. アクティブユーザー行 → 「一時停止」（`Pause` アイコン + 「一時停止」）が表示
  3. アクティブ + member ユーザー行 → 「管理者に昇格」（`Shield` アイコン + 「管理者に昇格」）も追加
  4. アクティブ + admin ユーザー行 → 「管理者を解除」（`ShieldOff` アイコン + 「管理者を解除」）が追加
  5. 一時停止ユーザー行 → 「復帰」（`Play` アイコン + 「復帰」）が表示
  6. 削除済みユーザー行 → アクションボタンなし（既存挙動）
  7. 各ボタン押下 → ローディング → リスト再取得後の状態更新を確認
- **期待結果:** アクション全種でアイコン+ラベル形態、機能継続
- **確認ポイント:**
  - `BTN_SM_CLASS` の `h-7` は維持され、行高さが変わっていない（admin 例外）
  - 隣接する `/admin/jobs` ページと視覚的に揃っている（同じ `BTN_SM_CLASS` + `Icon` パターン）

### 4. Cross-cutting: アイコンサイズ・コントラスト・モーション

- **目的:** 全ボタンで `<Icon>` のデフォルトサイズ `size={16}` が適用され、accent 背景上で `currentColor` 継承の色も視認できることを確認
- **手順:**
  1. DevTools で TagActions / AccountDeleteForm / UsersTable / Jobs 各画面のアイコンを検査
  2. SVG の `width` / `height` が `16` であることを確認
  3. `data-primary` 状態の「保存」ボタンで `Check` アイコンが accent 背景上で十分に視認できる（`IngestionJobRow` の既存パターンと同等）
  4. OS 設定で `prefers-reduced-motion: reduce` を ON にして同画面にアクセス → `PILL_BTN` / `BTN_SM_CLASS` の `transition-colors` が `motion-reduce:transition-none` で無効化される
- **期待結果:** 全アイコン `size={16}`、コントラスト確保、reduced-motion 対応
- **確認ポイント:** spec §7.1 「テキスト併用は `size={16}` / `aria-hidden`」に整合

## エッジケース・異常系

### 1. AccountDeleteForm: panel focus → input focus 上書き順序の検証

- **目的:** ADR-005 で受け入れた「初期 focus は panel、Tab 1 回で input」が実機で期待通りに動くことを確認
- **手順:**
  1. キーボード操作のみで `/settings/account-delete` を操作
  2. 「続けて削除する」を Enter で押下 → dialog 開く
  3. すぐに Tab キー 1 回 → input にカーソルが当たる
  4. 期待: panel 初期 focus（`tabIndex={-1}`）→ Tab で最初の focusable（`<input>` または「キャンセル」ボタン、DOM 順次第）に遷移
- **期待結果:** Tab 順は DOM 順で `<input>` → 「キャンセル」 → 「アカウントを完全に削除する」（× ボタンは無し、`showCloseButton` 未指定）
- **確認ポイント:** input が DOM 順で最初の focusable になっているか。「キャンセル」が先に来てしまう場合は plan/ADR-005 を再検討（description 内 `<input>` が `dialogActions` 内ボタンより DOM 順で前にあれば OK）

### 2. AccountDeleteForm: validation エラー時の dialog 残置

- **目的:** サーバーから `validation` kind かつ `fieldErrors.confirmation` が返ったとき、dialog が残置 + description 内 input 直下に `<p role="alert">` で表示されることを確認
- **手順:**
  1. dialog 内で input に正しいユーザー名を入力 → 「アカウントを完全に削除する」押下
  2. サーバー側で意図的に `validation` エラーを返す（通常はクライアントガードで防がれるが、サーバー側スキーマ違反のテストは難しい場合 skip 可）
- **期待結果:** dialog 残置、input 直下に `<p role="alert">{fieldErrors[0]}</p>` 表示
- **確認ポイント:** ヒントテキストとエラーテキストが重ならず、両方視認できる

### 3. AccountDeleteForm: system / business エラー時の dialog クローズ + summary 表示

- **目的:** `validation` 以外のエラーで dialog が閉じて section 内 summary に表示されることを確認
- **手順:**
  1. ネットワーク切断 or サーバー停止状態で削除を試みる
- **期待結果:** dialog 閉じる、section 内に `<p role="alert">{displayError(error)}</p>` で summary 表示
- **確認ポイント:** 内部 stack / 原文 message が漏れていない（spec §フィードバック・エラー表示原則 と整合）

### 4. AccountDeleteForm: 連続クリック・isPending ガード

- **目的:** 削除 button を連打しても重複 submit が走らないことを確認
- **手順:**
  1. 削除送信中（ローディング状態）に再度クリック → 無反応であること
- **期待結果:** `isPending` 中は dialog 内 confirm ボタンが `disabled` で 2 回目 submit は発火しない
- **確認ポイント:** `ConfirmDialog` の `closable={!isPending}` で送信中は Esc / × も無効化される

## 既存機能への影響確認

- **TagActions の `MergeTagDialog`**: 「統合」ボタン押下時の MergeTagDialog 動作（ボタン形態は本 Issue スコープ外、機能継続のみ確認）
- **AccountDeleteForm の `action.ts`**: server fn 不変、動作も不変
- **UsersTable のフィルタ・検索**: BTN_SM_CLASS 外の UI（検索 input / status select）は touch していないため動作不変

## 確認チェックリスト

- [ ] TagActions: 非編集モード 3 ボタンにアイコン+ラベル表示
- [ ] TagActions: 編集モード「保存」にアイコン+ラベル、「キャンセル」はテキストのみ
- [ ] TagActions: `ConfirmDialog` の `confirmIcon={Trash2}` 動作（main 既存、touch していないが確認）
- [ ] AccountDeleteForm: トリガー「続けて削除する」が `PILL_BTN` + `data-danger` + `Trash2`
- [ ] AccountDeleteForm: `ConfirmDialog` 内 description に input / ヒントテキスト
- [ ] AccountDeleteForm: 初期 focus が panel、Tab 1 回で input
- [ ] AccountDeleteForm: 不一致 + Enter → 無反応（dialog 残置）
- [ ] AccountDeleteForm: 一致 → ホーム遷移 + Header userDto 更新（rule 1）
- [ ] AccountDeleteForm: validation エラーで dialog 残置 + 内 alert 表示
- [ ] AccountDeleteForm: system エラーで dialog 閉じ + section summary 表示
- [ ] AccountDeleteForm: 連続クリック・isPending ガード
- [ ] UsersTable: 4 アクション全種にアイコン+ラベル
- [ ] UsersTable: `BTN_SM_CLASS` の `h-7` 維持
- [ ] Cross: 全アイコン `size={16}`、`prefers-reduced-motion` 対応
- [ ] 静的 guard: `grep router.invalidate()` と `grep "rule 1"` 両方ヒット
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` 全 PASS
- [ ] `pnpm test:unit` 全 PASS

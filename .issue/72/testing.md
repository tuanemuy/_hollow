# 動作確認計画 — Issue #72: prefers-reduced-motion 対応（motion-reduce バリアント一括導入）

**Issue:** #72
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm dev
```

CSS のみの変更であり、DB マイグレーション・シードデータの追加は不要。

### デプロイ方法

なし（検証環境のみで確認できる）。

---

## 確認項目

### 1. transition-colors の抑制（admin shell）

- **目的:** authenticated app shell でホバー時の背景色トランジションが reduce motion 時に即時切替になることを確認
- **手順:**
  1. `pnpm dev` で起動し、admin にログイン
  2. Chrome DevTools を開く → コマンドパレット (`Cmd+Shift+P`) → "Show Rendering" → Rendering タブ → "Emulate CSS media feature prefers-reduced-motion" を `reduce` に設定
  3. `/admin` のサイドバー (`NAV_ITEM`) にマウスを乗せ、背景色変化が **即時切替** で起こることを目視
  4. ヘッダ右の `ICON_BTN` / `PILL_BTN` も同様に確認
- **期待結果:** `transition-colors` 由来のフェードが発生せず、色変化が一瞬で切り替わる
- **確認ポイント:** focus / hover それぞれで transition がないこと

### 2. active:scale-[0.985] の抑制

- **目的:** クリック時の scale 縮小アニメーションが reduce motion 時に消えることを確認
- **手順:**
  1. Step 1 と同じ状態（reduce motion エミュレート ON）で `/admin` トップに遷移
  2. ヘッダ・サイドバー等の `PILL_BTN` を **長押し**（マウスダウン保持）
- **期待結果:** 長押し中に縮小しない（`scale-[0.985]` が無効化される）
- **確認ポイント:** reduce motion OFF に戻すと縮小することも確認し、対比

### 3. transition-all の抑制（フォーム入力欄）

- **目的:** `FIELD_INPUT` / `FIELD_TEXTAREA` のフォーカス時の `transition-all` が抑制されることを確認
- **手順:**
  1. reduce motion エミュレート ON のまま `/admin/profile` 等のフォーム画面に遷移
  2. テキスト入力欄にフォーカスを当てる
- **期待結果:** 背景色・ボーダー色の変化が即時切替
- **確認ポイント:** **focus shadow（`focus:shadow-focus` 等）自体は表示されること** — 「focus 表示が消えない」「ただし即時表示になる」が正しい挙動

### 4. RegistrationForm のトグルスイッチ

- **目的:** トグルスイッチの背景色 (`transition-colors`) と疑似要素 (`after:transition-transform`) のつまみアニメーションが両方とも抑制されることを確認
- **手順:**
  1. reduce motion エミュレート ON のまま `/admin/registration` に遷移
  2. 「新規登録を受け付ける」トグルスイッチをクリックして切り替える
- **期待結果:** 背景色・つまみ位置とも、フェードやスライドなしに即座に新状態に切り替わる
- **確認ポイント:** つまみが `aria-checked` 状態によって左右に瞬時移動する

### 5. 公開ページの transition 抑制

- **目的:** 未認証ユーザー導線（landing / public profile / search / share gate）が reduce motion を尊重することを確認
- **手順:**
  1. reduce motion エミュレート ON のままログアウト状態で以下を順に巡回
     - `/` (landing): CTA ボタン・feature カードリンクの hover
     - `/u/<任意の公開ユーザー>`: `NOTE_ROW` の hover（`transition-[background] duration-[120ms]`）、検索バーフォーカス
     - `/u/<...>/notes/<id>`: 公開ノート詳細の `PUB_PILL` 系
     - `/search?q=...`: `SEARCH_HIT_ROW` の hover
     - `/share/<token>`: ゲート画面の `GATE_INPUT` フォーカス、`GATE_SUBMIT` の hover
- **期待結果:** すべての箇所でトランジションが即時切替になる
- **確認ポイント:** landing は第一印象に直結するため特に重点的に

### 6. auth フォーム（login / register / password-reset）

- **目的:** 認証フォーム全体（`INPUT` / `REVEAL_BTN` / `BTN_PRIMARY` / `BTN_SECONDARY`）が reduce motion を尊重することを確認
- **手順:**
  1. reduce motion エミュレート ON で `/login`, `/register`, `/password-reset` に遷移
  2. 入力欄フォーカス、パスワード表示トグル、送信ボタン hover を確認
  3. `/password-reset/confirm` で強度メーター（`PasswordResetConfirmForm`）にパスワードを入力し、セグメント色変化を確認
- **期待結果:** すべての色変化が即時
- **確認ポイント:** 強度メーターのセグメントが瞬時に色変化（フェードなし）

### 7. 生成 CSS の検証

- **目的:** Tailwind JIT が `motion-reduce:` バリアントを正しく検出し、生成 CSS に `@media (prefers-reduced-motion: reduce)` ブロックが含まれることを確認
- **手順:**
  1. `pnpm build` を実行
  2. 生成された CSS（`dist/client/assets/*.css`）を `rg "prefers-reduced-motion"` で検索
  3. `active:scale-[0.985]` と `motion-reduce:active:scale-100` のソース順を確認（後者が後勝ちで効くこと）
- **期待結果:**
  - `@media (prefers-reduced-motion: reduce)` ブロックに `transition-property: none` を含むルールが生成されている
  - `motion-reduce:active:scale-*` のルールが `active:scale-*` より後ろに配置されている
- **確認ポイント:** ソース順が逆転していた場合は `motion-reduce:active:scale-100!` (`!important`) を併用する Plan B に切替

---

## エッジケース・異常系

### 1. reduce motion OFF 時に通常の transition が維持される

- **目的:** 既存ユーザー（reduce motion 未設定）に対して回帰が起きていないことを確認
- **手順:**
  1. Chrome DevTools の "Emulate CSS prefers-reduced-motion" を `no-preference` に戻す
  2. Step 1〜6 で確認した画面を再度操作
- **期待結果:** すべての箇所で従来通りの transition が起きる（変更前と挙動が一致）

### 2. `motion-safe:animate-pulse` 先行例の維持

- **目的:** `tag/styles.ts:15` の `progressBarIndeterminate` が無傷であることを確認
- **手順:**
  1. ingestion アップロード画面で進行中バーが表示される操作を行う
  2. reduce motion ON では `animate-pulse` が止まること、OFF では脈動することを確認
- **期待結果:** 先行例の挙動は変わらない

---

## 既存機能への影響確認

- **CSS バンドルサイズ:** Tailwind JIT が同一バリアントを共有するため数百バイトの増加に留まる想定。`pnpm build` の出力で著しい増加がないことを目視
- **SSR / Cloudflare runtime:** CSS のみの変更でロジック非影響、テストは追加しない

## 確認チェックリスト

- [ ] Step 1: admin shell の `transition-colors` 抑制（hover/focus）
- [ ] Step 2: `PILL_BTN` の `active:scale` 抑制
- [ ] Step 3: フォーム入力欄の `transition-all` 抑制 + focus shadow は維持
- [ ] Step 4: RegistrationForm トグルスイッチの色 + 疑似要素 transform 両方抑制
- [ ] Step 5: 公開ページ全画面（landing / public profile / search / share gate）
- [ ] Step 6: auth フォーム + 強度メーター
- [ ] Step 7: 生成 CSS に `@media (prefers-reduced-motion: reduce)` ブロックが含まれる + ソース順 OK
- [ ] エッジ 1: reduce motion OFF 時の回帰なし
- [ ] エッジ 2: `motion-safe:animate-pulse` 先行例の挙動維持
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` パス
- [ ] `pnpm build` パス

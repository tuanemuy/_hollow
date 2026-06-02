# 動作確認計画 — Issue #416: auth ボタン系統 (BTN_*) を common pill primitive へ統一する

**Issue:** #416
**作成日:** 2026-06-02

---

## 確認環境

このIssueの変更は `app/components/{common,auth}/styles.ts` と auth 配下 7 ファイルの className のみ（純フロント・視覚変更）。確認に必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev   # vite dev（ライブソース、CSS のホットリロードが効く）
```

> `pnpm start`（wrangler dev）は prebuilt の `dist/worker` を配信するため、ソース変更を確認する場合は先に `pnpm build` が必要（メモリ「pnpm start serves prebuilt dist」参照）。CSS の見た目確認は `pnpm dev` で足りる。

### 生成 CSS の後勝ち確認

```bash
pnpm build   # 生成 CSS で pillBtnTall の h-12/px-8/text-md が base を後勝ち上書きしているか確認
```

`dist/client/assets/*.css` 内で `.h-12` が `.h-9` より後、`.px-8` が `.px-4` より後、`.text-md` が `.text-sm` より後に出力されていれば後勝ち成立（ADR-005 参照）。

### デプロイ方法

検証環境のみで確認可能。ステージング反映が要る場合は `pnpm deploy:staging`（本番は `pnpm deploy:production`）。本 Issue の確認には不要。

## 確認項目

### 1. primary 送信ボタン（BTN_PRIMARY, `<button>`）の見た目

- **目的:** common pill 合成後も従来どおりの accent 縦長ボタンとして表示されること
- **手順:**
  1. `pnpm dev` で起動し `/login` を開く
  2. ログインフォームの送信ボタンを確認
  3. `/signup`, `/admin-signup`, パスワードリセット要求/確認画面でも送信ボタンを確認
- **期待結果:** 高さ h-12（48px）、横幅 full（`w-full`）、accent 背景・白文字、角丸 pill
- **確認ポイント:** 色が surface（グレー）に化けていないか（= `data-primary` 付与漏れの検出）。hover で accent-hover、押下で accent-pressed + 微縮小（scale 0.985）

### 2. primary inline ボタン（BTN_PRIMARY_INLINE, `<Link>`）の見た目

- **目的:** anchor の縦長 primary ボタンが従来どおり表示されること
- **手順:**
  1. メール認証画面（VerifyEmail）・メール変更確認画面（EmailChangeConfirm）を開く
  2. 「ホームへ」「ログインへ」等の `<Link>` ボタンを確認
- **期待結果:** 高さ h-12、`min-w-[200px]`、px-8、accent 背景・白文字、角丸 pill
- **確認ポイント:** accent 色になっているか（data-primary 付与確認）。`<a>` でも hover/active が効くか

### 3. secondary tall ボタン（BTN_SECONDARY_TALL, `<Link>`）の見た目

- **目的:** surface 系の縦長ボタンが従来どおり表示されること（primary を付けない合成）
- **手順:**
  1. VerifyEmail 画面の該当 `<Link>`（`${BTN_SECONDARY_TALL} mt-3`）を確認
- **期待結果:** 高さ h-12、`min-w-[200px]`、surface 背景・ink 文字（accent ではない）、角丸 pill
- **確認ポイント:** accent に化けていないこと（data-primary を付けていないので surface のまま）

## エッジケース・異常系

### 1. disabled 状態の表示（opacity 60→55 の意図的変化）

- **目的:** 送信中（`disabled={isPending}`）の disabled 表示が意図どおり opacity 55 になること
- **手順:**
  1. ログイン/サインアップ等のフォームを送信し、送信中の状態を観察（または devtools で `disabled` 属性を強制付与）
- **期待結果:** opacity 55（従来 60 から軽微に変化）、cursor-not-allowed、hover/active の視覚変化なし

### 2. reduced-motion での押下アニメ無効

- **目的:** active:scale が reduced-motion で無効化されること
- **手順:**
  1. OS/ブラウザの「視差効果を減らす」を有効化し、primary ボタンを押下
- **期待結果:** 押下時の scale 縮小が起きない（`motion-reduce:active:scale-100`）

## 既存機能への影響確認

- ログイン・サインアップ・管理者サインアップ・パスワードリセット・メール認証・メール変更確認の各フォームが従来どおり動作（送信・遷移）すること。挙動は integration テストで担保し、ブラウザでは見た目のみ確認（auth 画面は agent-browser の server-function POST が 403 になる制約があるため）。
- `BTN_SECONDARY`（h-11）削除による参照漏れがないこと（`pnpm typecheck` で検出）。

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る（BTN_SECONDARY 削除の参照漏れ・未使用 import なし）
- [ ] `./node_modules/.bin/biome check --write` / `format` がクリーン
- [ ] `pnpm build` 成功、生成 CSS で h-12/px-8/text-md が base を後勝ち上書き
- [ ] `pnpm test`（unit + integration）が通る
- [ ] BTN_PRIMARY の `<button>` が accent 縦長で表示（surface に化けていない）
- [ ] BTN_PRIMARY_INLINE の `<Link>` が accent 縦長で表示
- [ ] BTN_SECONDARY_TALL の `<Link>` が surface 縦長で表示（accent に化けていない）
- [ ] disabled で opacity 55・hover/active 無効
- [ ] reduced-motion で押下 scale が無効
- [ ] `grep -rEn "className=.*BTN_PRIMARY(_INLINE)?" app/components/auth --include="*.tsx"` の 17 行すべてに data-primary が付与されている

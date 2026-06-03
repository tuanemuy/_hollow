# 動作確認計画 — Issue #425: styles.ts 外のローカルボタン定義 (admin BTN_PRIMARY_CLASS / landing HERO_BTN_*) を common pill primitive へ統一する

**Issue:** #425
**作成日:** 2026-06-03

---

## 確認環境

このIssueの変更は `app/components/admin/{RegistrationForm,LLMSettingsForm,PromptsForm,DesignTokensForm}/index.tsx` と `app/components/landing/LandingPage.tsx` の className のみ（純フロント・視覚変更）。DB マイグレーションやシード変更は不要。確認に必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev   # vite dev（ライブソース、CSS のホットリロードが効く）
```

> `pnpm start`（wrangler dev）は prebuilt の `dist/worker` を配信するため、ソース変更を確認する場合は先に `pnpm build` が必要。CSS の見た目確認は `pnpm dev` で足りる。

### 生成 CSS の後勝ち確認（landing の pillBtnTall）

```bash
pnpm build   # 生成 CSS で landing の pillBtnTall（h-12/px-8/text-md）が base を後勝ち上書きしているか確認
```

`dist/client/assets/*.css` 内で `.h-12` が `.h-9` より後、`.px-8` が `.px-4` より後、`.text-md` が `.text-sm` より後に出力されていれば後勝ち成立（#416 ADR-005 参照。#416 で確認済みだが consumer に landing が増えるため再確認）。

### デプロイ方法

検証環境のみで確認可能。ステージング反映が要る場合は `pnpm deploy:staging`（本番は `pnpm deploy:production`）。本 Issue の確認には不要。

## 確認項目

### 1. landing hero ボタン（HERO_BTN_PRIMARY / HERO_BTN_SECONDARY, `<Link>`）の見た目【最重要・未認証で確認可】

- **目的:** common pill 合成後も従来どおりの縦長ボタンとして表示されること（primary=accent / secondary=surface）
- **手順:**
  1. `pnpm dev` で起動し `/`（ランディングページ、未認証で可）を開く
  2. ヒーロー部の「無料でアカウント作成」（primary, signup）と「ログイン」（secondary, login）の 2 ボタンを確認
  3. 各ボタンに hover / 押下する
- **期待結果:** 両方とも高さ h-12（48px）、`min-w-[200px]`、px-8、角丸 pill。primary は accent 背景・白文字、secondary は surface 背景・ink 文字
- **確認ポイント:**
  - primary が surface（グレー）に化けていないか（= `data-primary` 付与漏れの検出）
  - secondary が accent に化けていないか（= `data-primary` 誤付与の検出）
  - hover で色変化（primary: accent-hover / secondary: surface-hover）、押下で primary は accent-pressed + 微縮小（scale 0.985）
  - 旧実装に無かった `not-disabled:not-aria-disabled:` ガード付きの hover/active が効くこと

### 2. admin primary 保存ボタン（BTN_PRIMARY_CLASS → pillBtn+pillBtnPrimary, `<button>`）の見た目【要認証】

- **目的:** admin 各フォームの保存系 primary ボタンが従来どおり accent ボタンとして表示されること
- **手順:**
  1. 認証して管理画面へ入る（`browser-verify-authed-routes` 手順: sessions に生トークン直挿し＋`__Host-session` cookie 注入）
  2. 以下の各画面の primary ボタンを確認:
     - 登録設定（RegistrationForm）の保存ボタン
     - LLM 設定（LLMSettingsForm）の保存ボタン
     - プロンプト（PromptsForm）の保存ボタン
     - デザイントークン（DesignTokensForm）の「保存」submit ボタン
  3. 各ボタンに hover / 押下する
- **期待結果:** 高さ h-9（36px）、px-4、accent 背景・白文字、角丸 pill。hover で accent-hover、押下で accent-pressed + 微縮小
- **確認ポイント:** accent 色になっているか（surface に化けていない = `data-primary` 付与確認）。transition のタイミングが他の共通ボタンと揃っていること（duration 120→150ms の意図的変化、知覚差はほぼ無い）

### 3. DesignTokensForm の primary/surface/destructive 共存

- **目的:** primary のみ common 化した後、同フォーム内の surface（BTN_CLASS）・ghost destructive（BTN_DESTRUCTIVE_CLASS / BTN_SM_DESTRUCTIVE_CLASS）が回帰なく従来どおり共存すること
- **手順:**
  1. デザイントークン画面を開く
  2. 「＋ トークンを追加」（surface, BTN_CLASS）、「すべてリセット」（ghost destructive, BTN_DESTRUCTIVE_CLASS）、行内の「削除/既定に戻す」（small ghost, BTN_SM_DESTRUCTIVE_CLASS）、「保存」（primary）を見比べる
- **期待結果:** surface＝グレー背景、destructive＝通常時は透明背景＋二次テキスト色で hover 時のみ error 色、small＝h-7 の小型。primary（保存）だけが accent。いずれも従来と同じ見た目
- **確認ポイント:** ghost destructive が filled（常時 error-surface）に化けていないこと（ADR-005 の据え置き判断が効いている）

## エッジケース・異常系

### 1. admin primary ボタンの disabled 表示

- **目的:** 送信中（`disabled={busy}` 等）の disabled 表示が opacity-disabled（0.55）で表示されること
- **手順:**
  1. admin フォーム送信中の状態を観察（または devtools で `disabled` 属性を強制付与）
- **期待結果:** opacity 0.55、cursor-not-allowed、hover/active の視覚変化なし（#419 で既に正規化済みのため opacity 自体は不変）

### 2. admin primary ボタンのモバイルタップターゲット（max-sm:min-h-[44px]）

- **目的:** モバイル幅で admin primary ボタンの高さ下限が 44px に拡張されること（意図的 a11y 改善）
- **手順:**
  1. devtools のレスポンシブモードで幅を sm 未満（< 640px）にして admin primary ボタンを確認
- **期待結果:** ボタン高さが min 44px（h-9=36px より大きくなる）。デスクトップ幅では h-9（36px）のまま

### 3. reduced-motion での押下アニメ無効

- **目的:** active:scale が reduced-motion で無効化されること
- **手順:**
  1. OS/ブラウザの「視差効果を減らす」を有効化し、landing primary または admin primary ボタンを押下
- **期待結果:** 押下時の scale 縮小が起きない（`motion-reduce:active:scale-100`）

## 既存機能への影響確認

- landing の signup/login 導線、admin 各フォームの保存・リセット動作が従来どおり機能すること。admin の挙動（mutation）は integration テストで担保し、ブラウザでは見た目のみ確認（admin の server-function POST は agent-browser で 403 になる制約があるため）。
- 定数削除（`BTN_PRIMARY_CLASS` ×4 / `HERO_BTN_*` の値差し替え）による参照漏れ・未使用 import がないこと（`pnpm typecheck` で検出）。
- DesignTokensForm の `BTN_BASE` が surface/destructive からなお参照され、dead code になっていないこと。

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る（定数削除の参照漏れ・未使用 import なし）
- [ ] `./node_modules/.bin/biome check --write` / `format` がクリーン
- [ ] `pnpm build` 成功、生成 CSS で landing の h-12/px-8/text-md が base を後勝ち上書き
- [ ] `pnpm test`（unit + integration）が通る
- [ ] landing primary（signup）が accent 縦長で表示（surface に化けていない）
- [ ] landing secondary（login）が surface 縦長で表示（accent に化けていない）
- [ ] admin 4 フォームの primary 保存ボタンが accent で表示（surface に化けていない）
- [ ] DesignTokensForm の surface/destructive/small が回帰なく共存（ghost destructive が filled 化していない）
- [ ] admin primary が disabled で opacity 0.55・hover/active 無効
- [ ] admin primary が max-sm で min-h 44px に拡張
- [ ] reduced-motion で押下 scale が無効
- [ ] `grep -rn "data-primary" app/components/landing/LandingPage.tsx` が 1 件（:140 PRIMARY のみ、SECONDARY には無い）
- [ ] `grep -rn "BTN_PRIMARY_CLASS" app/components/admin --include="*.tsx"` が置換後ゼロ

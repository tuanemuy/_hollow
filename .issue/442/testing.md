# 動作確認計画 — Issue #442: styles.ts 外に残るローカルボタン定義（ghost destructive / small / surface / HEADER_CTA）を common へ統一

**Issue:** #442
**作成日:** 2026-06-03

---

## 確認環境

本 Issue の変更は `app/components/common/styles.ts`（新 variant 2 つ）と `app/components/admin/{DesignTokensForm,PromptsForm}/index.tsx`・`app/components/landing/LandingPage.tsx` の className のみ（純フロント・視覚変更）。DB マイグレーションやシード変更は不要。確認に必要な手順のみ記載。

### 検証環境の起動

```
pnpm dev   # vite dev（ライブソース、CSS のホットリロードが効く）
```

> `pnpm start`（wrangler dev）は prebuilt の `dist/worker` を配信するため、ソース変更を確認する場合は先に `pnpm build` が必要。CSS の見た目確認は `pnpm dev` で足りる。

生成 CSS の後勝ち検証用ビルド:

```
pnpm build   # 新 variant（data-[ghost-danger]: / data-[sm]:）が base utility を後勝ち上書きしているか生成 CSS で確認
```

### デプロイ方法

検証環境のみで確認可能。ステージング反映が要る場合は `pnpm deploy:staging`（本番は `pnpm deploy:production`）。本 Issue の確認には不要。

## 確認項目

### 1. landing ヘッダー「アカウント作成」CTA（HEADER_CTA → pillBtn+pillBtnPrimary）

- **目的:** ヘッダー右上の「アカウント作成」`<Link>` が従来どおり accent pill（h-9）として表示されること。surface に化けていないこと。
- **手順:**
  1. `pnpm dev` で起動し `/`（ランディングページ、未認証で可）を開く
  2. ヘッダー右上「アカウント作成」を確認（accent 背景・白文字・h-9・pill 形状）
  3. hover で `accent-hover` に変化、押下で `accent-pressed`＋わずかに縮む（0.985）ことを確認
- **期待結果:** 寄せ前と同じ accent pill。hover/active 色が accent 系。
- **確認ポイント:** ヒーロー部の「無料でアカウント作成」（h-12 縦長）と違い、ヘッダー CTA は h-9（短い）であること。`pillBtnTall` が付いていないことの確認。

### 2. DesignTokensForm surface ボタン「＋ トークンを追加」（BTN_CLASS → pillBtn）【要認証】

- **目的:** surface ボタンが従来どおり surface 背景・ink 文字で表示されること（視覚一致のため回帰ゼロ想定）。
- **手順:**
  1. 認証済みで admin デザイントークン設定画面を開く
  2. 「＋ トークンを追加」ボタンを確認（surface 背景・ink 文字・h-9）
  3. hover で `surface-hover`、押下で縮みを確認
- **期待結果:** 寄せ前と同じ surface pill。
- **確認ポイント:** 素の `pillBtn`（data-* 属性なし）で surface base 色が出ること。

### 3. DesignTokensForm「すべてリセット」ghost destructive（BTN_DESTRUCTIVE_CLASS → pillBtn+pillBtnGhostDanger）【要認証】

- **目的:** ghost destructive が「通常は透明＋二次テキスト色 / hover で error-surface＋error 文字」で表示され、押下時もグレーに化けないこと（ADR-001）。
- **手順:**
  1. admin デザイントークン設定画面でフッターの「すべてリセット」を確認（通常時：透明背景・ink-secondary 文字）
  2. hover で error-surface 背景＋error 文字に変わることを確認
  3. **マウス押下を保持**し、押下中もグレー（surface-hover）に化けず error-surface のままであることを確認（ADR-001 の押下グレー回帰チェック）
  4. 上書きが無い状態（`disabled`）で opacity 0.55・hover 無効を確認
- **期待結果:** 通常透明 → hover/active 赤系。押下グレー回帰なし。
- **確認ポイント:** push 中のグレー打ち消しが起きないこと（最重要）。

### 4. DesignTokensForm 行内 small ghost「削除 / 既定に戻す」（BTN_SM_DESTRUCTIVE_CLASS → pillBtn+pillBtnGhostDanger+pillBtnSm）【要認証】

- **目的:** ghost destructive かつ small（h-7 / px-3 / text-xs）で表示されること。h-9 に膨らんでいないこと。
- **手順:**
  1. デザイントークンの行を上書きして（badge「上書き中」が出る）、行内の「既定に戻す」ボタンを有効化
  2. ボタンが小型（h-7・小さい文字）であることを確認。隣の h-8 input と高さバランスが従来どおりであること
  3. hover で error-surface＋error 文字、押下グレー回帰なしを確認
  4. 未上書き行で `disabled`（opacity 0.55）を確認
- **期待結果:** small + ghost destructive の合成が従来の `BTN_SM_DESTRUCTIVE_CLASS` と一致。
- **確認ポイント:** small サイズが効いている（h-9 に膨らんでいない）こと。data-[sm]: variant の後勝ち確認。

### 5. PromptsForm「この項目をリセット」/「すべてのプロンプトをリセット」（BTN_GHOST_CLASS / BTN_DESTRUCTIVE_CLASS → pillBtn+pillBtnGhostDanger）【要認証】

- **目的:** 2 つの ghost destructive ボタン（h-9）が項目 3 と同じ表示になること。
- **手順:**
  1. admin プロンプト設定画面を開く
  2. 各カードの「この項目をリセット」（上書き時のみ有効）と、フッターの「すべてのプロンプトをリセット」を確認
  3. 通常透明 → hover 赤系 → 押下グレー回帰なし、disabled opacity を確認
- **期待結果:** 寄せ前の 2 ローカル定義（文字列同一）と一致。
- **確認ポイント:** 2 ボタンが同一表示であること（1 variant に集約された結果）。

## エッジケース・異常系

### 1. ghost destructive の disabled 表示

- **目的:** `disabled` 時に opacity 0.55・cursor not-allowed・hover/active 無効になること。
- **手順:** 各 ghost destructive ボタンを上書きなし状態（disabled）で観察し、hover してもグレー/赤に変化しないことを確認。
- **期待結果:** base `disabled:opacity-disabled disabled:cursor-not-allowed` と `not-disabled:` ガードが効き、無効時は色変化なし。

### 2. small ボタンのモバイルタップ下限（max-sm:min-h-0 打ち消し）

- **目的:** モバイル幅で small ボタン（h-7=28px）が 44px に膨らまないこと（ADR-004）。
- **手順:** devtools のレスポンシブモードで幅を sm 未満（< 640px）にし、DesignTokensForm 行内 small ボタンの高さが h-7（28px）のままであることを確認。
- **期待結果:** `data-[sm]:max-sm:min-h-0` が base の `max-sm:min-h-[44px]` を打ち消し、28px を維持。

### 3. reduced-motion で active:scale 無効

- **目的:** 「視差効果を減らす」有効時に押下 scale が無効化されること（ADR-002）。
- **手順:** OS/ブラウザの reduced-motion を有効化し、ghost destructive / HEADER_CTA を押下。
- **期待結果:** `motion-reduce:active:scale-100` でスケールしない。

## 既存機能への影響確認

- landing の signup 導線、admin デザイントークン/プロンプトのリセット・追加・保存動作が従来どおり機能すること。admin の挙動（mutation）は integration テストで担保し、ブラウザでは見た目のみ確認（admin の server-function POST は agent-browser で 403 になる制約があるため）。
- 定数削除（`BTN_BASE` / `BTN_CLASS` / `BTN_DESTRUCTIVE_CLASS` / `BTN_SM_CLASS` / `BTN_SM_DESTRUCTIVE_CLASS` / `BTN_GHOST_CLASS` / `HEADER_CTA`）による参照漏れ・未使用 import がないこと（`pnpm typecheck` で検出）。

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る（定数削除の参照漏れ・未使用 import なし）
- [ ] `pnpm lint:fix` / `pnpm format` 適用済み
- [ ] `pnpm build` 成功、生成 CSS で `data-[ghost-danger]:` の bg/text/active utility が base を後勝ち上書き
- [ ] `pnpm build` 生成 CSS で `data-[sm]:h-7 / px-3 / text-xs / max-sm:min-h-0` が base を後勝ち上書き
- [ ] `pnpm test`（unit + integration）が通る
- [ ] landing ヘッダー「アカウント作成」が accent h-9 pill で表示（surface に化けていない）
- [ ] DesignTokensForm「＋ トークンを追加」が surface pill で表示
- [ ] DesignTokensForm「すべてリセット」が ghost destructive、押下グレー回帰なし
- [ ] DesignTokensForm 行内 small ghost が h-7 のまま（h-9 に膨らまない）、押下グレー回帰なし
- [ ] PromptsForm 2 ボタンが ghost destructive で同一表示、押下グレー回帰なし
- [ ] 全 ghost destructive が disabled で opacity 0.55・hover/active 無効
- [ ] small ボタンが max-sm でも h-7（44px に膨らまない）
- [ ] reduced-motion で押下 scale 無効
- [ ] `grep -rn "BTN_BASE\|BTN_CLASS\|BTN_DESTRUCTIVE_CLASS\|BTN_SM_CLASS\|BTN_SM_DESTRUCTIVE_CLASS\|BTN_GHOST_CLASS\|HEADER_CTA" app/components --include="*.tsx"` が置換後ゼロ

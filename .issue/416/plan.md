# 実装計画 — Issue #416: auth ボタン系統 (BTN_*) を common pill primitive へ統一する

**Issue:** #416
**作成日:** 2026-06-02
**複雑度:** 中〜大規模
**系譜:** #336（umbrella）/ #273（pill 2系統集約）/ #152（disabled hover 無効化）

---

## 目的

auth 専用の縦長ボタン系統 `BTN_PRIMARY` / `BTN_PRIMARY_INLINE` / `BTN_SECONDARY` / `BTN_SECONDARY_TALL`（`app/components/auth/styles.ts`）を、`app/components/common/styles.ts` の pill primitive（`pillBtn` + data 駆動 add-on variant）へ寄せて SSOT 化する。#273/#152/#336 で確立した「common SSOT + data 駆動 variant」方針の自然な続き。

## スコープ

### 含まれるもの

- common に縦長 size add-on（`pillBtnTall`）を新設し、auth の `BTN_PRIMARY` / `BTN_PRIMARY_INLINE` / `BTN_SECONDARY_TALL` を `${pillBtn} ${pillBtnTall} (${pillBtnPrimary}) <レイアウト固有差分>` の合成へ置換する
- primary 系 consumer（`<button>`/`<Link>`）に `data-primary=""` を付与する
- 死蔵の `BTN_SECONDARY`（h-11、consumer 0 件）を削除する
- 設計判断（寸法 size variant 化 / disabled 値 60→55 / active:scale 付与 / aria-disabled 対応）を `.issue/416/adr.md` に記録する

### 含まれないもの

- admin の `BTN_PRIMARY_CLASS`（`admin/{LLMSettingsForm,DesignTokensForm,PromptsForm,RegistrationForm}` のローカル定義、h-9 px-4 opacity-50。auth/styles を import していない別系統）
- landing の `HERO_BTN_PRIMARY` / `HERO_BTN_SECONDARY`（`landing/LandingPage.tsx` のローカル定義、auth/styles 非依存）
- public `GATE_SUBMIT` / `SEARCH_FORM_BUTTON` / `PILL_BTN` 等（#336 の別フォローアップ）
- リンク装飾（`AUTH_FOOTER_LINK` / `FIELD_LINK` / `CALLOUT_ACTION`）の統一（#336 の別フォローアップ）
- focus-visible リングの全ボタン統一（#336 の別フォローアップ）
- 新規トークン追加・意匠刷新

## 実装ステップ

### 1. common に縦長 size add-on `pillBtnTall` を新設

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `pillBtn` の base 寸法（h-9 / px-4 / text-sm）を上書きする size add-on `pillBtnTall` を追加する。内容は `"h-12 px-8 text-md"`。`gap` は含めない（理由は注意欄）。primary 合成（`${pillBtn} ${pillBtnTall} ${pillBtnPrimary}` + `data-primary=""`）と surface 合成（`${pillBtn} ${pillBtnTall}`）の両適用形を JSDoc に明記する。
- **理由:** 寸法差は size variant として common に切り出すのが #273 ADR-001 補足の既定方針（small pill の縦長版）。padding/min-w/full-width はレイアウト固有なので add-on には含めず合成側に残す。
- **注意:** base の同一プロパティ素 utility（h-9/px-4/text-sm）を上書きするため、生成 CSS 順で add-on が後勝ちするか `pnpm build` の生成 CSS で確認する（#273 ADR-003 と同じ検証）。`gap-0` は含めない — gap utility は数値昇順で CSS 出力されるため `gap-0` は base `gap-1.5` より前に出て**後勝ちできず**、かつ auth ボタンは全てテキストのみ（flex 子要素なし）で `gap-1.5` は視覚的に無害なので指定自体が不要。`h-12`/`px-8`/`text-md` は実測で後勝ち成立（spacing は拡大方向で数値が後＝後勝ち、`text-md` はカスタムトークンで標準 text-* 群より後ろに出力）。万一後勝ちしない場合は `pillBtnTall` 側を `data-[tall]:` variant 化してフォールバック（ADR に記録）。

### 2. auth/styles.ts の BTN_* を common 合成へ置換

- **対象ファイル:** `app/components/auth/styles.ts`
- **変更内容:**
  - `BTN_PRIMARY` = `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full`
  - `BTN_PRIMARY_INLINE` = `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} min-w-[200px]`（px-8 は `pillBtnTall` に内包）
  - `BTN_SECONDARY_TALL` = `${pillBtn} ${pillBtnTall} min-w-[200px]`（surface 系＝primary を付けない＝base の bg-surface/text-ink がそのまま効く）
  - `BTN_SECONDARY`（h-11）= 削除（consumer 0 件）
- **理由:** common SSOT へ寄せ、auth 固有はレイアウト差分（w-full / min-w-[200px]）のみ合成側に残す。

### 3. consumer に data-primary 属性を付与

- **対象ファイル:** auth 配下 7 ファイル（下記 consumer 一覧）
- **変更内容:** primary 系（`BTN_PRIMARY` / `BTN_PRIMARY_INLINE`）を使う全 `<button>`/`<Link>` に `data-primary=""` を追加する。実 grep で確定した付与対象は**計 17 箇所**（下記内訳）。`BTN_SECONDARY_TALL`（VerifyEmail:171 の 1 箇所）は surface 系なので属性付与不要。
- **理由:** `pillBtnPrimary` は `data-[primary]:` 駆動のため、属性がないと accent でなく surface 色になる（無音の退行）。本 Issue の最大リスク。
- **付与対象 17 箇所の内訳（実 grep 確定）:**
  - LoginForm:191 `<button>` / PasswordResetRequestForm:116 `<button>` / PasswordResetConfirmForm:197 `<button>`（各 1）
  - SignUpForm:128 `<Link>` + :292 `<button>`（2）/ AdminSignUpForm:147 `<Link>` + :399 `<button>`（2）
  - EmailChangeConfirm: :103 / :123 / :141 / :161 / :175 `<Link>`（5）
  - VerifyEmail: :118 / :192 / :212 / :226 `<Link>`（INLINE 4）+ :162 `<button>`（PRIMARY 1）（計 5）
- **consumer 一覧（実 import 元、計 7 ファイル）:**
  - `auth/LoginForm/index.tsx` — `<button>` `BTN_PRIMARY` + disabled
  - `auth/PasswordResetRequestForm/index.tsx` — `<button>` `BTN_PRIMARY` + disabled
  - `auth/PasswordResetConfirmForm/index.tsx` — `<button>` `BTN_PRIMARY` + disabled
  - `auth/SignUpForm/index.tsx` — `<Link>` `BTN_PRIMARY` / `<button>` `BTN_PRIMARY` + disabled
  - `auth/AdminSignUpForm/index.tsx` — `<Link>` `BTN_PRIMARY` / `<button>` `BTN_PRIMARY` + disabled
  - `auth/EmailChangeConfirm/index.tsx` — `<Link>` `BTN_PRIMARY_INLINE` ×5
  - `auth/VerifyEmail/index.tsx` — `<Link>` `BTN_PRIMARY_INLINE` ×4 / `<button>` `BTN_PRIMARY` + disabled / `<Link>` `BTN_SECONDARY_TALL` ×1（`${...} mt-3` 合成）

### 4. 検証

- **手順:** `pnpm typecheck`（`BTN_SECONDARY` 削除の参照漏れ・未使用 import 検出）→ `./node_modules/.bin/biome check --write`（lint:fix）→ `./node_modules/.bin/biome format --write`（format）→ `pnpm build`（生成 CSS で size add-on の後勝ち確認）→ `pnpm test`
- **data-primary 付与漏れの機械的突合:** `grep -rEn "className=.*BTN_PRIMARY(_INLINE)?" app/components/auth --include="*.tsx"` で primary 使用 17 行（import を拾わず className 行のみ）を列挙し、各 JSX 要素に `data-primary` が付いているか突合する。
- **理由:** 視覚回帰ゼロを原則とし、意図的変化（disabled 60→55 / active:scale 付与）のみ許容する。生成 CSS 順依存の上書き競合を build で検証する。`data-primary` 付け忘れは無音退行なので機械的に突合する。

## 設計判断

詳細は `.issue/416/adr.md` を参照。

- **寸法差（h-12/h-11 ↔ h-9）:** common に縦長 size add-on `pillBtnTall` を切り出す。h-11(BTN_SECONDARY) は死蔵で消えるため足すサイズは h-12 一種で済む。
- **disabled 値 55 vs 60:** base の `opacity-55` に寄せる（SSOT 優先）。透過率差 5% は知覚上ほぼ判別不能、#336 の「disabled opacity 統一」方針にも合致。意図的変化として ADR 記録。
- **aria-disabled 対応:** base `pillBtn` が `aria-disabled:*` と `not-aria-disabled:` ガードを内包済みのため、寄せるだけで `<Link>` の disabled 表現対応が無償で整う。consumer 側の属性追加は不要（YAGNI）。
- **active:scale / 押下アニメ:** base 継承で付与する。#273 が共通系に付与済みで「全 pill の押下フィードバック統一」が確立済み方針。`motion-reduce:active:scale-100` で reduced-motion 無効化。意図的変化として ADR 記録。

## リスクと注意点

- **size add-on の上書き競合:** `pillBtnTall` の h-12/px-8/text-md が base を確実に上書きするかは生成 CSS 順依存（#273 ADR-003 / ADR-005）。`pnpm build` で確認必須。後勝ちしなければ `data-[tall]:` variant 化でフォールバック。
- **意図的視覚変化が 2 点:** disabled opacity 60→55、active:scale 付与。いずれも軽微だがブラウザ目視で確認し ADR に明記。
- **data-primary 付け忘れ:** primary 系を使う全箇所（button/anchor 計 17 箇所、step 3 の内訳参照）に確実に付与する。付け忘れると accent でなく surface 色になる無音退行。
- **誤検知の混入回避:** admin `BTN_PRIMARY_CLASS`・landing `HERO_BTN_*` は auth/styles 非依存の別系統。触らない（スコープ外）。
- **影響範囲は限定的:** 実 consumer は auth 配下 7 ファイルのみ。typecheck + biome + grep で参照漏れ・未使用 import を検出できる。

## テスト方針

- 自動: `pnpm typecheck` → biome（lint:fix / format / format:check は `./node_modules/.bin/biome` で確認）→ `pnpm test`
- 生成 CSS 確認: `pnpm build` 後、`pillBtnTall` の h-12/px-8/text-md が base を上書き（後勝ち）しているか確認
- 参照漏れ確認: `grep -rn "BTN_SECONDARY[^_]" app/` が styles.ts 定義以外でゼロ（削除後はゼロ）
- 手動（ブラウザ）: login/signup/admin-signup の送信ボタン（`BTN_PRIMARY`）、メール認証・メール変更確認の `<Link>` ボタン（`BTN_PRIMARY_INLINE` / `BTN_SECONDARY_TALL`）で、h-12 寸法・accent/surface 色・hover/active・disabled 表示（opacity 55）・押下 scale を確認。auth 画面は agent-browser の server-function POST が 403 になる制約があるため、ボタン経由 mutation はブラウザ自動検証せず表示確認に留め、挙動は integration テストで担保。

## レビュー履歴

### 1周目

**修正した点**:
- **[P-001 アーキ]** `pillBtnTall` から `gap-0` を削除。gap utility は数値昇順で CSS 出力されるため `gap-0` は base `gap-1.5` を後勝ち上書きできず、かつ auth ボタンは全てテキストのみで `gap-1.5` は視覚的に無害。add-on は `"h-12 px-8 text-md"` に確定。plan step 1・ADR-001 を修正。
- **[P-001 要件]** `data-primary` 付与対象を「計約 9 箇所」→ 実 grep で確定した **17 箇所**に修正。内訳（ファイル:行）を plan step 3 に明記し、機械的突合手順を「検証」ステップに追加。

**取り込んだ改善提案**:
- **[S-001 アーキ]** size add-on の後勝ち成立理由（spacing は拡大方向のみ安全 / カスタムトークン text-md は堅牢）を ADR-005 として新規追記。
- **[S-002 要件]** `pillBtnTall` の JSDoc 適用例に surface 合成（`${pillBtn} ${pillBtnTall}`）も併記する方針を plan step 1 に反映。

**見送った提案とその理由**:
- なし（両レビューの指摘・提案はすべてスコープ内で妥当だったため取り込み）。

### 2周目

**修正した点**:
- **[P-001/P-002 両視点]** 「リスクと注意点」セクションの更新漏れを修正。1周目は step 1/3 のみ直し、リスク欄に旧記述（`gap-0`・「約 9 箇所」）が残っていた。`gap-0` を除去し `h-12/px-8/text-md` に、付与箇所を「計 17 箇所（step 3 内訳参照）」に統一。

**取り込んだ改善提案**:
- **[S-001 要件]** 突合 grep を `className=.*BTN_PRIMARY(_INLINE)?` ベースに変更し、import 行のノイズ混入を排除（ちょうど 17 行が出る）。
- **[S-001 アーキ]** ADR-005 の text-md 後勝ち機序を精緻化。base の `text-sm` もカスタムトークンであり、後勝ちは「標準 vs カスタム」でなく `@theme inline` 内の宣言順（`--text-md` が `--text-sm` より後）に依る点を明記。

**見送った提案とその理由**:
- なし。

3周目は実施せず（2周目で指摘されたのはすべて 1周目修正の取りこぼし＝同一論点の更新漏れで、新規の設計・要件問題はゼロ。修正は機械的で収束済みと判断）。

# 実装計画 — Issue #425: styles.ts 外のローカルボタン定義 (admin BTN_PRIMARY_CLASS / landing HERO_BTN_*) を common pill primitive へ統一する

**Issue:** #425
**作成日:** 2026-06-03
**複雑度:** 中〜大規模
**系譜:** #336（umbrella）/ #416（auth BTN_* 統一・pillBtnTall 新設）/ #273（pill 2系統集約）/ #152（disabled hover 無効化）/ #419（disabled opacity 正規化）

---

## 目的

`app/components/common/styles.ts`（SSOT）の外にコンポーネント内ローカル定義された primary ボタン定数を、common の既存 pill primitive（`pillBtn` / `pillBtnTall` / `pillBtnPrimary`）へ寄せて SSOT 化する。#416（auth `BTN_*` の common 統一）のほぼクローンであり、対象が auth/styles ではなく「styles.ts 外のローカル定義」である点が異なる。primitive は #416 で整備済みのため **common/styles.ts への新規追加は不要**（既存をそのまま使う）。

## スコープ

### 含まれるもの（Issue の named scope）

- **A. admin `BTN_PRIMARY_CLASS`**
  - `admin/{RegistrationForm,LLMSettingsForm,PromptsForm}/index.tsx` — 各ファイルで同一文字列をローカル定義している `BTN_PRIMARY_CLASS` を削除し、`pillBtn` + `pillBtnPrimary` の合成（`${pillBtn} ${pillBtnPrimary}`）へ置換、consumer の `<button>` に `data-primary=""` を付与する
  - `admin/DesignTokensForm/index.tsx` — `BTN_PRIMARY_CLASS`（primary）を `${pillBtn} ${pillBtnPrimary}` + `data-primary=""` へ置換する
- **B. landing `HERO_BTN_PRIMARY` / `HERO_BTN_SECONDARY`**
  - `landing/LandingPage.tsx` — `HERO_BTN_PRIMARY` を `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} min-w-[200px]`（consumer `<Link>` に `data-primary=""`）、`HERO_BTN_SECONDARY` を `${pillBtn} ${pillBtnTall} min-w-[200px]`（surface 系・属性なし）へ置換する。#416 の `BTN_PRIMARY_INLINE` / `BTN_SECONDARY_TALL` と同一パターン。
- 各 consumer 5 ファイルへの `import { pillBtn, pillBtnPrimary[, pillBtnTall] } from "@/components/common/styles"` 追加
- 設計判断（duration/ease 明示指定の脱落 / active:scale 付与 / max-sm:min-h 付与 / aria-disabled capability / DesignTokensForm の destructive 非対象）を `.issue/425/adr.md` に記録する

### 含まれないもの

- **DesignTokensForm の destructive 系** — `BTN_DESTRUCTIVE_CLASS` / `BTN_SM_DESTRUCTIVE_CLASS` は **ghost destructive**（`bg-transparent text-ink-secondary`、hover で `bg-error-surface text-error`）。common `pillBtnDanger` は **filled**（`data-[danger]:bg-error-surface data-[danger]:text-error`）で視覚が別物。寄せると視覚回帰になるため対象外（ADR-005）。
- **DesignTokensForm の small 系**（`BTN_SM_CLASS` / `BTN_SM_DESTRUCTIVE_CLASS`、h-7）— pillBtn は h-9 寸法。small variant（`pillBtnSm` 等）は未整備で、寄せると寸法回帰。size add-on 新設はスコープ拡大。対象外（ADR-006）。
- **DesignTokensForm の `BTN_CLASS`（surface, `${BTN_BASE} bg-surface text-ink hover:not-disabled:bg-surface-hover`）の素 pillBtn 化** — 視覚的には pillBtn の surface 系と一致するが、本 Issue の named scope は「BTN_PRIMARY_CLASS / HERO_BTN_*」であり、BTN_CLASS は scope 外。ただし BTN_BASE の去就（後述）に伴い結論を出す（ADR-006 / 実装ステップ 2 参照）。
- **PromptsForm の `BTN_GHOST_CLASS` / `BTN_DESTRUCTIVE_CLASS`** — どちらも ghost（`bg-transparent` base、hover で error 色）で、ADR-005 と同じ理由で `pillBtnDanger`（filled）に寄せると視覚回帰。named scope（primary）外のため非対象（同ファイルを触るが primary のみ抜く）。
- **landing の `HEADER_CTA`（`landing/LandingPage.tsx:22`、:115 で `<Link to="/signup">` が consume）** — `HERO_BTN_*` と同系統の SSOT 外ローカル accent ピル（`h-9 px-4 rounded-pill bg-accent text-white`）がもう 1 つ存在するが、Issue の named scope は「`HERO_BTN_*`」のため今回は非対象。取りこぼしの無音退行と誤認しないよう明記。共通化したい場合は別フォローアップ。
- public / テキストリンク / focus-visible 等の他フォローアップ（#417 / #418 / #419）
- 新規トークン追加・新規 primitive 追加・意匠刷新

> **opacity に関する注記:** Issue 本文は admin `BTN_PRIMARY_CLASS` を `disabled:opacity-50` と記すが、実コードは #419 で既に `disabled:opacity-disabled`（= 0.55 トークン）へ正規化済み。pillBtn base も `disabled:opacity-disabled` なので、寄せても opacity 差分はゼロ（#416 のような opacity 50/60→55 の意図的変化は本 Issue では発生しない）。よって opacity の ADR は立てない。

## data-primary 付与対象（実 grep 確定・計 5 箇所）

primary 系を使う全 `<button>`/`<Link>` に `data-primary=""` を付与する。付け忘れは accent でなく surface 色になる**無音退行**で本 Issue の最大リスク。

| # | ファイル | 行 | 要素 | 現定数 → 置換後 |
|---|---------|----|------|----------------|
| 1 | `admin/RegistrationForm/index.tsx` | 136 | `<button>` | `BTN_PRIMARY_CLASS` → `${pillBtn} ${pillBtnPrimary}` + `data-primary=""` |
| 2 | `admin/LLMSettingsForm/index.tsx` | 493 | `<button>` | 同上（既存 `data-all-env-locked` と併存） |
| 3 | `admin/PromptsForm/index.tsx` | 242 | `<button>` | 同上 |
| 4 | `admin/DesignTokensForm/index.tsx` | 320 | `<button>` (submit) | `BTN_PRIMARY_CLASS` → `${pillBtn} ${pillBtnPrimary}` + `data-primary=""` |
| 5 | `landing/LandingPage.tsx` | 140 | `<Link>` | `HERO_BTN_PRIMARY` → `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} min-w-[200px]` + `data-primary=""` |

surface 系（属性付与不要）: `landing/LandingPage.tsx:143` `<Link>` `HERO_BTN_SECONDARY` → `${pillBtn} ${pillBtnTall} min-w-[200px]`（`data-primary` なし）。

（注: admin 3 ファイル・DesignTokensForm は consumer がそれぞれ 1 箇所のみ。各ファイルの `className={BTN_PRIMARY_CLASS}` 出現は grep で 1 件ずつと確認済み。）

## 実装ステップ

### 1. admin 単純 3 ファイルの BTN_PRIMARY_CLASS を common 合成へ置換

- **対象ファイル:** `admin/{RegistrationForm,LLMSettingsForm,PromptsForm}/index.tsx`
- **変更内容:**
  - ローカル定数 `BTN_PRIMARY_CLASS`（3 ファイルとも完全同一文字列）を削除する。
  - `import { pillBtn, pillBtnPrimary } from "@/components/common/styles";` を追加する。
  - consumer の `className={BTN_PRIMARY_CLASS}` を `` className={`${pillBtn} ${pillBtnPrimary}`} `` に置換し、同じ要素に `data-primary=""` を付与する（付与対象 #1〜#3）。
- **理由:** 3 ファイル重複の同一文字列を SSOT へ集約。primary の色は `data-[primary]:` 駆動なので属性が必須。
- **注意:** 各ファイルの他の定数（`TEXTAREA_CLASS` 等）は触らない。`BTN_PRIMARY_CLASS` 削除で他参照が無いことを typecheck（未使用変数）で担保。

### 2. DesignTokensForm の BTN_PRIMARY_CLASS を common 合成へ置換（destructive/small/surface は据え置き）

- **対象ファイル:** `admin/DesignTokensForm/index.tsx`
- **変更内容:**
  - `import { pillBtn, pillBtnPrimary } from "@/components/common/styles";` を追加する。
  - `BTN_PRIMARY_CLASS` 定数を削除し、consumer（submit ボタン :320）を `` className={`${pillBtn} ${pillBtnPrimary}`} `` + `data-primary=""` へ置換する（付与対象 #4）。
  - `BTN_BASE` / `BTN_CLASS` / `BTN_DESTRUCTIVE_CLASS` / `BTN_SM_CLASS` / `BTN_SM_DESTRUCTIVE_CLASS` は**そのまま残す**。
- **BTN_BASE の去就（結論）:** **残す。** `BTN_BASE` は `BTN_CLASS`（surface, scope 外）と `BTN_DESTRUCTIVE_CLASS`（ghost destructive, scope 外）がなお参照するため、`BTN_PRIMARY_CLASS` だけ抜いても BTN_BASE 自体は生きている。削除すると残り 2 定数が壊れる。よって BTN_BASE は temp として残置。`BTN_PRIMARY_CLASS` 行のみ削除する。
- **理由:** named scope は primary のみ。destructive（ghost）/ small は common に視覚一致する受け皿が無く（ADR-005 / ADR-006）、寄せると視覚回帰。surface（BTN_CLASS）は pillBtn と一致するが scope 外（ADR-006）。視覚回帰ゼロ原則を優先し、primary だけを最小差分で寄せる。
- **注意:** primary を抜くと DesignTokensForm 内に `bg-surface` 系（BTN_CLASS）・`bg-transparent` 系（destructive）と `pillBtn`（surface base）系（submit は primary なので無関係）が混在するが、これは意図的なスコープ限定。submit ボタンの寸法は h-9 px-4 で pillBtn base と一致するため視覚回帰なし（duration/ease 差は ADR-001、active:scale / max-sm:min-h 付与は ADR-002 / ADR-003）。

### 3. landing HERO_BTN_* を common 合成へ置換

- **対象ファイル:** `landing/LandingPage.tsx`
- **変更内容:**
  - `import { pillBtn, pillBtnTall, pillBtnPrimary } from "@/components/common/styles";` を追加する。
  - `HERO_BTN_PRIMARY` = `` `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} min-w-[200px]` ``（px-8 / h-12 / justify-center は pillBtnTall 内包、min-w はレイアウト固有差分として末尾合成）。consumer `<Link to="/signup">`（:140）に `data-primary=""` を付与（付与対象 #5）。
  - `HERO_BTN_SECONDARY` = `` `${pillBtn} ${pillBtnTall} min-w-[200px]` ``（surface 系＝primary を付けない＝base の bg-surface/text-ink が効く）。consumer `<Link to="/login">`（:143）は属性なし。
  - **`HERO_BTN_*` のローカル定数名は維持する（値のみ差し替え）。** landing は単一ファイル・単一 consumer ずつなので、#416 のように共通ファイル（`landing/styles.ts`）へ hoist する必要は無く、定数名維持で diff を最小化する（YAGNI）。`HEADER_CTA` 等の他ローカルボタンと同居する現状の構造を保つ。
- **理由:** #416 の `BTN_PRIMARY_INLINE`（`${pillBtn} ${pillBtnTall} ${pillBtnPrimary} min-w-[200px]`）/ `BTN_SECONDARY_TALL`（`${pillBtn} ${pillBtnTall} min-w-[200px]`）と完全同一パターン。SSOT へ寄せ、min-w のみ合成側に残す。
- **解消される弱点:** 現状 HERO_BTN_* は `hover:`/`active:` に `not-disabled:not-aria-disabled:` ガードが無い。pillBtn base 継承でガードが付き、`<Link>` の aria-disabled 表現も無償で整う（ADR-004。ただし consumer は disabled にならないので属性追加は不要＝YAGNI）。

### 4. 検証

- **手順:** `pnpm typecheck`（定数削除の未使用 import / 参照漏れ検出）→ `./node_modules/.bin/biome check --write`（lint:fix）→ `./node_modules/.bin/biome format --write`（format）→ `pnpm build`（pillBtnTall の後勝ち確認・#416 で確認済みだが landing でも再確認）→ `pnpm test`
- **data-primary 付与漏れの機械的突合:**
  - admin（インライン合成）: `grep -rEn "pillBtnPrimary" app/components/admin --include="*.tsx"` で出る各 `className` 行（4 件）に `data-primary` が同要素に付くか目視突合する。
  - landing（ローカル定数経由）: `HERO_BTN_PRIMARY` はローカル定数の値に `pillBtnPrimary` を内包するため、`pillBtnPrimary` 文字列は定数定義行（:78 付近）にしか出ず consumer 行には出ない。よって `grep -n "HERO_BTN_PRIMARY" app/components/landing/LandingPage.tsx` で consumer（:140）を特定し、その `<Link>` に `data-primary=""` が付くことを目視確認する。
  - SECONDARY 誤付与防止: `grep -n "data-primary" app/components/landing/LandingPage.tsx` がちょうど 1 件（:140 PRIMARY のみ、:143 SECONDARY には無い）であることを確認する。
- **理由:** 視覚回帰ゼロ原則。意図的変化（duration 120→150ms / active:scale 付与 / max-sm:min-h 付与）のみ許容し ADR 記録。`data-primary` 付け忘れは無音退行なので機械的に突合する。

## 設計判断

詳細は `.issue/425/adr.md` を参照。#416 ADR を踏襲しつつ #425 固有の差分を明記。

- **ADR-001 duration/ease 明示指定の脱落（意図的変化・#425 固有）:** admin は `duration-[var(--duration-fast)]`(=120ms) `ease-[var(--ease-standard)]` を明示。pillBtn base は素の `transition-colors`（デフォルト 150ms、ease は `cubic-bezier(0.4,0,0.2,1)` で `--ease-standard` と同値）。ease 不変、duration 120→150ms の知覚不能な微変化。SSOT 統一そのものとして記録。
- **ADR-002 active:scale 押下フィードバック付与（意図的変化）:** #416 ADR-003 と同じ。base 継承で付く。`motion-reduce:active:scale-100` で無効化。
- **ADR-003 max-sm:min-h-[44px] 付与（意図的 a11y 改善・#425 固有）:** pillBtn base 由来。admin ボタン（h-9=36px）に max-sm のモバイルタップターゲット下限 44px が付く。landing は h-12=48px で inert。意図的改善として記録。
- **ADR-004 aria-disabled capability 継承（YAGNI）:** #416 ADR-004 と同じ。landing `<Link>` の disabled 表現が無償で整うが consumer は disabled にならないため属性追加なし。
- **ADR-005 DesignTokensForm の destructive を pillBtnDanger に寄せない（視覚回帰回避・#425 固有）:** ghost destructive（transparent base）vs filled `pillBtnDanger`（error-surface chip）は視覚別物。Issue 本文は「pillBtnDanger も既に common にある」とするが、実コードでは一致しない。寄せると回帰のため対象外。
- **ADR-006 DesignTokensForm の small/surface（BTN_SM_*/BTN_CLASS）と BTN_BASE 残置（スコープ限定・#425 固有）:** small は寸法（h-7）違いで受け皿なし、surface は pillBtn と一致するが named scope 外。BTN_BASE は残り 2 定数が参照するため残置。primary のみ最小差分で寄せる。

## リスクと注意点

- **data-primary 付け忘れ（最大リスク・無音退行）:** primary を使う 5 箇所（#1〜#5、上表参照）に確実に付与する。付け忘れると accent でなく surface 色になる。step 4 の grep 突合で機械的に検出。
- **landing SECONDARY に data-primary を誤付与しない:** SECONDARY（:143）は surface 系。属性を付けると accent 化する逆方向の退行。
- **DesignTokensForm の過剰スコープ化を避ける:** destructive / small / surface / BTN_BASE には触らない。primary 1 定数のみ削除。スコープを広げると視覚回帰（ghost→filled）・寸法回帰（h-7）を招く。
- **pillBtnTall 後勝ち（landing）:** h-12/px-8/text-md が base を上書きするのは生成 CSS 順依存（#416 ADR-005 で確認済み）。landing でも `pnpm build` で再確認。
- **未使用 import / 定数残骸:** 定数削除後に未参照 import や死蔵定数が残らないか typecheck + biome で検出。
- **意図的視覚変化は 3 点:** duration 120→150ms / active:scale 付与 / max-sm:min-h 付与。いずれも軽微。ブラウザ目視 + ADR 記録。

## テスト方針

- 自動: `pnpm typecheck` → biome（lint:fix / format / format:check は `./node_modules/.bin/biome`）→ `pnpm test`
- 生成 CSS 確認: `pnpm build` 後、landing の pillBtnTall（h-12/px-8/text-md）が base を上書き（後勝ち）しているか確認（#416 で確認済みだが consumer が landing に増えるため再確認）。
- 参照漏れ確認:
  - `grep -rn "BTN_PRIMARY_CLASS" app/components/admin --include="*.tsx"` が置換後ゼロ（4 ファイルとも定数削除）。
  - `grep -rn "HERO_BTN_PRIMARY\|HERO_BTN_SECONDARY" app/components/landing` が定義行のみ（合成への置換後）。
  - admin: `grep -rn "pillBtnPrimary" app/components/admin --include="*.tsx"` の各 className 行に `data-primary` が対応すること。landing は `HERO_BTN_PRIMARY` 定数経由のため上の「機械的突合」手順（:140 を目視）で確認。
- 手動（ブラウザ）:
  - landing `/`（未認証可）— signup/login の 2 ボタンで h-12 寸法・accent(signup)/surface(login) 色・hover/active・押下 scale・ガード（not-disabled）を確認。最も確認しやすい。
  - admin（要認証・`browser-verify-authed-routes` 手順）— 登録設定 / LLM 設定 / プロンプト / デザイントークンの各保存ボタンで accent 色・h-9 寸法・disabled(opacity-disabled)・hover/active・押下 scale を確認。DesignTokensForm は submit(primary, accent) と destructive(ghost) / surface(BTN_CLASS) が回帰なく共存することを確認。admin の server-function POST がブラウザで 403 になる場合は表示確認に留め、挙動は integration テストで担保。

## レビュー履歴

### 1周目（両視点とも問題点ゼロで終了）

要件カバレッジ・アーキ整合性の両レビュアーとも**問題点（要修正）ゼロ**。中核（admin 4ファイルの `BTN_PRIMARY_CLASS`／landing `HERO_BTN_*`）が実コードと完全一致し、`data-primary` 付与5箇所＋surface 1箇所も grep で裏取り済み、スコープ判断（destructive=ghost非対象／small=受け皿なし／surface=named scope外／BTN_BASE残置）も実コードと整合、と確認された。以下の改善提案のみ反映:

**取り込んだ改善提案**:
- **[S 要件]** landing の第3ローカル accent ピル `HEADER_CTA` を「含まれないもの」に明記（named scope 外・取りこぼし誤認防止）。
- **[S 要件/アーキ]** Issue 本文の `disabled:opacity-50` は stale（#419 で既に `opacity-disabled` 化済み）である旨を opacity 注記として追記。opacity ADR を立てない判断を明文化。
- **[S アーキ]** landing の `data-primary` 突合は `pillBtnPrimary` grep が定数定義行しか拾わないため、`HERO_BTN_PRIMARY` 経由で consumer（:140）を特定する補助手順に修正（step 4・テスト方針）。
- **[S アーキ]** `HERO_BTN_*` のローカル定数名を維持する（hoist しない）YAGNI 判断を step 3 に明記。
- **[S アーキ]** PromptsForm の `BTN_GHOST_CLASS` / `BTN_DESTRUCTIVE_CLASS`（ghost）が ADR-005 と同理由でスコープ外である旨を「含まれないもの」に明記。

**見送った提案**: なし（すべてスコープ内の記述精度向上で取り込み）。

2周目以降は実施せず（両視点とも要修正ゼロ、改善提案は記述精度のみで設計・要件問題なし。収束済みと判断）。

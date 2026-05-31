# 実装計画 — Issue #397: 管理画面のデザイントークン設定で既定値が表示されず「既定値を上書きする」UXになっていない

**Issue:** #397
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

`/admin/design` のデザイントークン設定で、ビルトインの既定値（キー＋値）がフォームに初期表示され、ユーザーが見えている既定値を編集して上書きできるようにする。上書きしていないトークンは引き続きビルトイン既定値が使われ、既定値と同値の行は DB に永続化されない。

prompts 機能（Issue #218）で確立済みの「`BUILTIN_*_DEFAULTS` を domain に SSOT として置き、DTO で既定値＋上書き値を `isOverridden` 付きで合成し、保存時は override だけを永続化する」パターンを design tokens にそのまま横展開する。

## スコープ

### 含まれるもの

- domain に「キー→既定値」マップ `BUILTIN_DESIGN_TOKENS` を新設（上書き対象トークンの SSOT）
- `BUILTIN_DESIGN_TOKENS` と `app/styles/tokens.css` の値整合を CI で検出する整合性テスト
- DTO で「既定値＋上書き値」を `isOverridden` 付きで合成（prompts の `prompts`/`promptDefaults` と対称）
- usecase（`updateDesignTokens`）で既定値と同値の行を除外してから永続化
- フォームを「既定値ベースの全行初期表示・上書き判定の可視化・既定に戻す」UX に変更
- `spec/design/tokens.md` / `spec/domains/adminSettings.md` の整合記述

### 含まれないもの

- **エクスポート CSS 注入の不具合**。本 Issue の UX とは独立した潜在バグであり、別 Issue として起票する（Phase 4）。本計画では一切 touch しない。起票時は**独立した2件の根本原因を別々に記述**する:
  1. `htmlRenderer.ts:61` の `--${escapeCssIdent(key)}` 二重前置 — 保存キーは VO regex で既に `--` 込みなので `----color-accent` になる
  2. `serverCloudflare.ts:607,666` で `exportDesignTokens` が `DEFAULT_EXPORT_DESIGN_TOKENS = Object.freeze({})` に固定配線され、そもそも DB の override 値が export パイプライン（`runExportJob.ts:274`）に流れていない
- ダークモード / テーマ拡張（spec §12 でスコープ外と確定済み）
- `tokens.css` の既定値そのものの変更（値は不変）

## 実装ステップ

### 1. domain に既定トークンマップを SSOT 化

- **対象ファイル:** `app/core/domain/adminSettings/defaults.ts`
- **変更内容:** `BUILTIN_DESIGN_TOKENS: Readonly<Record<string, string>>` を `Object.freeze({...})` で追加する。対象は `spec/design/tokens.md` §12 が定める上書き対象セクションに限定する:
  - Color: brand（6） — `--color-accent`, `--color-accent-hover`, `--color-accent-pressed`, `--color-accent-surface`, `--color-accent-surface-hover`, `--color-accent-ink`
  - Color: neutral（9） — `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-surface-elevated`, `--color-ink`, `--color-ink-secondary`, `--color-ink-tertiary`, `--color-hairline`, `--color-hairline-strong`
  - Radius（7） — `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`, `--radius-full`
  - Typography（1） — `--font-sans`
  - Color: code（4） — `--code-keyword`, `--code-string`, `--code-function`, `--code-number`
  - **除外:** `var(...)` 参照値（`--code-comment` = `var(--color-ink-tertiary)`, `--color-info`）と breakpoints（media-query 用リテラルで `:root` 上書き不可）。理由は ADR-002。
  - 各キーは VO regex `/^--[a-z0-9-]+$/` を満たす `--` 込み。各値は `tokens.css` の宣言と**文字列完全一致**で転記する。`--font-sans` は `tokens.css` の複数行宣言を1行に正規化する（VO は `\n` 禁止のため）。
- **理由:** 「キー→既定値」をコードから参照可能にする（Issue 対応方針1）。prompts の `BUILTIN_PROMPT_DEFAULTS` と同じ配置で一貫性を保つ。

### 2. 既定値マップと `tokens.css` の整合性テスト

- **対象ファイル:** `app/core/domain/adminSettings/__tests__/defaults.test.ts`（新規）
- **変更内容:** `app/styles/tokens.css` を `fs.readFileSync` で読み、`:root { ... }` ブロックの宣言をパースする（複数行宣言・末尾セミコロンに対応するため、宣言を `;` で分割し、各宣言は**最初の `:` で1回だけ分割**（`indexOf(':')`）して key/value を取り、空白を正規化）。`clamp()` 等で値内にカンマを含む宣言が tokens.css 全体には存在するため、`split(":")` 単純分割は使わない。`BUILTIN_DESIGN_TOKENS` の各キーについて:
  - `tokens.css` に同名宣言が存在し、値が空白正規化後に一致すること
  - 値が `DesignTokens.create({ tokens: { [key]: value } })` を通る（VO 制約を満たす）こと
  - 一方向検証（既定マップ→tokens.css）のみ行う。逆方向（tokens.css にあるが既定マップに無い）は「上書き対象外トークン」が大量にあり過剰検知になるため検証しない。
- **理由:** 手書き定数と CSS SSOT のドリフトを CI で機械検出し、二重管理の唯一の弱点を塞ぐ（Issue 対応方針4）。domain コードは CSS を読まず純粋なまま（テストだけが fs を使う）。

### 3. DTO に既定値と override 区別を追加

- **対象ファイル:** `app/core/application/dto/adminSettings.ts`
- **変更内容:** prompts と対称の形にする:
  - 型 `DesignTokenDTO = Readonly<{ value: string; isOverridden: boolean }>` を追加
  - `InstanceSettingsDTO.designTokens` を `Readonly<Record<string, string>>` → `Readonly<Record<string, DesignTokenDTO>>` に変更
  - `InstanceSettingsDTO.designTokenDefaults: Readonly<Record<string, string>>`（＝`BUILTIN_DESIGN_TOKENS`）を追加
  - `toInstanceSettingsDTO` で `BUILTIN_DESIGN_TOKENS` をベースに各キーを `{ value: 既定値, isOverridden: false }` で初期化し、`settings.designTokens.tokens` の override で上書き（`{ value: override値, isOverridden: true }`）。既定マップに無い override キーも `isOverridden: true` で含める。
- **理由:** フォームが「既定値ベース表示＋上書き判定」を描画できるようにする（Issue 対応方針2,3）。prompts の `prompts`/`promptDefaults`/`isOverridden` と対称で一貫。

### 4. usecase の保存時に「既定と同値の行を落とす」フィルタを追加

- **対象ファイル:** `app/core/application/adminSettings/updateDesignTokens.ts`
- **変更内容:** 受け取った `tokens` のうち、`BUILTIN_DESIGN_TOKENS[key]` と値が完全一致するエントリを除外してから `DesignTokens.create` に渡す。これにより「既定値そのままの行は DB に書かれない」（Issue 期待挙動）。`resetDesignTokens` は既存どおり（空に戻す）。
- **理由:** Issue 対応方針3。既定マップを知るのは domain の `BUILTIN_DESIGN_TOKENS`、import 方向は application→domain で正。domain の `DesignTokens` VO は「永続化される override 集合」という意味を純粋に保つ（既定マップ知識を持ち込まない）。

### 5. フォームの初期表示・保存・行操作を既定値ベースに変更

- **対象ファイル:** `app/components/admin/DesignTokensForm/Page.tsx`, `app/components/admin/DesignTokensForm/index.tsx`
- **変更内容:**
  - `Page.tsx`: `DesignTokensForm` に新 DTO（`settings.designTokens`: 合成済み, `settings.designTokenDefaults`）を渡す。
  - `index.tsx`:
    - 初期 `entries` を「合成済み designTokens の全キー」で構築する（既定キー全行＋既定外 override キー）。各行は `key`, `value`, `defaultValue`（既定マップの値, 既定外キーは `null`）, `isOverridden` を持つ。
    - 既定が常に表示されるため空状態 UI（`entries.length === 0`）は実質出ないが、防御的に残す。
    - **重要: design tokens は wholesale 置換であり、prompts の `resetPromptTemplateFn` のような per-key reset の usecase/domain 操作は存在しない**（`resetDesignTokens` は全消しのみ）。行の「既定に戻す」（`onRowRemove`）は、既定キー行では「その行の value を `defaultValue` に揃えた上で、全 entries を `updateDesignTokens` に再送（既定同値は usecase フィルタで落ちて override が消える）」で実現する。prompts の per-row reset パターンをそのまま流用しないこと。既定外 override キー行（`defaultValue === null`）では従来どおり行を削除して全 entries を再送（保存）。
    - 行ごとに `isOverridden`（既定キー行は value ≠ defaultValue、既定外 override 行は常に true）を `data-*` 属性で可視化し、prompts に揃えて「上書き中／既定」を表示する。既定キー行は既定値ラベル（`既定値: {defaultValue}`）を表示。**既定外 override キー行（`defaultValue === null`）は戻す先が無いため既定値ラベルは非表示、操作は行削除のみ**とする。
    - 保存: 既定値と同値・空値の行は送信しない（VO は空値不可。空＝既定に戻す意図）。残りを usecase に送り、usecase 側でも既定同値を除外する（二重防御）。
    - 説明文・空状態コピーを「既定値を上書きする」UX に合わせて更新する（`spec/design/tokens.md` への誘導文は残してよいが、既定値がフォームに見える旨を反映）。
  - スタイルは Tailwind utility-first・`data-*` variant の既存規約に従う（CLAUDE.md Styling）。
- **理由:** Issue の中心要件「既定値が見えて上書きできる」UX を実装（方針2,3）。

### 6. テスト更新

- **対象ファイル:** `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` ほか DTO/usecase 関連テスト
- **変更内容:**
  - `toInstanceSettingsDTO`: 「override 無し→全既定値が `isOverridden:false`」「override 有り→該当キーのみ `isOverridden:true`、他は既定」「既定外 override キーも surface される」をカバー。
  - `updateDesignTokens`: 「既定と同値の行は永続化されない」「既定と異なる行のみ保存」「既定外キーは保存」をカバー。
  - 既存の DTO 形に依存するテスト（`designTokens` を `Record<string,string>` 前提で読む箇所）を新型に追従。具体的には `adminSettings.integration.test.ts:1581` 付近の `settings.designTokens["--accent"]` を string 参照している箇所を `.value` 経由に修正する。`--accent` は curated subset 外キーなので、「既定外 override キーも `isOverridden:true` で surface される」ケースの実テストに転用する。
- **理由:** 回帰防止。

### 7. spec 整合

- **対象ファイル:** `spec/design/tokens.md`（§12 を補記）, `spec/domains/adminSettings.md`（あれば）
- **変更内容:** 「`BUILTIN_DESIGN_TOKENS` が上書き対象トークンの SSOT（値は `tokens.css` と整合テストで担保）」「既定値は UI に初期表示され override のみ永続化」を記述。`tokens.css` の値自体は変更しない。あわせて §12 の上書き対象が「Color: code セクション全体」ではなく、`var()` 参照値（`--code-comment` 等）を除く curated subset である旨と、その除外理由（参照値は編集時に意味が不明瞭）を明記する。
- **理由:** ドキュメント整合（Issue 対応方針4、影響範囲「spec/design/tokens.md との整合」）。

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001:** 既定値マップは手書き定数 + `tokens.css` 整合性テストで担保（ランタイム CSS パース / codegen は却下）
- **ADR-002:** 定義場所は domain `defaults.ts`、上書き対象は spec §12 の curated subset（`var()` 参照値と breakpoints は除外）
- **ADR-003:** 既定同値フィルタは application usecase に配置（domain VO は純粋に保つ）

## リスクと注意点

- **値の表記揺れ:** `tokens.css` は `rgba(60, 60, 67, 0.12)`（スペース有）、tokens.md §11 は `rgba(60,60,67,0.12)`（スペース無）等の揺れがある。整合性テストは **`tokens.css`（CSS SSOT）を基準**にし、`BUILTIN_DESIGN_TOKENS` の値を tokens.css の宣言と空白正規化後に一致させる（md とは比較しない）。`clamp(...)` のカンマ・スペースもそのまま転記。
- **`--font-sans` の VO 制約:** 値はフォントスタック（引用符・カンマ）で 512 文字以内・`[\n\r;{}]` 非含有を満たすが、`tokens.css` の複数行宣言を1行に正規化して定数化する必要がある。整合性テストも複数行宣言を空白正規化して比較する。
- **既定値に手で戻す操作:** ユーザーが override 後に手で既定値と同じ文字列に戻すと override が DB から消える。これは Issue 期待挙動どおりだが、UI コピー / `isOverridden` 表示で「既定に戻った」ことが分かるようにする。
- **既定マップに無い既存 override キー:** 過去に任意キーで保存された override は DTO マージで `isOverridden:true` として表示され続ける（消えない）。正しい挙動。
- **エクスポート二重前置バグは未修整:** 本計画では触らない。別 Issue 起票（Phase 4）。

## テスト方針

- **単体（domain）:** `defaults.test.ts` — `BUILTIN_DESIGN_TOKENS` 全キーが tokens.css と一致 & `DesignTokens.create` を通る。
- **単体（application）:** `toInstanceSettingsDTO` の合成、`updateDesignTokens` の既定同値除外。
- **手動/ブラウザ:** `/admin/design` で初回（override 無し）に既定値が全行表示／値を変えて保存→DB に override のみ／既定に戻すと override が消える／「すべてリセット」で全既定表示に戻る。agent-browser の serverfn POST は 403 になるため、保存系はボタン経由の手動確認 or integration test で担保（MEMORY 既知事項）。
- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`。biome は `./node_modules/.bin/biome` で format 確認（MEMORY 既知事項）。

## レビュー履歴

### 1周目: 両視点とも要修正は最小、改善提案を取り込み

**修正した点（要件カバレッジ視点）**:
- 問題点ゼロ（方針1〜4・期待挙動を全てカバー、スコープ逸脱なしと確認）

**修正した点（アーキ・リスク視点）**:
- P-001: design tokens には per-key reset の usecase/domain 操作が存在しない（`resetDesignTokens` は全消しのみ）。行の「既定に戻す」は wholesale `updateDesignTokens` 再送で実現する旨を Step 5 に明記。prompts の per-row reset を流用しない注意も追記。

**取り込んだ改善提案**:
- S-001(req): Step 6 に `adminSettings.integration.test.ts:1581` の `--accent` string 参照箇所を具体明記し、既定外 override surface ケースの実テストに転用。
- S-001(arch): Step 2 のパーサを「最初の `:` で1回だけ分割（`indexOf`）」と明記（clamp 等のカンマ値対策）。
- S-002(arch): Step 5 に `defaultValue === null`（既定外 override）行の UI 挙動（既定値ラベル非表示・削除のみ）を明記。
- S-003(req) / S-002,S-003(arch): エクスポートバグ起票は独立2件（二重前置 + DI 空配線）を別々に記述する旨をスコープ欄に明記。spec §12 補記に `--code-comment` 除外理由を含める旨を Step 7 に追記。

**見送った提案とその理由**:
- なし（全提案がスコープ内で妥当だったため反映）

両レビューとも要修正は P-001 の1件のみで、それを反映済み。計画は prompts の確立パターンと高精度で整合し、VO 制約・整合性テストの実現可能性も実機確認済み。

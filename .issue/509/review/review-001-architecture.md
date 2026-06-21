# レビュー — Issue #509 PR #769（Architecture / Styling 観点）

対象: PR #769（`app/components/export/` のデザイン未実装解消）
計画: `.issue/509/plan.md` / ADR: `.issue/509/adr.md`（ADR-001〜006）
検証: `pnpm typecheck` ✅ / `pnpm build` ✅（生成 CSS を実物 grep で裏取り）

総評: **APPROVE 相当**。ADR-004（status 色共通化）・ADR-006（`exportStatus.ts` 切り出し）・`Tone` 型の `common/styles.ts` への移動はいずれも設計どおりに実装され、二重定義は解消、admin / export 双方の参照も健全。スコープ（スタイリングのみ）を逸脱したロジック・構造変更の混入は無し。Blocker は無い。

## Architecture / Styling

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001] `exportStatus.ts` の置き場所・責務は ADR-006 / レイヤー規約と整合**
  場所: `app/components/common/exportStatus.ts`
  `exportStatusTag(status: ExportJobDTO["status"]): Tone` は純関数として `common/` に独立配置され、戻り値型 `Tone` のみ `common/styles.ts` から import している。これは ADR-006 の決定（DTO 依存を `styles.ts`〔JIT スキャン対象のリテラル群〕に持ち込まず、ロジックを別ファイルへ分離）に忠実。`styles.ts`（スタイル文字列定数）と `exportStatus.ts`（status→Tone ロジック）の責務分離は適切で、`app/components` が presentation 寄りという CLAUDE.md のレイヤー観とも矛盾しない（DTO は application 由来の型 import のみで、ロジックは UI 表示マッピングに閉じている）。admin / export 3 画面が同一関数を共有しており横断ヘルパとして `common/` 配置は妥当。

- **[N-002] `Tone` 型の移動・export と二重定義解消は完遂、参照破壊なし**
  場所: `app/components/common/styles.ts:291` / `app/components/admin/Jobs/index.tsx:21`
  `export type Tone = keyof typeof tagTone`（= `"info"|"success"|"warning"|"error"`）として SSOT 化され、admin/Jobs のローカル `type Tone` 宣言は削除・共通 import へ差し替え済み。`ingestionStatusTag`（L110）・`exportStatusTag` とも同一 `Tone` を返し、`STATUS_DOT_COLOR: Record<Tone, string>` も同型から導出。grep で旧ローカル `exportStatusTag` の残骸・他参照は無し。`pnpm typecheck` グリーン。二重定義（admin ローカル Tone と共通 Tone の併存）は解消されている。
  なお `app/components/admin/UsersTable/index.tsx:24` に別の `type Tone = "...|neutral"`（`neutral` を含む別形状）がローカル残存するが、これは `tagToneNeutral` を扱う UsersTable 固有の事情で `keyof typeof tagTone` と意味が異なり、本 PR のスコープ外。本 Issue の二重定義解消対象は admin/Jobs と export であり、その範囲は完了している。

- **[N-003] dot 色マッピングが Tone 経由で 4 系統に閉じ、`data-status` 多分岐を排除（ADR-004 達成）**
  場所: `app/components/export/styles.ts:97`（`STATUS_DOT_COLOR`）/ 使用箇所 `ExportJobsList/index.tsx:121`・`ExportJobDetail/index.tsx:135`
  チップは `tagBadge` + `tagTone[exportStatusTag(status)]`、dot は `STATUS_DOT_COLOR[tone]` と、両者が同一 `exportStatusTag` 戻り値から導出されており色マッピングの二重持ちが無い。`expired` は `cancelled` と同じ `warning` に集約（モックに無い色を新規決め打ちしない）。`processing` の pulse のみ status 値で個別判定しており、上書き順リスクのある `data-status` 6 分岐 CSS は採用していない。ADR-004 の意図どおり。

- **[N-004] `export/styles.ts` の hoisting パターンは既存 styles.ts 群と一貫**
  場所: `app/components/export/styles.ts`
  module-scoped const + JSDoc + 「common/layout の既存定数は再定義しない」明記という構成は `common/styles.ts`・`layout/styles.ts`・`note/list/styles.ts`・`public/styles.ts` の先例と同型。粒度・命名（`EXPORT_MAIN_FORM`/`_LIST`・`JOB_CARD`・`STATUS_DOT`・`PROGRESS_BAR` 等）はモック CSS クラス名に対応づけられ妥当。`EXPORT_MAIN_BASE` を共通化し max-width だけ 2 定数に分けるのも適切（720/1100 の差分のみ外出し）。`pillBtn*`/`ALERT*`/`tagBadge`/`checkboxRow`/`field*`/`EMPTY_STATE`/`PAGE_TITLE` 等は再定義せず流用しており、規約「共通定数への集約・再定義回避」に沿う。

- **[N-005] 新規リテラル px は意匠固有値に限定され、トークン代替可能な見落としは無し**
  場所: `app/components/export/styles.ts:26-27`（`max-w-[720px]`/`max-w-[1100px]`）, `:52`（`rounded-[7px]`）
  `--container-max` は 1280px で 720/1100 とは一致せず、tokens.css に該当 container トークンは存在しない（grep 確認）。720/1100 はトークン化されていない一意の意匠固有値であり arbitrary 持ち込みは正当（plan S-003）。`rounded-[7px]` は `note/list/styles.ts`・`public/styles.ts` に先例があり別途正当化不要。色・余白・角丸・影は概ねトークン由来ユーティリティ（`bg-surface`/`border-hairline`/`rounded-lg`/`rounded-pill`/`text-ink-secondary`/`opacity-disabled`/`tracking-tightest` 等）で、ハードコードすべき箇所を arbitrary で逃げている形跡は無い。`0_0_0_0.5px_rgba(0,0,0,0.04)`（segmented 影の第2レイヤー）はモック固有の極薄リングでトークン化対象外（ADR-005 で正当化済み）。

- **[N-006] 影トークン合成は lightningcss/var() 制約と矛盾しない（ビルドで実証）**
  場所: `app/components/export/styles.ts:52`（`data-[active]:shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]`）
  CLAUDE.md の lightningcss 制約は「`@media (width >= …)` 内の `var()` を minify が拒否する」ことに限定された話で、`box-shadow` 値の中の `var()` には適用されない。`pnpm build` が成功し、生成 CSS（`dist/client/assets/index-*.css`）に `var(--shadow-xs), 0 0 0 .5px …` が実在することを grep で確認済み。`--shadow-xs` の値（`0 1px 2px rgba(0,0,0,0.04)`、tokens.css L118）は ADR-005 の第1レイヤーと一致し、トークン一元管理と忠実再現を両立。生 rgba ベタ書きを避けるという ADR の意図も満たす。
  （補足: `public/styles.ts:113` は `data-[active]:shadow-xs`〔素のユーティリティ〕を使う先例だが、これは第2レイヤーの極薄リングを持たないケース。本 PR は 2 レイヤー合成が必要なため arbitrary 合成が妥当で、書き分けに問題は無い。）

- **[N-007] スタイリングのスコープを越えた構造・ロジック変更の混入は無し**
  検証: `git diff origin/main...HEAD` を export 3 コンポーネントで確認
  ハンドラ（`onSubmitSingle`/`onSubmitBulk`/`onCancel`/`onDownload`）・state・ポーリング・ネイティブ input は不変で、className 付与とインデント変更のみ。`ExportJobsList/index.tsx` の新規追加は `showProgressBar`/`pct` という**表示用の派生値**のみ（データフロー・分岐ロジックの変更ではない）。count span（`{processed}/{total}`）は全 status で維持され、進捗バーは `processing`＋`total>0` 時のみ別要素として追加（plan S-002「count をバーに置換しない」を遵守、`ExportJobsList/index.tsx:134-143`）。checkbox の DOM 出現順（FrontMatter→メディア）も維持され、`ExportForm.test.tsx` の `findMediaCheckbox()`（item(1)依存）を壊さない。

- **[N-008] DTO import 経路の二系統は同一型で実害なし（軽微な一貫性メモ）**
  場所: `exportStatus.ts:1`（`@/core/application/dto/export`）vs `ExportJobsList`/`ExportJobDetail`/`Page.tsx`（`@/core/application/export/view`）
  `export/view.ts` は `export type { ExportJobDTO }` で `dto/export` の型を再 export しているだけなので、両経路は同一型を指し型不整合は無い（typecheck グリーンで実証）。`exportStatusTag` が `dto/export` 直参照、UI コンポーネントが `export/view` 経由という揺れはあるが、これは本 PR 以前からのプロジェクト全体の import 経路の二重性であり、本 Issue で統一する必然性は薄い。将来 import 経路を一本化する場合の留意点として記録に留める（本 PR の修正対象としない）。

- **[N-009] ペア `data-*` 属性（S-001 沈黙バグ防止）は全箇所で付与済み**
  検証箇所: `ExportJobsList/index.tsx:171-197`・`ExportJobDetail/index.tsx:241-253`・`ExportForm/index.tsx:316,334`
  `pillBtnPrimary`→`data-primary=""`、`pillBtnDanger`→`data-danger=""`、`pillBtnGhost`→`data-ghost=""`、`pillBtnSmDense`→`data-sm=""` がそれぞれ漏れなく対で付与されている（詳細 `<Link>` 含む）。ADR-003 / plan S-001 で警告された「クラスは当たるが色が出ない沈黙バグ」は回避されている。

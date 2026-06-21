# レビュー — Issue #509 PR #769（Architecture / Styling 観点・Round 3 / フル再レビュー）

対象: PR #769（`app/components/export/` のデザイン未実装解消）
計画: `.issue/509/plan.md` / ADR: `.issue/509/adr.md`（ADR-001〜007）
前ラウンド: `.issue/509/review/review-002-architecture.md`（Blocker/Warning なし、APPROVE 相当・W-001 として meta 罫線分離を要請）

検証:
- `pnpm typecheck` ✅（exit 0）
- 最新コミット `fix(ui): #509 レビュー指摘対応（segmented focus / 共通定数 / meta 罫線）` を取得・確認
- `gh pr diff 769` で全差分取得、`styles.ts` / `exportStatus.ts` / `admin/Jobs/index.tsx` / `ExportJobsList` / `ExportJobDetail` を実物精査

総評: **APPROVE 相当**。Round 2 の W-001（meta グリッドの top-hairline を一覧側へ分離）は `JOB_META_DIVIDER` 定数の切り出しという妥当な形で正しく修正された。規約・hoisting パターン・スコープ・Tone 共通化・影トークン合成・`has-[:focus-visible]:` のいずれにも回帰・新規問題なし。Blocker・Warning なし。Note 4 件を記録する。

## Architecture / Styling

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001] W-001 修正（`JOB_META_DIVIDER` 切り出し）は正しく、罫線が一覧側のみに分離された**
  場所: `app/components/export/styles.ts:131-135`、`ExportJobsList/index.tsx:152`、`ExportJobDetail/index.tsx:130`
  従来 `JOB_META`（`grid …`）に `border-t border-hairline pt-3` を焼き込んでいたため、詳細ビューでは `<dl class={JOB_META}>` が `<section>` の最初の子（ページタイトル直下）に来て「上に何も無い宙に浮いた罫線」が出る退行があった。本修正で罫線＋ペア余白を `JOB_META_DIVIDER = "pt-3 mt-1 border-t border-hairline"` として切り出し、一覧側（`ExportJobsList`）だけが `` `${JOB_META} ${JOB_META_DIVIDER}` `` で合成、詳細側（`ExportJobDetail`）は素の `JOB_META` を使う構造になった。grep で `JOB_META_DIVIDER` の使用が一覧 2 箇所（import+適用）・詳細 0 箇所であることを確認。一覧ではカードヘッド/進捗/エラーの下にメタが来るため罫線が意味を持ち、詳細では `JOB_META` 単独で罫線が出ない。修正意図・JSDoc（L122-129「detail view では top hairline が宙に浮くので焼き込まない」）・実装が三者一致。`mt-1`（罫線とその上要素の間隔）を `JOB_META`（grid 内の `gap`）から切り離して divider 側へ寄せた分配も正しい。

- **[N-002] `JOB_META_DIVIDER` の hoisting は domain-styles モジュールの方針に整合（単一consumer でも妥当）**
  場所: `app/components/export/styles.ts:135`
  現状 `JOB_META_DIVIDER` の consumer は `ExportJobsList` 1 箇所のみ。一見「1 箇所だけなら定数にせずインラインでよいのでは」と見えるが、`export/styles.ts` は冒頭 JSDoc（L1-10）どおり「export 3 画面が共有する domain-specific repeating utility の SSOT」として設計されたモジュールで、`JOB_META` と対で意味を持つ罫線トークンを同モジュールに置くのは妥当。`JOB_META`（共有）と `JOB_META_DIVIDER`（一覧固有の付加）を**隣接定義 + JSDoc 相互参照**（`{@link JOB_META_DIVIDER}` / mock `.job-meta { border-top }`）で結んだことで、「なぜ罫線が分離されているか」が定数レベルで自己説明的になっている。`common/styles.ts` の `pillBtnSm` / `pillBtnSmDense`（base + 付加 add-on を隣接定義）と同じイディオム。リテラル文字列は JIT がスキャンするためビルド挙動はインラインと同一。新規規約逸脱なし。

- **[N-003] Tone 共通化・影トークン合成・`has-[:focus-visible]:`・スコープ厳守は Round 2 から回帰なし（再確認）**
  場所: `common/styles.ts:291`(`Tone`)、`common/exportStatus.ts`、`export/styles.ts:58,103-108`、`admin/Jobs/index.tsx:15,21`
  - **Tone SSOT**: `export type Tone = keyof typeof tagTone`（`common/styles.ts:291`）が単一定義。`exportStatus.ts` は `Tone` のみ import（値依存なし）、`STATUS_DOT_COLOR: Record<Tone, string>`（`export/styles.ts:103`）も `Tone` で型付けされ 4 系統に閉じる。`admin/Jobs/index.tsx` はローカル `type Tone` を持たず共通 `Tone`（L21 import）を参照、`ingestionStatusTag`（L110）も同 `Tone` を返す。二重定義なし。
  - **`exportStatusTag` のスコープ**: `common/exportStatus.ts` に純関数として独立（DTO `ExportJobDTO["status"]` 依存を styles.ts に持ち込まない＝ADR-006 どおり）。admin/Jobs（L15）と export 3 画面が同一関数を共有し、横依存（admin→export）も解消済み。`expired`→`warning` の畳み込みも ADR-004 の表と一致。
  - **影トークン合成**: `SEGMENTED_BTN`（L58）の `data-[active]:shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]` は ADR-005 どおり第1レイヤーをトークン変数経由、第2レイヤーのみ arbitrary。生 rgba のベタ書き回避を維持。
  - **`has-[:focus-visible]:`**: `SEGMENTED_BTN`（L58）の `has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent` は ADR-007 どおり。CLAUDE.md の lightningcss 制約（`@media` 内 `var()` のみ）とは無関係で逸脱なし。
  - **ペア `data-*` 属性**: 一覧の行アクション（`ExportJobsList/index.tsx:172,184,196`）は `pillBtnPrimary`/`pillBtnDanger`/`pillBtnGhost` に対し `data-primary=""`/`data-danger=""`/`data-ghost=""` を漏れなく付与（ADR-003 の沈黙バグ回避要件を満たす）。`data-active={…|| undefined}`・status dot の `aria-hidden` も ADR-003 どおり。
  - **リテラル px**: `max-w-[720px]`/`max-w-[1100px]`/`rounded-[7px]` は `--container-max`(1280) と不一致の意匠固有値で正当（plan S-003、`styles.ts:14-24` JSDoc に根拠記載）。

- **[N-004] N-001（publication の `focus-within:` 先例不一致）は Round 2 から不変・本 PR スコープ外で据え置き妥当**
  場所: `export/styles.ts:58`（`has-[:focus-visible]:`）vs `publication/styles.ts`（`RADIO_CARD` の `focus-within:`）
  Round 2 N-001 で指摘した「sr-only radio 内包 label のフォーカスリング」手法の二系統分岐（export=`has-[:focus-visible]:` / publication=`focus-within:`）は本 PR で変化なし。export 側の `has-[:focus-visible]:` 採用は ADR-007 どおり正しく、publication の修正は別 Issue で本 PR で直す必然性は薄い（スコープ厳守）。将来共通化時は ADR-007 の `has-[:focus-visible]:` を正とする方針を引き続き記録に残す。本 PR のマージは妨げない。

## Round 2 指摘の解消確認

- **W-001（meta グリッドの top-hairline 分離）**: 解消済み（N-001）。`JOB_META_DIVIDER` 切り出しにより詳細ビューの宙吊り罫線が消え、一覧ビューのみ罫線が出る。
- Round 1/Round 2 の Note（配置・Tone SSOT・dot 4 系統・影合成・スコープ・ペア `data-*`）はいずれも本 Round 差分で破壊されていないことを再確認（N-003）。

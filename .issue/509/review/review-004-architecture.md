# レビュー — Issue #509 PR #769（Architecture / Styling 観点・Round 4 / フル再レビュー）

対象: PR #769（`app/components/export/` のデザイン未実装解消）
計画: `.issue/509/plan.md` / ADR: `.issue/509/adr.md`（ADR-001〜007）
前ラウンド: `.issue/509/review/review-003-architecture.md`（Blocker/Warning なし、APPROVE 相当）

検証:
- `pnpm typecheck` ✅（exit 0）
- 最新コミット `d5653060 fix(ui): #509 ジョブ詳細の空アクション行の罫線を抑止` を取得・確認（Round 3 W-001 修正）
- `gh pr diff 769` で全差分取得。`CLAUDE.md` / `common/styles.ts` / `common/exportStatus.ts` / `export/styles.ts` / `admin/Jobs/index.tsx` / `ExportJobDetail` / `ExportJobsList` を実物精査
- W-001 修正は `df8cc3be`（fix 前）との `git show` 差分で挙動を突き合わせ

総評: **APPROVE 相当**。Round 3 W-001（`ExportJobDetail` の `JOB_ACTIONS` ラッパ div を条件描画化）は、3 つの子条件の和集合をそのままガード式にするという過不足のない形で正しく修正された。規約・hoisting・リテラル px・影トークン合成・`has-[:focus-visible]:`・スコープのいずれにも回帰・新規問題なし。Blocker・Warning なし。Note 3 件を記録する。

## Architecture / Styling

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001] W-001 修正（`JOB_ACTIONS` の条件描画化）はガード式が子条件の和集合と完全一致しており過不足なし**
  場所: `app/components/export/ExportJobDetail/index.tsx:236-266`
  修正前は `<div className={JOB_ACTIONS}>` が無条件描画で、`failed`/`cancelled`/`expired`（status）など全子要素が `null` になる状態でも `border-t pt-3`（`JOB_ACTIONS` 定数に焼き込まれた上罫線＋上パディング）だけが残り、中身ゼロの宙吊り罫線が出る退行があった。本修正は `canDownload || isActive || (isCompleted && isExpiredByClock)` をラッパに付与。この 3 項は内部の 3 つの条件付き子（`canDownload`→ダウンロード、`isActive`→キャンセル、`isCompleted && isExpiredByClock`→期限切れ注記）の述語と**逐語一致**しており、「子が 1 つでも出るなら div を出す／全滅なら div ごと消す」が正確に成立する。over-guard（子は出るのにラッパが消える）も under-guard（子は全滅なのにラッパが残る）も無い。`message`（`formError`）・「一覧へ戻る」Link はラッパ外（L268-278）に独立しているため、エラー表示・戻り導線がガードに巻き込まれて消える回帰も無い。

- **[N-002] 罫線抑止の方式が一覧側（`JOB_META_DIVIDER`）と整合し、`JOB_ACTIONS` 定数本体は不変**
  場所: `export/styles.ts:145-146`、`ExportJobsList/index.tsx:167-201`、`ExportJobDetail/index.tsx:237`
  W-001 は「定数から `border-t` を剥がす」のではなく「中身が無いときは要素ごと描かない」で解いた。これは Round 3 の `JOB_META`／`JOB_META_DIVIDER` 分離（罫線を定数から切り離す方式）とは別アプローチだが妥当である。`JOB_META` は詳細・一覧の双方が共有し罫線の要否が画面で割れるため定数分離が必要だったのに対し、`JOB_ACTIONS` の罫線（カードヘッド/メタ/エラーの下に来るアクション帯の上罫線）はどちらの画面でも「アクションがあるなら出す／無いなら帯ごと無い」で意味が一貫するため、定数を割らず描画ガードで畳むのが素直。`JOB_ACTIONS` 定数自体（`border-t border-hairline …`）は無変更で、一覧側の `JOB_ACTIONS` は常に「詳細」Link（無条件）を子に持つため空にならず、一覧側にガードを足す必要も無い（L192-200）。両画面で `JOB_ACTIONS` の使い方が破綻していないことを確認。回帰なし。

- **[N-003] Tone 共通化・影トークン合成・`has-[:focus-visible]:`・ペア `data-*`・スコープ・リテラル px は Round 3 から回帰なし（ゼロベース再確認）**
  場所: `common/styles.ts:291`、`common/exportStatus.ts`、`export/styles.ts:57-58,103-108,135,146`、`admin/Jobs/index.tsx:15,21`
  - **Tone SSOT**: `export type Tone = keyof typeof tagTone`（`common/styles.ts:291`）が単一定義。`exportStatus.ts`・`export/styles.ts`（`STATUS_DOT_COLOR: Record<Tone, string>`、4 系統に閉じる）・`admin/Jobs/index.tsx`（L21 で共通 `Tone` を import、ローカル `type Tone` 不在）すべてが共通型を参照。二重定義なし。
  - **`exportStatusTag` のスコープ/配置**: `common/exportStatus.ts` に純関数として独立（`ExportJobDTO["status"]` 依存を `styles.ts` に持ち込まない＝ADR-006）。admin/Jobs と export 3 画面が同一関数を共有、`expired`→`warning` の畳み込みも ADR-004 表と一致。横依存（admin→export）解消済み。
  - **影トークン合成**: `SEGMENTED_BTN`（L58）の `data-[active]:shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]` は ADR-005 どおり第1レイヤーをトークン変数経由、第2レイヤーのみ arbitrary。生 rgba ベタ書き回避を維持。
  - **`has-[:focus-visible]:`**: `SEGMENTED_BTN`（L58）の `has-[:focus-visible]:outline/outline-2/outline-accent` は ADR-007 どおり。CLAUDE.md の lightningcss 制約（`@media` 内 `var()` 限定）と無関係で逸脱なし。
  - **ペア `data-*` 属性**: 一覧の行アクション（`ExportJobsList/index.tsx:172,184,196`）は `data-primary`/`data-danger`/`data-ghost` + `data-sm` を漏れなく付与、詳細のアクション（`ExportJobDetail/index.tsx:242,254`）も `data-primary`/`data-danger` を付与（ADR-003 の沈黙バグ回避要件を満たす）。`data-active={…|| undefined}`・status dot の `aria-hidden`・進捗バー `role="progressbar"` の aria も維持。
  - **リテラル px / 影響範囲**: `max-w-[720px]`/`max-w-[1100px]`/`rounded-[7px]` は `--container-max`(1280) と不一致の意匠固有値で正当（plan S-003、`styles.ts:14-24` JSDoc に根拠）。W-001 修正は `ExportJobDetail` の 1 箇所のみで `styles.ts` には触れておらず、共有定数経由の波及なし。

## Round 3 指摘の解消確認

- **W-001（`ExportJobDetail` の空 `JOB_ACTIONS` 行の宙吊り罫線）**: 解消済み（N-001）。`canDownload || isActive || (isCompleted && isExpiredByClock)` ガードで、全子要素が `null` のとき（`failed`/`cancelled`/`expired` 等）にラッパ div ごと描画されなくなり、中身ゼロの上罫線が消えた。ガード式は内部 3 子の述語と逐語一致し過不足なし。
- Round 1〜3 の Note（配置・Tone SSOT・dot 4 系統・影合成・スコープ・ペア `data-*`・`JOB_META_DIVIDER` 分離）はいずれも本 Round 差分で破壊されていないことを再確認（N-002/N-003）。

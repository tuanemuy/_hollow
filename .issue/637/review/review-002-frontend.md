# PR #651 レビュー — Frontend 観点（review-002 / Round 2）

対象: PR #651 `feat(ui): 高度なローディングUX — アップロード進捗・失敗リトライ導線・useFormStatus（#634 Phase 3）`
計画: `.issue/637/plan.md` / ADR: `.issue/637/adr.md`
前回: `.issue/637/review/review-001-frontend.md`（Blockers 0 / Warnings 2 / Notes 6）

## サマリー

- Blockers: 0 / Warnings: 0 / Notes: 4
- Round 1 の Warning 2 件はいずれも解消済み（W-001 ドキュメント整合、W-002 は ADR 範囲内の非必須事項 + `primary` prop での footgun ハードニング）。
- Round 1 修正で追加された `SubmitButton` の `primary` prop は新たな回帰を生んでいない。実在 3 呼び出し（`SecurityForm` / `ProfileForm` / `ShareLinkGate`）はすべて primary pill（`BTN_PRIMARY` / `GATE_SUBMIT` = `pillBtn + pillBtnPrimary`）であり、既定 `primary=true` が出す `data-primary=""` が `data-[primary]:` accent variant を正しく発火させる。non-primary 用途は現状コードに無く、`primary={false}` で打ち消せる経路もテスト済み。
- DoD 3 点（リトライ一貫化 / 進捗可視化 / `useFormStatus` 整理）は計画・ADR どおり充足。`pnpm typecheck` green、`pnpm test:unit` 3554 件 green、biome check（変更 common ファイル）green。

## Frontend

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Round 1 W-001（ドキュメントの「スライド」表記）解消を確認。`docs/frontend_implementation_example.md:854`「`ProgressBar`（indeterminate＝部分幅バーのパルス）」、`:861-863`「パルス（`Skeleton` と同じ motion 言語）」「Tailwind 標準の `animate-pulse` で完結（#635 ADR-001 / #637 ADR-004）」と実装（`ProgressBar.tsx:85` `motion-safe:animate-pulse`）・ADR-004 に整合。`ProgressBar.tsx` の JSDoc（L8-17, L26-32）も同一ファイル内でパルス表記に統一され、Round 1 で指摘した「スライド」残存は無くなっている。後続実装者が `@keyframes` 追加（#635 ADR-001 違反）へ走るリスクは解消。

- **[N-002]** Round 1 で追加された `SubmitButton` の `primary` prop（`SubmitButton.tsx:31,48`）が回帰を生んでいないことを確認。`primary` 既定 `true` → `data-primary=""` 出力、`primary={false}` → 属性なし、を `SubmitButton.test.tsx:78-96` がカバー。実呼び出し（`SecurityForm` L328-332/L399-403、`ProfileForm` L413-418/L486-490、`ShareLinkGate` L183-188）はいずれも primary 系 className のため `data-primary` 残留が正しく accent を当て、footgun は生じない。Round 1 で核心だった pending 経路テスト（`<form action>` in-flight で pendingLabel / `disabled` / `aria-busy` 反映 → resolve で idle 復帰）も `SubmitButton.test.tsx:102-140` で追加済みで、DoD-3 の実証になっている。

- **[N-003]** Round 1 W-002（ShareLinkGate の prop drilling 半解消）は ADR-003 Consequences が「複合 pending 条件のボタンは form-pending 以外が prop に残り、完全な prop 削減にはならない」と明示済みの範囲。`ShareLinkGate/index.tsx` で送信ボタンは `SubmitButton`（`useFormStatus`）に切り出され（L183-188）、`isPending` は `<input disabled={isPending || isLocked}>`（L168）のために View へ残るのみ。input の disable は「フォーム submit 中は入力も止めたい」という別意図で、ここを二重に子コンポーネント化する利は小さく現状維持が妥当。機能・a11y（`aria-invalid` / `aria-describedby` 分岐）にも問題なし。必須対応なし。

- **[N-004]** ルート `errorComponent` 統一が Round 1 から維持されている。`_app` 配下のリーフ 13 ルートはすべて `RouteErrorFallback`（`routerInvalidate(router)` リトライ、`_app` シェル除外）に置換され、`_app/route.tsx`（`AppErrorFallback` = シェル境界・`appShellInvalidate`）と `settings/route.tsx`（専用 `SETTINGS_ERROR_*`）のみが ADR-002 どおり意図的除外。二重構造（シェル用 / リーフ用）の意味分離は規約どおりで、リトライ導線・見た目の一貫化（DoD#4）を満たす。`IngestionQueue` の手動 tick（`retryNow` + `scheduleNowRef` + `inflightRef`/`fatalRef` ガード）、`RetryableError` の `error.retryable !== false` 集約ガード、`UploadDialog` の件数 determinate 進捗 + `decorative` による二重読み上げ回避も Round 1 から不変で健全。
</content>
</invoke>

# PR #651 レビュー — Test・計画/DoD整合

**対象 PR:** #651（feat(ui): 高度なローディングUX — アップロード進捗・失敗リトライ導線・useFormStatus / #634 Phase 3）
**ブランチ:** issue/637/advanced-loading-ux
**観点:** Test カバレッジ・既存テスト回帰・DoD 整合・plan.md ステップ完遂
**実施日:** 2026-06-12

## 検証サマリー

- `pnpm test:unit` 全 3551 件パス（224 ファイル）を実機確認。新規 3 ファイル（ProgressBar / RetryableError / SubmitButton）＋更新 2 ファイル（IngestionQueue / UploadDialog）を精読。
- DoD 3 項目は実装としては満たされている。ただし **DoD-3（`useFormStatus` フォームフィードバック）と DoD-1 の一部（アップロード件数進捗の進行）について、新挙動の中核分岐を直接検証するテストが欠落**している。実装は正しいが「テストで担保されている」とは言い切れない箇所がある。
- plan.md のステップ（RouteErrorFallback 差し替え、MediaUploader 言語統一）は完遂を確認。

## Test・計画/DoD整合

### Blockers

なし

### Warnings

#### [W-001] `SubmitButton` の pending 分岐（useFormStatus の本質挙動）が未テスト — `app/components/common/__tests__/SubmitButton.test.tsx`

`SubmitButton.test.tsx`（78 行・3 ケース）は「idle ラベル＋enabled」「`disabled` prop の OR 合成」「`className`」のみを検証し、コメントにもある通り `useFormStatus().pending` は常に `false` の経路しか踏んでいない。

しかし本コンポーネントの存在意義＝DoD-3 の中核は「フォーム送信中に `pendingLabel` 表示＋`disabled`＋`aria-busy=true` へ切り替わる」という **pending===true 分岐**であり、これを実行するテストが 1 件も無い。手動テスト（report.md TC-3）も idle 描画のみで pending 動的挙動はユニットに委ねると明記されているため、結果として pending 反映はどの自動テストでも検証されていない。

これは「ユニットで担保できない制約」ではない。`app/components/auth/__tests__/LoginForm.test.tsx` は `form.requestSubmit()` ＋未解決の action promise で実際に pending 状態を再現しており（`submit()` ヘルパ）、同手法を `<form action={deferredAction}><SubmitButton .../></form>` に適用すれば pending ラベル／`disabled`／`aria-busy` を直接 assert できる。plan.md ステップ9・testing.md「SubmitButton: useFormStatus pending 反映」が要求する検証に正面から欠ける。

**提案:** 未解決 promise を返す action を持つ `<form action>` に `SubmitButton` を入れて `requestSubmit()` し、pending 時に `textContent === pendingLabel` / `disabled === true` / `aria-busy === "true"` を assert するケースを追加する。

#### [W-002] アップロード件数進捗の「進行」（done が 0→中間→完了へ動く／determinate ProgressBar の value）が未検証 — `app/components/ingestion/__tests__/UploadDialog.test.tsx`

ADR-001 が「実数が取れる唯一の箇所」と位置づける複数ファイルの件数進捗（ステップ3）について、テストは開始時 `"2 件中 0 件をアップロード"`（line 1033、更新済み）と最終 `"2 件中 2 件をキューに追加しました"` の 2 点しか見ておらず、ループ途中で `done` が 1 に増えた中間状態（`"2 件中 1 件をアップロード..."`）と、それを反映する `<UploadingView done>` の determinate `ProgressBar`（`value={percent}` ＝ 50%）が一度も assert されていない。

すなわち本 PR の新規実装の核（逐次ループ中に `setView({...done})` が live で進む・`percent` が中間値を取る）が回帰検出されない。1 件目 resolve 後 2 件目 resolve 前に status を読めば中間値を確認できる（既存テストの段階的 resolver 制御がそのまま使える）。なお `ProgressBar.test.tsx` 側は `value=40` で `aria-valuenow` を検証しているが、`decorative` で使う UploadDialog 経路（aria-hidden・幅 style）の結線は別問題。

**提案:** 多ファイルアップロードのループ途中で「`N 件中 1 件をアップロード`」が出ること、および `ProgressBar` が 50% 相当の幅で描画されること（または `done` prop 反映）を assert するケースを追加する。

#### [W-003] `RetryableError` 導入による IngestionJobRow の二重「再試行」ボタンがテストで区別されていない — `app/components/ingestion/__tests__/IngestionJobRow.test.tsx:226`

`failedJob` カードはもともと owner 向け「再試行」ボタン（`ownerRetry`）を持つ。今回インライン error 表示を `RetryableError` に置換したことで、retry 失敗後は **同じ「再試行」ラベルのボタンが 2 つ**（owner-retry ＋ RetryableError の onRetry）レンダされ得る。当該テスト（"does not call router.invalidate and shows an inline error when 再試行 fails"）は失敗 *前* に `find(b => textContent === "再試行")` で owner ボタンを掴むため現状は緑だが、ラベル衝突を区別する assert が無く、将来 `RetryableError` 経由の再 retry を踏むと意図せぬボタンを掴むリスクがある。テスト自体は通っているので回帰の緩めではないが、IngestionJobRow に追加された `RetryableError`（`onRetry={lastAction}`・`isRetrying`）の新経路は **専用の assert が無い**（line 251-258 は「いずれかの alert に文言が出る」までしか見ない）。

**提案:** RetryableError 由来の再試行ボタンを owner ボタンと区別（例: 親要素 role や近接テキストで絞る）し、`lastAction` 再実行が走ることを 1 ケース足す。最低限、二重ボタンが許容仕様であることをコメントで明示する。

### Notes

#### [N-001] `ProgressBar` / `RetryableError` の新規ユニットは要求カバレッジを良く満たす

- ProgressBar: indeterminate 既定（`aria-busy`・`aria-valuenow` 無し）／determinate（`aria-valuenow`/min/max）／クランプ＋100% で `aria-busy=false`／`decorative`（role 無し・aria-hidden）／`motion-safe:animate-pulse`／custom label・className を網羅。plan の要求項目（indeterminate/determinate/decorative/motion）を満たす。
- RetryableError: メッセージ表示／onRetry 無しで非表示／onRetry 有り＋click 発火／`retryable===false`（fatal）でガード抑制／`isRetrying` で disabled＋aria-busy を網羅。S-002 ガードを正確に検証している。

#### [N-002] IngestionQueue の回帰更新は新挙動を正しく締めている（緩めていない）

fatal（unauthorized）時は「認証が必要です」を出しつつ「今すぐ再取得」を **出さない** ことを `.not.toContain` で明示（line 212-213）、非 fatal（notFound 3 連続）では文言＋「今すぐ再取得」両方を assert（line 264-265）。`pollFatal` ／ `onRetry={pollFatal ? undefined : retryNow}` の分岐を表裏で押さえており、testing.md の「fatal でリトライを出さない」を担保。文言 assert を旧「進捗の自動更新に失敗しました」固定文から `displayError` 実文言（kind 別）へ更新した点も適切。

#### [N-003] RouteErrorFallback 差し替え（plan ステップ6）は完遂

ベア `errorComponent` を持つ `_app` 子ルート 13 ファイル（index/tags/trash/upload/notes 各種/exports 各種/views/history 各種/edit）を `RouteErrorFallback` に統一。リトライは `routerInvalidate(router)`（`_app` 除外）で ADR-002 と一致。`_app/route.tsx` の `AppErrorFallback`（`appShellInvalidate`）は据え置き＋既存テスト `AppErrorFallback.test.tsx` も緑で、シェル境界と子ルートの分離が保たれている。`settings/route.tsx` の専用スタイル除外も計画通り。ただし `RouteErrorFallback` 自体の専用ユニットテストは無い（AppErrorFallback にはある）。retry の `routerInvalidate` 呼び出し・`isPending` 中 disabled を 1 ケース足すと対称性が取れる（任意）。

#### [N-004] MediaUploader の言語統一（plan ステップ5/7b）は「現状維持＋RetryableError 寄せ」を選択し完遂

7b（XHR 実バイト進捗）は ADR 通り見送り、error 表示を手書き `<div role="alert">` から `RetryableError`（`onRetry={lastFile !== null ? onRetry : undefined}`）へ置換。個別ファイル再試行の既存挙動を保ったまま言語統一しており plan 準拠。ただし MediaUploader にはそもそもユニットテストが存在せず（PR 前後とも）、この置換は自動検証外。回帰の緩めではないが新規カバレッジも無い。

#### [N-005] `error.retryable !== false` 既定の妥当性

`retryable` は optional で、`forbidden`/`unauthorized`/`validator`（transport shape）が `false` を持つ。それ以外（business/system 等）は `undefined`＝「`!== false`」で retry を出す既定。RetryableError テストの `systemError`（retryable 未指定）でボタンが出る挙動と一致しており、ガード設計は妥当。意図的な「fatal のみ抑制」になっている。

## 結論

DoD 3 項目・plan の全ステップは実装レベルで完遂を確認。新規 3 コンポーネントのうち ProgressBar / RetryableError はテストが要求カバレッジを良く満たす。一方、**`useFormStatus` の pending 反映（W-001）とアップロード件数進捗の進行（W-002）という、本 PR で新規追加した動的挙動の中核が自動テストで未検証**で、既存の auth テスト手法（`requestSubmit` ＋未解決 promise）でユニット化可能なため「ユニット不向き」を理由にできない。Blocker ではないが、DoD を「テストで担保」と言うには W-001/W-002 の追補が望ましい。回帰更新（IngestionQueue / UploadDialog）は新挙動を正しく締めており、不要な緩めは無い。

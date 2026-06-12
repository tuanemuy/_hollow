# PR #651 レビュー Round 2 — Test・計画/DoD整合

**対象 PR:** #651（feat(ui): 高度なローディングUX — アップロード進捗・失敗リトライ導線・useFormStatus / #634 Phase 3）
**ブランチ:** issue/637/advanced-loading-ux
**観点:** Test カバレッジ・既存テスト回帰・DoD 整合・plan.md ステップ完遂
**実施日:** 2026-06-12
**前提:** Round 1（review-001-test.md）の W-001 / W-002 / W-003 修正後の再レビュー

## 検証サマリー

- `pnpm vitest run` で対象 6 ファイル（SubmitButton / ProgressBar / RetryableError / UploadDialog / IngestionJobRow / IngestionQueue）= 68 件パスを実機確認。
- Round 1 の 3 件の Warning（W-001 SubmitButton pending 経路 / W-002 件数進捗の中間値 / W-003 IngestionJobRow の RetryableError 経路）は **いずれも適切に修正済み**で、緩すぎ・偽 green ではないことを実装と突き合わせて確認。
- DoD 3 項目（①失敗時エラー表示・リトライ導線の一貫 ②進捗可視化 ③useFormStatus フォームフィードバック整理）は実装＋テストの双方で担保されている。
- 新規 Blocker・新規 Warning は無し。残課題は任意改善（Note）のみ。

## Test・計画/DoD整合

### Blockers

なし

### Warnings

なし

#### Round 1 指摘の対応確認（すべて解消）

- **[W-001 解消] SubmitButton の pending 分岐** — `SubmitButton.test.tsx:102-140`。未解決 promise を返す `action` を持つ `<form action={action}>` に `SubmitButton` を入れ、`form.requestSubmit()` 後に pending 窓を観測する正攻法を採用。`textContent === "保存中..."` / `disabled === true` / `aria-busy === "true"` を pending 中に assert し、`resolveAction()` 後に idle へスナップバック（`"保存"` / enabled / `aria-busy === "false"`）まで検証。`SubmitButton.tsx:41-52` の `pending ? pendingLabel : label` / `disabled={pending || disabled}` / `aria-busy={pending}` の **pending===true 経路を実際に踏んでいる**。Round 1 が「ユニット化可能」と指摘した手法（auth テストの `requestSubmit` + 未解決 promise）に正しく当てており、偽 green ではない。加えて `data-primary` の既定/`false` 切替ケースも追加されており、`useFormStatus` 中核挙動の回帰検出力が確立。

- **[W-002 解消] アップロード件数進捗の中間値** — `UploadDialog.test.tsx:1026-1093`。`uploadMock` を resolver を配列に積む手動制御 promise に置き換え、(1) 開始時 `"2 件中 0 件をアップロード"` ＋ `uploadProgressPercent() === 0`、(2) **1 件目のみ resolve した中間状態で `"2 件中 1 件をアップロード"` ＋ `uploadProgressPercent() === 50`**、(3) 2 件目 resolve 後 `"2 件中 2 件をキューに追加しました"` の 3 点を assert。`uploadProgressPercent()`（`UploadDialog.test.tsx:155-165`）は `[aria-hidden="true"] > div[style*="width"]` から実 `width: N%` を読み出すヘルパで、`UploadDialog.tsx:842,850` の `percent = Math.round((done/total)*100)` → determinate `ProgressBar value={percent} decorative` の結線を実検証している。`submitFiles` の逐次ループ（`UploadDialog.tsx:446,450` の `done += 1; setView({...done})`）が live で進む核挙動を、中間値 50% で締めている。`MAX_FLUSH` 上限付きのマイクロタスク drain で無限ループ耐性も確保。Round 1 が指摘した「0 → 最終の 2 点しか見ない」緩さは解消。

- **[W-003 解消] IngestionJobRow の RetryableError 二重「再試行」ボタン区別** — `IngestionJobRow.test.tsx:266-329`。owner 向け「再試行」（`IngestionJobRow.tsx:261`、`data-sm` 無し）と RetryableError 由来の「再試行」（`RetryableError.tsx:47-48`、`pillBtnSm` + `data-sm=""`）を **`data-sm` 属性で曖昧性なく区別**する専用ケースを追加。失敗前は 1 件（owner, `data-sm` null）、`ownerRetry` 失敗後は 2 件に増えること、RetryableError ボタンが自身の `role="alert"` 内（`再試行に必要なデータが見つかりません` 文言を含む別 alert）に属すること、そのボタン click で `lastAction`（= owner retry, `IngestionJobRow.tsx:81,157-158,294` の `onRetry={lastAction ?? undefined}`）が **2 回目**実行されることを assert。`data-sm` の出所も `styles.ts` の `pillBtnSm`（`data-[sm]:` 変種）に実在し、区別は装飾でなく構造的。Round 1 が懸念した「ラベル衝突で意図せぬボタンを掴むリスク」は属性ベースの絞り込みで除去され、インライン retry 新経路の回帰検出力が付いた。

### Notes

#### [N-001] 新規 3 コンポーネントのユニットは要求カバレッジを満たす（Round 1 N-001 を踏襲・再確認）

- `ProgressBar.test.tsx`: indeterminate 既定（`aria-busy=true` / `aria-valuenow` 無し / `aria-label="処理中"`）、`motion-safe:animate-pulse` ガード、determinate（`aria-valuenow`/min/max）、クランプ＋100% で `aria-busy=false`、`decorative`（role 無し・`aria-hidden`）、custom label/className を網羅。`ProgressBar.tsx` の全分岐（determinate/indeterminate/decorative）を踏む。
- `RetryableError.test.tsx`: メッセージ表示 / onRetry 無しで非表示 / onRetry 有り＋click 発火 / `retryable===false`（fatal）でガード抑制 / `isRetrying` で disabled＋aria-busy。`RetryableError.tsx:40` の `showRetry = onRetry !== undefined && error.retryable !== false` ガードを表裏で締めている。

#### [N-002] IngestionQueue の回帰更新は新挙動を正しく締めている（緩めていない）

`IngestionQueue.test.tsx`。fatal（unauthorized, 212-213）は `認証が必要です` を出しつつ `今すぐ再取得` を **`.not.toContain`** で抑制、非 fatal（notFound 3 連続, 264-265）は文言＋`今すぐ再取得` 両方を assert。`pollFatal ? undefined : retryNow` 分岐を表裏で押さえ、testing.md「fatal でリトライを出さない」を担保。

#### [N-003] RouteErrorFallback の専用ユニットテストは依然無し（任意・Round 1 N-003 から不変）

plan ステップ6（ベア `errorComponent` の `RouteErrorFallback` 統一）は完遂を Round 1 で確認済み。`RouteErrorFallback` 自体の専用ユニット（`routerInvalidate` 呼び出し・`isPending` 中 disabled）は本 Round でも追加されていない。`AppErrorFallback.test.tsx` が類似挙動を押さえており Blocker ではないが、対称性のため 1 ケース足すと望ましい（任意）。

#### [N-004] MediaUploader は依然ユニットテスト無し（任意・Round 1 N-004 から不変）

plan ステップ5/7b（XHR 進捗は見送り、error 表示を `RetryableError` へ寄せ）は完遂済み。MediaUploader にはユニットテストが PR 前後とも存在せず、この置換は自動検証外のまま。回帰の緩めではないが新規カバレッジも無い（任意）。

## 結論

Round 1 の 3 件の Warning（W-001/W-002/W-003）は **すべて適切に解消**された。いずれも実装の中核分岐（SubmitButton の pending===true、UploadDialog の件数進捗 50% 中間値、IngestionJobRow の RetryableError 別経路 retry）を実際に踏むテストで、属性・実数値・状態スナップバックを load-bearing に assert しており、偽 green・緩すぎは認められない。DoD 3 項目は実装＋テストで担保。新規 Blocker・Warning は無く、残るは任意の対称性改善（N-003 RouteErrorFallback / N-004 MediaUploader の専用ユニット）のみ。Test・DoD 整合の観点で **APPROVED**。

# PR Review #001 — feat(issue/98): ConfirmDialog の in-dialog エラー表示とエラー時フォーカス保持

**PR:** #420
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 7（a11y 3 / state 2 / test 3 のうち重複統合後）
- Notes: 多数（良好）
- Verdict: **BLOCKED**

---

## Frontend & Accessibility

#### Blockers
- なし

#### Warnings
- **[FA-W-001]** `role="alertdialog"` パネル内に `role="alert"` をネスト＋`aria-describedby` に errorId を載せる三者重複で、SR/ブラウザ組み合わせによっては同一文言の二重読み上げの可能性。情報欠落はなし。
  - 分析: エラーは「ダイアログが開いた後・失敗時」に動的描画される。`role="alert"`（implicit assertive live region）が挿入時に発火＝これが実際の announce 機構。`aria-describedby` は focus 入場時に読まれるが、エラー出現時に focus は移動しない（isPending 完了済みで confirm ボタンに留まる）ため再読み上げは発火しない。よって実フローで二重読み上げは起きない。
  - 対応: `role="alert"` は動的 announce に必須のため維持。`aria-describedby` の errorId は alertdialog APG（メッセージを describedby で参照）に沿うため維持。二重読み上げは focus 非移動により実害なしと判断（ADR-005 に記録）。
- **[FA-W-002]** エラー再描画後のフォーカス保証は「初期フォーカス（panel）」とは別問題。
  - 分析: エラー時 isPending=false で confirm ボタン（panel 内）に focus が留まる。focus は dialog 内にあり、`role="alert"` で情報も届く。機能的後退なし。対応不要（ADR-005 に記録）。
- **[FA-W-003]** description 無し・error だけのケースで `mt-2` のみの余白。現状全呼び出し側が description ありのため実害なし。Note 扱い。

#### Notes
- describedBy 合成・formError 集約・排他ガード両輪・onClose setError(null)・型設計いずれも計画/ADR どおり実装され良質（N-001〜N-006）。

---

## State Management & Cross-caller Correctness

#### Blockers
- **[ST-B-001]** 別操作の stale error が削除ダイアログを開いた瞬間に dialog 内へ漏れる
  - 場所: `IngestionJobRow.tsx` / `IngestionPreviewForm.tsx` / `SavedViewsList/index.tsx` / `tag/TagActions.tsx` / `note/detail/NoteActions.tsx` / `trash/TrashRowActions.tsx`（削除/破棄ボタンの open ハンドラ）
  - 理由: これらは `error` state を削除以外の操作（commit/regenerate/retry, rename, toggle-default/duplicate/repair, restore 等）と共有。削除ボタンの `setConfirm…Open(true)` ハンドラが `setError(null)` を呼ばないため、「別操作が失敗 → 行内に error 表示中 → 削除ボタンを押す」と、`error={confirmOpen ? error : undefined}` ガードが発火し、**未確認の確認ダイアログ内に無関係な前操作のエラーが `role="alert"` で出る**。PR 前は dialog に error prop が無く stale error は行内に留まったため、これは本 PR で新設された不整合（regression）であり、本 Issue が解消したい「ダイアログ状態とエラーの不整合」をむしろ作っている。
  - 提案: 各削除ボタンの open ハンドラを `onClick={() => { setError(null); setConfirm…Open(true); }}` にする。「ダイアログを開く＝前操作の error を破棄」の不変条件を成立させ、onClose 側の既存 setError(null) と対称化する。回帰テストも1本追加。

#### Warnings
- **[ST-W-001]** `BulkActionBar` だけ成功時 close が `await routerInvalidate` の**前**（他は後）。実害なしだが invalidate 待ちの間にダイアログが消える一瞬の不整合。→ 統一して invalidate の後に close。
- **[ST-W-002]** onClose の setError(null) が共有 state ゆえ非対称（open 側 reset 欠落）。ST-B-001 の open 時 reset で対称化され解消。

#### Notes
- close ライフサイクル反転（手順A/B/C）は8ファイル全て要否表どおり正確（N-001）。排他ガード両輪・displayError 集約・SavedViewsList の rename validation 温存も正確（N-002〜N-005）。

---

## Test

#### Blockers
- なし

#### Warnings
- **[T-W-001]** plan.md 方針(b)「error 指定でもダイアログ mount 維持」のテストが空振り（error 無しでも panel は mount されるため error 固有挙動を捕捉しない）。→ 「ConfirmDialog は error を受けても open を自分で false にしない＝close を所有しない」契約を捕捉するアサーションに強化。
- **[T-W-002]** テスト(c) が `aria-describedby` の id 並び順（`ids[0]=desc, ids[1]=alert`）という実装詳細に結合。順序入替で誤った理由で割れる脆さ。→ 順序非依存（集合）で「role=alert を指す id が1つ・description を指す id が1つ」を検証。
- **[T-W-003]** 本 PR 中核の挙動変更「キャンセルで error 破棄／行内・dialog 二重表示防止」の回帰ガードが自動テストに皆無（testing.md が「ユニット推奨」と明記）。→ 既存テスト資産のある `IngestionJobRow` に「discard 失敗 → dialog 内 alert に出る・行内 FORM_ERROR には出ない → キャンセルで両方消える」を1本追加。

#### Notes
- SerializedError モックは実型・displayError 写像と整合（N-001）。happy-dom/react-dom 構成は既存テスト踏襲で保守性高い（N-002）。IngestionPreviewForm 回帰なし（N-003）。テスト(e) が方針(b)の意図を実質補完（N-004）。

---

## Design Decisions

ST-B-001 の修正方針（open＝error 破棄の不変条件）と FA-W-001/W-002 の a11y 判断を ADR-005 に記録する。

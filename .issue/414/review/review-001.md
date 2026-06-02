# PR Review #001 — feat(#414): mutation に楽観的UI更新を適用

**PR:** #422
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 5
- Notes: 多数
- Verdict: **BLOCKED**

---

## React 19 セマンティクス・並行処理

#### Blockers
なし

#### Warnings
- **[B/W-React-1]** 削除 transition がリスト全体で共有 / `SavedViewsList/index.tsx:114,297` / 親の `isDeleting` が全行に配られ `rowBusy = isPending || isDeleting` で1行削除中に無関係な他行の操作までブロックされる。正しさには影響しないが UX 劣化。提案: 削除中の disabled を対象行のみに絞る、または不要なら除去。
- **[W-React-2]** 既定 toggle の server 引数が baseline 由来 / `SavedViewsList/index.tsx:214-219` / `applyOptimisticIsDefault(!optimisticIsDefault)` は optimistic 反転だが server には `view.isDefault ? null : view.id`（baseline）を送る。disabled で連打は防がれ実害はないが乖離しうる。提案: optimistic 値基準（`optimisticIsDefault ? null : view.id`）に揃える。

#### Notes
- ADR-004/005 の React 19 async transition 理解は正確（N-001〜N-007）。フックルール遵守、削除の親引き上げ・rollback・エラー所有・既定 toggle 自行反映・複製見送り・discard dim いずれも正しい。

## フロントエンド UX・コード整合性

#### Blockers
- **[B-FE-1]** ADR-006 で撤回された設計を示唆する誤コメント / `SavedViewsList/index.tsx:278-282` / 「the error is shown inside the dialog (see the `error` guard on `ConfirmDialog` below)」と書かれているが、ADR-006 どおり ConfirmDialog には `error`/`isPending` を渡しておらず**実態と真逆**。本 PR 中核 ADR と矛盾する有害コメント。提案: 実態（削除は楽観除去で行ごと unmount、エラーは親所有→baseline 復帰後の行 `rowError` 枠）に合わせて書き直し、Issue #98 参照は ADR-006 参照へ差し替え。

#### Warnings
- **[W-FE-1]** `summary` の `!confirmDeleteOpen` ガードが事実上デッド / `SavedViewsList/index.tsx:283-289` / 削除エラーは confirm close 後にしか入らず、`error` も削除ボタン押下時に `setError(null)`。抑制対象がほぼ発生しない。提案: 必要性を再評価し、不要なら条件撤去で単純化。
- **[W-FE-2]** `aria-busy` が複製ボタンだけで不揃い / `SavedViewsList/index.tsx:455` / 既定・rename・repair も pending 走るが複製のみ付与。かつ disabled 要素の busy は支援技術に届きにくい。提案: 複製の `aria-busy` を外して兄弟と揃える（disabled で十分）。

#### Notes
- ADR-004/005 のコメントは正確（N-002/003）。data-* 規約準拠、新規 CSS/@apply なし（N-004）。

## テスト

#### Blockers
なし

#### Warnings
- **[W-Test-1]** 削除失敗テストが「pending で除去→reject で復帰」の遷移を未検証 / `SavedViewsList.test.tsx:183-212` / `mockRejectedValue` で即 reject のため「一度消えてから戻った」のか「最初から消えなかった」のか区別不能。提案: rename テスト同様、reject を遅延保持し flush 直後に除去を assert →reject→復帰+alert を assert する二段構え。
- **[W-Test-2]** discard 失敗テストが `role="alert"` 未検証 / `IngestionJobRow.test.tsx:343-374` / dim 復帰のみ assert。既存テスト（398-471）がダイアログ内エラーを担保するため全体カバレッジは充足。提案: dim 復帰テストに「ダイアログ開いたままエラー表示」を1行追加（任意）。

#### Notes
- 楽観的即時性検証は全箇所で mock を pending 保持して正攻法（N-001）。ADR-003 トレードオフを aria-label で観測検証（N-002）。ViewFormDialog の detach close 検証が堅牢（N-003）。3連続実行で flaky なし。

---

## Design Decisions

このラウンドで新規の設計判断なし。B-FE-1 / W-FE-1 の対応で ADR-006 の意図をコメントに正しく反映する。

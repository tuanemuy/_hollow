# PR Review #002 — feat(#414): mutation に楽観的UI更新を適用

**PR:** #422
**Date:** 2026-06-02
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

---

## React 19 セマンティクス + フロントエンド UX・整合性

#### Blockers
なし

#### Warnings
なし

#### Notes
- B-FE-1 修正確認: ConfirmDialog 周辺コメントが ADR-006 の実態（削除は楽観除去で行ごと unmount、エラーは親所有→行 `rowError` 枠）に一致。参照も Issue #98 → ADR-006 に差し替え済み。
- W-FE-1 確認: `!confirmDeleteOpen` ガード撤去後も二重表示は起きず、跡に矛盾なし。
- W-FE-2 確認: 複製ボタンの `aria-busy` 撤去、全アクションボタン `disabled={rowBusy}` のみで統一。
- W-React-1 確認: `isDeleting` prop・型・受け渡し完全除去、`rowBusy = isPending`。`startDelete` transition は引き続き optimistic 除去を駆動。削除失敗時の行再マウントもボタン操作可能。デッドコード・未使用変数なし。
- W-React-2 確認: 既定 toggle の server 引数 `optimisticIsDefault ? null : view.id` が楽観反転と完全一致。disabled で stale 競合なし。
- フック順序・optimistic/transition の崩れなし。

## テスト

#### Blockers
なし

#### Warnings
なし

#### Notes
- W-Test-1 確認: 削除失敗テストが reject 遅延保持で「除去→reject→復帰+alert」の二段検証に。偽陽性なし、3連続実行で flaky なし。
- W-Test-2 確認: discard 失敗テストに `alertdialog` 残存 + `role="alert"` 本文 assert を追加。既存テストと相補的。
- 受け入れ基準のカバレッジに抜けなし。

---

## Design Decisions

新規の設計判断なし。1周目指摘の対応で ADR-006 の意図をコメントに正しく反映した。

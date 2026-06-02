# PR Review #001 — feat(#405): 保存ビュー管理UIの拡充

**PR:** #412
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 2
- Notes: 多数（良い点・軽微なドキュメント不一致）
- Verdict: **BLOCKED**

---

## Frontend

### Blockers

- **[B-1]** 編集ダイアログの「公開範囲」(kind) が編集可能 UI なのに永続化されず無言破棄される
  - 場所: `app/components/view/ViewFormDialog.tsx:246-266`（kind ラジオ）/ `app/components/view/SavedViewsList/action.ts:89-114`（updateSavedViewFn が kind を渡さない）/ `app/core/application/view/updateSavedView.ts`（UpdateSavedViewInput に kind なし）
  - 理由: create/edit 両モードで kind ラジオが操作可能だが、edit 経路は usecase に kind を渡さず変更経路も無い。ユーザーが編集で公開範囲を切り替えて保存しても成功扱いで閉じ、値は元のまま＝「変更したのに反映されない」バグ。
  - 提案: edit モードでは kind ラジオを read-only/disabled にする（updateSavedView は kind 変更非対応、P20 に編集モックも無いためスコープを絞る）。create モードは現状維持（正しく機能）。

### Warnings

- **[W-1]** `styles.ts` の `brokenBanner` JSDoc が実装と矛盾
  - 場所: `app/components/view/SavedViewsList/styles.ts:67`
  - 理由: コメントが「`role="alert"`」と書くが、実装（`index.tsx:296`）の banner div には付いていない（ADR-005 準拠の正しい挙動）。後続実装者が誤って role を足す誘発要因。
  - 提案: コメントから `role="alert"` の記述を削除。

### Notes

- [N] edit 時に壊れたタグ参照が無言で落ちる（`index.tsx:218-220`、生存タグのみ逆引き）。実質「修復」になるが妥当な副作用。
- [N] server function 作法・入力検証2点・dateRange 制約・aria・mutation→invalidate はすべて既存と一貫。

---

## Domain / Application

### Blockers
なし

### Warnings

- **[W-001]** `deleteDirectory` の name フォールバックに `DirectoryName.forRoot()`（空文字）を流用
  - 場所: `app/core/application/directory/deleteDirectory.ts:105`
  - 理由: map miss 時のフォールバックが「ルートディレクトリ名」という別概念の空文字センチネルの流用。現状 `collectSubtreeSnapshot` が全ノードを set するため到達しない防御コードだが、将来 `forRoot` の意味が変わると意図せぬ挙動になりうる。
  - 提案: `"" as DirectoryName` を直接使うか、「name 不明時の空文字センチネル」とコメント明示（ADR-E の decoder 側キャストと整合）。

### Notes
- ADR-B の非対称マージ・採番ループ・後方互換・所有者検証・ドメイン純粋性すべて健全（詳細は良い点多数）。

---

## Adapter / Data

### Blockers / Warnings
なし（マイグレーション不要の主張は裏取り済みで正当、decode フォールバック・encode 対称性・OCC・integration テストすべて整合）。

---

## Test / Cross-cutting

### Blockers / Warnings
なし

### Notes
- [N] dispatch happy-path（decode 済み name の素通し）が dispatchDomainEvent レイヤーで未カバー（decoder/handler テストが前後を担保するため実害小）。
- [N] plan.md/testing.md の adapter テストパス表記が実体（`app/core/adapters/d1/__tests__/savedViewRepository.integration.test.ts`）とズレ。application/view テストは fake 使用の **unit** だが「実 DB integration」と表現。ドキュメント文言のみ不正確、コードは正しい。

---

## Design Decisions

特になし（既存 ADR-A〜E の範囲内）。B-1 の修正方針（edit で kind を read-only）は ADR 追記不要の実装詳細。

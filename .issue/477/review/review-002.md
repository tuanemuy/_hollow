# PR Review #002 — refactor(ui): ノート公開設定を独立ページからインコンテキストモーダルへ

**PR:** #479
**Date:** 2026-06-04
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 多数（前回指摘はすべて解消）
- Verdict: **BLOCKED**（FE-W-003 残のため。完了条件は Blocker 0 かつ Warning 0）

---

## Frontend

### Blockers
- なし

### Warnings
- **[FE-W-003]** `useActionState` 由来のフォームエラー（`visibilityState.error` / `issueState.error`）が close→reopen で残存する
  - 場所: `app/components/publication/PublishSettings/index.tsx`（visibility/issue の `useActionState` とエラー表示）
  - 理由: FE-W-001/W-002 と同根（`PublishSettings` 本体は `NoteActions` 配下で常時マウント）。close 時リセット effect（ADR-005）は `issuedToken`/`visibility` だけを戻し、`useActionState` の error state は触れない。前回オープン時の更新/発行エラーが、閉じて再オープンした直後に `role="alert"` で再表示されうる。「閉じればリセット」という ADR-005 の意図とエラー挙動が部分的に不整合。
  - 提案: エラーを `useActionState` の戻り値ではなく専用 `useState` で保持し、close 時 effect で他 transient state と一緒に null リセットする（pending は `useActionState` の third 戻り値を継続利用）。

### Notes
- FE-W-001（issuedToken 残存）解消。close effect で `setIssuedToken(null)`。
- FE-W-002（visibility 非追従）解消。close effect で `setVisibility(data.visibility)`。依存配列 `[open, data.visibility]` と `if(open) return` ガードが ADR-005 どおり機能。楽観更新との二重更新ちらつきなし。
- pending 集約（ADR-004）の新規 unit テストを確認。回帰なし。スタイリング規約準拠維持。
- a11y: 発行URL出現・成功の aria-live 欠如は軽微ギャップとして残る（非ブロッキング、将来 UploadDialog の role=status に揃える余地）。

---

## Test

### Blockers
- なし
### Warnings
- なし
### Notes
- TEST-W-001 解消。`PublishSettings.test.tsx` 新規追加で pending 集約／closable の3不変条件（in-flight で closable=false / 完了で復帰 / mid-flight unmount でカウンタ非残留）を検証。ミューテーションで赤転確認済み（タウトロジーでない）。モック戦略は既存 serverFnMock 作法に整合。
- TEST-W-002 解消。NoteActions のピル特定が sr-only "公開状態:" 起点の安定セレクタに変更。
- 軽微カバレッジ余地（非ブロッキング）: close 時 state リセット（FE-W-001/W-002）の回帰 unit は未追加。今回スコープ外。

---

## Architecture / Routing

### Blockers
- なし
### Warnings
- なし
### Notes
- ARCH-W-001 解消。`PUBLISH_BODY` を JSDoc ごと削除、dangling 参照ゼロ（grep 確認）。`PAGE_TITLE` の不要 import も除去済み。
- ルート削除の波及は依然クリーン（routeTree から publish 一掃、削除3ファイルへの参照ゼロ）。
- appUrl 引き回し・レイヤー越境なし・server-fn 維持に回帰なし。
- ADR-005 追記が実装と完全一致。

---

## Design Decisions

- FE-W-003 は ADR-005 の「transient state は close 時にリセット」方針を `useActionState` のエラーにも拡張して解消する。エラーを専用 `useState` に切り出すことで、`useActionState`（プログラム的に reset 不可）の制約を回避しつつ close リセットの対象に含める。ADR-005 に追記する。

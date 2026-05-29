# PR Review #002 — feat(#321): 内部リンクの後追い再解決

**PR:** #327
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 1
- Warnings: 1
- Notes: 多数
- Verdict: **BLOCKED**

2視点でレビュー: (1) round-1 修正の検証、(2) 全体 correctness の最終確認（新鮮な目）。

---

## 修正検証（round-1 の3 Warning 対応）

#### Blockers
なし

#### Warnings
- **[W-F1]** フォーマット未適用。`internalLinkBackfill.integration.test.ts` の新規追加行が Biome line-width 超過で `pnpm format:check` が失敗（CLAUDE.md「After changes: ... && pnpm format」未完遂）。`pnpm typecheck`/`pnpm lint` は通るがフォーマットゲート破壊。

#### Notes
- W-T1（自己参照テスト）: 偽陽性でない。self除外（exceptId / SQL `fromNoteId <> targetNoteId`）と「別ノートからの参照は解決される」正の対照を同一実行で対比し、exceptId 無視や `<>` 句欠落の壊れた実装なら FAIL する設計。十分。
- W-A1（backfill JSDoc）: offset ページングの skip/重複・カウント意味・再実行収束・「one-shot でなく re-runnable」を正しく説明。十分。
- W-Ad1（setLinkResolution コメント）: 将来の追加バインド考慮の注意喚起。妥当。

## 全体 correctness（最終確認）

#### Blockers
- **[B-1]** `handleLinkTargetTrashed` が consume 時のステータス再読を持たず、`note.trashed` が `note.restored` の後に遅延配送/再配送されると解決済みリンクを恒久的に誤って null 解除し収束しない。
  - 場所: `app/core/application/note/handleLinkTargetTrashed.ts`
  - 理由: 配送は at-least-once・順序保証なし（CLAUDE.md/ADR）。trash→restore は別 UoW・別 outbox 行。R を先に配送（resolution が A=active と読み B を再解決）→ T が遅延配送（trashed が無条件で B を null 解除）すると、A は active のままなのに B が null になり**修復イベントが存在しない**。trashed 重複配送でも同様。resolution handler は status ガードで収束するのに trashed handler は持たない非対称が原因。統合テストも trash→restore を正順でのみ検証しており未カバー。
  - 提案: `handleLinkTargetTrashed` も UoW 内で `findById` を読み、`note===null`（purge済み、FK が既にクリア）または `status==='active'`（restore が勝った/stale trash）なら no-op。`trashed` のときだけ解除する。両 handler が consume-time 再読で対称になり任意順・重複で収束。

#### Warnings
なし

#### Notes
- 勝者判定・owner 越境なし・lower 一貫性・kind=id 非解除・retry 冪等・stale 解除と他ノート再解決の相互作用はいずれも正しい（B-1 を除く）。
- plan/adr と実装の乖離・未実装・TODO/仮実装なし。

---

## 対応（このラウンドで修正）

- **B-1（Blocker）**: `handleLinkTargetTrashed` に consume-time `findById` ガードを追加。`note===null`（purge → FK 済み）または `status==='active'`（restore 勝ち/stale/redeliver）なら no-op、`trashed` のときだけ解除。これで resolution / trashed 両 handler が consume-time 再読で対称になり、任意順・重複配送でも収束。
  - テスト追加: 統合「reordered/redelivered trash while active is no-op」、ユニット「active 時 no-op」「absent 時 no-op」。既存ユニットの trashed テストは note を `trashed` 状態に修正。
- **W-F1**: `pnpm exec biome format --write` で整形。`pnpm format:check` グリーン確認。
- 全スイート再実行: unit 2753 / integration（後述）全PASS、typecheck/format クリーン。

## Design Decisions
- **ADR-012 候補**: trashed reaction handler も resolution handler と同じく consume-time ステータス再読で「現在 trashed のときだけ解除」する（at-least-once / 順序なし下での収束のため両 handler を対称化）。adr.md に追記。

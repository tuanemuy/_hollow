# PR Review #002 — fix(issue/306): forward suggested directory to IngestionJobRow commit + invalidate

**PR:** #311
**実施日:** 2026-05-29
**レビュー方式:** General Review（小規模 Issue のため単発レビュー / 2 ラウンド目）
**最終ステータス:** APPROVED（W-001 / W-002 ともに本ラウンドで対応済み）

---

## General Review (Round 2)

### Blockers
なし

### Warnings

- **[W-001]** ADR-001 の Consequences に semantic shift（`suggestedDirectoryId` を explicit `directoryId` として送ることで stale 参照がエラー化する点）が未記述
  - 場所: `.issue/306/adr.md`
  - **対応済み**: ADR-001 の Consequences に「Semantic shift」として 1 段落追加。サーバー側 `resolveDirectoryId` の非対称設計（explicit は throw / suggested は graceful fallback）と、本 PR で UI 経由では graceful fallback が事実上 dead path になることを明記。`IngestionPreviewForm` も同じ brittleness を既に持っているため両動線で一貫している点も併記。

- **[W-002]** `IngestionJobRow.onCommit` の新パスに対する unit test がない
  - 場所: `app/components/ingestion/__tests__/`
  - **対応済み**: `app/components/ingestion/__tests__/IngestionJobRow.test.tsx` を新規追加（既存 `IngestionPreviewForm.test.tsx` の serverFn router パターンを流用）。3 ケースで pin:
    1. `suggestedDirectoryId !== null` → payload に `directoryId` が乗り `directoryNameToCreate` は乗らない / `router.invalidate` 未呼び出し / navigate 呼び出し
    2. `suggestedDirectoryId === null && suggestedDirectoryName !== null` → payload に `directoryNameToCreate` が乗り `directoryId` は乗らない / `router.invalidate` 1 回呼び出し / navigate 呼び出し
    3. commit 失敗時 → `router.invalidate` も `router.navigate` も呼ばれない
  - 結果: 全 PASS（2693 件全 PASS）

### Notes

- **[N-001]** payload 構築の論理は排他的で正しい。`willCreateDirectory = suggestedDirectoryId === null && suggestedDirectoryName !== null` と `directoryId` 送信条件 (`suggestedDirectoryId !== null`) が mutually exclusive。
- **[N-002]** invalidate 呼び出し順（`router.navigate` の前）が正しい。rule 2 / WHY コメント（`.issue/299/adr.md ADR-003` への参照付き、「Sidebar tree が変わるため」の意味的理由付き）も規約通り。
- **[N-003]** `willCreateDirectory === false`（既存 directoryId 送信パスを含む）では invalidate が呼ばれず、rule 2 の定義と完全に整合。
- **[N-004]** ADR-001 は方針転換の経緯（Phase 2 で発見 → review-001 では別 Issue として切り出し → ユーザー判断で「仕様乖離」と確定 → 本 PR スコープに復帰）を時系列で説明しており追跡可能。Issue #312 のクローズ判断も妥当（`Closes #312` を PR body に追記済み）。
- **[N-005]** discard / regenerate パスは `routerInvalidate(router)` ラッパー経由で `_app` 除外を維持しており、本 PR では触っていない。設計判断と整合。

---

## 結論

**APPROVED.**

review-002 で出した W-001 / W-002 はいずれも本ラウンドで対応済み（ADR-001 加筆 + `IngestionJobRow.test.tsx` 追加）。これにより本 PR は:

- Blockers なし
- Warnings ゼロ（すべて対応済み）
- 2693 件 unit test PASS / typecheck PASS / biome format PASS
- Issue #306 / #312 両方を解消

の状態。次ラウンドのレビューは不要、Ready for review のままマージ可能。

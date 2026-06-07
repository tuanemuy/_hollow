# PR Review #001 — feat(tag): P18 タグ管理に検索・ソート・最終使用列を追従（#569 A/B/C）

**PR:** #577
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7（うち実修正対象 2 / 非問題・許容トレードオフ 5）
- Notes: 多数（設計品質を高く評価）
- Verdict: **BLOCKED**（Warning 残のため。実修正2件を潰して再レビュー）

レイヤー: Backend / Frontend / Test の3観点で並列レビュー。

---

## Backend（Domain ポート / D1 Adapter / Use Case・DTO）

### Blockers
なし

### Warnings
- **[B-W-001]** `sortExpr` の型推論（集約式分岐の型不均一） / `app/core/adapters/d1/repositories/tagRepository.ts:158-165` / 各分岐の型（`sql<number>` / `SQLiteColumn` / `sql<string|null>`）が不均一 / 提案: 予防的。**→ 非問題と判定**: `pnpm typecheck` は通っており（drizzle `orderBy` が当該 union を受理）、実害なし。予防的指摘にとどまるため修正不要。

### Notes（抜粋）
- 集約クエリ設計（ADR-001）が `noteCount`/`0013` と完全に並列で優秀。NULL ハンドリング（`row.lastUsedAt === null ? null : new Date(...)`）・タイブレーク（`asc(tags.id)`）・trashed/owner 除外（active-notes JOIN predicate）が正確。DTO 波及3箇所も正しい値。

---

## Frontend（route / schema / client / styling / a11y）

### Blockers
なし（B-001 は精査の結果「問題なし」）

### Warnings
- **[F-W-001]** uncontrolled input `key={query ?? ""}` の autocomplete 副作用 / `TagListToolbar.tsx:92` / back/forward 時の URL 同期意図は正しいが、ブラウザ saved data を消す副作用 / **→ 許容**: 検索 UI は軽量で実害小。URL を SSOT とする設計の必然。
- **[F-W-002]** `<form>` に `role="search"` を持たせない構成 / `TagListToolbar.tsx:81-98` / **→ 許容**: ADR-004 で `<search>` ラッパに解決済み（Biome `useSemanticElements` 準拠 + 公開側検索と統一）。意図的トレードオフ。
- **[F-W-003]** 空 `?q=` の schema 処理 / `schema.ts:45` / `.min(1)` reject → `.catch(undefined)` で正規化 / **→ 非問題**: ルート loader コメントで意図明記済み、設計どおり。

### Notes（抜粋）
- 二段構え schema（`pagination.ts` 規範厳守）、loader 分離（ADR-002）、`useTransition`+`router.navigate`、`useOptimistic` 独立、0件空状態分岐、デザイントークン整合、レスポンシブ、a11y いずれも高品質。総合「承認推奨」。
- **[F-N-010]** `TagListSort`/`TagListOrder` の union 型が `schema.ts` の `TAG_LIST_SORTS` と `TagList.tsx` の2箇所に分散。実害なしだが将来 `as const` 由来に寄せると整合化可能。**→ スコープ外（軽微・任意）**。

---

## Test（網羅性・回帰）

### Blockers
なし

### Warnings
- **[T-W-001]** `TagListToolbar` の空 submit（q ドロップ）・navigate 挙動のコンポーネントテストが無い / `TagListToolbar.tsx:57-74` / schema 単体とブラウザ TC-001 では確認済みだが component レベル未カバー / **→ 実修正対象**: 既存テストインフラ（`useRouter`/`navigate` モック）があり安価。`TagListToolbar` のテストを追加。
- **[T-W-002]** schema の型ガードが void-cast / `schema.ts:70-76` / `pagination.ts` と差異との指摘 / **→ 非問題**: `pagination.ts:55-56` も `void` を使用。整合済み、修正不要。
- **[T-W-003]** `formatLastUsed` の整形結果（`最終使用 YYYY/MM/DD` / 未使用フォールバック）の表示アサーションが無い / `TagList.tsx:40-48` / **→ 実修正対象**: render ベースで安価に追加可能。C-5 表示の具体カバレッジを足す。

### Notes（抜粋）
- アダプタ統合テスト（集約・NULL・trashed除外・cascade・ソート/タイブレーク/NULL順）、usecase 統合、schema 単体、`reduceTags` の `lastUsedAt` 保持はいずれも具体的で偽陽性リスク低。Confidence HIGH。

---

## このラウンドの対応方針

- **実修正（このPRで潰す）**: T-W-001（TagListToolbar の空submit/navigate テスト追加）、T-W-003（lastUsedAt 表示の render アサーション追加）。
- **非問題・修正不要**: B-W-001（typecheck 通過・予防的）、F-W-003（設計どおり）、T-W-002（pagination.ts と整合）。
- **許容トレードオフ**: F-W-001（autocomplete 副作用）、F-W-002（ADR-004 解決済み）。
- **スコープ外（軽微・任意）**: F-N-010（型 SSOT 分散）。

## Design Decisions
特になし（既存 ADR-001〜005 で網羅済み）。

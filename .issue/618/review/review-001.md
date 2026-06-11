# PR Review #001 — feat(search): 公開検索(P32)に更新日時表示とフィルターUX改善

**PR:** #645
**Date:** 2026-06-11
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 多数
- Verdict: **BLOCKED**（Warning 残のため修正へ）

---

## Domain / Application

Blockers: なし / Warnings: なし
- N-001〜N-005: 縦配線・JSDoc・上書き挙動・ISO projection すべて計画と整合。軽微: `PublicSearch.tsx` で `new Date(hit.updatedAt)` を2回構築（実害なし）。

## Adapter (D1)

Blockers: なし / Warnings: なし
- 両経路 SELECT（FTS :214 / LIKE :252）、NaN ガード → SystemError(DataIntegrityError)、facet 経路は対象外で正しい。

## Frontend

Blockers: なし

### Warnings
- **[W-FE-001]** 共有フォーマッタが TZ 依存（`getFullYear` 等）で、P30（client/ブラウザTZ）と P32（RSC/workerd UTC）で同じ instant が別の日付になりうる。
  - 場所: `app/components/public/formatNoteDate.ts:5-11`
  - 提案: UTC 固定（`getUTC*`）に揃える＋JSDoc に TZ 前提を明記
- **[W-FE-002]** モック `.result-card` のモバイル規則・日付フォーマットが実装（P30 同型）と乖離したまま、`styles.ts` のコメントがモック準拠を主張している。
  - 場所: `app/components/public/styles.ts:199-201`, `spec/design/pages/P32-public-search.html:478,844,928`
  - 提案: モックを #627 確定挙動（モバイル単カラム・メタ行折込・右列 M月D日）へ追従、コメント出典を P30 `NOTE_ROW` に修正

### Notes
- useOptimistic（async transition / patch reducer / 楽観値ベースのハンドラ / 全描画箇所）は満点に近い。grid 化・a11y・モック sort-btn 整理も完全。

## Test

Blockers: なし

### Warnings
- **[W-TEST-001]** 不正 `updated_at` → `SystemError` の adapter 経路が未テスト。
  - 場所: `app/core/adapters/d1/searchIndex.ts:420-426`
  - 提案: integration に malformed row → SystemError の1ケース追加
- **[W-TEST-002]** `searchPublicNotes` の usecase 結果 DTO に `updatedAt` が載る結線アサーションがない。
  - 提案: 既存 projection テストに expect 1行追加

### Notes
- 両経路アサーション実在確認済み。owned 上書きアサーションは値の差で実質強化。

---

## Design Decisions

- 日付フォーマッタを UTC 固定に統一する（→ ADR-005 として記録）

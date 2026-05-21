# PR Review #001 — fix(issue-60): drop legacy instance_settings row via migration 0009

**PR:** #105
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 16 (Migration 8 + Plan/ADR 7 + 1 留意)
- Verdict: **APPROVED**

---

## Migration / Schema Safety

#### Blockers
なし

#### Warnings
なし

#### Notes

- **[N-001]** `json_type(JSON, PATH)` 2引数形式の SQLite 仕様適合性は正しい。ローカル SQLite 3.51 で実証確認: `json_type('{}', '$.a')` は `NULL` を返し、エラーにならない（json1 拡張の規定どおり「path がドキュメント内に存在しない場合 NULL を返す」）。D1 は SQLite 3.43+ なので 2引数形式は問題なく利用可能。`savedViewRepository.ts:443,458` の `json_extract` 利用実績と同じ json1 拡張群。
  - 場所: `app/core/adapters/d1/migrations/0009_drop_legacy_instance_settings.sql:21-22`

- **[N-002]** 冪等性が完全に確保されている。`DELETE WHERE id = 'singleton' AND (...)` は二度走行しても (1) 初回で削除済みなら 0 rows affected で no-op、(2) singleton 制約と一致、(3) WHERE 述語は防御的に「キー不在」のみを対象とするため正規行は何度走らせても触らない。

- **[N-003]** 削除条件の論理が的確。`OR` 結合により「片方だけ legacy」のハーフ汚染状態にも対応。
  - 場所: `app/core/adapters/d1/migrations/0009_drop_legacy_instance_settings.sql:20-23`

- **[N-004]** 命名規則・コメントスタイルが既存資産 (`0005_drop_todos.sql` / `0007_notes_slug_partial_unique.sql`) と一致。WHY 中心のコメントで CLAUDE.md 原則に整合。

- **[N-005]** drizzle-kit との共存が安全。DDL を一切いじらず DML のみなので drizzle-kit 再生成で上書きされない。

- **[N-006]** 本番影響が二重に絞られている。(1) ADR-001 の通り本番 D1 に legacy 行は存在せず、(2) WHERE 述語が「現行スキーマでは絶対に NULL にならないキー」の不在のみを対象。

- **[N-007]** マニュアルテストが「正規行温存」を実証 (TC-3, `version=3, claude-opus-4-7`)。

- **[N-008]** パフォーマンス上の懸念なし。singleton 最大1行。

## Plan/ADR Alignment + Test Data

#### Blockers
なし

#### Warnings
なし

#### Notes

- **[N-009]** Plan step 1 ↔ migration `0009_drop_legacy_instance_settings.sql` は SQL本文・コメント文言・`json_type` 述語の両条件まで一字一句一致。R1 S-001 反映の `json_type` 採用も保持。
- **[N-010]** Plan step 2 ↔ seed 修正は4ファイル (`.issue/{1,8,29,30}/.../seed.sql`) すべて同一の `'{"tokens":{}}'` + `limits_json` 新キー値で揃っており、その他フィールド (`prompts_json: '{}'`, `'anthropic'`, `'claude-opus-4-7'`, `'env'`, `version=0`, `'2026-05-01T00:00:00.000Z'`) は意図通り温存。
- **[N-011]** `limits_json` の値は `app/core/domain/adminSettings/entity.ts:65-75` の `defaultLimits()` とバイト単位完全一致。
- **[N-012]** 4 seed 間の cross-file consistency: すべて完全一致。
- **[N-013]** migration 連番（0008 → 0009）も正しく、drizzle-kit 運用方針（手書き許容）とも整合。
- **[N-014]** testing.md の確認項目 1〜4 + エッジケース1 がそれぞれ TC-1〜TC-4 + summary に対応し、スクリーンショット13枚で裏付け。TC-2 の save 永続化失敗は `SECRET_BOX_MASTER_KEY` 未設定起因の環境制約で、Issue #60 のスコープ外と適切に区別。`.issue/60/progress.md` 不在で問題なし。
- **[N-015]** PR description は実態と完全一致。スコープ外への漏出なし。

## 総合

- **[N-016]** 計画 (`plan.md` / `adr.md`) と実装の一致度は完全。SQL 文法、冪等性、削除条件の論理、命名規則、コメントスタイル、drizzle-kit 共存、本番影響、いずれも問題なし。マニュアルテスト 4/4 PASS で挙動も裏付け済み。マージ可能。

---

## Design Decisions

特になし。Phase 1 で確立した ADR-001 の方針が実装で完全に実現されており、レビューラウンド中に新たな設計判断は発生しなかった。

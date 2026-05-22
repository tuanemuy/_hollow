# PR Review #001 — fix(adapters/d1): apply selectInChunks to remaining inArray callsites (#45)

**PR:** #164
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 13
- Verdict: **BLOCKED** (Warning 必修により次ラウンド必要)

---

## D1 Adapter (Infrastructure)

### Blockers
なし

### Warnings
- **[W-001]** `tagRepository.integration.test.ts` のテスト関数内で `TZ` を再宣言してモジュールトップの `TZ` をシャドウしている
  - 場所: `app/core/adapters/d1/__tests__/tagRepository.integration.test.ts` 新規 describe 内
  - 理由: モジュールスコープに既に `const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();` (line 14) があるのに、新規 describe ブロック内でローカル `const TZ` を同値で再宣言している。動作上は問題ないが、他リポジトリのテスト（`mediaAssetRepository.integration.test.ts:9` や `noteRepository.integration.test.ts` の bind-limit ケース）はモジュールトップの `TZ` をそのまま使っており、本ファイルだけ局所的な一貫性が崩れる
  - 提案: ローカル `const TZ` を削除し、モジュールトップの `TZ` をそのまま参照する

### Notes
- **[N-001]** 4 箇所すべてが既存パターン (`noteRepository.findByIds:304-314` / `loadChildren:232-251` / `findReferrers:612-617`) と完全に同形で書き換えられている。ADR 追加を不要と判断したのは妥当 — ADR-002 で確立した「`selectInChunks` ヘルパで保護する」原則の機械的展開であり、新規設計判断は発生していない
- **[N-002]** `tagRepository.findByIds` の旧コードにあった `inArray(tags.id, ids as readonly string[] as string[])` という二重キャストが、`[...chunk]` 一本化で消えたのは副産物として綺麗
- **[N-003]** `resolveTagAndCandidates` の chunk 跨ぎ集計は正しい。`countByNote: Map<string, Set<string>>` は chunk 結果を flat 結合した row 列を線形に走査して `(noteId, tagId)` の組をマージするので、同一 `noteId` の `noteTags` 行が複数 chunk に分散しても `seen.size === tagIds.length` 判定は正しい
- **[N-004]** ADR-003 で「`outboxRepository.ts` はスコープ外」とした判断は技術的に正しい。`inArray(outboxEvents.id, ...)` は subquery または worker の claim batch 由来で bind 数が bounded
- **[N-005]** ADR-003 が `noteRepository:471` の `inArray(notes.id, [...intersected])` をスコープ外としている件: 厳密には intersection の上限は `min(|set_i|)` で、各候補セット自体は unbounded になりうる。本 Issue のスコープを 4 箇所の機械適用に絞った判断は妥当だが、いずれ別 Issue で起票する余地がある
- **[N-006]** `mediaAssetRepository.integration.test.ts` の `nextId` prefix が `0193e7f1-...` で `tagRepository` (`0193e7f0-...`) や `noteRepository` (`0193e7d0-...`) と被らない設計。テスト並列実行時の ID 衝突回避が考慮されている
- **[N-007]** `pnpm typecheck` / `biome check` / `biome format --check` すべて pass

---

## Integration Test

### Blockers
なし

### Warnings
- **[W-002]** Test ID collision: 同一 describe block 内に `T-bind-005` が 2 つ存在する
  - 場所: `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts:785` (Issue #33 由来 "findReferrers tie-breaks equal updatedAt by descending id") と `:952` (新規 "findByOwner({ tagIds: [...150] })")
  - 理由: 両方とも `describe("D1NoteRepository — D1 bind limit regression (integration)"` 配下にある。仕様トレース (T-bind-NNN ↔ Issue) が壊れる。Issue #33 の suite を踏襲するなら連番を継続すべき
  - 提案: 新規テストの id を `T-bind-007` にリネーム（コメント・it タイトル・testing.md の該当箇所も併せて更新）

- **[W-003]** `tagRepository.findByIds([])` の空配列ケースが新規テストでも既存テストでも asserted されていない
  - 場所: `app/core/adapters/d1/__tests__/tagRepository.integration.test.ts` 新規 describe
  - 理由: `testing.md` のエッジケース 1 で「各リポジトリの bind-limit regression テスト内で空配列も assert する（または既存テストで担保されているか確認）」と明記。`mediaAssetRepository.integration.test.ts` には空配列ケースがあるのに、`tagRepository.integration.test.ts` には無い
  - 提案: 既存の `describe("D1TagRepository.findByIds — D1 bind limit regression (Issue #45)"` に `it("returns [] for an empty id list without querying", ...)` を 1 ケース追加

### Notes
- **[N-008]** seed パターンは Issue #33 で確立された "1 ステートメント = 1 行 insert を `db.batch` に詰める" 規約を忠実に踏襲できている
- **[N-009]** T-bind-005 (new) の設計は資料的に正しい：tag 150 件 → 単一 note に全紐づけ → `findByOwner({ tagIds })` で `[note]` を期待。`Map<noteId, Set<tagId>>` の chunk 跨ぎ集約が壊れたら必ず failed になる
- **[N-010]** assertion スタイルが既存 `T-bind-001` と一貫（`toHaveLength(150)` + `new Set(...) toEqual new Set(...)` で順序非依存比較）
- **[N-011]** `D1PublicationStateRepository.findByNoteIds` の新規 T-bind-001 は既存 describe 内に置かれており、`plan.md` で「新規ファイル」と書いた箇所からの軽微な乖離だが、テスト実効カバレッジは同等
- **[N-012]** `publicationStateRepository.integration.test.ts` (plan/testing で「新規ファイル」と記された) は最終的に作成されず、`noteRepository.integration.test.ts` 内の既存 publicationState describe への追記で代用。plan ↔ 実装の軽微な乖離だが品質問題ではない
- **[N-013]** mediaAssetRepository の seed が `refCount: 0, status: "pending"` で DB CHECK と enum を満たし、`MediaAsset.reconstruct` の invariants (attached なら refCount>=1) にも触れない最小組合せ

---

## Design Decisions

特になし（新規 ADR は不要。Issue #33 ADR-002 / ADR-003 の機械的展開）。

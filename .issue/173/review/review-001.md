# PR Review #001 — perf(issue-173): collapse duplicate buildOwnerListWhere via listWithCount

**PR:** #176
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9 (Adapter 3 / Domain・App 3 / Test 3 / Performance 0)
- Notes: 多数（要点のみ抜粋）
- Verdict: **BLOCKED**（Warning が残存しているため修正後に再レビュー）

---

## Adapter / Infrastructure

### Blockers
- なし

### Warnings

- **[A-W-001]** chunk 経路の `count = sorted.length` が "rows が full `where` 適用後" という暗黙の不変条件に依存していることがコード横に明示されていない
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:473-482`
  - 理由: `selectInChunks` per-chunk クエリは `where(and(where, inArray(notes.id, [...chunk])))` で full `where` を適用するため `sorted.length === filter 適用後の総件数`。ただし将来の改修で「`idScope.size` で十分」と誤読する可能性がある
  - 提案: `count: sorted.length` 直前に WHY コメントを 1 行追加（ADR-001(#165) §補足参照）

- **[A-W-002]** `runExportJob` inline stub が silent `{ items: [], count: 0 }` を返す semantics は隣接 `findByIds` の throw fail-fast パターンと方針が混在
  - 場所: `app/core/application/export/runExportJob.ts:227-230`
  - 理由: 隣接 `findByOwner` / `countByOwner` も silent stub なので 3 兄弟としては一貫しているが、`findByIds` の throw 方針と混在する
  - 提案: 隣接 stub と内部一貫性があるため本 PR では対応不要。Follow-up として整理

- **[A-W-003]** ポート公開面 3 メソッドの filter 共有規約が JSDoc 言及のみで型では強制されない
  - 場所: `app/core/domain/note/ports/noteRepository.ts:170-209`
  - 理由: `NoteOwnerListOpts` / `NoteOwnerCountOpts` の Pick 型関係で部分的に保証されているが、将来 filter 追加時のドリフト検出は弱い
  - 提案: 型レベル強化は本 PR スコープ超え。Follow-up として記録

### Notes
- [A-N-001] `Promise.all` 並列化は `loadChildren` 前例と整合し安全
- [A-N-002] `null` 短絡は `findByOwner` + `countByOwner` の合成として意味論的に正しい
- [A-N-003] chunk 経路の `hydrateMany(page)` 1 回呼び出しで N+1 回避
- [A-N-004] sort 安定性は `sortNoteRowsBy` helper 経由で `findByOwner` と同等
- [A-N-005] `mapDbError` メッセージ命名が既存パターンと整合
- [A-N-008] stub 全体として内部一貫性

---

## Domain / Application

### Blockers
- なし

### Warnings

- **[D-W-001]** `listWithCount` JSDoc が `countByOwner(opts === undefined)` 経路との対応関係を明示していない
  - 場所: `app/core/domain/note/ports/noteRepository.ts:175-209`
  - 理由: `countByOwner` は `opts === undefined` で「active + trashed の総数」を返すが、`listWithCount` は `opts` 必須なので「`opts.status` 未指定 = active + trashed」という対応を契約として明示すべき
  - 提案: JSDoc に 1 文「`countByOwner(undefined)` 経路は `opts.status` 未指定の `listWithCount` と等価」を追加

- **[D-W-002]** `listWithCount` JSDoc の短絡条件記述が adapter 内部用語 (candidate-set / intersection) をリーク
  - 場所: `app/core/domain/note/ports/noteRepository.ts:191-194`
  - 理由: `findByOwner` JSDoc は adapter 内部用語を一切露出していない。ポート契約面の語彙で揃えるべき
  - 提案: "any candidate-set intersection that is empty" → "filter の組み合わせから到達可能な note が 0 件のとき" のような抽象的表現に整える

- **[D-W-003]** `findByOwner` の 1 行薄い JSDoc と `listWithCount` の重厚 JSDoc で情報密度の落差が大きい
  - 場所: `app/core/domain/note/ports/noteRepository.ts:109-113, 161-172, 174-209`
  - 理由: 3 兄弟として同程度の粒度に揃える方が「同じ filter 解決を共有する」契約が伝わる
  - 提案: `listWithCount` JSDoc 冒頭の表現を「同じ filter 解決を共有する `findByOwner` / `countByOwner` 兄弟の合成」と明確化する。`findByOwner` 側を厚くするのは本 PR スコープ超え（別途 spec-sync 等で扱う）

### Notes
- [D-N-001] `listNotesByOwner` の修正は型安全に行われている
- [D-N-002] Issue #30 由来コメントの書き換えは意味論を忠実に継承
- [D-N-003] Hexagonal 整合性は保たれている（adapter 詳細が domain ポートに漏れていない）
- [D-N-004] エラーハンドリングは Cross-layer catch policy に準拠
- [D-N-005] `runExportJob` inline stub は隣接 `findByOwner` / `countByOwner` 方針と整合
- [D-N-006] `StubNoteRepository` throw パターンは既存 stub 方針と整合
- [D-N-007] 横断影響の見落としなし（`as unknown as NoteRepository` キャストは pre-existing で本 PR スコープ外）

---

## Test

### Blockers
- なし

### Warnings

- **[T-W-001]** T-listWithCount-001 / 002 の cross-check が非対称で count 契約の pinning が弱い
  - 場所: `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts` T-listWithCount-001 / 002
  - 理由: `findByOwner` には full opts (pagination 含む)、`countByOwner` には部分 opts (フィルタのみ) を渡しているため、「`listWithCount.count === countByOwner(opts_as_count)`」のペアリング検証が弱い
  - 提案: コメントを実態に合わせるか、`countByOwner` 呼び出し時に明示的に「pagination を渡しても無視される」契約を pin する形に変更

- **[T-W-002]** T-listWithCount-001 の `expect(a).toBeDefined()` が lint 抑止用ノイズ
  - 場所: T-listWithCount-001
  - 理由: テスト本来の関心事と無関係なアサーションがレビュー時のシグナル/ノイズ比を下げる
  - 提案: `expect(batchItems.map(n => n.id)).not.toContain(a.id)` のような意味あるアサーションに変更

- **[T-W-003]** T-listWithCount-003 が空配列短絡を `listWithCount` 側でしか pin していない
  - 場所: T-listWithCount-003
  - 理由: 空 intersected ケースでも `findByOwner` + `countByOwner` ペアと等価であることが pin されていない（T-001/T-002 は非空ケースしかカバーしない）
  - 提案: T-003 に `findByOwner(opts) → []` / `countByOwner(opts) → 0` の cross-check を追加

### Notes
- [T-N-001] chunk 経路の sort=title / order=asc は既存 T-bind-013 でカバーされ間接的に担保
- [T-N-002] `limit > sorted.length` のエッジケースは既存契約に乗っているため追加 pin 不要
- [T-N-003] visibility filter のみで chunk 経路を起こす設計は責務分担として妥当
- [T-N-004] `StubNoteRepository.listWithCount` throw パターンは既存方針と整合
- [T-N-005] fixture/seed 独立性は確保
- [T-N-006] 既存 `listNotesByOwner` usecase test は無変更で回帰確認のみ

---

## Performance

### Blockers
- なし

### Warnings
- なし

### Notes
- [P-N-001] `buildOwnerListWhere` 呼び出し回数を 2 → 1 に半減し、candidate set I/O / `intersectIdSets` 計算 / `Array.from(intersected)` がすべて 1 回に
- [P-N-002] chunk 経路で `countByOwner` の per-chunk `count()` クエリが完全消失（`idScope.size=5000` で ~115 → ~58 サブリクエストへ約 50% 純減）
- [P-N-003] `idScope === null` 経路の `Promise.all([select, count])` 並列化で latency 約 1/2
- [P-N-004] メモリプロファイル退化なし
- [P-N-005] `hydrateMany(page)` で N+1 回避維持
- [P-N-006] `Array.from(idScope)` も 1 回確保に減少
- [P-N-007] 既存 `findByOwner` / `countByOwner` 無変更で regression リスクなし

---

## Design Decisions

このラウンドで見つかった設計判断: 特になし（ADR-001 で既に網羅済み）。

A-W-002 / A-W-003 / D-W-003 は本 PR スコープでの修正を見送り、Follow-up 候補として記録する（ADR-001 §Follow-up に追記検討）。

---

## 修正方針

### このラウンドで修正する（即時修正）

- **[A-W-001]** chunk 経路 `count: sorted.length` 直前に WHY コメント 1 行追加
- **[D-W-001]** `listWithCount` JSDoc に `countByOwner(undefined)` との対応関係を明示
- **[D-W-002]** JSDoc の adapter 内部用語 (candidate-set / intersection) を抽象的表現に整える
- **[D-W-003]** `listWithCount` JSDoc 冒頭を「`findByOwner` / `countByOwner` の filter 解決を共有する合成」と明確化（`findByOwner` 側を厚くするのは本 PR スコープ外）
- **[T-W-001]** T-001/T-002 の cross-check で count 契約 pinning を明示的に
- **[T-W-002]** T-001 の `toBeDefined()` を意味あるアサーション (`not.toContain`) に置換
- **[T-W-003]** T-003 に `findByOwner` / `countByOwner` 等価性 cross-check を追加

### 本 PR スコープ外として見送り（理由を明記）

- **[A-W-002]** `runExportJob` inline stub の silent return: 隣接 `findByOwner` / `countByOwner` も silent stub で 3 兄弟として内部一貫性がある。`findByIds` の throw との方針差は Follow-up
- **[A-W-003]** ポート公開面 3 メソッドの filter 共有規約の型レベル強化: 本 PR は API 追加であり、既存 `NoteOwnerListOpts` / `NoteOwnerCountOpts` の型関係を再設計するのはスコープ超え。Follow-up

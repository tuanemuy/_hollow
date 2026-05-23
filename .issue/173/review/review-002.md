# PR Review #002 — perf(issue-173): collapse duplicate buildOwnerListWhere via listWithCount

**PR:** #176
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 全レイヤーで問題点ゼロ確認
- Verdict: **APPROVED**

---

## Adapter / Infrastructure

### Blockers
- なし

### Warnings
- なし

### Notes
- [A-N-001] [A-W-001] 修正確認: `noteRepository.ts:482-487` に WHY コメントが追加され、`sorted.length` が「filtered total」であることと「`idScope.size` ではない理由」(status / dateRange / visibility NOT EXISTS predicates が candidate-set 外にある) が ADR-001(#165) §補足参照付きで明示されている
- [A-N-002] 見送り済み [A-W-002] (`runExportJob` inline stub silent return) は再指摘なし。隣接 stub と内部一貫
- [A-N-003] 見送り済み [A-W-003] (ポート公開面 filter 共有規約の型レベル強化) は再指摘なし。本 PR スコープ外として承認済み

---

## Domain / Application

### Blockers
- なし

### Warnings
- なし

### Notes
- [D-N-001] [D-W-001] 対応: `countByOwner(undefined)` ↔ `listWithCount` with all filter fields unset の対応が JSDoc に明示され、3 メソッド間の意味論的等価関係が `items === findByOwner` / `count === countByOwner(opts')` の擬似コード形式まで含めて pin されている
- [D-N-002] [D-W-002] 対応: adapter 内部用語 "candidate-set" が抽象表現 "filter combination cannot match any owner-scoped note" / "filters that intersect to the empty set" に置き換わった。`intersect to the empty set` は集合論的な domain-neutral 語彙
- [D-N-003] [D-W-003] 対応: JSDoc 冒頭が「3 兄弟の合成」("the third sibling of an API family that shares one filter contract") として明確化され、`{@link}` 参照付きで relations が辿れる
- [D-N-004] Hexagonal 整合性: adapter 詳細は domain ポート JSDoc に一切露出していない
- [D-N-005] Cross-layer catch policy 準拠維持

---

## Test

### Blockers
- なし

### Warnings
- なし

### Notes
- [T-N-001] [T-W-001] 対応: T-001/T-002 で `countByOwner(owner, opts)` に full `opts` を渡し、pagination/sort 無視契約が両経路で pin されている
- [T-N-002] [T-W-002] 対応: `expect(a).toBeDefined()` を `expect(batchItems.map(n => n.id)).not.toContain(a)` に置換、ページ window の意味論を直接 pin
- [T-N-003] [T-W-003] 対応: T-003 に `findByOwner(opts) → []` / `countByOwner(opts) → 0` の cross-check が追加され、空 intersected ケースでも sibling-equivalence 契約が pin される
- [T-N-004] T-001 / T-002 のサニティアサーションは fixture セマンティクス pinning として補完的役割を維持
- [T-N-005] T-004 の count independence は T-001/T-002 の full-opts cross-check と相互補強

---

## Performance

### Blockers
- なし

### Warnings
- なし

### Notes
1 周目から変化なし。`buildOwnerListWhere` 1 回化、chunk 経路の per-chunk `count()` 純減、`Promise.all` 並列化、メモリプロファイル退化なし、N+1 回避、すべて維持。

---

## Design Decisions

このラウンドで新規の設計判断は無し。1 周目で識別された見送り 2 項目 (A-W-002 / A-W-003) は本 PR スコープ外として ADR-001(#173) §Follow-up に追記検討可能だが、必須ではない（既に ADR-001(#165) Follow-up の文脈で類似 follow-up が記録されているため）。

---

## 結論

**APPROVED** — 全 4 レイヤーで Blocker・Warning ともゼロ。1 周目で指摘された 7 件 (Adapter 1 / Domain 3 / Test 3) はいずれも適切に解消され、新たな問題は検出されなかった。

PR を Ready for review に切り替えて完了。

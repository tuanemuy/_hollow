# PR Review #002 — fix(issue-165): chunk intersected id scope in buildOwnerListWhere

**PR:** #170
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 10
- Verdict: **APPROVED**

3 レイヤー（Adapter / Test / Performance）すべてで Round 1 指摘が反映され、新規問題なし。1 ラウンドクリーンで完了。

---

## Adapter / Infrastructure (Round 2)

### Round 1 指摘の反映確認
- **A-W-001** (`where ?? undefined` の二重防御): **反映済み**。`buildOwnerListWhere` の return shape が `{ where: SQL; idScope: ReadonlySet<string> | null } | null` に絞られ、caller の `?? undefined` 4 箇所が全削除。`and(...conditions) as SQL` の cast は WHY コメントで invariant を明示
- **A-W-002** (`SortColumn` 型制約): **反映済み**。`type SortColumn = Extract<keyof NoteRow, "updatedAt" | "createdAt" | "title">` に変更。列名タイポやスキーマ変更時に型エラーで検出可能
- **A-W-005** (backlink WHAT コメント): **反映済み**。`// backlink listing fixed sort: updatedAt desc, id desc` と `countByOwner` の id-only パス WHAT コメントが削除
- **A-W-003** (Follow-up): **反映済み**。ADR-001 Follow-up に `chunk 並列数の上限ガード` が追記

### Blockers / Warnings
- なし

### Notes
- [A-N-006] `as SQL` cast の WHY コメントで drizzle `and()` invariant が説明されている
- [A-N-007] `Extract` で `keyof NoteRow` と交差されており列追加・削除時にメンテされる
- [A-N-008] `select({ c: count() })` 化で I/O・マテリアライズが削減
- [A-N-009] Follow-up エントリ 3 件が ADR-001 にトレース可能な形で追記

---

## Test (Round 2)

### Round 1 指摘の反映確認
- **T-W-001** (`sort='title'` chunk 経路テスト): **反映済み**。`T-bind-012` で 150 件 + `sort='title', order='asc', limit=50` の chunk 経路同値性を SQL 仕様と独立な expected 構築で検証
- **T-W-002** (T-bind-011 list/count cross-check): **反映済み**。`expect(listed).toHaveLength(count)` 追加
- **T-W-003** (seam straddle): **反映済み**。`T-bind-013` で `late/earlyTs` 2 バケット × 60 件 = 120 件 で SAFE_CHUNK_SIZE=90 を straddle
- **T-W-004** (`intersected.size === 0` 早期短絡): **反映済み**。`T-bind-014` で存在しない tagId で `[]` / `0` を assertion

### Blockers / Warnings
- なし

### Notes
- 全 44 ケース PASS（新規 7 件 `T-bind-008..014` 含む）
- T-bind-012 expected が `sortNoteRowsBy` を参照せず独立に lexicographic sort を再実装している点が良い
- T-bind-013 は UUIDv7 の time-ordered 性に依存するが、テスト本体が独自に id sort するため前提失効を同期検出

---

## Performance (Round 2)

### Round 1 指摘の反映確認
- **P-W-001/W-002** (`contentHtml` 全行マテリアライズ問題): **反映済み**。ADR-001 Follow-up に「`findByOwner` chunk 経路の 2-pass 最適化」として明示記録。10-50KB/行の現実サイズと「Workers 128MB / NoteRow 1KB / 1 万件」前提の桁ズレ、2-pass 化の具体方針、別 Issue 化判断が記載
- **P-W-003** (`countByOwner` chunk `count()` 集計): **反映済み**。両経路で `select({ c: count() })` に切替、`rows[0]?.c ?? 0` / `rows.reduce(...)` で集約。WHY コメントで filter 制約の理由を保持
- **P-W-004** (重複呼び出し回避): **反映済み**。ADR-001 Follow-up に追記

### Blockers / Warnings
- なし

### Notes
- [P-N-006] `count()` 集約化で行素材化が消え値 N 個に圧縮
- [P-N-007] Follow-up セクションが「既出 / 新規」に分離されトレース可能
- [P-N-008] `idScope === null` 経路は単発 SQL を維持し chunk 化オーバーヘッドが filter 不使用ケースに漏れない
- [P-N-009] chunk 経路コメント (l.399-403) が WHY を明示

---

## Design Decisions

このラウンドで新規の設計判断は無し。Round 1 で識別された Follow-up 3 項目（[P-W-001/W-002], [A-W-003], [P-W-004]）が ADR-001 に追記され、別 Issue として継続管理される判断が確定。

---

## 完了判定

**Blocker 0 / Warning 0** で 1 ラウンドクリーン → レビューループ完了。

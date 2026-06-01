# PR Review #003 — fix(#388): ディレクトリ移動UIのスケーラビリティ改善 / パス先頭スラッシュ重複の修正

**PR:** #398
**Date:** 2026-06-01
**Round:** 3回目（最終確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（1〜2周目の全指摘の解消を確認）
- Verdict: **APPROVED**

---

## Frontend / アクセシビリティ / UX / ロジック

### Blockers
なし

### Warnings
なし

### Notes
- W-F1/W-L1（Escape 二重クローズ）解消確認: `hasListbox` 時のみ `preventDefault`＋`stopPropagation`＋`setOpen(false)`、非表示時はバブルさせる二段挙動。テストで実検証済み。
- W-F2（clear フォーカス脱落）解消確認: `clear()` が `inputRef` で検索 input にフォーカスを戻す。
- パス正規化（ADR-003）・cyclic 除外＋root 分離（ADR-002）・DirectoryPicker の二択維持＋clearable（ADR-005）・MoveNoteDialog の submit ガードいずれも計画/ADR と整合。残存 Blocker/Warning なし。
- `MoveDirectoryDialog` の `dto/directory` import 経路差は同一型 re-export で型不整合なし。経路統一は plan で明示的にスコープ外。

---

## テスト網羅性 / テスト設計 / テスト品質

### Blockers
なし

### Warnings
なし

### Notes
- W-T1（commit で閉じる・query クリア・再オープン）/ W-T2（Escape で閉じる・stopPropagation 二段）/ N-T2（disabled）すべて追加され、削除すると fail する意味あるアサーション。
- 安定属性ベースのセレクタで脆くなく、index アクセスは length アサーションでアンカー済み。`.skip`/`.only` 無し、2ファイル22テスト全 green。
- `directoryTree.test.ts` は `//`否定・正常系・フィールド不変・forest 独立正規化・第2 root 配下の id 解決（早期 break なし）まで網羅。

---

## Design Decisions

特になし（ADR-001〜005 で記録済み）。3周で収束、APPROVED。

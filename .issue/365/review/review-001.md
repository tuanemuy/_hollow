# PR Review #001 — fix(#365): タグ利用件数を read-time 集計に変更

**PR:** #371
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 多数（良点）
- Verdict: **BLOCKED**（Warning 残のため。完了条件は Blocker 0 かつ Warning 0）

---

## Adapter / Infrastructure

### Blockers
なし

### Warnings
- **[W-A001]** `orderBy` でエイリアス参照か集計式再展開かが drizzle バージョン依存。機能的実害なし（SQLite では同結果）。ソート integration test が緑であることで担保。→ 対応: 生成 SQL を一度 `.toSQL()` で確認できると回帰調査が早い（必須ではない）。
  - 場所: `tagRepository.ts:149,186`
- **[W-A002]** `groupBy(tags.id)` への bare column select は SQLite/D1 固有の緩い挙動（PK 機能従属）。D1 固定なので実害なしだが移植性のない書き方。→ 対応: その旨を1行コメントで残すと親切。
  - 場所: `tagRepository.ts:168-185`

### Notes
- COUNT(notes.id) 選択・active を JOIN 条件側に配置・coerce・他経路無変更・N+1なし・LIKE維持・テスト堅実、すべて適切（N-001〜N-008）。Blockerなし、マージ可能と評価。

---

## Test

### Blockers
なし

### Warnings
- **[W-T001]** ソートテストに「0 件タグ」が含まれず plan ケース6から逸脱。noteCount ソート時に count=0 タグが一覧に残り desc 末尾/asc 先頭に並ぶ挙動が未検証（COUNT(*) 退行や INNER 化を検出できない）。
  - 場所: `tagRepository.integration.test.ts:346-387`
  - 提案: 0 件タグを末尾に seed して desc 末尾/asc 先頭・一覧から脱落しないことをアサート。
- **[W-T002]** owner 分離テストが別名タグのため WHERE 句の確認に留まり、JOIN の owner 境界（自 owner tag に他 owner note がリンクされた場合の混入）を突いていない。
  - 場所: `tagRepository.integration.test.ts:389-408`
  - 提案: 自 owner の tag に他 owner 所有の note を linkNoteTag し、それでも混入カウントされないことをアサート。
- **[W-T003]** 「同一ノートに複数タグ」「limit/offset 境界」が未カバー。plan リスク欄は limit+1 戦略を「テストでカバー」と明記しているが全テスト limit:100 で境界を踏まない。
  - 場所: `tagRepository.integration.test.ts` 全体
  - 提案: limit:1/offset:1 等で集計タグ数に limit が効く（JOIN 前行数でない）ことを1ケース固定。

### Notes
- 列ドリフト無視テストが本質を突く、数値アサートで coerce 暗黙カバー、cascade/active/独立性すべて妥当（N-001〜N-006）。

---

## Architecture / Spec

### Blockers
なし

### Warnings
- **[W-S001]** database 設計 spec が死蔵化を反映していない。`note_count` 列と `idx_tags_owner_note_count` 索引が現役のように記述されたまま。
  - 場所: `spec/database/index.md:302,308`
  - 提案: 「Issue #365 以降は死蔵（表示は read-time 集計。spec/domains/tag.md 参照）」の注記を追加。
- **[W-S002]** usecase 設計 spec の noteCount inc/dec 記述が死蔵化と矛盾。CreateNote/SaveNote の noteCount inc/dec は実装されておらず（配線漏れがバグの本質）、この記述自体が「increment 配線漏れ＝バグ」と再誤認させる原因。
  - 場所: `spec/usecases/note.md:18,47`、`spec/usecases/tag.md:55`
  - 提案: 死蔵列の更新であり表示は read-time 集計である旨を注記、または実装に合わせ「noteCount 列を更新しない」と明記。tag.md:55 の「再集計」は実装が increment ループなので語を正す。

### Notes
- spec/domains/tag.md の二層構造記述・findByOwner の JSDoc は的確（CLAUDE.md「WHYのみ」準拠）。根本原因（mergeTags のみが increment 呼び出し）も実コードと一致（N-001〜N-004）。

---

## Design Decisions

新規の設計判断なし（既存 ADR-001/002/003 の範囲内）。W-S002 の対応により、spec 全体で「死蔵だが残置」の判断が追える状態に揃える。

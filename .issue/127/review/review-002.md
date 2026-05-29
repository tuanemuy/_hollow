# PR Review #002 — fix(issue/127): resolve internal-link resolved_note_id by title (and id) match

**PR:** #320
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（修正解消確認・退行なし）
- Verdict: **APPROVED**

---

## Test + Domain

### Blockers
- なし

### Warnings
- なし

### Notes（抜粋）
- 1周目 Warning 全件解消（W-T-001 / W-T-002 / W-D-001）。
- **ミューテーション検証実施**: `status === "active"` ガードを削除すると trashed テストが FAIL、`note.id === targetId` ガードを削除すると id-mismatch テストが FAIL。両ガードがテストで意味づけされ回帰穴が塞がれたことを確認。
- Domain `resolveInternalLinks` に退行なし（catch 撤去・明示ソート・self除外・kind=id 4条件ガード）。
- カバレッジに残る穴なし。domain/note 全体 103 PASS / 0 FAIL。

## Use Case + Adapter/Port

### Blockers
- なし

### Warnings
- なし

### Notes（抜粋）
- W-A-001/002 解消: ポート JSDoc に trim 契約・LIMIT 非適用を追記。
- W-U-001 解消: ADR-006 文言精緻化（永続化等価 / エラー順序は意図的変更）＋ overwrite target が他ユーザーのとき ForbiddenError かつ foreign note 無変更を固定する統合テスト追加。
- W-U-002 解消: デッドコード削除、`directoryId` は `const` 化。削除による破綻なし（overwrite 経路以降で未参照、create 経路でのみ使用）を確認。
- typecheck クリーン / ユニット 13 PASS / ingestion 統合 27 PASS（新規 ForbiddenError 含む）。振る舞いを変えるソース変更なし。

---

## Design Decisions

このラウンドで新規の設計判断なし。ADR-001〜007 は実装と整合。

## 完了

1ラウンド（round 2）で Blocker 0 / Warning 0 を達成。レビュー完了 → PR を Ready for review に切り替える。

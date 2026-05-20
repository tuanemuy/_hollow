# PR Review #002 — feat(issue-50): switch FTS5 tokenizer to trigram for CJK partial match

**PR:** #90
**Date:** 2026-05-20
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 多数
- Verdict: **BLOCKED**（軽微）

---

## Infrastructure / Adapter

### Blockers
- なし

### Warnings
- なし

### Notes
- review-001 W-001 (CREATE TRIGGER IF NOT EXISTS) 完全対応
- review-001 W-002 (ADR-002 Consequences 追記) 完全対応
- review-001 W-004 (schema.ts コメント) 完全対応
- 修正による回帰なし、冪等性の物語に穴なし

**Verdict: CLEAN**

---

## Test

### Blockers
- なし

### Warnings
- なし

### Notes
- review-001 W-001 (`bulkRebuildFromSnapshots` wipe 契約検証) 完全対応
  - stale doc 本文も trigram で `デザイン` にマッチするため、wipe をスキップすれば必ず落ちる構造
  - `result.hits.find((h) => h.noteId === stale.noteId)).toBeUndefined()` で明示的に消失を確認
- review-001 W-002 (visibilityFilter ネガティブアサート) 完全対応
  - `["public"]` / `["private"]` / `["public", "private"]` の 3 ケース網羅
- 整合性問題なし、ヘルパー崩れなし、コメントの WHY 明記が CLAUDE.md 原則と整合
- 統合テスト 342/342 PASS

**Verdict: CLEAN**

---

## Documentation / Spec

### Blockers
- なし

### Warnings

- **[W-001]** P32（公開検索画面）の責務記述に短すぎるクエリ時の UX が落ちている
  - 場所: `spec/pages/index.md:280-287`
  - 理由: review-001 W-002 への対応として P10（個人領域ホーム）には追記したが、P32（公開検索）に対称対応が漏れていた。trigram の 3 codepoint 制約は adapter 側のガードで、検索経路（個人 / 公開）に関係なく一様に効くため P32 にも同等の記述が必要
  - 提案: P32 の「機能」リストに「クエリが短すぎる場合は trigram 索引の制約で 0 件扱い」を 1 行追記
  - **→ 本ラウンドで対応済み**（P32 にミラー追記）

- **[W-002]** scenario E3 の表現「N-gram（trigram）」がやや実装詳細寄り
  - 場所: `spec/scenario/browse.md:36`
  - 提案者自身が「軽微。見送り可」と明記。シナリオ表現が現在の実装と一意に対応している価値もある
  - **→ 見送り**（明示的な見送り合意のうえ次の adapter 移植時に再評価）

### Notes
- review-001 B-001 / B-002 / W-001 / W-002 / W-003 / W-004 すべて完全対応
- ADR と各 spec の論旨が一貫している
- `.issue/29/adr.md` ADR-006 の Status 更新とクロスリファレンスが双方向で成立

---

## Design Decisions

- 本ラウンドで採用した W-001 修正は P10 と P32 の対称性を保つための spec-sync。新規 ADR は作らない。
- W-002 は提案者自身が「見送り可」と明記しているため見送り（シナリオ層の抽象度が下がる可能性はあるが、現状の実装と一意対応するという利点もある）。

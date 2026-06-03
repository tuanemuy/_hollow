# PR Review #001 — feat(#92): 短すぎる検索キーワードに LIKE フォールバックを追加

**PR:** #443
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（実質対応するもの: Test W-001 / Infra W-001 / Test W-002 のコメント補足）
- Notes: 多数（MATCH 経路完全保持・SQL安全性・visibility アクセス制御を確認）
- Verdict: **BLOCKED**（Warning 解消のため1ラウンド修正）

---

## Infrastructure

### Blockers
なし

### Warnings
- **[W-001]** `substr(sd.body_plain, 1, 160)` のスニペット切り出しは SQLite の文字単位。`SearchSnippet` 上限 1024 は JS の UTF-16 code unit 数。160 文字 = 最大 320 code units で安全だが、将来 `LIKE_SNIPPET_CHARS` を引き上げる際に単純比較すると超過リスク。
  - 場所: `app/core/adapters/d1/searchIndex.ts:232`
  - 対応: 定数コメントに単位差の注記を追加。
- **[W-002]** LIKE 経路の ORDER BY は `note_id ASC` 単独（MATCH 経路は bm25 tie-break）。決定性・cursor 一貫性は問題なし。性能はオーナー受容済み。
  - 対応: 変更不要（Note 寄り）。

### Notes
- MATCH 経路の SQL は main とバイト単位で完全一致、回帰なし（N-001）。
- `'""'` 分岐消滅は意図どおり、全消滅ケースも LIKE 経路で救済方向（N-002）。
- score 0 経路（`-0 >= 0`）正しい、テスト #12 が `=== 0` で符号付きゼロ回避（N-003）。
- drizzle バインドパラメータ・WHERE AND 結合・OR 括弧すべて正しい（N-004）。
- body_plain NOT NULL で substr が null 返さず、空文字も SearchSnippet 通過（N-005）。

## Test

### Blockers
なし

### Warnings
- **[W-001]** LIKE エスケープテストが `_`（アンダースコア）を検証していない。テスト名・plan #9 は「`%`・`_` をリテラル扱い」を謳うが、実際は `%` のみアサート。`_` のエスケープが回帰してもテストが緑のまま。
  - 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts`（`LIKE fallback treats % and _ literally`）
  - 対応: `_` を含む doc と対照 doc を seed し、`_` がワイルドカード暴発しないアサートを追加。**修正する。**
- **[W-002]** score-0 アサートは `toHit` のクランプ（負値→0）に吸収され、LIKE 経路が将来 bm25 様の値を返すよう壊れても偽陰性になりうる。
  - 対応: テストにこの限界を示すコメントを追記（Note 寄り）。

### Notes
- plan 12 ケースは `_` 不足を除き全実装（N-001）。
- 旧テストは削除でなくリネーム＋期待値反転で回帰意図維持、否定アサート追加も良い（N-002）。
- 混在ケーステストが「短トークン破棄」を観測可能な振る舞いで証明、秀逸（N-003）。
- 偽陽性リスク低、FK 連鎖整合（N-004）。

## Security

### Blockers
なし

### Warnings
なし

### Notes
- SQL インジェクション安全（バインドパラメータ、`["\\]` strip）（N-001）。
- escapeLikePattern のエスケープ順序・`ESCAPE '\\'` 整合（N-002）。
- ワイルドカード暴発防止をテストで明示（N-003）。
- **visibility アクセス制御**: 公開検索が `["public"]` 固定、buildSharedFilters が両経路に同一適用、非公開漏れの構造的隙間なし（N-004）。
- tag LIKE / スニペット / DoS いずれも問題なし（N-005〜N-007）。

---

## Design Decisions

このラウンドで新規の設計判断なし。既存 ADR-001〜003 の範囲内。

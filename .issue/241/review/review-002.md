# PR Review #002 — docs(spec/design): update P13/P15 FrontMatter examples to "show if present" model

**PR:** #247
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## General Review

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] W-001 完全解消を確認**: コミット `6a67ee0 docs(spec/design): also update P15 FrontMatter wording (review-001 W-001)` で `spec/design/pages/P15-export.html:727` の旧文言（`title / tags / date / status などのメタデータを冒頭に出力`）が新表現（`date / title / description などのメタデータを冒頭に出力`）に書き換わっており、ADR-001（`SUGGESTED_KEYS` のみサジェスト）/ ADR-002（`frontMatter.tags` 不参照）に整合。`.issue/241/plan.md` も「含まれるもの」にこの修正を明記する形でレビューを受領しており、差分と計画が一致している。

- **[N-002] 取りこぼし再探索の結果**: 以下の多角的な grep（カンマ / スラッシュ / 「と」「や」「、」区切り、日本語混在、3-token 列挙、`frontMatter.<key>` 直書き、`KNOWN_KEYS` 系語）で、`spec/design/` 配下に旧モデル前提の固定スキーマ列挙は他に残っていないことを確認した:
  - `(title|date|tags|status|slug|description)` 系の 3-token 以上列挙 → ヒットは P13/P15 の本 PR 修正済み行のみ（および性質の異なる `P15-export.html:750` の `{title} · {slug} · {date} · {id} · {ext}`）
  - 日本語版（`タイトル|日付|タグ|ステータス|スラッグ|説明` の 3-token 以上） → なし
  - `KNOWN_KEYS` / `既知キー` 系の語 → spec/ 配下に残置なし

- **[N-003] スコープ外（指摘ではなく観察）**: `spec/design/pages/P15-export.html:750` の `使用可能: {title} · {slug} · {date} · {id} · {ext}` はエクスポートのファイル名テンプレート変数の列挙であり、FrontMatter キーの固定スキーマ列挙ではない（実装側で意味を持つテンプレート変数）。本 Issue / ADR-001-002 のスコープ外。

- **[N-004] スコープ外（観察）**: `spec/design/pages/P07-landing.html:721` の「フロントマターを解釈してタグや日付を自動で整理します」はランディング向けキャッチコピーで、「FrontMatter の `date` 解釈」+「（本文ハッシュタグ由来の）タグ自動整理」と読めなくはないが、字面では FrontMatter からタグを取るとも誤読されうる。固定スキーマ列挙ではないため本 PR のスコープ外。気になるなら別 Issue 化検討。

- **[N-005] `spec/adr/003-metadata-formats.md:15`** の `title / aliases / created / updated / publish など` は ADR-002 への明示的言及付きで「例示」として書かれており、`tags` を含まないなど後追い記述として既に整合している。本 PR と矛盾しない。

- **[N-006] 検証成果物の質**: `.issue/241/.manual-test/` 配下に PASS 2/2 のレポートとスクリーンショット 3 枚（特に決定的証拠の `step-03-frontmatter-line.png`）が残されており、文言 1 行修正としては十分以上の検証厚み。P15 の追加修正についても TC-003 が PASS 記録されている。

---

## Design Decisions

特になし。

---

## レビュアー総評

Round 1 の W-001 は本 PR 内で完全に吸収済み。多角的な grep で他に旧モデル前提の固定スキーマ列挙が `spec/design/` 配下に残っていないことを確認できた。Issue #241 の意図「旧固定スキーマ前提の撲滅」は完了。**APPROVED**。

# PR Review #001 — docs(spec/design): update P13 FrontMatter example to "show if present" model

**PR:** #247
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 4
- Verdict: **BLOCKED** (Warning が 1 件、修正対象)

---

## General Review

### Blockers

なし

### Warnings

- **[W-001]** P15-export.html に同種の旧モデル前提文言が残置されている
  - 場所: `spec/design/pages/P15-export.html:727`
  - 理由: `title / tags / date / status などのメタデータを冒頭に出力` という文言が、本 PR が P13 で撲滅対象とした「`tags` / `status` を固定スキーマ的に列挙する」表現と同質。Issue #230 ADR-001（`SUGGESTED_KEYS = ["date", "description", "title", "slug"]`、`tags`/`status` はサジェスト対象外）/ ADR-002（`frontMatter.tags` は新仕様で意味を持たない）に同様に抵触する。plan.md の grep 検証が PR で書き換えた文字列（カンマ区切り）に限定されており、スラッシュ区切りバリエーションを取りこぼしていた。
  - 提案: 本 PR で同じパターンの修正（`date / title / description などのメタデータを冒頭に出力`）を追加する。Issue 意図 = 「旧固定スキーマ前提の撲滅」に同居する 1 行のため、本 PR スコープに取り込むのが妥当。

### Notes

- **[N-001]** 文言設計の判断は妥当。`date` を先頭に置くことで「実装側で意味を持つ唯一のキー（`parseFrontMatterDate`）」を暗黙的に強調できており、ADR-001 の意図と整合する。`slug` をサジェスト対象でありながら例示から外し可読性を優先した判断も妥当。
- **[N-002]** 「を検出」という述語を残した判断（plan.md 設計判断②）も妥当。「あれば表示」はエディタ表示モデルの話で、取り込み時のパース挙動とは別レイヤー。
- **[N-003]** Row 4 メタ行の `#design #essay #apple` ハッシュタグ群と `FrontMatter: ...` 文言の同居は、ADR-002 「タグソースはハッシュタグに一本化」をモック側でも視覚的に体現しており完成度が上がっている。
- **[N-004]** ブラウザ検証（`.issue/241/.manual-test/`）は 3 枚のスクリーンショット＋ snapshot 文言一致まで取っており、文言 1 行修正の規模に対して妥当な厚み。

---

## Design Decisions

特になし（既存 ADR-001/002 の追従であり、新たな設計判断は発生していない）。

---

## レビュアー総評

PR で変更された 1 行自体は ADR-001/002 と完全整合し、文言・配置・検証ともに妥当。ただし `spec/design/pages/P15-export.html:727` のスラッシュ区切り同種文言が plan.md の grep クエリ（リテラル一致）で取りこぼされていた。Issue 意図（旧固定スキーマ前提の撲滅）の完遂を求めるなら W-001 を本 PR で吸収する判断。

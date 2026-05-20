# PR Review #003 — feat(issue-50): switch FTS5 tokenizer to trigram for CJK partial match

**PR:** #90
**Date:** 2026-05-20
**Round:** 3回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

review-002 で指摘された Docs/Spec W-001（P32 への対称対応）が修正コミットで完全に反映され、P10 と P32 の責務記述に trigram 短クエリの 0 件挙動が対称に明記された。Infra / Test レイヤーは Round 2 時点で既に CLEAN だったため再走対象外。

---

## Documentation / Spec

### Blockers
- なし

### Warnings
- なし

### Notes
- P10 (`spec/pages/index.md:115`) と P32 (`:285`) の双方が trigram 短クエリの落ち UX を明記、個人検索と公開検索の責務記述に対称性が成立
- 文言の微差は構造差（既存の長いパラ vs 単独行）からくる必然で意味は同一
- scenario / domain / database / manual-tests / ADR の全層で論旨が一貫しており、「ドメイン契約は据え置き、adapter ガードで 0 件返却、UI ヒントはフォロー Issue」というストーリーが全層に伝搬
- review-002 がコミットに含まれて Round 2 → Round 3 の経緯がトレース可能
- P30（ユーザー単位の検索ボックス）は高レベル記述で facets/hints が書かれていないため trigram 制約の追記不要。意図的な抽象度差として整合

**Verdict: CLEAN**

---

## Final Verdict

すべてのレイヤーがクリーン:
- Infrastructure / Adapter: Round 2 で CLEAN
- Test: Round 2 で CLEAN
- Documentation / Spec: Round 3 で CLEAN

**PR #90 はマージ可能な状態。**

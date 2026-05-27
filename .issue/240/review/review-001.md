# PR Review #001 — docs(issue-240): align spec with implementation — drop FrontMatter↔publish sync references

**PR:** #242
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 7
- Verdict: **BLOCKED**（Warning 1 件あり、修正後再レビュー）

---

## General

### Blockers
なし

### Warnings

- **[W-001]** `.issue/240/testing.md` の TC-F1-03 検証手順 4 が分かりにくい
  - 場所: `.issue/240/testing.md:61`（「ノートに `publish` 系のキーが既にあれば（手書きの場合）、その値は P14 の状態と一致せずに維持されていることを確認」）
  - 理由: 「P14 の状態と一致せずに」という表現は二重否定的でロジックがすぐ読み取れない。本来言いたいのは「P14 で公開状態を変えても、既に手書きされている `publish` 値はそのまま残り、書き換えられない（独立性が保たれる）」というポイント。後続読者がこの一文だけ拾うと「不整合な状態を残す」と誤読する可能性がある
  - 提案: 「ノートに `publish` 系のキーが既に手書きされている場合、`P14` 経由の公開状態切替によって `publish` の値が上書きされないこと（独立性の二方向検証）」のように書き換えると、対の検証であることが伝わる

### Notes

- **[N-001]** plan / ADR / testing / manual-test 成果物 / spec 6箇所の更新が完全に一致しており、廃止方向の意図がぶれずに反映されている（grep 検証もゼロヒット=意図的残置のみで通る）
- **[N-002]** TC-D4-05 をネガティブテストへ転用（番号体系保全 + 機械的回帰防御）という ADR-002 の判断は適切。書き換え後文言は前後の TC-D4-01〜04（重複キー、不正 JSON 等の構造編集系異常系）と種別「異常系」のままで違和感がない
- **[N-003]** ADR-003 の `aliases` を残し、`title / description / slug / aliases / date` という順序が `spec/domains/note.md:78` の `title, description, slug, aliases` 例示順と揃っている
- **[N-004]** Issue #230 ADR-001 との接続が `.issue/240/adr.md` ADR-001 の Context および理由 2 で明示されており、後続読者が経緯を辿れる
- **[N-005]** `spec/scenario/publish.md` F1 正常系の番号付きリストは項目 4 削除後も 1〜3 で完結し、項目 3 末尾が F1 のクライマックスとして自然に機能している
- **[N-006]** `spec/pages/index.md` P11/P12 の該当行は箇条書きで「公開ステータス書換時の保存前注意表示」という末尾断片を除去しても句読点も破綻していない
- **[N-007]** マニュアルテスト実機実行結果が新仕様の主張（独立性・非伝播）を実装ベースで PASS 確認しており、spec 変更が虚構でないことが裏打ちされている

---

## Design Decisions

特になし

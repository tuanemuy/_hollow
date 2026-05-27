# PR Review #002 — docs(issue-240): align spec with implementation — drop FrontMatter↔publish sync references

**PR:** #242
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## General

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** W-001 の修正は提案文言にほぼ忠実で、二重否定の解消と「P14 → FrontMatter 方向の不伝播」という主張を明確化できている。step 3 と対をなす「独立性の二方向検証」というラベリングも保持されており、後続読者が一文だけ拾っても意図を読み違えにくい
- **[N-002]** 「`publish` 系のキー」が「`publish` キー」に絞られたが、TC-D4-05 step 1 の文言と整合し、`.issue/240/manual-test/results/TC-F1-03.md` の検証対象（`publish` キー単独）とも一致する。表記の揺れは生じていない
- **[N-003]** step 4 は「既に手書きされている場合は」という条件付きサブステップであり、Edge Case 1（同 testing.md 内）の「無ければスキップ」前提と整合している
- **[N-004]** ラウンド 1 の Notes（N-001〜N-007）はいずれもラウンド 2 の修正で破壊されていない。spec 本体・plan・ADR・manual-test 成果物との接続は維持されたまま
- **[N-005]** ラウンド 1 全体を再点検したが、見落とした Blocker / Warning 候補は検出できなかった。spec 6 箇所と ADR-003 の更新は計画通り完全に反映されており、grep でも意図しない残置は無い

---

## Design Decisions

特になし

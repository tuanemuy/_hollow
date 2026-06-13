# PR Review #002 — feat: #680 編集中フォームの routerInvalidate フォーカス喪失を復元フックで解消

**PR:** #684
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 14
- Verdict: **BLOCKED**（Frontend W-001 の ADR 文言修正のみ）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 0 / **APPROVED**）

## 指摘一覧と仕分け

### このPRで直す

- [Frontend W-001] ADR-004 の「body blur と RSC detach は区別不能（本質的制約）」断定に裏取りがない（RSC detach 由来の focusout が React 合成 onBlur を発火させるか未観測）。論拠の重心を「区別不能」→「実害小」に正すべき。フック本体の変更は不要 → **修正済み**（ADR-004 の W-001 記述を、見送りの主根拠を実害の小ささに置き、onBlur 解除案は relatedTarget 分離の未実測リスクで採らない、という表現に精緻化。コード変更なし）

### 確認済み（1周目仕分けの妥当性）

- 1周目 Frontend W-001（見送り）・W-002（E-1 修正で解決）・Test B-001/W-001/W-002/W-003（修正）はすべて妥当に処理済みと Round 2 で再確認。Test は全分岐をミューテーション実測で裏付け APPROVED。

## Notes（主な良い点）

- ハンドラ spread が3フォームで onChange と非干渉（AC-7 構造的担保）（Frontend N-001）
- post-commit arm（ADR-004）が JSDoc に WHY 付きで反映、happy-dom 差異もテスト冒頭に明記（Frontend N-003）
- ユニット9件が全分岐網羅、各ガードが mutation-sensitive でトートロジーでない（Test N-001〜N-006）
- ユニット⇔実機の責務分担が妥当（Test N-007）

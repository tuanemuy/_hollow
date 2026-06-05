# PR Review #003 — コードブロックの shiki シンタックスハイライト / Tab インデント

**PR:** #504
**Date:** 2026-06-06
**Round:** 3回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（対応不要）
- Verdict: **APPROVED**

2周目の Logic 指摘 W-L-001（`dedentAtCaret` の先頭改行バグ）の修正を Logic / Test 両観点で最終確認。Frontend / Performance は2周目でクリーン、かつ本ラウンドの修正（`dedentAtCaret` と回帰テスト1件）に該当ファイルが含まれないため再確認不要。

---

## Logic
#### Blockers
なし
#### Warnings
なし

修正 `lineStart = text.slice(0, caret).lastIndexOf("\n") + 1` を全境界（caret=0/末尾/改行直後/複数改行/スペース内）でコード追跡＋実測検証し、いずれも正しい lineStart と `removedBeforeCaret`/`restoreCaretWithin` のオフセット整合を確認。1周目修正（オンデマンドロード・キャレットガード・enclosingPre）への退行なし。

## Test
#### Blockers
なし
#### Warnings
なし

回帰テストを mutation testing で検証: `dedentAtCaret` を旧実装に戻すと当該テストが `AssertionError: expected '\nfoo' to be '\n  foo'` で FAIL し、修正版で 33/33 green。`value={...}` 式で `\n` が実改行として渡り、`event.defaultPrevented` も検証して no-op が偶然でないことを担保。false positive なし。検証用の一時変更は元に戻し済み（git diff クリーン）。

## Frontend / Performance
本ラウンドは該当変更なし（2周目で Blocker 0 / Warning 0 確定）。

---

## レビュー結論

3ラウンドかけて 1周目 Warning 7 件・2周目 Warning 1 件をすべて解消。3周目で全観点 Blocker 0 / Warning 0 のクリーンラウンドに到達したため APPROVED。PR を Ready for review に切り替える。

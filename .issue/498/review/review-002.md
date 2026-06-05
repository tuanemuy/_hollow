# PR Review #002 — コードブロックの shiki シンタックスハイライト / Tab インデント

**PR:** #504
**Date:** 2026-06-06
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（Logic）
- Notes: 多数（対応不要）
- Verdict: **BLOCKED**（Warning 1 件のため修正）

1周目の Warning 7 件はすべて修正済みであることを、各観点で再確認（Frontend / Test / Performance は Blocker 0 / Warning 0）。Test レビューは mutation testing で追加テストが意図した退行を実際に検出することを実証。Performance レビューは実 build で `dist/server` への shiki 0 件混入・grammar の個別 lazy chunk 化を再確認。

---

## Frontend
#### Blockers / Warnings
なし（W-F-001/002 修正を妥当と確認）

## Logic
#### Blockers
なし

#### Warnings
- **[W-L-001]** `dedentAtCaret` の行頭判定が、caret offset 0 かつブロックが改行で始まる場合に誤った行を dedent する。
  - 場所: `InlineEditor.tsx` `dedentAtCaret`（`text.lastIndexOf("\n", caret - 1)`）
  - 理由: `caret === 0` のとき `lastIndexOf("\n", -1)` は fromIndex を 0 にクランプし index 0 を検査するため、先頭が `\n` だと `0` を返す（`-1` ではない）。結果 `lineStart` が 1 になり、1 行目（空行）ではなく 2 行目の行頭スペースを除去してしまう。serialize で span は除去されるが、スペースの改変は保存に乗るため編集結果として誤り。
  - 提案: `text.slice(0, caret).lastIndexOf("\n") + 1` に置換（負の fromIndex クランプを構造的に回避）。

## Test
#### Blockers / Warnings
なし（W-T-001/002 の追加テストが mutation testing で退行検出を実証。モック更新による空洞化なし）

## Performance
#### Blockers / Warnings
なし（W-P-001/002/003 の修正を実 build とコード追跡で確認。`dist/server` shiki 0 件、grammar 個別 lazy chunk）

---

## 修正対応（このラウンドで実施）

- W-L-001: `dedentAtCaret` の行頭判定を `text.slice(0, caret).lastIndexOf("\n") + 1` に変更。回帰テスト「does not dedent another line on Shift+Tab at offset 0 of a newline-led `<pre>`」を追加（バグ版では 2 行目のスペースが除去され FAIL することを確認）。

## Design Decisions

特になし（既存 ADR の範囲内）。

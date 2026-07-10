# PR Review #002 — refactor(common): 可変単位バイト整形ヘルパ（formatBytes）の重複を共有 util に集約

**PR:** #829
**Date:** 2026-07-10
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1（プロセス指摘のみ — コード欠陥なし）
- Notes: 7
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0 / N: 5）
- Test: review-002-test.md（B: 0 / W: 1 / N: 2）

## 指摘一覧と仕分け

- [W-001]（Test）Round 1 の3修正が未コミットで PR HEAD には旧テスト — `byteSize.test.ts`
  → **対応: このラウンドでコミット＋push して解消**（コード変更ではなくプロセス。両レビュアーが「修正は的確に反映済み・全期待値検算一致」と確認済み）。
- [N-001]（Test）実閾値ケースを limits 既定値定数に pin していない（代表 call-site 形状での固定に留まる）
  → **見送り**: 既定値はランタイム可変設定で literal 一致は非保証。call-site 形状（0桁を踏む 256 MB / 1桁 32 MB）の固定でリグレッション検出目的は満たす。レビュアー自身も「テスト目的には十分・任意」と明記。
- [N-002]（Test）`scaled>=100` の0桁パスを GB/TB レンジで未 exercise
  → **見送り**: 0桁パスは KB(100 KB)・MB(100 MB / 256 MB)で既にロック済み。GB/TB は同一コードパスで冗長。機能的な穴ではない（レビュアーも「任意」）。
- Frontend [N-001〜005] / Round1 由来はすべて良い点・追跡メモ（1文字一致・U+2014・ADR-001 据え置き・型緩和の意図補完）→ 対応不要。

## 完了判定

このラウンドで「このPRで直す」コード指摘はゼロ（W-001 は commit/push で解消、N は見送り記録済み）。
Step 7 の完了条件を満たし **APPROVED**。

# PR Review #003 — refactor(note): #795 editor メディアアップロードUI刷新

**PR:** #797
**Date:** 2026-06-27
**Round:** 3回目（収束確認）

## Summary

- Blockers: 0
- Warnings: 1（すべて見送り記録済み）
- Notes: 10
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 0 — クリーン）
- Test: review-003-test.md（B: 0 / W: 1）
- Architecture / Consistency: ラウンド2で B:0/W:0 に収束済み（review-002-arch.md）。ラウンド2のフィックスは data-disabled の値表記（styling）とテストのみで、アーキ面の差分なし → 再レビュー不要と判断。

## 前ラウンド指摘の解消

- [W-001 frontend] data-disabled の値 → `"" / undefined` に修正、ADR-003 準拠（解消）
- [B-004 test] Promise.resolve 連打の脆さ → `vi.waitFor` で確定待機に置換（解消）
- [B-005 test] エラー/retry 経路 → presign 失敗 → RetryableError → 再試行 → 成功 のテスト追加（解消）
- [W-006 test] 複数回アップロード → done → dropzone 表示 → 再アップロードのテスト追加（解消）
- [W-007 test] progress/サムネイル → 進捗テキスト・画像サムネ/動画アイコン分岐のテスト追加（解消）
- [W-008 test] unsupported MIME バリエーション → parametrized テスト追加（解消）

## 指摘一覧と仕分け

- [W-010 test] `putWithProgress` の XHR エラーコールバック（onerror/onabort/ontimeout）が個別にテストされていない — `MediaUploader.test.tsx` → **見送り**
  - 理由: アップロード失敗時のエラー UX（catch → error state → RetryableError → onRetry）は presign 失敗ケースで既に E2E 検証済み。XHR の onerror/onabort/ontimeout は同一の catch 分岐に合流する別の rejection ソースに過ぎず、追加テストは同じコードパスの冗長カバレッジになる。reviewer 自身も「critical path はカバー済み・低リスク・スコープ外」と評価。critical なエラー経路の振る舞いは担保されているため本 PR では追加しない。

## 完了判定

このラウンドで「このPRで直す」と仕分けた指摘は **0件**（Blocker 0、修正対象 Warning 0、残る W-010 は見送り記録済み）。Step 7 の完了条件を満たすため **APPROVED**。3レイヤーとも実装・テストが計画と受け入れ基準 AC-1〜AC-8 を満たすことを確認。

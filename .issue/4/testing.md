# 動作確認計画 — Issue #4: identity の 3 ユースケースの integration test が欠落

**Issue:** #4
**作成日:** 2026-05-18

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

なし（integration test は D1 テスト環境のみ使用、サーバー起動不要）。

### デプロイ方法

なし（テスト追加のみ）。

## 確認項目

### 1. Integration test の実行

- **目的:** 3 つの新規 describe ブロックが PASS することを確認する
- **手順:**
  1. `pnpm test:integration` を実行
- **期待結果:** 全テストが PASS、新規 3 describe ブロック（RevokeAllOtherSessions / RequestEmailChange / VerifyEmailChange）の各 it がすべて GREEN
- **確認ポイント:** 既存テストに FAIL がないこと

## 確認チェックリスト

- [ ] `pnpm test:integration` が全 PASS
- [ ] `RevokeAllOtherSessions` describe ブロックの it が PASS
- [ ] `RequestEmailChange` describe ブロックの it が PASS
- [ ] `VerifyEmailChange` describe ブロックの it が PASS
- [ ] 既存テストに回帰がない

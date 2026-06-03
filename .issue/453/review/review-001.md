# PR Review #001 — feat(dev): ローカル dev 用の認証シードスクリプト（admin ユーザー＋セッション投入）を追加

**PR:** #455
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## General Review

複雑度「小規模」のため、レイヤー分割せず変更全体を1本で General Review した。

### Blockers
なし

全観点を検証し Blocker 級の問題なし。検証の要点:

- **users INSERT** — カラムリスト17個が migration DDL（`0001_hollow_schema.sql`）と同一順序で一致。NOT NULL 列すべて非NULL。CHECK 制約適合（`email_verified=1`・`banned=0`・`role='admin'`）。
- **sessions INSERT** — カラム9個が DDL と一致、NOT NULL 列充足、FK `user_id` は同一バッチ投入の user を参照。
- **UUIDv7** — `USER_ID`/`SESSION_ID` とも UUIDv7 パターンに合致（version nibble `7`・variant `8`）。`/admin/users` の rehydration（`idGenerator.validate`）を通る。
- **ドメイン不変条件** — `username='dev-admin'` は pattern 合致・予約語（`admin` 単体のみ）非該当・長さOK。`email`・`displayName` も `User.reconstruct` を通過。
- **セッション解決** — `resolve` はトークン生比較＋`expires_at` 辞書順比較。`2999-...` は現在時刻より大で有効。session id は UUIDv7 不要（`UserId.create` は非空チェックのみ）。
- **冪等性** — DELETE(sessions) → DELETE(users) → INSERT の順。sessions を先に明示削除するため `foreign_keys` PRAGMA の ON/OFF に依存せず orphan/FK 違反が起きない。UNIQUE 衝突も事前 DELETE で回避。
- **一時ファイル後始末** — `try { execFileSync } finally { rmSync }` で確実に削除。
- **スコープ** — アプリのランタイムコードは無変更。計画・ADR と完全整合。
- **ドキュメント正確性** — 案内コマンドはすべて package.json に実在。cookie 名・CDP 注入手順も実コードのメカニクスと一致。

### Warnings
なし

SQL 文字列補間は外部入力ゼロの定数のみ（インジェクション経路なし）。ローカル dev 専用ツールであり許容範囲。

### Notes
- **[N-001]** スクリプト冒頭 JSDoc が依存メカニクス（生トークン比較 / status 派生 / UUIDv7 検証）を明記しており CLAUDE.md の WHY コメント方針に沿う。
- **[N-002]** `db:execute:local` を子プロセスで再利用する設計（ADR-001）は妥当。`execFileSync("pnpm", ["db:execute:local", sqlFile])` は pnpm が trailing arg を `--file` の値に渡すため正しい。
- **[N-003]** package.json の追加位置が `db:execute:*` グループを1行分断。機能上無害のため対応不要。
- **[N-004]** 「Deleting the user cascades...」コメントは PRAGMA OFF だと厳密には cascade しないが、sessions を先に明示 DELETE しているため冪等性に影響なし。実害なし。

---

## Design Decisions

特になし（計画時の ADR-001 で設計判断は記録済み。レビューで新たな設計判断は生じなかった）。

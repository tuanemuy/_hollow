# 動作確認 — Issue #210

本 Issue はコード変更を伴わない調査・設計検討タスク（Issue 非ゴール：実装は別 PR）。
よってブラウザ／実行による動作確認は対象外。成果物（`investigation.md`）の主張がコードと一致するかの確認手順のみを記す。

## 確認環境

リポジトリのコードを読むだけで完結する。サーバ起動・DB 投入は不要。

## 確認手順（ドキュメントの正確性）

1. lazy upgrade の直列構造を確認する。
   - `app/core/adapters/d1/repositories/credentialStore.ts` の `verifyPassword` → `maybeRehashLegacy` が `verifyHash` 成功後に `hashScrypt` を `await` する直列であること。
   - rehash が legacy 行のみ（`isScryptEncoded` 早期 return）で発火すること。
2. logIn の制御順を確認する。
   - `app/core/application/identity/logIn.ts` で `verifyPassword`（UoW#1, rehash 含む）が status チェック（UoW#2）より前に完走すること。
3. 認証 rate limit の不在を確認する。

   ```bash
   grep -rn "rateLimit\|throttle\|lockout\|attempt" app/core/application/identity app/routes/login.tsx app/core/presentation/authGuard.ts
   ```

   - 認証経路にレート制御がヒットしないこと（= investigation.md ④の「rate limit は存在しない」前提が正しいこと）。

## ④の前提に関する明記

Issue #210 ④は「application 層の rate limit が `unverified` 拒否前に効く前提を testing.md に明示」を求めていたが、**調査の結果その前提は成立しない**：認証経路に rate limit / lockout は実装されていない。

したがって本書では「rate limit が効く前提」を記述できない。代わりに事実として以下を明記する。

- 現状、ログイン経路に application 層の rate limit は存在しない。
- lazy upgrade rehash の DoS 増幅は、verify 成功（正しいパスワード）＋legacy 行 1 回限り、という二重制約で深刻度・低（詳細は `investigation.md` 2 章）。
- 構造的に閉じるなら⑤案 A（rehash を status OK 確定後に遅延）が望ましく、別 PR（F-1）に委ねる。

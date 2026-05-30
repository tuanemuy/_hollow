# 動作確認計画 — Issue #182: handle queue visibility timeout risk in user.deleted fan-out

**Issue:** #182
**作成日:** 2026-05-30

---

## 確認環境

このIssueの変更（`user.deleted` fan-out の所要時間ログ + ドキュメント是正）を確認するために必要な手順のみ記載。本 Issue は wrangler 設定・DB スキーマを変更しないため、マイグレーションは不要。

### 検証環境の起動

ローカル Cloudflare スタック（consumer Worker を含む）を起動し、consumer のログを観測する:

```bash
pnpm dev
```

ユニットテストで担保できる範囲は以下で実行:

```bash
pnpm test:unit
pnpm typecheck
```

### デプロイ方法

実トラフィック / 負荷下での `durationMs` 観測は staging で行う。consumer Worker のみ再デプロイで反映できる:

```bash
pnpm deploy:staging:consumer
```

デプロイ後は Cloudflare のダッシュボード tail / Logpush で consumer のログを観測する。

## 確認項目

### 1. fan-out 所要時間ログが出力される

- **目的:** `user.deleted` の fan-out 完了時に `durationMs` を含む構造化ログが出ることを確認する。
- **手順:**
  1. `pnpm test:unit` を実行し、`dispatchDomainEvent.test.ts` の新規ケース（`user.deleted` fan-out 完了時に `logger.info` が `durationMs`（number, > 0）と `userId` を含む meta で呼ばれる）が PASS することを確認する。
  2. ローカル（`pnpm dev`）で、ノートと in-flight export job を持つユーザーのアカウント削除を発火させ、relay → queue → consumer 経由で `user.deleted` が dispatch されたとき、consumer ログに `[dispatch] user.deleted fan-out complete` が `durationMs` 付きで出ることを確認する。
- **期待結果:** ログメッセージ `[dispatch] user.deleted fan-out complete` が `{ eventId, userId, durationMs }` の meta で1回出力される。
- **確認ポイント:** `durationMs` が数値であること。fan-out が空（公開ノート・export job ゼロ）でもログが出ること。

### 2. 既存の user.deleted routing が壊れていない

- **目的:** ログ追加と stub への clock 追加で既存の fan-out 挙動（publication → export の順次実行・冪等 retry）が変わっていないことを確認する。
- **手順:**
  1. `pnpm test:unit` で `dispatchDomainEvent — user.deleted routing (#159)` の既存3ケース（routing 順序 / partial failure retry×2 / BusinessRuleError）が PASS することを確認する。
- **期待結果:** 既存3ケースが全て green。
- **確認ポイント:** 順序が publication → export のままであること。partial failure 時に `retry` を返すこと。

### 3. ドキュメント是正の整合

- **目的:** `docs/runtime_cloudflare.md` の「Queues」節が push consumer の正確なセマンティクスを反映していることを確認する。
- **手順:**
  1. `docs/runtime_cloudflare.md` の「Queues」節を読み、`visibility_timeout_ms` が pull consumer 専用で push には適用されない旨、push の上限（wall 15分 / CPU 30秒・`limits.cpu_ms` で延長可）、`handleQueue` の per-message ack の記述があることを確認する。
- **期待結果:** 旧記述（visibility timeout が `[[queues.consumers]]` に置けるとの誤記）が是正されている。
- **確認ポイント:** push/pull の区別が明確で、`user.deleted` fan-out の `durationMs` 観測への言及があること。

## エッジケース・異常系

### 1. payload userId が空（BusinessRuleError）

- **目的:** validation 失敗が計測区間に入らず、従来通り handled+warn で ack されることを確認する。
- **手順:**
  1. `pnpm test:unit` の該当ケース（`returns handled+warn when payload userId is empty`）が PASS することを確認する。
- **期待結果:** `UserId.create` の `BusinessRuleError` が計測開始前に投げられ、`durationMs` ログには到達せず、`logger.warn` が1回呼ばれて `handled` が返る。

## 既存機能への影響確認

- **他イベントの dispatch:** ログ追加は `user.deleted` case のみ。`note.*` / `export.*` / `ingestion.*` 等の dispatch・既存テストに影響しないことを `pnpm test:unit` 全 PASS で確認。
- **consumer の per-message ack:** ハンドラ本体（`handleQueue`）は変更しないため、ack/retry 挙動は不変。

## 確認チェックリスト

- [ ] `pnpm test:unit` 全 PASS（新規 durationMs ケース + user.deleted 既存3ケース + BusinessRuleError ケース）
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm dev` で consumer ログに `[dispatch] user.deleted fan-out complete` が `durationMs` 付きで出る
- [ ] `docs/runtime_cloudflare.md` の Queues 節が push consumer の正確なセマンティクスに是正されている
- [ ] 他イベント・既存機能への影響なし
- [ ]（任意・運用）staging へ consumer をデプロイし、負荷下で `durationMs` 分布を tail / Logpush で観測

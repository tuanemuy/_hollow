# ADR — Issue #560: 共有リンクのパスワード失敗カウンタが永続化されずロックアウトが発火しない

## ADR-001: 失敗時のカウンタ永続化を「UoW 外 throw」で保証する

### Status
Accepted

### Context

D1 UoW（`app/core/adapters/d1/unitOfWork.ts`）は deferred-batch 方式で、「`fn` が正常 return したときだけ `db.batch()` を flush する」設計（throw 時は積んだ書き込みを破棄＝ロールバック相当）。一方 `resolveShareLink.ts` は誤パスワード時に `shareLinkRepository.save()`（failed_attempts increment / lockout 設定）を pending batch に積んだ直後 `BusinessRuleError` を throw するため、increment が永続化されずロックアウトが永久に発火しない。

「UoW の不変条件を壊さず、失敗時も状態を永続化したい」を満たす方法として以下を比較した:

- **案A:** UoW 内では throw せず、`run()` の戻り値で成功/失敗の outcome を表現し、UoW の外でその outcome に基づいて `BusinessRuleError` を throw する（save が flush されてから throw）
- **案B:** 失敗時の increment を別 UoW で先にコミットしてから throw する
- **案C:** UoW 側に「throw されても pending を flush する」オプションを追加する

### Decision

**案A を採用する。**

- UoW の中核不変条件（「正常 return 時のみ atomic flush」）を一切変更しない → 全 usecase（UoW に依存する箇所）への波及がゼロ。
- 修正が `resolveShareLink.ts` 1ファイルに閉じる。
- `acquireEditLock.ts` 等、既存の「`run` の戻り値を usecase 本体で受けて分岐/加工する」確立パターンの自然な延長。
- save → throw の順序が単一 UoW 内で自然に保証され、OCC（version は `recordFailedAttempt` で +1 され `addOcc` で守られる）も 1 回の batch で従来どおり完結。
- コールバックの戻り値が discriminated union（`{ outcome: "ok" | "password_invalid" }`）になることで「失敗も永続化される」意図が型に現れる。

### Consequences

- 良い点: 波及最小・1ファイル・既存パターンと一貫・型に意図が現れる・presentation 無変更（throw される code が不変）。
- トレードオフ: usecase のコールバックが「成功も失敗も return する」形になり戻り値型が union になる（可読性は許容範囲）。
- 却下理由:
  - **案B** — 共有リンク解決が2つの UoW に割れ、同一リンクへの同時誤入力で OCC 競合の窓が増える（片方が `OPTIMISTIC_LOCK_FAILURE` になりうる）。reads と write が別 UoW に跨り expectedVersion の整合を取り直す必要があり、Issue スコープに対して過剰。
  - **案C** — UoW の中核不変条件（throw = ロールバック）を壊し、outbox 配置・relay kick・OCC ガードの semantics が全 usecase で曖昧になる。波及が最大で CLAUDE.md「UoW の不変条件は安易に変えない」に反する。

---

## ADR-002: `password_invalid` outcome に `shareLinkId` を持たせる

### Status
Accepted

### Context

案A では `verifyShareLinkAccess` の失敗を UoW の外で `BusinessRuleError("share_link_password_invalid")` に変換する。元実装の throw メッセージは `Share link ${lookup.id} password verification failed` と link id を含んでいた。`lookup` は UoW コールバックのスコープ内にしか存在しないため、UoW 外の throw からは参照できない。

### Decision

discriminated union の `password_invalid` バリアントに `shareLinkId: string` を持たせ、UoW 外の throw でメッセージに埋め込む。`ok` バリアントは `noteId` / `ownerUsername`（戻り値そのもの）を持つ。これにより元のエラーメッセージ（id 入り）を維持しつつ、コールバック return 後に throw する形に移行できる。

### Consequences

- 良い点: エラーメッセージの情報量（link id）が回帰しない。型に「失敗時も id を運ぶ」意図が現れる。`ShareLinkId` ブランド型ではなく素の `string` を採用したのは、UoW 内の `lookup.id`（既に `ShareLinkId`）をそのまま代入でき、外側ではメッセージ補間にしか使わないため追加の検証コストが無いから。
- トレードオフ: なし（コールバック内クローズドな型なので外部 API には漏れない）。

---

# ADR — Issue #100: feat(infra): wire R2 ObjectStorage / TempFileStorage and remove production Stubs

## ADR-001: production Stub を DI 内の inline unavailable-adapter に置換する

### Status
Accepted

### Context

Issue #96 ADR-005 では「production runtime で R2 binding が未配備の場合に operation 時 `StorageUnavailableError` / `TempFileStorageUnavailableError` を throw する Stub クラス」を `app/core/adapters/cloudflare/` に置いていた。 これは `app/core/application/__tests__/fakes/` 配下の test fake (`InMemoryObjectStorage` / `FakeTempFileStorage`) と意図的に挙動を分離する設計だった。

本Issueで Stub を撤去するにあたり、binding 欠落時の挙動として 3 つの選択肢を検討した:

- (A) **container 構築時に throw（fail-fast）** — wrangler.toml で binding 必須なら欠落は config bug。即時 500 で運用者が気付ける。
- (B) **inline unavailable-adapter で operation 時 throw** — Stub と挙動同等のまま、`createRequestContainer` 内に閉じた anonymous 実装を持つ。export class を消して「production-runtime 内に閉じた fallback」に格下げ。
- (C) **binding が必ず存在する前提で `!` 断定** — `ServerEnv` の R2 関連を required に upgrade。

### Decision

(B) inline unavailable-adapter で operation 時 throw を採用する。

- `app/core/adapters/cloudflare/r2ObjectStorage.ts` から `StubObjectStorage` クラスを削除
- `app/core/adapters/cloudflare/r2TempFileStorage.ts` から `StubTempFileStorage` クラスを削除
- `app/core/application/di/serverCloudflare.ts` 内に module-scoped な private factory `createUnavailableObjectStorage()` / `createUnavailableTempFileStorage()` を追加し、各メソッドを `async () => { throw new StorageUnavailableError(...) }` クロージャ形（既存 `StubObjectStorage` の `async function { throw }` と同等の microtask 挙動）で実装する
- `createRequestContainer` の fallback 経路は新 factory に置換。条件分岐式（binding 有無 / SigV4 atomic 揃い）は維持

> **実装メモ:** `async () => { throw ... }` 形を採用する理由は、既存 Stub クラスの `async put(...) { throw ... }` と完全に同じ microtask 経路（lazy await / unhandled-rejection trap の挙動）を保つため。 `Promise.reject(...)` を直接返す形だと、戻り値の評価時点で rejection promise が生成され、`await` されるまでの間に unhandled-rejection ハンドラがトリガーされうる。挙動互換性のため `async` クロージャに揃える。

### Consequences

- **良い点:**
  - `app/core/adapters/cloudflare/` の API surface が縮減し、adapter ファイルの責務が「実装」に絞られる
  - production 動作（binding 欠落時に operation で 500） は完全に維持されるため、staging / production の挙動互換性が壊れない
  - test fake は `app/core/application/__tests__/fakes/` に変わらず存在し、test 境界の純度は維持
- **トレードオフ:**
  - DI ファイル (`serverCloudflare.ts`) に「fallback factory」というロジックが残るため、DI が「単純な配線」だけでなくなる。ただし fallback は数行で済み、関連ロジックを同居させる方が「DI が何を選ぶか」が読みやすい
  - test 側の downgrade 検証は `toBeInstanceOf(StubXxx)` から `rejects.toThrow(StorageUnavailableError)` への書き換えが必要

### Cross-reference

- 本ADRは `.issue/96/adr.md` の **ADR-005** を supersede する

---

## ADR-002: `ServerEnv` の R2 関連フィールドは optional のまま維持する

### Status
Accepted

### Context

Stub クラス削除と同時に、`ServerEnv` の R2 関連フィールド (`OBJECT_STORAGE?: R2Bucket` / `TEMP_FILES?: R2Bucket` / `R2_ACCOUNT_ID?` / `R2_ACCESS_KEY_ID?` / `R2_SECRET_ACCESS_KEY?` / `R2_OBJECT_BUCKET_NAME?`) を required に upgrade して TypeScript レベルで「binding 必須」を表現する選択肢がある。

しかし、`pruner` / `relay` / `dlq` worker の `[env.*]` ブロックには R2 binding を宣言していない（これらの worker は R2 を使わない）。 required 化すると worker entry の型エラーになり、`ServerEnv` を共有している部分を分割する必要が生じる。 これは本Issueのスコープを超え、別Issueで扱うべき責務分離になる。

### Decision

`ServerEnv` の R2 関連フィールドは optional のまま維持する。Stub クラス削除は (ADR-001) inline unavailable-adapter への置換で完結させ、型レベルの required 化は本Issueでは行わない。

### Consequences

- **良い点:**
  - worker entry の型互換性が維持される
  - `ServerEnv` 一本で web / consumer / pruner / relay / dlq 全 worker を表現する現状の単純さが保たれる
- **トレードオフ:**
  - 「web / consumer では R2 必須」という運用上の不変条件が型レベルで表現されない。実行時には `createRequestContainer` の fallback 経路で吸収される
  - 将来 `ServerEnv` を worker 種別ごとに分割するリファクタリングが起きた場合、本Issueの判断は revisit され得る（その時は別ADRで扱う）

### Cross-reference

- 本ADRは ADR-001 (#100) の補完

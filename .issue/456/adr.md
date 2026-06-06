# ADR — Issue #456: lazy upgrade を status OK 確定後に遅延させる

## ADR-001: rehash ヒントの返却方式と rehash 実行メソッドの分離

### Status
Proposed

### Context
`verifyPassword` の rehash を status OK 確定後に遅延させるにあたり、案 A には 2 分岐がある:

- (a) `verifyPassword` の戻り値を `{ userId, needsRehash }` にリッチ化する
- (b) `verifyPassword` を rehash-free にして rehash を独立メソッド化する

rehash は `pending.add` を使うため UoW 内実行が必須。`logIn` は status 確定後に **別（3つ目）の UoW** を起こす必要があり、その UoW の `credentialStore` インスタンス上で rehash を呼ぶ形になる。「verifyPassword の戻り値に rehash 関数を埋め込む」案は、その関数が別 UoW の `pending` を掴めず破綻する。

また `verifyPassword` の `null` 単一失敗経路は enumeration defence（存在をタイミング・エラー形状で漏らさない）という明示的なセキュリティ契約であり、これを壊してはならない。

### Decision
(a) と (b) のハイブリッドを採用する:

- 戻り値を `{ userId, needsRehash } | null` にリッチ化する。`needsRehash` は **prefix 判定のみ**で暗号演算を含まず、成功時のみ付随する。失敗経路は従来どおり `null` 単一経路を厳守 → enumeration defence を壊さない。
- rehash 実行は公開メソッド `rehashLegacyPassword(userId, raw)` に分離する。`logIn` が status active 確定後に別 UoW を起こし、その UoW の `credentialStore` 上でこのメソッドを呼ぶ。

これは Issue #208 の `verifyCurrentForChange`（verify と rehash を分離し、rehash 不要経路では rehash-free verify を使う）の分離パターンと整合する。`verifyPassword` が rehash-free verify に、`rehashLegacyPassword` が rehash 専用メソッドに相当する。

「needsRehash を返さず毎回無条件 `rehashLegacyPassword` を呼ぶ（idempotent no-op 依存）」案は、legacy 判定のための余分な read か無駄な呼び出しを生むため却下。

### Consequences
- 良い点: enumeration defence を維持したまま rehash を status 確定後へ遅延できる。#208 の確立済みパターンと一貫。port 実装は D1 のみなので波及は最小。
- トレードオフ: legacy 行の初回 logIn でのみ rehash 用の 3 つ目の UoW（追加 `db.batch`）が発生する。次回以降 needsRehash=false で発生しない。許容範囲。

---

## ADR-002: `verifyPasswordForUser`（requestEmailChange）をスコープ外とする

### Status
Proposed

### Context
`verifyPasswordForUser` も成功時に inline で `maybeRehashLegacy` を実行する。本 Issue の対象に含めるべきか。

### Decision
スコープ外（現状維持）とする。`verifyPasswordForUser` の唯一の呼び出し元 `requestEmailChange` はログイン済みユーザの再認証経路で、pending / suspended ユーザはこの経路に到達できない。Issue の構造的無駄（「拒否されるのに rehash が走る」）が発生しないため、inline lazy upgrade を維持する。

注意: `requestEmailChange` の usecase 自体には `status === active` の明示チェックは無い。到達不能性は **認証済みルート / セッションミドルウェアによるゲーティング**（active セッションを持つ前提）に依存しており、usecase 内の status 判定に依存しているわけではない。

### Consequences
- 良い点: 変更範囲を Issue の意図に絞れる。active 前提経路では rehash が無駄にならない。
- トレードオフ: `verifyPassword` と `verifyPasswordForUser` で rehash の扱いが非対称になるが、それぞれの経路特性（status 未確定 / active 確定済み）に即した正しい非対称。クラス JSDoc に理由を残す。

---

## ADR-003: deleted ユーザのテスト期待値（実装時の判断）

### Status
Accepted（実装時）

### Context
plan.md ステップ6は「deleted ユーザで logIn → `account_unavailable` 拒否 + rehash 不発火」を求めていた。しかし `verifyPassword` は `deletedAt !== null` を verify 段階で `null` に潰す（enumeration defence）ため、soft-deleted ユーザは UoW#1 で弾かれ、`logIn` は `account_unavailable` ではなく **`invalid_credentials`** を返す。`deriveStatus` も `deletedAt` を deleted の唯一のマーカーとしており、`deletedAt` 無しで status だけ `deleted` にする経路は存在しない。したがって `logIn` の `status === "deleted"` 分岐は `deletedAt` 経由では到達不能。

### Decision
deleted ケースのテストは実コードの挙動に合わせ、`invalid_credentials` を期待値とした（その旨をテスト内コメントで明示）。本 Issue の主眼である「rehash 不発火」は、verify 段階で弾かれるため当然満たされ、legacy hash 不変 + `updated_at` sentinel 不変の二重 assert で担保している。`account_unavailable` を強制するために `verifyPassword` の deletedAt ガードを緩めることは enumeration defence を壊すためしない。

### Consequences
- 良い点: enumeration defence を維持。テストが実挙動と一致し虚偽にならない。
- トレードオフ: plan.md の文言（account_unavailable）とテスト期待値（invalid_credentials）が形式上ずれるが、これは plan.md が `verifyPassword` の deletedAt ガードを見落としていたためで、rehash 不発火という本質要件は完全に満たしている。

---

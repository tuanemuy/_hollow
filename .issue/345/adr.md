# ADR — Issue #345: 認証必須ルートのガードを共通化し /exports・/views にも適用する

## ADR-001: 共有認証ガードを authMiddleware.ts ではなく新規 authGuard.ts に置く

### Status
Accepted

### Context
Issue は共有モジュールの配置先として `@/core/presentation/authMiddleware` か `@/components/auth/` の二択を提示。共有する `createServerFn({ method: "GET" })` ガードをどこに置くか決める必要がある。

- `app/core/presentation/authMiddleware.ts` は先頭に `import "@tanstack/react-start/server-only";` を持ち、server バンドル限定モジュールとして `getCurrentUser` / `requireCurrentUser` / `redirectIfAuthenticated` を提供している。
- `createServerFn` で作るラッパーは client バンドルにも参照される isomorphic コード。server-only マーカー付きファイルに置くと client 解決時にエラーになる。
- `@/components/auth/` は LoginForm 等の UI コンポーネント置き場で、`createServerFn` ベースのルートガードの本籍としては責務がずれる。

### Decision
新規 `app/core/presentation/authGuard.ts` を作る。CLAUDE.md 上、認証状態の解決と server-function ベースのルートガードは presentation 層の横断的ユーティリティ責務であり、認証ロジックは既に authMiddleware に集約済み。よって presentation 層が妥当。server-only な `getCurrentUser` 実装は authMiddleware に残し、それを**ハンドラ内で動的 import** するガード関数だけを server-only マーカーを持たない authGuard.ts に置く。

### Consequences
- 良い点: server-only 契約を崩さず、既存3ルートと同じ「ハンドラ内動的 import」の作法を踏襲。presentation 層に認証ガードが集約される。
- トレードオフ: authMiddleware と authGuard でファイルが2つに分かれる。両者の責務（authMiddleware = server-only な解決ロジック / authGuard = isomorphic な beforeLoad ガード）が明確なので許容。

---

## ADR-002: 共有粒度を「beforeLoad ヘルパー（redirect 込み）」とする

### Status
Accepted

### Context
重複しているのは `createServerFn` の `{ authenticated }` 取得部分だけでなく、`beforeLoad` 内の redirect ロジックも含む。redirect の向きは2系統に確定している:

- 認証必須（settings / exports / views）: `if (!authenticated) throw redirect({ to: "/login" })`
- ゲスト専用（login / signup）: `if (authenticated) throw redirect({ to: "/", search: HOME_SEARCH })`

選択肢:
- (A) `{ authenticated }` を返す `createServerFn` だけ共有し、redirect は各ルートの `beforeLoad` に残す。
- (B) redirect ロジックごと beforeLoad ヘルパー（`requireAuthenticatedRoute` / `redirectAuthenticatedRoute`）にして共有する。

### Decision
(B) を採用。redirect 先・条件が2系統で完全に共通なため、redirect ロジックも共有することで settings/exports/views 間および login/signup 間のコピペを完全に排除できる。各ルートは `beforeLoad: requireAuthenticatedRoute` のように参照するだけになる。

### Consequences
- 良い点: 重複が完全に消える。ルートファイルは beforeLoad を1行参照するだけになり意図が明確。
- トレードオフ: redirect 先がルートごとに変わる将来要件が出たら、ヘルパーを引数化するかルート側に戻す必要がある。現状2系統で安定しているため許容。authMiddleware の既存 `requireCurrentUser` / `redirectIfAuthenticated`（throw 型・server-only・`createServerFn` 非経由で client から呼べない）とは別物として、`createServerFn` ラップ版を authGuard に新設する。

---
## ADR-003: authMiddleware の未使用 throw 型ヘルパーを削除する

### Status
Accepted

### Context
PR レビュー（review-001）で、`authMiddleware.ts` の `requireCurrentUser`（UserDTO を返す throw 型）と `redirectIfAuthenticated`（throw 型）がいずれも全コードベースから未参照（static/dynamic とも import なし）であることが判明。実使用される `requireCurrentUser` はすべて `@/lib/server/currentUser` 由来（entity 版）で、authMiddleware 版とは別物。本Issueで新設した `authGuard.requireAuthenticatedRoute` / `redirectAuthenticatedRoute`（`createServerFn` ラップ版）と同じ振る舞いの dead な双子が残ると、どちらを使うべきか紛らわしい。

### Decision
authMiddleware から `requireCurrentUser` と `redirectIfAuthenticated` の両 throw 型ヘルパー、および未使用化する `redirect`・`HOME_SEARCH` import を削除する。認証ガードという同一機能の中で完結し、本Issueの新コードと直接混同されうるため、別Issueに切り出さず本PRで掃除する。authMiddleware は cookie 操作（`setSessionCookie`/`clearSessionCookie`）と DTO 解決（`getCurrentUser`）に責務を絞る。

### Consequences
- 良い点: 認証ガードのエントリポイントが `authGuard`（beforeLoad 用）と `lib/server/currentUser`（RSC/action 用）に明確化され、紛らわしい dead な双子が消える。
- トレードオフ: 将来 DTO を返す throw 型ヘルパーが必要になれば再追加が要るが、現状 YAGNI。

---

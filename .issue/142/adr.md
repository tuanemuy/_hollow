# ADR — Issue #142: Origin/Referer header verification for admin server functions

## ADR-001: CSRF ミドルウェアの適用範囲を admin 限定にする

### Status
Proposed

### Context
TanStack Start には全 `createServerFn` にグローバル適用する仕組み（`registerGlobalMiddleware` 相当）もあるが、CSRF 検証をどの範囲に適用するか選択が必要。
- 選択肢A: 全 server function にグローバル適用
- 選択肢B: admin 系 mutation server function に個別 `.middleware` で適用

### Decision
選択肢B（admin 限定の個別適用）を採用。
- Issue の受け入れ基準は「admin 系 server function 全てに適用」でスコープは admin。
- グローバル適用は auth/identity 系の server function（パスワードリセット等）への影響が読みきれずスコープ拡大になる。
- 既存の `errorResponseMiddleware` も各 action で個別列挙しており、プロジェクトの現行パターンと一致する。

### Consequences
- 良い点: スコープが明確で副作用が限定的。既存パターンと一貫。
- トレードオフ: 将来 admin 以外の mutation に CSRF を広げる場合は個別追加が必要。グローバル適用への移行は別 Issue 扱い。

---

## ADR-002: CSRF 失敗を既存 `ForbiddenError`（kind: forbidden）で表現する

### Status
Proposed

### Context
CSRF 検証失敗時に 403 を返すために、新しい error kind を導入するか既存のエラー型を再利用するか。

### Decision
既存 `ForbiddenError`（`app/core/application/errors/index.ts`、`kind: "forbidden"`）を再利用。
- `HTTP_STATUS_BY_KIND.forbidden = 403` が既に存在。
- `redactForClient` は forbidden を素通しするのでクライアントに 403 + メッセージが届く。
- `requireAdminUser` も同じ `ForbiddenError` を使っており一貫性が保てる。
- code は application 層 `ForbiddenError` の既存慣行に揃えて **UPPER_SNAKE_CASE**（`FORBIDDEN_CROSS_ORIGIN`）。`errorCodeNaming.test.ts` の lower_snake_case 規約は `app/core/domain/*/errorCode.ts` モジュールのみが対象で、application 層でインラインに `new ForbiddenError(code, ...)` へ渡す code は `requireAdminUser` の `"FORBIDDEN_ADMIN_ONLY"` 等 UPPER_SNAKE が慣行。

### Consequences
- 良い点: 新 kind 不要。presentation の status マッピング・serialize 機構をそのまま利用。
- トレードオフ: CSRF 失敗と認可失敗が同じ kind なので、クライアント側で両者を区別したい場合は code / message での判別が必要（現状そのニーズはない）。

---

## ADR-003: APP_URL を `getContainer().config.appUrl` 経由で取得する

### Status
Proposed

### Context
期待する自オリジンの判定に `APP_URL` が必要。env を直読みするか、DI 経由で取得するか。

### Decision
`getContainer().config.appUrl` を使う。
- env は `app/core/application/di/serverCloudflare.ts` で `RequestContainer.config.appUrl` に正規化済み。
- `errorResponseMiddleware` が同じく `getContainer()` を static import している前例があり client-graph 汚染リスクなし。
- env 直読み（`process.env` / Cloudflare bindings）は DI 境界を飛び越えるためアーキテクチャ違反。

### Consequences
- 良い点: DI 境界を尊重。`head.ts` の `joinUrl(config.appUrl, ...)` と同じ値で一貫。
- トレードオフ: ミドルウェアが request スコープ内で実行される前提（`getContainer()` が解決可能であること）。スコープ外実行はワイヤリングバグであり例外で顕在化する。

---

## ADR-004: 受け入れ基準の「Origin 不一致 → 403」を Workers-pool integration ではなくミドルウェア結合テストでカバーする

### Status
Accepted（実装時の判断）

### Context
plan.md のテスト方針は「最低1本の `*.integration.test.ts` で Origin 不一致 → 403 を必ずカバー」とし、難しければミドルウェア結合テストで代替してその判断を報告するよう指示していた。実装時に既存 `*.integration.test.ts`（41本）を確認したところ、いずれも Workers pool（Miniflare + 実 D1）で **usecase / adapter / worker 層を直接呼ぶ**もので、TanStack Start の server-function HTTP 境界（`createServerFn` / `createMiddleware` チェーン、`getRequest` / `getRequestHeader`）を request 経由で叩くものは1本も存在しなかった。

CSRF 検証は `.server(...)` ボディ内で行われ、これは TanStack Start コンパイラが client bundle から strip しつつ server-fn pipeline でラップする部分である。実際の Origin ヘッダを流して 403 を観測するには full fetch handler（`app/server.cloudflare.ts`）を立ち上げる必要があり、既存 integration テストのどのパターンとも乖離する。

### Decision
受け入れ基準（Origin 不一致 → 403）は、`csrfMiddleware.test.ts` 内のミドルウェア結合テストでカバーする。`errorResponseMiddleware` と `csrfMiddleware` を**実際の配列順（`[errorResponseMiddleware, csrfMiddleware]`）**で連結し、cross-origin POST が「`AppServerError`（`kind: forbidden`）+ `setResponseStatus(403)`」として serialize されることを検証する。これにより [P-001] のミドルウェア順序ミスも回帰検出できる。新規 `*.integration.test.ts` は追加しない。

### Consequences
- 良い点: 順序回帰（[P-001]）を含め、CSRF 失敗が serialize 済み 403 になる経路を検証できる。Workers-pool harness を server-fn 境界用に拡張する重い作業を回避。
- トレードオフ: 実 HTTP リクエスト経路（フレームワークの header 抽出・compiler 変換）は通っていない。`getRequest` / `getRequestHeader` の挙動は mock 前提。フレームワーク自体のヘッダ抽出契約が変わった場合はこのテストでは検出できない（別途 e2e / manual test の領分）。

---

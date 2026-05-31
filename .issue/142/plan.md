# 実装計画 — Issue #142: security(admin): add Origin/Referer header verification for admin server functions

**Issue:** #142
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

admin 系 server function の CSRF 対策が SameSite=lax cookie のみで、明示的な Origin / Referer 検証が無い（Issue #101 / PR #138 のセキュリティレビュー W-F-006 / ADR-010 で指摘）。`lax` は top-level navigation の POST に cookie を送る挙動があるため、admin 専用 destructive エンドポイントに対して Origin（欠落時は Referer）検証を追加し、cross-origin な state-changing リクエストを fail-closed で 403 reject する。

## スコープ

### 含まれるもの

- `app/core/presentation/` 配下に CSRF 防御ミドルウェア（`csrfMiddleware`）を新規追加
- admin 系 mutation server function（7ファイル・13関数）への適用
- Origin 比較の純粋関数のユニットテスト + admin server function への integration test

### 含まれないもの

- 全 server function へのグローバル適用（auth/identity 系への影響が読めずスコープ拡大になるため admin 限定）
- Better Auth / 自前 `SessionService` の cookie 発行挙動の変更（受け入れ基準で明示的に「変更なし」）
- GET ローダー（`serverData` 経由、middleware 非通過）への対応 — safe method として元々対象外
- `app/components/auth/AdminSignUpForm/action.ts` の `adminSignUpFn` — 名前に "Admin" を含む POST だが、未認証 `/setup` ルートの初回管理者ブートストラップ経路で `setupToken` でゲート済み。session cookie で保護される `/admin/*` の destructive エンドポイントとは性質が異なり、Issue の動機（lax cookie のみで守られた admin 経路の CSRF 補強）からは対象外

## 実装ステップ

### 1. CSRF ミドルウェアを新規作成

- **対象ファイル:** `app/core/presentation/csrfMiddleware.ts`（新規）
- **変更内容:**
  - `createMiddleware({ type: "function" }).server(async ({ next }) => ...)` で実装
  - `getRequest().method` を取得し、`GET` / `HEAD` / `OPTIONS`（safe method）は検証スキップして即 `next()`
  - state-changing メソッドでは `getRequestHeader("origin")` を読み、欠落時は `getRequestHeader("referer")` にフォールバック
  - `const { config } = await getContainer();` で `config.appUrl` を取得（`errorResponseMiddleware` と同じく client-graph safe な static import）
  - 一致しなければ `throw new ForbiddenError("FORBIDDEN_CROSS_ORIGIN", "Cross-origin request rejected")`（serialize は `errorResponseMiddleware` が担当）
  - ヘッダ名は lower-case で読む（`getRequestHeader("origin")` / `getRequestHeader("referer")`）。既存コード（`VerifyEmail/action.ts` の `getRequestHeader("user-agent")` 等）の慣行に揃える。
- **理由:** Issue 要件「`app/core/presentation/` 配下に CSRF 防御ミドルウェア追加」。presentation 層の transport 境界が正しい置き場所。

### 2. 検証ロジックを純粋関数として export

- **対象ファイル:** `app/core/presentation/csrfMiddleware.ts`（同上）
- **変更内容:** `isSameOrigin(candidate: string | undefined, appUrl: string): boolean` を named export。両方の URL を `new URL()` で parse し `origin`（scheme+host+port）を比較。Origin は値そのもの、Referer はフルURL なので `new URL(referer).origin` を取る。candidate が無効URL/欠落なら `false`。
- **理由:** middleware 本体は framework グローバルに依存しテストが重いが、origin 比較ロジックは純粋関数として単体で網羅テストできる（プロジェクト方針「純粋関数を優先」）。

### 3. admin mutation server function 全てに適用

- **対象ファイル:**
  - `app/components/admin/LLMSettingsForm/action.ts` — `updateLLMConfigFn`, `testLLMConnectionFn`
  - `app/components/admin/Jobs/action.ts` — `retryIngestionJobFn`, `retryExportJobFn`, `rebuildSearchIndexFn`
  - `app/components/admin/UsersTable/action.ts` — `suspendUserFn`, `reinstateUserFn`, `promoteUserFn`, `demoteUserFn`
  - `app/components/admin/DesignTokensForm/action.ts` — `updateDesignTokensFn`, `resetDesignTokensFn`
  - `app/components/admin/PromptsForm/action.ts` — `updatePromptTemplateFn`, `resetPromptTemplateFn`, `resetAllPromptTemplatesFn`
  - `app/components/admin/RegistrationForm/action.ts` — `toggleRegistrationPolicyFn`
- **変更内容:** 各 `createServerFn(...)` チェーンで `.middleware([errorResponseMiddleware])` を `.middleware([errorResponseMiddleware, csrfMiddleware])` に変更し、`csrfMiddleware` を import 追加。
  - **順序:** `errorResponseMiddleware` を**配列の先頭（最外層）**、`csrfMiddleware` をその後ろ（内側）に置く。TanStack Start の middleware 配列は**先頭が最外層**で、各 middleware の `next()` が次の middleware をラップする（`@tanstack/start-client-core` の `executeMiddleware` は配列を先頭から `shift()` する）。`errorResponseMiddleware` は `next()` を try/catch で包んで throw を serialize・`setResponseStatus(403)` するので、csrf の throw を捕捉するには csrf が errorResponse の `next()` の内側で実行される必要がある。順序を逆（`[csrfMiddleware, errorResponseMiddleware]`）にすると csrf の throw は errorResponse の try の外で起きるため捕捉されず、serialize も 403 設定もされない素の `ForbiddenError` がそのままクライアントへ漏れる。
- **理由:** Issue 要件「admin 系 server function 全てに適用」。`loadXxx`（GET ローダー）は `serverData` 経由で middleware を通らないので自動的に safe-method 除外と整合。
- **CSRF 対象外（変更しない）:** `Jobs/action.ts` の `loadJobsSnapshot`、`UsersTable/action.ts` の `loadAdminUsers`、`Dashboard/action.ts` の `loadUsageMetrics`、`LLMSettingsForm/action.ts` の `loadInstanceSettings` — いずれも `serverData`（GET ローダー、createServerFn 非経由）。

### 4. テスト追加

テスト方針セクション参照。

## 設計判断

詳細は adr.md を参照。

- **適用範囲:** 全 server function 共通適用ではなく admin 限定の個別 `.middleware` 追加（ADR-001）
- **エラー型:** 新 kind を追加せず既存 `ForbiddenError`（`kind: "forbidden"` → 403）を再利用（ADR-002）
- **APP_URL の取得:** env 直読みではなく `getContainer().config.appUrl` 経由（ADR-003）

## リスクと注意点

- **Better Auth / SameSite cookie への非影響:** 本変更は読み取り専用（`getRequestHeader`）で、cookie 発行（`authMiddleware.ts` の `BASE_COOKIE_OPTIONS`）には一切触れない。受け入れ基準を満たす。なお現リポジトリは Better Auth ではなく自前 `SessionService` + `__Host-session` cookie 実装（Issue 文中の "Better Auth" は経緯上の表現）。
- **開発環境での Origin 不一致:** `APP_URL` が実際のアクセスオリジン（`localhost:ポート`等）とずれていると正当な POST が 403 になる。検証は scheme+host+port の `origin` 単位で行い、末尾スラッシュ等の表記揺れを `new URL().origin` で吸収する。dev では `APP_URL` をアクセス URL に合わせる必要がある。
- **Origin / Referer 両方欠落:** safe でないメソッドで両方欠落なら 403。admin 専用 destructive エンドポイントなので fail-closed が適切。
- **ミドルウェア順序の取り違え（最重要）:** `errorResponseMiddleware` を**配列の先頭（最外層）**に置く必要がある（`[errorResponseMiddleware, csrfMiddleware]`）。逆順（`[csrfMiddleware, errorResponseMiddleware]`）にすると csrf の throw が errorResponse の try/catch の外で起きるため捕捉されず、serialize も 403 設定もされない素の `ForbiddenError` がそのままクライアントへ漏れる（500 ですらない）。ミドルウェア結合テスト（csrf→errorResponse を実際の配列順で連結し「不一致 Origin → serialize 済み 403」を確認）で回帰防止する。

## テスト方針

- **ユニットテスト（主軸）:** `app/core/presentation/__tests__/csrfMiddleware.test.ts`（新規）
  - 純粋関数 `isSameOrigin` を直接テスト:
    - 異なる Origin → `false`
    - 一致 Origin → `true`
    - Origin 欠落 + Referer が同一オリジンのフルURL → `true`（フォールバック）
    - Origin / Referer 両欠落（`undefined`）→ `false`
    - 無効な URL 文字列 → `false`
    - 末尾スラッシュ / パス付き Referer でも origin 単位で一致 → `true`
  - ミドルウェア本体は `@tanstack/react-start` / `@tanstack/react-start/server`（`getRequest` / `getRequestHeader`）/ `getContainer` を `vi.mock` し、(a) GET は検証スキップ、(b) 不一致 POST で `ForbiddenError` throw、(c) 一致 POST で `next()` 到達、を確認。
- **ミドルウェア結合テスト（必須・[P-001] 回帰防止）:** `errorResponseMiddleware` と `csrfMiddleware` を**実際の配列順（`[errorResponseMiddleware, csrfMiddleware]`）で連結**し、不一致 Origin の POST が「serialize 済みの 403（`AppServerError` + `setResponseStatus(403)`）」になることを確認する。これにより順序ミスがテストで即検出される。
- **integration テスト（受け入れ基準）:** admin server function を異なる Origin ヘッダ付き POST で叩いて 403 / 正しい Origin で成功を検証（`*.integration.test.ts`）。受け入れ基準は明示的に integration test を要求しているため、最低1本の `*.integration.test.ts` で「Origin 不一致 → 403」を必ずカバーする（上記のミドルウェア結合テストをこの形で配置するのが現実的）。

## レビュー履歴

### 1周目: 両視点でレビュー

**修正した点（要件カバレッジ視点）**:
- スコープ「含まれないもの」に `adminSignUpFn`（setupToken ゲート済みブートストラップ経路）を対象外として明記（req S-001）。
- integration テストを受け入れ基準を字義通り満たす形に格上げし、ミドルウェア結合テストを必須項目として独立記載（req S-002 / arch S-003）。

**修正した点（アーキ・リスク視点）**:
- **[arch P-001] ミドルウェア順序を逆に修正**: `[csrfMiddleware, errorResponseMiddleware]` → `[errorResponseMiddleware, csrfMiddleware]`。TanStack Start は配列先頭が最外層で、`errorResponseMiddleware` の try/catch が csrf の throw を捕捉するには errorResponse が外側（先頭）である必要がある。逆順では serialize も 403 設定もされず素の `ForbiddenError` が漏れる。実装ステップ3・リスク節・テスト方針すべてに反映。
- **[arch S-001] エラー code を UPPER_SNAKE に修正**: `forbidden_cross_origin` → `FORBIDDEN_CROSS_ORIGIN`。`errorCodeNaming.test.ts` の lower_snake 規約は domain の `errorCode.ts` のみ対象で、application 層インライン code は `FORBIDDEN_ADMIN_ONLY` 等 UPPER_SNAKE が慣行。adr.md ADR-002 も修正。
- **[arch S-002] ヘッダ名を lower-case で読む**ことを実装ステップ1に明記。

**見送った提案**: なし（全て取り込み）。

### 結論
致命的な [P-001]（ミドルウェア順序）を修正済み。要件カバレッジ視点は「問題点ゼロ」、アーキ視点の P-001 も解消。実装フェーズへ進む。

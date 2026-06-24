# 実装計画 — Issue #615: feat(settings): P22 セッション一覧の表示リッチ化（device-parser / 地名 / 最終アクセス時刻）

**Issue:** #615
**作成日:** 2026-06-25
**複雑度:** 中〜大規模

---

## 目的

#572 で虚偽表示禁止原則（#543 ADR-004 / #572 ADR-002）に従い意図的に見送った P22 アクティブセッション一覧の表示リッチ化を、**実データ・更新経路を伴って**段階導入する。`spec/design/pages/P22-settings-security.html`（SSOT）が示す端末別アイコン・パース済みデバイス名・最終アクセス相対時刻を、捏造せずに表示できる範囲で提供する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `userAgent` から OS / ブラウザ / デバイス種別を解析するドメインサービスが存在し、純粋関数として userAgent 文字列のみから判定する（I/O なし） | Issue スコープ1 | 1 |
| AC-2 | パース結果が `SessionDTO` に projection され、UI が「Chrome on macOS」形式のラベルを表示する。判別不能時は中立ラベル `不明な端末` にフォールバックし、推測で OS/ブラウザ名を捏造しない | Issue スコープ1 / 原則 | 2,3,8 |
| AC-3 | デバイス種別に応じて行アイコンの glyph が切り替わる。desktop / mobile / tablet は互いに異なる glyph、unknown（判別不能）は汎用 glyph | Issue スコープ1 | 8 |
| AC-4 | `sessions.updatedAt` がセッション活動（`resolve` 経路）ごとに **best-effort で**更新され、`SessionDTO` 経由で `session-meta` 2行目「最終アクセス: {相対時刻}」として**実データに基づき**表示される。更新経路が無い場合は「最終アクセス」ラベルを出さない。recordActivity の書き込み失敗は認証フローを落とさない（best-effort・握り潰し） | Issue スコープ3 / 原則 | 4,5,6,8 |
| AC-5 | 相対時刻（「たった今」「2時間前」「3日前」「2026年5月8日」等）を整形する共有ヘルパーが存在し、**最終アクセス（updatedAt）の表示に使われる**。ログイン日時（createdAt）にも適用可能な共有ヘルパーとして実装する（createdAt 表示の相対化自体は本 Issue では必須化しない＝努力目標。ステップ8参照） | Issue スコープ4 | 7,8 |
| AC-6 | 地名（geo）表示は本 Issue では実装せず、IP 素出しのまま据え置く（理由は ADR / スコープ参照）。地名ラベルや捏造地域名を表示しない | Issue スコープ2 / 原則 | （スコープ外） |
| AC-7 | spec（`spec/usecases/identity.md` 等）が updatedAt 更新経路・device-parser projection を反映し、**geo（地名）を別 Issue 化し本 Issue では「未実装＝虚偽回避のため意図的に表示しない」旨も spec に記録する**（虚偽表示禁止の一貫性を spec 反映の受け入れ基準にも結びつける・S-001） | プロジェクト規約 | 9 |

## スコープ

### 含まれないもの

- **地名（geo）解決＝スコープ2 は本 Issue では見送る。** `ipAddress` から地域名を解決するには (a) 外部 geo API への通信ポート追加（presentation→application→新ポート→新アダプター、ネットワーク I/O / レート制限 / 障害時フォールバック / privacy）か、(b) オフライン GeoIP DB（MaxMind GeoLite2 等：~60MB バイナリ + ライセンス + Cloudflare Workers バンドル制約 + 定期更新運用）が必要。いずれも本 Issue の表示リッチ化に対して過大な外部依存・運用負荷を持ち込み、捏造禁止原則上「不正確な地名」を出すリスクもある。device-parser / 最終アクセスと違い**手元データのみでは解決不能**なため、別 Issue として切り出す（詳細・判断根拠は adr.md ADR-002）。UI は #572 の IP 素出しを据え置く。
- 既存 token ベース `revoke` / `revokeSession` の変更（#572 で温存済み）。
- `updatedAt` 更新の高頻度書き込み最適化以上の作り込み（スロットルは入れるが、専用の last-active 列追加やイベント駆動更新は行わない — ADR-003）。

## 調査結果

- 関連ファイル:
  - `app/core/domain/identity/ports/sessionService.ts` — `SessionRecord`（token 入り読み取り型）/ `SessionService` interface。`listForUser` / `revokeByIdForUser` は #572 で追加済み。
  - `app/core/domain/identity/services/` — 既存ドメインサービス（`identityService.ts` / `credentialPolicyService.ts`）。device-parser の置き場所候補。
  - `app/core/adapters/d1/repositories/sessionService.ts` — `D1SessionService`。`issue` / `resolve` / `listForUser` 実装。`resolve` は select のみで `updatedAt` を更新しない。
  - `app/lib/server/currentUser.ts` — `getCurrentUser`（`cache()` でリクエスト単位 1 回）が `sessionService.resolve(token)` を呼ぶ唯一の経路。**ここが活動時刻更新の自然な注入点**。
  - `app/core/application/dto/identity.ts` — `SessionDTO` / `toSessionDTO`。`updatedAt` は projection 済みだが UI 未使用（JSDoc で「最終アクセスに出すな」と明記）。
  - `app/core/application/identity/listUserSessions.ts` — read-only usecase。
  - `app/components/identity/SecurityForm/index.tsx` — `SessionRow` / `SessionIcon` / `sessionTitle` / `formatLoginTime`。表示は #572 で分離済み。
  - `spec/usecases/identity.md` L190-229 — `ListUserSessions` / `RevokeUserSession` 仕様。
- あるべきアーキテクチャ（`CLAUDE.md` / `spec/`）:
  - ヘキサゴナル + DDD。依存は内向き（presentation→application→domain、adapter はポート実装）。
  - **device-parser は純粋関数で I/O 無し** → ドメイン層（ドメインサービス / 値オブジェクト）が正しい置き場所。「ドメインに置くべきロジックが紛れ込まない」原則に従い、UI/usecase に直書きしない。
  - DTO projection は application 層（`toSessionDTO`）。表示整形（相対時刻）は presentation 層。
  - 虚偽表示禁止（#543 ADR-004 / #572 ADR-002）が最重要制約。
  - cross-cutting（clock）はポート越し。`resolve` 内の時刻も adapter が持つ `Clock` を使う（既存どおり）。
- 既存実装の状態:
  - #572 で projection / 表示が分離済みのため、device-parser と相対時刻は **`toSessionDTO` と `SessionRow` の差し替え**で段階導入できる（Issue 記載どおり）。`SessionDTO.updatedAt` は projection に保持済み。
  - 乖離: `D1SessionService.resolve` に `updatedAt` 更新経路が無い。これが「最終アクセス」を出せない唯一の backend 不足で、本 Issue で塞ぐ。
  - 相対時刻ヘルパーはコードベースに存在しない（各所 `toLocaleString` 直書き）。新規の共有ヘルパーを presentation 層に作る。
- 依存関係:
  - `resolve` の更新は**全認証リクエストに影響**（`getCurrentUser` 経由）。書き込みが毎リクエスト走るため、スロットル（後述）で D1 書き込み回数を抑える。
  - device-parser のパース結果型を `SessionRecord` ではなく projection（`SessionDTO`）に載せるか、`SessionDTO` に生 `userAgent` を残して presentation でパースするかの選択あり（ADR-001）。

## 設計

### ドメインモデルへの影響

- **新規ドメインサービス `deviceInfoService`（純粋関数）** を `app/core/domain/identity/services/deviceInfo.ts` に追加。
  - 入力: `userAgent: string | null`。出力: 値オブジェクト的な `DeviceInfo = Readonly<{ kind: "desktop" | "mobile" | "tablet" | "unknown"; os: string | null; browser: string | null; label: string | null }>`。
  - I/O・ambient time・乱数なし。userAgent 文字列の構造のみから判定する pure function。判別不能なフィールドは `null`（捏造しない）。`label` は os/browser が取れたときだけ「Chrome on macOS」形式で合成し、取れなければ `null`。
  - `kind` は行アイコン切替に使う最小限の分類。OS/ブラウザのバージョン番号までは追わない（モックは出すが、UA 偽装で不正確になりやすく、虚偽表示リスクを避けて主要トークンのみ判定）。
  - 既存ライブラリ（ua-parser-js 等）の採用可否は ADR-001 で判断。**ドメイン層に外部ライブラリ依存を持ち込まない方針**を優先し、限定的な自前パーサとする。
- `SessionService` port / `SessionRecord` の形は変えない（device パースは projection 段で行うため port 型に DeviceInfo を載せない）。
- **不変条件の追加なし。** セッションはアグリゲートでなく、device-parser は表示のための解析であって業務不変条件ではない。

### ユースケース / アプリケーションロジック

- `toSessionDTO`（`app/core/application/dto/identity.ts`）を拡張し、`deviceInfoService` を呼んで `SessionDTO.device: DeviceInfo` を載せる。token と同様、生 `userAgent` は DTO に**残す**（フォールバック表示・透明性のため）が、パース済み `device` も併せて projection する。
  - projection（パース）を application 層で行うことで、presentation はパース済みの確定値だけ受け取る（CLAUDE.md「DTO projection は application 層」）。
- `listUserSessions` usecase 自体のフローは不変（`toSessionDTO` 経由で device が乗る）。
- **`updatedAt` 更新は usecase ではなく `getCurrentUser`（presentation 隣接の lib）から port メソッド経由で呼ぶ。** 専用 usecase は作らない（`getCurrentUser` 自体が「usecase ラッパー不要の一行ポートアクセス」として既存設計で許容されている）。port に `touch` 系メソッドを足す（下記）。

### アダプター / 永続化 / 外部連携

- `SessionService` port に **`recordActivity(token: string): Promise<void>`** を追加（冪等・best-effort・最終アクセス時刻更新）。
  - JSDoc: 「`resolve` で解決されたトークンの `updatedAt` を `now` に進める。活動時刻トラッキング用。不在/期限切れトークンは no-op。書き込み頻度はアダプター側で WHERE スロットルする（ADR-003）。**best-effort**: これは認証成否に影響しない付随書き込みであり、呼び出し側（`getCurrentUser`）が失敗を握り潰すことを許容する」。
- `D1SessionService.recordActivity` 実装: `updated_at` は ISO 8601 文字列で保存されている（`issue` が `now.toISOString()` で挿入、`resolve`/`listForUser` も `gt(expiresAt, now.toISOString())` の文字列比較）ため、**SQLite の `datetime()` 算術には頼らず**、アダプター内で `cutoff = new Date(this.clock.now().getTime() - ACTIVITY_THROTTLE_MS).toISOString()` を算出し、drizzle で `UPDATE sessions SET updated_at = now.toISOString() WHERE token = ? AND updated_at < cutoff`（`and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff))`）を実行する。直近更新済み（`updated_at >= cutoff`）なら 0 行更新で D1 書き込みを抑える（ADR-003）。`mapDbError` でラップ。`ACTIVITY_THROTTLE_MS`（単位 ms、例 5 分）は既存 `DEFAULT_SESSION_TTL_MS` と同じ adapter-local 定数スタイルで定義する。
- `getCurrentUser`（`app/lib/server/currentUser.ts`）で `resolve` 成功後に `recordActivity(token)` を呼ぶが、**best-effort 注入**とする。`getCurrentUser` は現状 try/catch を持たない読み取り専用ヘルパーであり、`recordActivity` の D1 一時障害・ロック競合（`mapDbError` 経由で `SystemError` を throw しうる）が認証経路（`requireCurrentUser` / `requireAdminUser` 含む全ページ）を落とすのを防ぐため、**`recordActivity` 呼び出しのみを限定的に `try/catch` で囲み、失敗はログのみに留めて握り潰す**（resolve は既に成功＝認証は完結している）。これは CLAUDE.md「broad try/catch は明示的境界のみ」に反しない「付随書き込みの partial-failure tolerance」という正当な境界であり、ADR-003 に明記する（P-001）。
  - **UoW の外で呼ぶ（S-001）:** `getCurrentUser` は `userRepository.findById` を `container.unitOfWorkProvider.run(...)` の callback 内で呼ぶが、`sessionService` は port/adapter 設計上 **UoW の外**で binding に直接実行される（現コードの `resolve` も `run` の外）。`recordActivity` も `resolve` 同様 **`unitOfWorkProvider.run` の callback には紛れ込ませず**、read-only な findById 用 UoW callback の外側で（`resolve` 成功直後・best-effort try/catch 内で）呼ぶ。セッションはアグリゲート外・UoW 対象外であり、findById のトランザクションに付随書き込みを巻き込まない。
  - **握り潰し時のログはポート越しの `logger` を使う（S-002）:** 失敗時のログは `console.*` 直書きでなく、`getCurrentUser` が既に保持する `container.logger`（`SharedDeps.logger: Logger` — `app/core/application/di/types.ts` L102 で公開、`serverCloudflare.ts` で `ConsoleLogger` を注入）の `logger.warn(...)` を使う。CLAUDE.md「cross-cutting（logging）はポート越し」原則に従い、新規配線は不要（既存の `container` から参照できる）。
  - **read→read+activity-touch のセマンティクス更新（P-002）:** `getCurrentUser` の JSDoc を「one-line port access (read) does not need a usecase wrapper」から「read + best-effort activity-touch」に改訂し、副作用が入ることを明記する。`recordActivity` を冪等かつ WHERE スロットル付きにすることで「同一リクエストで複数回呼ばれても害がない」ことを設計の主軸に据え、`cache()` のリクエスト単位 1 回は**負荷見積りの前提ではなく best-effort の最適化**として扱う（React の `cache` はメモ化であって at-most-once 副作用ランナーではないため、副作用回数の保証をメモ化に暗黙依存させない）。
- **マイグレーション不要**（`updated_at` 列は既存）。geo を見送るため geo 関連スキーマ追加なし。

### UI / プレゼンテーション

- **相対時刻ヘルパー** `app/components/common/relativeTime.ts`（新規, presentation 層）: `formatRelativeTime(instant: string, now?: Date): string` を pure 実装。「たった今 / N分前 / N時間前 / N日前」、一定日数を超えたら `toLocaleDateString("ja-JP")` の絶対日付にフォールバック。`Intl.RelativeTimeFormat` を使うか自前かは ADR-004。
- `SecurityForm/index.tsx`:
  - `SessionIcon` を `device.kind` で glyph 切替（desktop=ラップトップ / mobile=スマホ / tablet=タブレット / unknown=汎用）。モックの SVG パスを流用。
  - `sessionTitle` を `device.label`（あれば）→ 無ければ `userAgent` 素出し → 無ければ `不明な端末` の優先順に変更。
  - **`session-meta` 行構成（geo 抜き・S-002）:** モック（L787-820）の 1 行目は `OS · ブラウザ · geo · IP` の `·` 連結だが、本 Issue では (a) OS/ブラウザは `device.label` としてタイトルへ寄せ、(b) geo は出さない（ADR-002）。結果、`session-meta` 行は **2 行構成**にする — 1 行目: IP（`ipAddress` があれば素出し、localhost 等で null なら行ごと省略）、2 行目: 「最終アクセス: {formatRelativeTime(updatedAt)}」。device トークンを meta 1 行目に重複表示しない（タイトルに集約済み）。`·` 連結の複合行は作らない。
  - **ログイン日時（createdAt）の扱い（S-003）:** #572 が追加した「ログイン日時」表示（`formatLoginTime` の locale 絶対表示）は**維持**する（本 Issue の必須対象は最終アクセス＝updatedAt の相対表示）。`formatRelativeTime` は共有ヘルパーなのでログイン日時へ適用することも可能だが、相対化は努力目標とし、絶対表示のままでも AC-5 違反としない。
  - `session-meta` の 2 行目「最終アクセス」は updatedAt 更新経路が入ったので実データ。geo 無しは AC-6 / ADR-002 と整合。
  - **発行直後セッションの初期状態の見え方（S-002）:** `recordActivity` で更新経路は必ず入るが、まだ一度も活動 touch されていない発行直後のセッションは `updatedAt == createdAt` となるため、「ログイン日時（createdAt 絶対表示）」と「最終アクセス（updatedAt 相対表示）」が同一時刻を指し、相対側が「たった今 / ログイン直後」のように createdAt と重複して見えることがある。これは虚偽ではなく初期状態の正しい表示であり（活動が進めば最終アクセスだけ更新される）、バグではない。検証者が「重複表示はバグか仕様か」で迷わないよう一文残す。
- `SessionDTO` import 経路・Page の data 取得は変更なし。

## 実装ステップ

### 1. device-parser ドメインサービス追加

- **対象ファイル:** `app/core/domain/identity/services/deviceInfo.ts`（新規）
- **変更内容:** `DeviceInfo` 型（`kind` / `os` / `browser` / `label`、判別不能は null）と純粋関数 `parseDeviceInfo(userAgent: string | null): DeviceInfo` を実装。主要トークン（Mac OS X→macOS / Windows / iPhone→iOS / iPad→iPadOS / Android / Linux、Chrome / Safari / Firefox / Edge）のみ判定。判別不能フィールドは null、`label` は os と browser が両方取れたときだけ「{browser} on {os}」で合成。`kind` は iPhone/Android phone=mobile, iPad/tablet=tablet, それ以外で OS 判明=desktop, 全不明=unknown。
- **理由:** I/O 無しの純粋解析はドメイン層が正しい置き場所（CLAUDE.md）。捏造を避けるため判別不能は null。
- **テスト:** ステップ 3（domain 単体テスト）で代表 UA のパース結果・kind・label・null フォールバックを検証。

### 2. DTO に device を載せる

- **対象ファイル:** `app/core/application/dto/identity.ts`
- **変更内容:** `SessionDTO` に `device: DeviceInfo` を追加（生 `userAgent` も残す）。`toSessionDTO` で `device: parseDeviceInfo(record.userAgent)` を projection。`updatedAt` の JSDoc を「更新経路が入ったため最終アクセスとして表示可」に改訂。`DeviceInfo` は domain 定義の型をそのまま DTO に載せ再定義しない（プリミティブのみで wire-safe、presentation は DTO 経由でのみ参照＝依存方向を侵さない、ADR-001）。
- **理由:** パースを application projection に集約。presentation は確定値を受け取る。
- **テスト:** ステップ 10 の `dto/identity.test.ts` で `toSessionDTO` の `device` projection（label 合成・null フォールバック）を検証。

### 3. ドメインサービスの単体テスト

- **対象ファイル:** `app/core/domain/identity/services/__tests__/deviceInfo.test.ts`（新規）
- **変更内容:** 代表 UA（macOS Safari / Windows Chrome / iPhone / iPad / Android / 不明 / null）でパース結果・kind・label・null フォールバックを検証。
- **理由:** 純粋関数の振る舞いと「捏造しない（不明は null）」を担保。

### 4. port に recordActivity 追加

- **対象ファイル:** `app/core/domain/identity/ports/sessionService.ts`
- **変更内容:** interface に `recordActivity(token: string): Promise<void>` を追加。JSDoc に「解決済みトークンの `updatedAt` を now に進める。最終アクセス時刻トラッキング用。不在/期限切れは no-op。書き込み頻度はアダプターで WHERE スロットル。**best-effort**: 認証成否に影響しない付随書き込みで、呼び出し側は失敗を握り潰してよい」と明記。
- **理由:** 「最終アクセス」を実データ化する更新経路を型で表現。port は最小限の追加。
- **テスト:** port は型定義のみ（振る舞いテストは adapter のステップ 10 integration で担保）。

### 5. adapter に recordActivity 実装

- **対象ファイル:** `app/core/adapters/d1/repositories/sessionService.ts`
- **変更内容:** `recordActivity(token)` を実装。`updated_at` が ISO 8601 文字列保存である既存実装に合わせ、`cutoff = new Date(this.clock.now().getTime() - ACTIVITY_THROTTLE_MS).toISOString()` を算出し、drizzle の `update(sessions).set({ updatedAt: this.clock.now().toISOString() }).where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)))`（スロットル付き・冪等）で実行。SQLite の `datetime()` 算術は使わない（既存 `toISOString()` 値と非互換になるため）。`ACTIVITY_THROTTLE_MS`（ms、例 5 分）を `DEFAULT_SESSION_TTL_MS` と同じ adapter ローカル定数スタイルで定義。`mapDbError` でラップ。
- **理由:** 毎リクエスト書き込みを避けつつ実データを更新（ADR-003）。既存の文字列時刻表現と整合（P-003）。マイグレーション不要。
- **テスト:** ステップ 10 の integration（real D1）でスロットル内不変・スロットル超更新・不在トークン no-op を検証。

### 6. getCurrentUser から活動時刻を更新

- **対象ファイル:** `app/lib/server/currentUser.ts`
- **変更内容:** `resolve(token)` 成功直後（**`unitOfWorkProvider.run` の findById callback の外側**・S-001）に `recordActivity(token)` を呼ぶが、**`recordActivity` 呼び出しのみを限定的な `try/catch` で囲み、失敗は `container.logger.warn(...)`（`console.*` 直書きでなくポート越しの注入済み logger・S-002）のみに留めて握り潰す**（best-effort・P-001）。`getCurrentUser` の JSDoc を「read のみ」から「read + best-effort activity-touch」に改訂し副作用が入ることを明記（P-002）。`cache()` の 1 回保証は負荷見積りの前提ではなく最適化として扱い、冪等・WHERE スロットルで複数回呼ばれても無害である点を主軸にする。
- **理由:** `resolve` を呼ぶ唯一の認証経路がここ。専用 usecase を増やさず最小注入。付随書き込みの失敗で認証経路を落とさない。セッションはアグリゲート外なので findById の UoW callback に含めない（S-001）。ログはポート越し（S-002）で CLAUDE.md のロギング原則に整合。
- **テスト:** 認証経路への副作用導入は手動/ブラウザ確認（活動後に最終アクセスが進む）で担保。`getCurrentUser` 自体は real-DB 統合の対象外（既存方針どおり）。

### 7. 相対時刻ヘルパー追加

- **対象ファイル:** `app/components/common/relativeTime.ts`（新規）+ `app/components/common/__tests__/relativeTime.test.ts`（新規）
- **変更内容:** `formatRelativeTime(instant: string, now?: Date): string`。たった今 / N分前 / N時間前 / N日前、しきい値超で絶対日付。`now` 注入可で決定的テスト。「たった今」の上限粒度は ACTIVITY_THROTTLE_MS と整合させる（S-004・ADR-004 参照）。
- **理由:** スコープ4。共有ヘルパーとして presentation 層に置く。テスト容易性のため `now` 注入。
- **テスト:** 同ステップで作る `relativeTime.test.ts` に `now` 注入で たった今/分/時間/日/絶対日付の境界を併記（このステップでテストまで完結）。

### 8. SessionRow の表示リッチ化

- **対象ファイル:** `app/components/identity/SecurityForm/index.tsx`
- **変更内容:** `SessionIcon` を `kind` 受け取りで desktop/mobile/tablet で互いに異なる glyph・unknown は汎用 glyph に切替（モック SVG パス流用）。`sessionTitle` を `device.label` → `userAgent` → `不明な端末` の順に変更。`session-meta` を 2 行構成にする — 1 行目: IP（null なら省略・geo は出さない）、2 行目: 「最終アクセス: {formatRelativeTime(session.updatedAt)}」。device トークンを meta に重複表示せずタイトルへ集約（S-002）。ログイン日時（createdAt）の `formatLoginTime` 絶対表示は維持（S-003：相対化は努力目標）。
- **理由:** モック構造に追従。地名以外のリッチ化を実データで実現。
- **テスト:** ステップ 10 の `SecurityForm/__tests__/index.test.tsx` で kind 別アイコン・device.label タイトル・最終アクセス相対表示・null UA フォールバックを検証。

### 9. spec 追記

- **対象ファイル:** `spec/usecases/identity.md`
- **変更内容:** `SessionDTO` に `device` を追記、`ListUserSessions` 処理フローに device projection を追記、`updatedAt` を「`resolve` 経路で活動ごとに更新（スロットル付き）された最終アクセス時刻」と更新。geo は「外部依存のため別 Issue」と明記。`recordActivity` の存在も sessionService 仕様箇所に追記。
- **理由:** spec を SSOT に保つ。geo 見送りの判断を spec にも残す。

### 10. テスト追記（adapter / dto / frontend）

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`（real D1）, `app/core/application/dto/__tests__/identity.test.ts`, `app/components/identity/SecurityForm/__tests__/index.test.tsx`
- **変更内容:** integration に `recordActivity` がスロットル内では updatedAt を変えず、スロットル超で更新すること・不在トークン no-op を追加。dto に `toSessionDTO` の `device` projection（label 合成・null フォールバック）を追加。frontend に kind 別アイコン・device.label タイトル・最終アクセス相対表示を追加。
- **理由:** 更新経路・projection・表示の回帰を防ぐ。

## 設計判断

詳細は adr.md を参照。要点:

- device-parser は外部ライブラリを避けた自前の純粋ドメインサービスとして実装（ADR-001）
- **geo（地名）解決は外部依存（API ポート or オフライン GeoIP DB）が過大なため本 Issue では見送り、別 Issue に切り出す（ADR-002）**
- `updatedAt` 更新は port の `recordActivity` + adapter スロットル（WHERE 条件）で実現し、`getCurrentUser` から注入。専用列・イベント駆動は導入しない（ADR-003）
- 相対時刻ヘルパーは presentation 層に新規追加し `now` 注入で決定的にする（ADR-004）

## リスクと注意点

- **write-on-read の負荷:** `recordActivity` を全認証リクエストで呼ぶため、スロットル WHERE（直近更新済みなら 0 行）で実書き込みを間引く。`cache()` でリクエスト単位 1 回に抑制済み。万一 D1 書き込みが問題化したら閾値を上げる。
- **device-parser の判別精度:** UA 偽装・新ブラウザで判別不能になる。捏造禁止のため不明は null/汎用 glyph/`不明な端末` にフォールバックし、推測でラベルを埋めない。
- **「最終アクセス」の意味:** スロットル幅（例 5 分）内の活動は反映されないため、表示は厳密な「最終」ではなく「最終アクセス（おおむね）」。相対時刻表示なので実害は小さいが、ラベル文言で過剰な厳密さを主張しない。
- **スロットル幅と相対表示の最小粒度の整合（S-004）:** `formatRelativeTime` の「たった今」上限を `ACTIVITY_THROTTLE_MS`（スロットル幅）以下に設定しないと、「たった今活動したのに『5 分前』」という違和感が出る。逆にスロットル幅を相対表示の最小粒度（分単位）より大きくしすぎると最終アクセスがガサつく。スロットル幅 ≤「たった今」で吸収できる粒度、を満たすよう両定数を選ぶ（ADR-003 / ADR-004）。
- **recordActivity 失敗の可用性影響（P-001）:** `recordActivity` は best-effort で `getCurrentUser` 内の限定 try/catch で握り潰すため、D1 一時障害でも認証経路（全ページ）は落ちない。これを設計判断として ADR-003 に確定。
- **geo 見送りの一貫性:** モックは地名を出すが本 Issue では出さない。IP 素出し据え置きが #572 と整合。地名を出さないことが「未実装の虚偽回避」であることを spec / ADR に残す。
- **port 拡張の波及:** `SessionService` 実装は `D1SessionService` のみ（fake/stub 無し、テスト基盤も real D1）。`recordActivity` を `D1SessionService` に実装すれば型エラー波及なし。

## テスト方針

- **純粋関数 unit（`pnpm test:unit`）:** `deviceInfo.test.ts`（parse 結果 / kind / label / null フォールバック）、`relativeTime.test.ts`（`now` 注入で たった今/分/時間/日/絶対日付の境界）、`dto/identity.test.ts`（`toSessionDTO` の device projection）。
- **adapter 結合（real D1, `pnpm test:integration`）:** `identity.integration.test.ts` に `recordActivity` のスロットル挙動（閾内不変・閾超更新・不在 no-op）と、`listForUser` が更新後 updatedAt を返すことを追加。
- **frontend:** `SecurityForm` の kind 別アイコン・`device.label` タイトル・最終アクセス相対表示・null UA フォールバック。
- **手動/ブラウザ:** 複数端末でログインし、デバイス名・アイコン・最終アクセスが端末ごとに正しく出ること、IP のみで地名が出ないこと、活動後に最終アクセスが進むことを確認。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目
**修正した点**:
- **P-001（recordActivity 失敗が認証リクエストを落とす）**: `recordActivity` を port JSDoc／設計／ステップ 4-6 で **best-effort** と明記。`getCurrentUser` 内で `recordActivity` 呼び出しのみを限定的な `try/catch` で囲み失敗を握り潰す方針に変更し、CLAUDE.md「broad try/catch は境界のみ」に整合する「付随書き込みの partial-failure tolerance」境界として ADR-003 に追記。リスク欄にも可用性影響を追記。
- **P-002（read-only な getCurrentUser に書き込み副作用）**: `getCurrentUser` JSDoc を「read のみ」→「read + best-effort activity-touch」に改訂する旨を設計・ステップ 6 に明記。`cache()` の 1 回保証を負荷見積りの前提から外し、冪等＋WHERE スロットルで複数回呼ばれても無害である点を主軸に据える方針を設計・ADR-003 に反映。
- **P-003（スロットル WHERE と ISO 文字列スキーマの整合）**: 実スキーマが `updated_at` を ISO 8601 文字列で保存（`issue` の `toISOString()`、`resolve`/`listForUser` の文字列比較）であることを確認のうえ、`cutoff = new Date(now - ACTIVITY_THROTTLE_MS).toISOString()` を算出し `lt(sessions.updatedAt, cutoff)` の文字列比較で間引く具体方針へ設計・ステップ 5・ADR-003 を修正。SQLite `datetime()` 算術を使わない旨を明記。

**取り込んだ改善提案**:
- **coverage S-002**: geo 抜きの `session-meta` 行構成（device はタイトルへ集約・geo は出さない・1 行目 IP／2 行目「最終アクセス」の 2 行構成・`·` 複合行は作らない）を設計・AC-4・ステップ 8 に明示。
- **coverage S-003**: AC-5 を「最終アクセス（updatedAt）に使うのが必須、ログイン日時（createdAt）の相対化は努力目標」と一意化。ステップ 8 の「ログイン日時は維持」との齟齬を解消。
- **arch S-003**: 各実装ステップに「テスト」項を併記（domain→3、dto→10、adapter→10 integration、helper→7 で完結、frontend→10）。
- **arch S-004**: スロットル幅と `relativeTime` の「たった今」最小粒度の整合（スロットル幅 ≤ 吸収粒度）をリスク欄・ステップ 7・ADR-003/004 に追記。

**見送った提案とその理由**:
- **coverage S-001 / S-004, arch S-001 / S-002**: 個別対応不要（取り込みの中で自然にカバー、または軽微）。ただし ADR-001 に DeviceInfo を domain 型のまま DTO 貫通させる依存方向の正当性、ADR-003 にスロットルを呼び出し側でなく adapter WHERE へ寄せた理由を一文ずつ補強した。

### 2周目
**両視点とも問題点ゼロ。** 軽微な改善提案（arch S-001/S-002・coverage S-001/S-002）を反映して終了。

**取り込んだ改善提案**:
- **arch S-001**: `recordActivity` を `unitOfWorkProvider.run`（findById 用 read-only UoW callback）の**外側**で呼ぶ旨を設計・ステップ6・ADR-003 に明記。セッションがアグリゲート外・UoW 対象外であることを理由に添えた。
- **arch S-002**: best-effort 握り潰し時のログを `console.*` 直書きでなく注入済みの `container.logger`（`SharedDeps.logger: Logger`・`types.ts` L102）越しに `logger.warn(...)` する旨を設計・ステップ6・ADR-003 に明記（CLAUDE.md のポート越しロギング原則）。実 logger 注入経路を確認のうえ「新規配線不要」と記述。
- **coverage S-001**: AC-7 本文に「geo を別 Issue 化し『未実装＝虚偽回避のため意図的に表示しない』旨を spec に記録する」を追記し、虚偽表示禁止の一貫性を spec 反映の受け入れ基準にも結びつけた。
- **coverage S-002**: 発行直後セッションは `updatedAt == createdAt` で「ログイン日時」と「最終アクセス」が同一相対時刻になりうる初期状態の見え方（バグでなく仕様）を設計 UI 節に一文残した。

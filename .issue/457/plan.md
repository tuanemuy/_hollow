# 実装計画 — Issue #457: security: 認証経路の rate limit / lockout 検討（#210 F-2）

**Issue:** #457
**作成日:** 2026-07-11
**複雑度:** 小規模

---

## 目的

認証経路（`logIn` / `login.tsx` / `authGuard`）にレート制御 / lockout を入れるべきかを検討し、根拠を持って一つの設計判断に到達する。結論に応じて成果物（調査記録・運用ドキュメント）を残す。実装が必要な重い機能追加を伴う Issue ではなく、**要否の検討 → 判断 → 判断に沿った軽量な成果**が本 Issue のゴール。

## 到達した設計判断（結論）

**CF エッジ（WAF Rate Limiting Rules + 常時稼働の DDoS 保護）を第一次かつ推奨の制御手段とし、application 層にはレート制御 / lockout を追加しない。** 判断根拠・切り分け・推奨エッジ設定・列挙攻撃耐性との整合を `.issue/457/investigation.md`（本計画のステップ1で作成）と `docs/runtime_cloudflare.md` の新セクションに記録する。application 層フォールバック設計（既存 `PromptPreviewRateLimiter` パターンの踏襲）は「エッジ Rate Limiting Rules がプランで使えない場合の待避策」として設計だけ記録し、**本 Issue では実装しない**。

詳細な判断とトレードオフは `.issue/457/adr.md`（ADR-001 / ADR-002）を参照。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ログイン試行のレート制御 / lockout を入れるべきか、入れるならどのレイヤー・粒度かの判断が根拠付きで文書化されている | Issue ゴール① | 1, 3 |
| AC-2 | CF 側（WAF / Rate Limiting Rules）で足りるか、application 層が必要かの切り分けが文書化されている | Issue ゴール② | 1, 2 |
| AC-3 | rate limit / lockout を入れる場合の列挙攻撃耐性（現状 `invalid_credentials` 集約）との整合が分析され、採用判断がその整合を損なわないことが示されている | Issue ゴール③ | 1 |
| AC-4 | 推奨 CF 設定（粒度・閾値・アクション・注意点）が運用者が適用できる粒度で `docs/runtime_cloudflare.md` に記載されている | 判断に沿った成果 | 2 |
| AC-5 | application 層フォールバック設計（採用しない前提の待避策）が、既存アーキテクチャ（ポート / D1 アダプター / エラー kind）に照らして具体化され、未実装であることが明示されている | 中間案の検討記録 | 1, 3 |

## スコープ

### 含まれないもの

- **application 層レート制御 / lockout の実装**。判断の結論が「エッジで足りる」であるため。フォールバック設計は記録のみ。
- **lazy upgrade の遅延化**（別 Issue: #456 / #210 F-1）。本 Issue の非ゴール。
- **ログインのタイミング側チャネル対策（unknown email の scrypt スキップによる存在推定）**。これはレート制御ではなく別種の列挙耐性論点。調査で観測事実として記録するが、対策実装は本 Issue 外（フォローアップ候補として investigation に記録）。
- **CF WAF ルールの実適用（IaC / ダッシュボード操作）**。運用手順として文書化するが、リポジトリからの自動適用は範囲外（Rate Limiting Rules は Pulumi / wrangler 管理外の運用リソース）。

## 調査結果

### 関連ファイル

- `app/core/application/identity/logIn.ts` — ログインユースケース。`verifyPassword`（UoW#1）→ status チェック（UoW#2）→ 必要なら `rehashLegacyPassword`（UoW#3）→ `sessionService.issue`。レート制御 / lockout は一切ない。
- `app/components/auth/LoginForm/action.ts` — `loginFn` サーバー関数（`createServerFn({ method: "POST" })`）。ログインの transport 境界。**`ipAddress: null` がハードコード**されており、現状アプリは CF-Connecting-IP を取得すらしていない（`userAgent` のみ `getRequestHeader` で取得）。
- `app/core/presentation/authGuard.ts` / `authMiddleware.ts` — 認証済み判定・セッション cookie。レート制御なし。
- `app/core/adapters/d1/repositories/credentialStore.ts` — `verifyPassword`：email 未存在 / soft-deleted / password NULL は **scrypt を走らせず即 `null` 返却**（L248-250）。ハッシュ照合は存在するアカウントに対してのみ scrypt（`N=2^16`）フル実行。負値パスは全て `null` に集約（`invalid_credentials` 相当）。
- `app/core/application/ports/promptPreviewRateLimiter.ts` + `app/core/adapters/d1/repositories/promptPreviewRateLimiter.ts` — **本プロジェクト唯一の application 層レート制御の先例**（Issue #574）。`tryConsume(key, now) → { allowed, retryAfterSec }`、単一の `INSERT ... ON CONFLICT DO UPDATE ... setWhere(count < max) RETURNING` で atomic に slot 消費、古い window 行の opportunistic 削除で pruner 不要。config（`max` / `windowMs`）注入。フォールバック設計の踏襲元。
- `app/core/application/errors/index.ts` — `AuthenticationError extends UnauthorizedError`。kind は `unauthorized`。`invalid_credentials` / `unverified` / `account_unavailable` / `setup_token_disabled` / `invalid_setup_token` の 5 種。**`tooManyRequests` / `rateLimited` の kind は存在しない**。
- `app/core/presentation/errorResponse.ts` — `HTTP_STATUS_BY_KIND`：`unauthorized → 401`。**429 に対応する kind がない**。app 層 429 を返すには SerializedError union 全体（全レイヤー）に新 kind を追加する必要がある。
- `docs/runtime_cloudflare.md` — Reference runtime が Cloudflare Workers + D1 + Queues であることの一次情報源。§Observability に「未認証 POST エンドポイントの頻度制御はエッジ層（Cloudflare WAF / rate-limit rules）に委譲する」既存方針（`.issue/647/adr.md` ADR-006）が明記済み。
- `wrangler.toml` / `wrangler.<stage>.toml` — KV / Durable Object バインディングは**存在しない**（D1 / R2 / Queues / ASSETS / Service Binding(RELAY) / Workers AI はあるが、レート制御用の永続カウンタ基盤は無い）。app 層のステート保持は実質 D1 一択。

### あるべきアーキテクチャ

- **cross-cutting concern はポートの背後に置く**（CLAUDE.md）。もし app 層でレート制御するなら `PromptPreviewRateLimiter` と同型のポート + D1 アダプターが正しい形。
- **Reference runtime は Cloudflare**。エッジ（WAF Rate Limiting Rules / DDoS 保護 / Turnstile）が Worker 起動**前**に効くため、CPU / 帯域を守る制御はエッジが構造上有利。
- **入力検証は transport 境界と値オブジェクト構築の 2 点のみ**。レート制御はそのどちらでもない横断関心。
- **エラーは kind タグ付き構造化シリアライズ**。新しい失敗形（429）を足すのは union 全体に波及する重い変更。

### 既存実装の状態

- 認証経路に rate limit / lockout は**不在**（#210 investigation で確定済み。本 Issue で再確認）。
- app は現状クライアント IP を取得していない（`ipAddress: null`）。IP ベースの app 層制御には CF-Connecting-IP の配線追加が前提。
- 列挙耐性は `invalid_credentials` へのエラー集約で担保されている（コード / タイミング両面のうち、**コード面は完全に集約済み**）。ただし `verifyPassword` は未存在 email で scrypt をスキップするため**タイミング側チャネルは残る**（本 Issue のスコープ外だが記録する）。

### 切り分け — CF エッジ vs application 層

| 観点 | CF エッジ（WAF Rate Limiting Rules） | application 層（D1 カウンタ） |
|---|---|---|
| 効くタイミング | Worker 起動**前**。scrypt も D1 書き込みも消費せず遮断 | Worker 起動**後**。判定のため attempt ごとに D1 書き込みが hot path に載る |
| CPU-DoS 耐性（scrypt 保護） | 高（計算前に shed） | 低〜中（判定自体がコスト。scrypt 前に効かせても D1 write は増える） |
| 帯域 / 分散フラッド | CF DDoS 保護と一体で対処可能 | Worker より内側では帯域は守れない |
| クライアント IP の信頼性 | エッジは CF-Connecting-IP をネイティブに把握。詐称困難 | app は CF-Connecting-IP を信頼するしかなく、配線追加が必要 |
| アカウント単位のオンライン総当たり | IP 分散には弱い | account/email キーで分散 IP にも対応可能だが lockout の副作用（後述）が大きい |
| 実装コスト | ルール定義（運用リソース）。コード変更ゼロ | 新エラー kind（union 全体）+ D1 テーブル + migration + ポート + アダプター + DI + IP 配線 |
| 列挙耐性への影響 | IP キーはアカウント identity に触れず、列挙面ゼロ | email/account キーの lockout は存在漏洩・self-DoS リスク |

**結論：本 Issue が守りたいもの（scrypt CPU コストの毎回発生・総当たり耐性）に対しては、Worker 起動前に効くエッジが構造上優位。** オンライン総当たりは scrypt（`N=2^16`, 1 試行 50–100ms、かつ未存在 email はスキップ）が既に強い律速で、残る現実的脅威は「単一〜少数ソースからの volumetric フラッド」＝エッジ / DDoS 領域。app 層 lockout は列挙耐性を**むしろ後退**させ（下記）、実装コストも高い。

### 列挙攻撃耐性との整合

- 現状：`logIn` は email 形式失敗も wrong password も未存在 email も `invalid_credentials`（401）へ集約（コード面で完全）。`unverified` / `account_unavailable` は**正しいパスワードで verify 成功した後**にのみ分岐するため、パスワード未知の攻撃者には漏れない。
- **IP キーのエッジレート制御はアカウント identity に一切触れない**ため、列挙面をゼロで維持する（推奨案が現状の集約を損なわない）。
- 仮に **email/account キーの app 層 lockout** を入れると：
  - lockout 応答（例：429 vs 401）がアカウントごとに差を持つと**存在オラクル**になりうる。回避するには未存在 email でも同一のカウンタ挙動・同一応答が必要で、実装の慎重さを要する。
  - 攻撃者が victim の email を連打して**意図的にロックアウト（self-DoS）**できる。lockout は rate-limit window より副作用が持続的で悪質。
  - → よって「入れるとしても per-account lockout は避け、per-IP のみ」が妥当。そして per-IP はエッジの方が優れているため、app 層に置く動機がさらに薄い。

## 設計

本 Issue の結論は「app 層に実装を追加しない」なので、ドメイン〜プレゼンテーションへの**変更は無し**。以下は各レイヤーへの影響確認（あるべき順に内側から）。

### ドメインモデルへの影響

なし。試行記録 / lockout 状態というドメイン概念を導入しない（採用案がエッジ側のため）。セッション・認証情報の既存モデルは変更しない。

### ユースケース / アプリケーションロジック

なし。`logIn` は変更しない。

### アダプター / 永続化 / 外部連携

なし。D1 スキーマ変更・migration・新テーブルなし。

### UI / プレゼンテーション

なし。`loginFn` / `login.tsx` は変更しない。`ipAddress: null` も現状維持（採用案は app 層 IP を必要としない）。

### （記録のみ・未実装）application 層フォールバック設計

エッジ Rate Limiting Rules がプランで使えない場合の待避策。実装する場合の内側からの設計を **記録として** 残す（本 Issue では作らない）：

1. **ポート**：`app/core/application/ports/authAttemptRateLimiter.ts` に `PromptPreviewRateLimiter` と同型の `tryConsume(ipKey, now) → { allowed, retryAfterSec }`。キーは**アカウント identity ではなく CF-Connecting-IP**（列挙面ゼロを維持）。
2. **アダプター**：`D1PromptPreviewRateLimiter` を踏襲した `D1AuthAttemptRateLimiter`（`INSERT ... ON CONFLICT DO UPDATE setWhere(count<max) RETURNING` + 旧 window opportunistic 削除）。新 D1 テーブル + migration。
3. **エラー kind**：`tooManyRequests`（429）を SerializedError union に追加し `HTTP_STATUS_BY_KIND` に `429` を登録。全レイヤーへ波及する重い変更である点が、この案を「待避策」に留める最大の理由。
4. **IP 配線**：`loginFn` で `getRequestHeader("CF-Connecting-IP")` を取得し `logIn` に渡す。`logIn` は verify **前**に `tryConsume` を呼び、`allowed=false` なら `Retry-After` 付き 429。
5. verify 前チェックにより scrypt 消費前に遮断できるが、判定の D1 write が hot path に載るトレードオフは残る。

## 実装ステップ

依存関係が無い文書成果なので、以下の順で作成する。

### 1. 調査・判断記録 `.issue/457/investigation.md` の作成

- **対象ファイル:** `.issue/457/investigation.md`（新規）
- **変更内容:** 本計画「調査結果」「切り分け」「列挙耐性との整合」を独立した調査ドキュメントとして整形記載。構成：(0) 現状コードの要点（`logIn` フロー / `verifyPassword` の scrypt スキップ / `ipAddress: null` / KV・DO 不在）、(1) 脅威モデル（オンライン総当たり vs volumetric CPU-DoS）、(2) CF エッジ vs app 層の切り分け表、(3) 列挙耐性との整合（per-account lockout の self-DoS / 存在オラクル分析）、(4) 結論（エッジ第一次・app 層追加なし）、(5) 推奨エッジ設定、(6) 待避策としての app 層設計（未実装）、(7) フォローアップ候補（タイミング側チャネル）。
- **理由:** AC-1 / AC-2 / AC-3 / AC-5 の一次成果物。#210 investigation と同じ体裁で判断を追跡可能にする。

### 2. `docs/runtime_cloudflare.md` に認証エッジ保護の運用セクション追記

- **対象ファイル:** `docs/runtime_cloudflare.md`
- **変更内容:** 新セクション「Auth endpoint edge protection」を追記。推奨 WAF Rate Limiting Rule（ログインのサーバー関数 POST 経路 = TanStack Start のサーバー関数エンドポイント。運用者はダッシュボード / ルールで method=POST かつ当該経路をマッチ）、カウントキー = IP、閾値の初期値の目安（例：10 req / 60s / IP、要チューニング）、アクション（block または managed challenge）、常時 DDoS 保護との併用、必要時のみ Turnstile エスカレーション。注意点：Rate Limiting Rules の可用性 / クォータは CF プラン依存、`CF-Connecting-IP` が信頼できる唯一のクライアント IP（app では XFF を信頼しない）、staging / production の両ゾーンにルールを適用すること。§Observability の既存「頻度制御はエッジに委譲」方針との一貫性に言及。
- **理由:** AC-4。判断に沿った運用ガイドを Reference runtime ドキュメントに残す。

### 3. `.issue/457/adr.md` の作成

- **対象ファイル:** `.issue/457/adr.md`（新規）
- **変更内容:** ADR-001（レイヤー選定：エッジ第一次 / app 層追加なし）、ADR-002（レート制御の粒度：per-IP 採用・per-account lockout 不採用、列挙耐性根拠）。
- **理由:** トレードオフのある技術的設計判断（レイヤー・粒度・CF vs app）を ADR として残す。

## 設計判断

- **レイヤー：CF エッジ第一次、app 層追加なし。** Worker 起動前に効く点で scrypt CPU 保護 / volumetric に構造優位。詳細 ADR-001。
- **粒度：per-IP。per-account lockout は不採用。** lockout は self-DoS と存在オラクルで列挙耐性を後退させる。詳細 ADR-002。
- app 層 429 を返すには SerializedError union 全体に新 kind が要る点が、app 層案の実装コストを押し上げ、判断を裏付ける。

## リスクと注意点

- **CF Rate Limiting Rules の可用性はプラン依存。** 契約プランで使えない / クォータ不足の場合はフォールバック（app 層 per-IP 限定・記録済み設計）が必要になる。この前提を investigation / runtime doc に明記する。
- **分散（botnet）総当たりは per-IP エッジルールを回避する。** これは DDoS / bot management 領域であり、per-account lockout でも self-DoS になるため本質的にアプリ単独では解けない。scrypt の律速 + CF DDoS 保護 + 必要時 Turnstile が現実的な多層防御である旨を明示する。
- **タイミング側チャネル（未存在 email の scrypt スキップ）は残存。** レート制御では塞げない別論点。investigation にフォローアップ候補として記録し、スコープ膨張を避ける。
- **判断が「実装しない」であるため、後続の implement / manual-test フェーズは文書レビューのみ**になる点をレビュアーが誤解しないよう plan に明記済み。

## テスト方針

- コード変更が無いため単体 / 統合テストの追加は無い。
- 検証は文書レビュー：(a) investigation の脅威モデル・切り分け・列挙耐性分析に論理的欠落がないか、(b) runtime doc の推奨ルールが運用者に適用可能な粒度か、(c) ADR がトレードオフを明示しているか。
- 参考：将来フォールバックを実装する場合のテスト観点（本 Issue 対象外）— `D1AuthAttemptRateLimiter.tryConsume` の window 境界 / 同時実行 atomic 性 / 429 の `Retry-After`、および per-IP キーがアカウント存在を漏らさないこと。

# 調査・設計検討 — Issue #457

**対象:** 認証経路（`logIn` / `loginFn` / `authGuard`）へのレート制御 / lockout の要否・レイヤー・粒度の判断（#210 F-2）
**前提:** 認証系にレート制御は不在（#210 investigation / PR #454 で確定）。本書はその再確認と、守るべき脅威・切り分け・列挙耐性との整合を独立に記録する。結論と ADR は `.issue/457/adr.md`（ADR-001 / ADR-002）。

## 0. 現状コードの要点

中核は `app/core/application/identity/logIn.ts`、`app/core/adapters/d1/repositories/credentialStore.ts`、`app/components/auth/LoginForm/action.ts`。

### logIn の制御フロー（`logIn.ts`）

```
EmailAddress.create(input.email)   ← 形式失敗は invalid_credentials に集約
UoW#1: credentialStore.verifyPassword(email, password) → { userId, needsRehash } | null
  ↓ null                    → invalid_credentials (401)
UoW#2: userRepository.findById(userId) → status
  ↓ null                    → account_unavailable（孤児クレデンシャル）
  ↓ status === 'pending'    → unverified
  ↓ 'suspended' / 'deleted' → account_unavailable
UoW#3: needsRehash なら credentialStore.rehashLegacyPassword(userId, password)
sessionService.issue(userId, { userAgent, ipAddress })
```

- レート制御 / lockout は一切ない。失敗の負値パスは `invalid_credentials`（未存在 email / wrong password / email 形式失敗）に集約される。
- `unverified` / `account_unavailable` は **verify 成功後（UoW#2 の status 分岐）にのみ**到達する。パスワード未知の攻撃者には漏れない。

### verify 経路の scrypt スキップ（`credentialStore.verifyPassword`, L230–258）

```
row = SELECT users.id, users.deletedAt, accounts.password ... WHERE users.email = :email
  ↓ !row                    → return null   (L248)  ← scrypt 未実行
  ↓ row.deletedAt !== null  → return null   (L249)  ← scrypt 未実行（soft-deleted）
  ↓ row.password === null   → return null   (L250)  ← scrypt 未実行（OAuth-only 等）
verifyHash(raw, row.password)                (L251)  ← ここで初めて scrypt (N=2^16) / legacy PBKDF2
  ↓ !ok                     → return null
return { userId, needsRehash: !isScryptEncoded(row.password) }
```

- **scrypt（1 試行 50–100ms）が走るのは「存在し・非削除・パスワード有り」のアカウントに対してのみ**。未存在 email はハッシュ照合前に即 `null` 返却で、CPU を消費しない。
- ハッシュ照合コストの観点では、この scrypt がオンライン総当たりの主たる律速。

### クライアント IP を取得していない（`loginFn`, `action.ts`）

- `loginFn = createServerFn({ method: "POST" })`。ログインの transport 境界。
- `userAgent` は `getRequestHeader("user-agent")` で取得するが、**`ipAddress: null` がハードコード**（L23）。アプリは現状 `CF-Connecting-IP` を取得すらしていない。IP ベースの application 層制御には配線追加が前提。

### エッジ用ステートの土台が無い

- `wrangler.toml` / `wrangler.staging.toml` のバインディングに **KV / Durable Object は存在しない**（D1 / R2 / Queues / ASSETS / Service Binding(`RELAY`) / Workers AI(`AI`) はあるが、レート制御のステート保持に使える永続カウンタ基盤は無い）。application 層でステートを持つなら実質 D1 一択。
- application 層で 429 を返す `tooManyRequests` エラー kind は存在しない（下記 2 章）。

## 1. 脅威モデル

守りたいのは (a) scrypt CPU コスト（毎ログインでフル実行）、(b) 総当たり耐性、(c) volumetric フラッド。

- **オンライン総当たり（アカウント単位）:** scrypt（`N=2^16`, 1 試行 50–100ms）が既に強い律速。加えて未存在 email は scrypt をスキップするため、辞書攻撃で「存在するアカウント」を絞り込んでも 1 試行あたりのコストは変わらない。単一アカウントへの総当たりは律速で現実的でない。
- **volumetric CPU-DoS / フラッド:** 存在するアカウントの email に対して verify を大量に投げると、1 リクエストごとに scrypt が走り Worker CPU を消費できる。これが本 Issue で最も現実的な脅威。単一〜少数ソースからの高頻度フラッドが典型で、**帯域・接続数・頻度の制御領域＝エッジ / DDoS**。
- **分散（botnet）総当たり:** 多数 IP からの単一アカウント総当たり。per-IP のレート制御を原理的に回避する。scrypt の律速 + CF DDoS 保護 + 必要時 Turnstile で受ける領域で、アプリ単独では解けない。

## 2. 切り分け — CF エッジ vs application 層

| 観点 | CF エッジ（WAF Rate Limiting Rules） | application 層（D1 カウンタ） |
|---|---|---|
| 効くタイミング | Worker 起動**前**。scrypt も D1 書き込みも消費せず遮断 | Worker 起動**後**。判定のため attempt ごとに D1 書き込みが hot path に載る |
| CPU-DoS 耐性（scrypt 保護） | 高（計算前に shed） | 低〜中（判定自体がコスト。scrypt 前に効かせても D1 write は増える） |
| 帯域 / 分散フラッド | CF DDoS 保護と一体で対処可能 | Worker より内側では帯域を守れない |
| クライアント IP の信頼性 | エッジは `CF-Connecting-IP` をネイティブに把握。詐称困難 | app は `CF-Connecting-IP` を信頼するしかなく、配線追加が必要（現状 `ipAddress: null`） |
| アカウント単位のオンライン総当たり | IP 分散には弱い | account/email キーで分散 IP にも対応可能だが lockout の副作用（3 章）が大きい |
| 実装コスト | ルール定義（運用リソース）。コード変更ゼロ | 新エラー kind（SerializedError union 全体）+ D1 テーブル + migration + ポート + アダプター + DI + IP 配線 |
| 列挙耐性への影響 | IP キーはアカウント identity に触れず、列挙面ゼロ | email/account キーの lockout は存在漏洩・self-DoS リスク |

**結論:** 本 Issue が守りたいもの（scrypt CPU の毎回発生・volumetric フラッド）に対しては、Worker 起動前に効くエッジが構造上優位。オンライン総当たりは scrypt が既に強律速で、残る現実的脅威は volumetric フラッド＝エッジ / DDoS 領域。application 層 lockout は列挙耐性を**むしろ後退**させ（3 章）、実装コストも高い。

## 3. 列挙攻撃耐性との整合

- **現状（コード面で完全に集約）:** `logIn` は email 形式失敗も wrong password も未存在 email も `invalid_credentials`（401）へ集約する。`AuthenticationError` は `kind: 'unauthorized'` としてシリアライズされ、応答は 401 で一様。`unverified` / `account_unavailable` は正しいパスワードで verify 成功した後の status 分岐でのみ返るため、パスワード未知の攻撃者には漏れない。
- **per-IP エッジ制御は列挙面ゼロ:** カウントキーがクライアント IP でありアカウント identity に一切触れないため、現状の集約を損なわない。推奨案が既存の列挙耐性を後退させない。
- **per-account / per-email lockout を入れると後退する:**
  - lockout 応答（例：429 vs 401）がアカウントごとに差を持つと**存在オラクル**になりうる。未存在 email でも同一のカウンタ挙動・同一応答を保証する追加実装が必要で、慎重さを要する。
  - 攻撃者が victim の email を連打して**意図的にロックアウト（self-DoS）**できる。lockout は rate-limit window より副作用が持続的で悪質。
  - → 「入れるとしても per-account lockout は避け、per-IP のみ」が妥当。そして per-IP はエッジの方が優れているため、application 層に置く動機がさらに薄い。

## 4. 結論

**CF エッジ（WAF Rate Limiting Rules + 常時稼働の DDoS 保護）を第一次かつ推奨の制御手段とし、application 層にはレート制御 / lockout を追加しない。粒度は per-IP。per-account lockout は不採用。** 判断根拠・トレードオフは `.issue/457/adr.md`（ADR-001 レイヤー選定 / ADR-002 粒度）を参照。既存方針「未認証 POST エンドポイントの頻度制御はエッジに委譲」（`.issue/647/adr.md` ADR-006）とも一貫する。

## 5. 推奨エッジ設定（概要）

判断の要点のみ。運用者が適用できる粒度の手順は `docs/runtime_cloudflare.md` の「Auth endpoint edge protection」セクションを参照。

- **対象:** ログインのサーバー関数 POST 経路。
- **カウントキー:** クライアント IP（`CF-Connecting-IP`）。アプリは XFF を信頼しない。
- **閾値:** 初期目安 10 req / 60s / IP（要チューニング）。
- **アクション:** block または managed challenge。常時 DDoS 保護と併用し、必要時のみ Turnstile にエスカレーション。
- **注意:** Rate Limiting Rules の可用性 / クォータは CF プラン依存。WAF ルールはリポジトリ管理外の運用リソースなので staging / production 両ゾーンに適用する。分散 botnet 総当たりは per-IP を回避する（DDoS / Turnstile 領域）。

## 6. 待避策としての application 層フォールバック設計（未実装）

**本 Issue では実装しない。** エッジ Rate Limiting Rules がプランで使えない場合の待避策として、既存 `PromptPreviewRateLimiter`（`app/core/application/ports/promptPreviewRateLimiter.ts` + `app/core/adapters/d1/repositories/promptPreviewRateLimiter.ts`, Issue #574）を踏襲する内側からの設計を記録に留める。

1. **ポート:** `PromptPreviewRateLimiter` と同型の `tryConsume(ipKey, now) → { allowed, retryAfterSec }`。キーは**アカウント identity ではなく `CF-Connecting-IP`**（列挙面ゼロを維持）。踏襲元は `RateLimitDecision` 型と単一 `tryConsume` の最小契約。
2. **アダプター:** `D1PromptPreviewRateLimiter` を踏襲。単一の `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < :max RETURNING` で atomic に slot 消費（SQLite のステートメント単位ロックで直列化、リトライループ無し）。window バケットは `floor(now_ms / windowMs)`、旧 window 行は同一呼び出しで opportunistic 削除するため pruner 不要。config（`max` / `windowMs`）注入。新 D1 テーブル + migration が必要。
3. **エラー kind:** application 層で 429 を返す `tooManyRequests` kind は現状存在しない（`SerializedError` union は business / notFound / conflict / unauthorized / forbidden / validation / system / secretBox / unknown の 9 種のみ、`HTTP_STATUS_BY_KIND` にも 429 が無い）。追加すると union 全体（application errors → presentation errorResponse → 表示層）に波及する。**この波及コストが、本案を「待避策」に留める最大の理由。**
4. **IP 配線:** `loginFn` で `getRequestHeader("CF-Connecting-IP")` を取得し `logIn` に渡す（現状 `ipAddress: null` を実値に）。`logIn` は verify **前**に `tryConsume` を呼び、`allowed=false` なら `Retry-After` 付き 429。
5. **トレードオフ:** verify 前チェックで scrypt 消費前に遮断できるが、判定の D1 write が hot path に載る。エッジ（計算前に shed）に対して構造的に劣後する点は変わらない。

## 7. フォローアップ候補（本 Issue スコープ外）

- **タイミング側チャネル（未存在 email の scrypt スキップ）:** 0 章のとおり、`verifyPassword` は未存在 / 削除済み / パスワード無しの email に対して scrypt を走らせず即 `null` を返す。応答時間の差から「email が存在するか」を推定できる余地が残る（コード面の `invalid_credentials` 集約では塞げない別種の列挙耐性論点）。レート制御では塞げないため本 Issue のスコープ外。**別 Issue #837 として起票済み**（例：未存在時にもダミー scrypt を走らせて応答時間を平準化する等、コストとのトレードオフを含めて評価）。

## 8. 結論サマリ

- 認証経路のレート制御 / lockout は**不在**（再確認）。
- 守るべき現実的脅威は volumetric CPU-DoS / フラッド。オンライン総当たりは scrypt が既に強律速で、未存在 email はスキップされる。
- レイヤー：**CF エッジ第一次、application 層追加なし**（Worker 起動前に効き、scrypt CPU / 帯域を構造的に守れる）。ADR-001。
- 粒度：**per-IP**。per-account lockout は self-DoS / 存在オラクルで列挙耐性を後退させるため不採用。ADR-002。
- application 層フォールバック（per-IP 限定）は設計のみ記録・**未実装**。429 kind 追加の union 波及がコストの中心。
- タイミング側チャネルはフォローアップ候補（別論点・スコープ外）。

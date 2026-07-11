# General Review（セキュリティ設計判断ドキュメント）— PR #836 / Issue #457

対象: `.issue/457/investigation.md`（新規）, `.issue/457/adr.md`（新規）, `.issue/457/testing.md`（新規）, `.issue/457/plan.md`（新規）, `docs/runtime_cloudflare.md`（追記）。コード変更ゼロ。

## 検証サマリ

- **コード事実の照合: 引用はすべて実コードと一致。** 事実誤認 Blocker はゼロ。
- **受け入れ基準 AC-1〜AC-5: すべて成果物で充足。**
- **判断の論理的妥当性: 概ね妥当。** ただし runtime doc の圧縮した一文が investigation §6 の自説と食い違う（W-002）。
- **運用可能性: 概ね良好。** WAF ルールの Match 粒度に運用上の落とし穴の記載漏れ（W-001）。

### コード事実の照合結果（すべて一致）

| ドキュメントの主張 | 実コード | 判定 |
|---|---|---|
| `verifyPassword`：未存在 / soft-deleted / password NULL で scrypt スキップし即 null（L248-250） | `credentialStore.ts` L248 `if (!row) return null` / L249 `deletedAt !== null` / L250 `password === null` → L251 `verifyHash`（scrypt はここで初めて実行） | 一致 |
| `loginFn` は `ipAddress: null` ハードコード（L23）、`userAgent` のみ取得 | `action.ts` L23 `ipAddress: null`、L16 `getRequestHeader("user-agent")` | 一致 |
| `logIn` フロー verify→status→rehash→session、`unverified`/`account_unavailable` は verify 成功後にのみ分岐 | `logIn.ts` L37 verify → L49 status → L79 rehash → L85 issue。`unverified`(L63)/`account_unavailable`(L55,L69) はすべて `verified !== null` 後 | 一致 |
| `HTTP_STATUS_BY_KIND` に 429 / `tooManyRequests` kind 無し | `errorResponse.ts` L107-125：401/403/404/409/422/500/503 のみ、429 無し | 一致 |
| SerializedError union は 9 種（business/notFound/conflict/unauthorized/forbidden/validation/system/secretBox/unknown） | `errorResponse.ts` L37-47 `SERIALIZED_ERROR_KINDS` がちょうどこの 9 種 | 一致 |
| `PromptPreviewRateLimiter`：`tryConsume(key, now)→{allowed, retryAfterSec}`、`INSERT ... ON CONFLICT DO UPDATE ... setWhere(count<max) RETURNING`、旧 window opportunistic 削除、config(max/windowMs)注入 | port L11-29 `RateLimitDecision`/`tryConsume`、adapter L54-64 の SQL 形状・L69-76 の旧 window 削除・L10-15 config | 一致 |
| `wrangler.toml`/`wrangler.staging.toml` に KV / Durable Object バインディング無し | 両ファイルとも D1 / R2 / Queues / ASSETS / Service Binding(RELAY) / AI のみ。KV・DO は不在 | 一致（N-001 参照） |
| scrypt `N=2^16`（~50–100ms） | `scrypt.ts` L6 `SCRYPT_LOG_N = 16`、L82 `N: 1 << 16` = 65536 = 2^16 | 一致 |
| 既存方針 ADR-006 との一貫性 | `.issue/647/adr.md` ADR-006 L112：「リクエスト頻度の制御は当面ログ基盤側（Cloudflare の WAF / レート制限ルール…）に委ね、アプリ層では持たない」。有効なレート制限には KV/DO が要りスコープ外、という理由も一致 | 一致 |

### 受け入れ基準の充足

- **AC-1**（レイヤー・粒度の判断＋根拠）: 充足。investigation §4 / adr ADR-001・ADR-002。
- **AC-2**（CF vs app 層の切り分け）: 充足。investigation §2 の切り分け表。
- **AC-3**（列挙耐性との整合）: 充足。investigation §3、per-IP=列挙面ゼロ・per-account lockout=存在オラクル/self-DoS の分析。
- **AC-4**（運用者が適用できる粒度の CF 設定）: 充足だが Match 粒度に注意点漏れ（W-001）。
- **AC-5**（app 層フォールバック設計を既存アーキに照らして具体化＋未実装明示）: 充足。investigation §6、`tooManyRequests` kind の union 波及コストを未実装理由として明記。

## Blockers

なし。ドキュメントが引用するコード事実に誤りは見つからなかった。判断の骨子（エッジ第一次・per-IP・app 層追加なし）も論理的に成立している。

## Warnings

- **[W-001]** runtime doc の WAF「Match」粒度が、TanStack Start のサーバー関数パスの性質に触れておらず、運用者が pin したルールが将来のデプロイで無言で失効しうる。
  - 場所: `docs/runtime_cloudflare.md`（Auth endpoint edge protection の Match 項）
  - 理由: TanStack Start のサーバー関数は個別ルートではなく `_serverFn`（関数 ID 付きパス）に POST される（`app/routes/__root.tsx` L48 のコメントが `_serverFn` ラウンドトリップに言及）。その関数 ID はビルド由来の識別子で、ファイル移動・リネーム等で変わりうる。WAF ルールを具体パスに pin すると、ID が変わったデプロイでルールが**エラーも出さず**マッチしなくなり、レート制御が静かに消える。AC-4（運用者適用性）の観点で実害のある落とし穴。doc は「deployed route に対して具体パスを確認せよ（ハードコードするな）」とだけ述べ、"確認した値も後続デプロイで変わりうる／変わったら再確認が要る" という運用上の含意を書いていない。
  - 提案: Match 項に「サーバー関数パスはビルド由来の識別子であり、コード変更で変わりうる。ルール適用後もデプロイ毎に再確認するか、より安定した属性（例: `_serverFn` ベースパス＋POST を粗い backstop として）でのマッチも検討する」旨を一文追記する。粗いマッチが他の mutation も巻き込むトレードオフに触れると尚良い。

- **[W-002]** runtime doc の圧縮した一文が、investigation §6 の自説（verify 前チェックの app 層 limiter は scrypt CPU を消費せず遮断できる）と食い違う。
  - 場所: `docs/runtime_cloudflare.md`（"sheds volumetric floods without spending scrypt CPU (N=2^16, ~50–100 ms per verify) or a D1 write, **which an in-app counter could not**"）
  - 理由: investigation §6.4-6.5 は「`logIn` は verify **前**に `tryConsume` を呼び…verify 前チェックで scrypt 消費前に遮断できるが、判定の D1 write が hot path に載る」と明記している。つまり app 層 limiter も scrypt CPU は節約でき、真の劣後点は「Worker 起動が必ず走る」「カウンタ自身の D1 write」の 2 点。runtime doc の "which an in-app counter could not" は scrypt CPU まで一括で "app 層には無理" と読め、同一 PR 内の investigation の分析と矛盾する。エッジの優位（Worker 起動前 + D1 write ゼロ）という結論自体は正しいが、根拠の粒度が不正確で、レビュアー / 運用者が誤読しうる。
  - 提案: 「without spending scrypt CPU or a D1 write, which an in-app counter could not」を「without booting the Worker or spending a D1 write for the counter itself — an in-app limiter can skip scrypt by checking before verify, but not the Worker invocation and the counter write」等に補正し、investigation §6.5 と粒度を揃える。

## Notes

- **[N-001]** wrangler バインディングの列挙が緩い。investigation §0・plan は「D1 / R2 / Queues のみ」と書くが、実際は ASSETS・Service Binding(`RELAY`)・Workers AI(`AI`) も存在する。ただし本論点で load-bearing な主張（**KV / Durable Object が無い → app 層のステートは実質 D1 一択**）は正しく、結論に影響しない。厳密には「KV / Durable Object は無い」と書けば十分で、「〜のみ」は不要な断定。
  - 場所: `.issue/457/investigation.md` §0 / `.issue/457/plan.md`（関連ファイル節）

- **[N-002]** Markdown 構造は健全。runtime doc の TOC に `- [Auth endpoint edge protection](#auth-endpoint-edge-protection)` を追加、見出し `## Auth endpoint edge protection`（h2、他セクションと同階層）に解決する。アンカー切れ無し。investigation のフェンスコードブロック（logIn フロー / verify 経路）は開閉が揃っており破綻無し。見出し階層・トーンとも既存ドキュメントと整合。

- **[N-003]** タイミング側チャネル（未存在 email の scrypt スキップ）をスコープ外に切り出した判断は妥当。レート制御とは別種の列挙耐性論点であり、investigation §7 に具体的なフォローアップ（未存在時にダミー scrypt を走らせ応答時間を平準化、コストとのトレードオフ込み）まで記録しており、スコープ膨張を避けつつ追跡可能にしている。良い切り出し。

- **[N-004]** 閾値 10 req/60s/IP を「初期目安・要チューニング（starting point, not a tuned value）」と明示しているのは誠実で良い。ログインは正当利用でも試行回数が少ない経路なので 10 は緩めだが、チューニング前提が明記されているため問題なし。

- **[N-005]** ADR-002 の per-account lockout 分析（存在オラクル: 429 vs 401 の応答差がアカウント存在を漏らす／self-DoS: victim の email 連打で意図的ロックアウト）はいずれも古典的かつ正確。per-IP はアカウント identity に触れないため現状の `invalid_credentials` 集約（`logIn.ts` で email 形式失敗・wrong password・未存在 email をすべて 401 に集約）を後退させない、という結論も実コードの挙動と整合。

- **[N-006]** testing.md はコード変更ゼロを踏まえ「文書レビューのみ・実行環境不要」と正しく整理し、各確認項目を AC に対応付けている。「差分がドキュメントに限られることを `git diff --name-only` で確認」まで含めており妥当。

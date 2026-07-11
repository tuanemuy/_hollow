# General Review（Round 2）— PR #836 / Issue #457

対象: `.issue/457/investigation.md`, `.issue/457/adr.md`, `.issue/457/testing.md`, `.issue/457/plan.md`（新規）, `docs/runtime_cloudflare.md`（追記）。コード変更ゼロ。

Round 1（W-001 / W-002 / N-001）はすべて反映済み。ゼロベースで再検証した結果、新規 Blocker / Warning は無し。

## 検証サマリ

- **コード事実の照合: 引用はすべて実コードと一致。** 事実誤認ゼロ。
- **受け入れ基準 AC-1〜AC-5: すべて成果物で充足。**
- **判断の論理的妥当性（エッジ第一次・per-IP・app 層追加なし）: 根拠から妥当に導けている。**
- **Markdown: 破綻なし（TOC アンカー解決・コードフェンス開閉一致）。**

### Round 1 指摘の反映確認

- **W-001（WAF Match 粒度 / `_serverFn` 無言失効）: 反映済み。** `docs/runtime_cloudflare.md` の Match 項に「TanStack Start のサーバー関数は build-derived な `_serverFn`（関数 ID）パスに POST され、ファイル移動 / リネームでデプロイ毎に変わりうる。具体パスに pin したルールはエラーも出さず silently stop matching しうる。デプロイ毎に再確認するか、`_serverFn` ベースパス＋POST の粗い backstop で受ける（他の mutation も巻き込むトレードオフ込み）」旨が明記された。提案どおりの含意まで反映。`_serverFn` パスは実在（`csrfMiddleware.test.ts` が `/_serverFn/x` を使用、`__root.tsx` L48 コメントが `_serverFn` ラウンドトリップに言及）。
- **W-002（runtime doc の圧縮した一文が investigation §6 と食い違う）: 反映済み。** 該当文が「without booting the Worker or spending a D1 write for a counter — costs an in-app limiter cannot avoid.（An in-app limiter checking before `verifyPassword` could still skip the scrypt CPU…; the edge's structural edge is that it never pays the Worker invocation or the counter's D1 write at all — see §6.）」に補正され、investigation §6.4-6.5（app 層 limiter も verify 前チェックなら scrypt は節約できる／真の劣後は Worker 起動 + カウンタ D1 write）と粒度が完全に一致。矛盾解消。
- **N-001（wrangler バインディング列挙の緩さ）: 反映済み。** investigation §0 L49 が「D1 / R2 / Queues / ASSETS / Service Binding(RELAY) / Workers AI(AI) はあるが、レート制御に使える永続カウンタ基盤は無い」と全バインディングを列挙。load-bearing な「KV / Durable Object は無い → app 層ステートは実質 D1 一択」は保持され、結論に影響なし。

### コード事実の照合結果（すべて一致）

| ドキュメントの主張 | 実コード | 判定 |
|---|---|---|
| `verifyPassword`：未存在 / soft-deleted / password NULL で scrypt スキップし即 null（L248-250） | `credentialStore.ts` L248 `if (!row) return null` / L249 `deletedAt !== null` / L250 `password === null` → L251 `verifyHash`（scrypt はここで初めて実行） | 一致 |
| `loginFn` は `ipAddress: null` ハードコード（L23）、`userAgent` のみ取得 | `action.ts` L23 `ipAddress: null`、L16 `getRequestHeader("user-agent")` | 一致 |
| `logIn` フロー verify→status→rehash→session、`unverified`/`account_unavailable` は verify 成功後にのみ分岐 | `logIn.ts` L37 verify → L49 status → L79 rehash → L85 issue。`unverified`(L63)/`account_unavailable`(L55,L69) はすべて `verified !== null` 後 | 一致 |
| `HTTP_STATUS_BY_KIND` に 429 / `tooManyRequests` kind 無し | `errorResponse.ts` L107-125：401/403/404/409/422/500/503 のみ、429 無し | 一致 |
| `SerializedError` union は 9 種 | `errorResponse.ts` L37-47 `SERIALIZED_ERROR_KINDS` がちょうど business/notFound/conflict/unauthorized/forbidden/validation/system/secretBox/unknown | 一致 |
| `PromptPreviewRateLimiter` 契約（`tryConsume`→`{allowed, retryAfterSec}`、`INSERT ... ON CONFLICT DO UPDATE setWhere(count<max) RETURNING`、旧 window opportunistic 削除、config 注入） | port / adapter の形状と一致（Round 1 で確認、変更なし） | 一致 |
| `wrangler.toml`/`wrangler.staging.toml` に KV / Durable Object 無し | `kv_namespaces` / `durable_objects` の宣言は両ファイルに存在せず（assets / d1 / r2 / services(RELAY) / queues / ai のみ） | 一致 |
| runtime doc §Auth の一文が investigation §6 と整合 | 補正後の文が §6.4-6.5 の分析粒度と一致 | 一致 |

### 受け入れ基準の充足

- **AC-1**（レイヤー・粒度の判断＋根拠）: 充足。investigation §4 / ADR-001・ADR-002。
- **AC-2**（CF vs app 層の切り分け）: 充足。investigation §2 の切り分け表。
- **AC-3**（列挙耐性との整合）: 充足。investigation §3。per-IP=列挙面ゼロ・per-account lockout=存在オラクル/self-DoS。実コード（`logIn.ts` の `invalid_credentials` 集約）と整合。
- **AC-4**（運用者が適用できる粒度の CF 設定）: 充足。runtime doc §Auth に Match / Counting key / Threshold / Action / Notes。W-001 反映で Match の運用落とし穴も解消。
- **AC-5**（app 層フォールバック設計の具体化＋未実装明示）: 充足。investigation §6、`tooManyRequests` kind の union 波及コストを未実装理由として明記。

## Blockers

なし。

## Warnings

なし。

## Notes

- **[N-001]** ADR-001 Context の「守りたいのは (a) scrypt CPU, (b) 総当たり耐性」は投資調査 §1 の三分類（(a) scrypt CPU / (b) 総当たり / (c) volumetric）から (c) を導入文で省いているが、直後の Decision 理由 1・2 で volumetric を明示的に扱っているため実害なし。厳密には investigation §1 と脅威列挙を揃えると尚良い。任意。
- **[N-002]** Markdown 構造は健全。runtime doc TOC L21 `- [Auth endpoint edge protection](#auth-endpoint-edge-protection)` が h2 見出し `## Auth endpoint edge protection`（L365）に解決（アンカー切れ無し）。W-002 反映で追加された長い一文・括弧付き補足も 1 文として読め、破綻なし。investigation §0 のフェンスコードブロック（logIn フロー / verify 経路）は開閉一致。
- **[N-003]** testing.md はコード変更ゼロを踏まえ「文書レビューのみ・実行環境不要」と整理し、各確認項目を AC に対応付け、差分がドキュメントに限られることを `git diff --name-only` で確認する手順まで含めており妥当。
- **[N-004]** タイミング側チャネル（未存在 email の scrypt スキップ）をスコープ外に切り出し、investigation §7 に具体的フォローアップ（ダミー scrypt で応答時間平準化・コストトレードオフ込み）まで記録した判断は妥当。スコープ膨張を避けつつ追跡可能。
- **[N-005]** 閾値 10 req/60s/IP を「starting point, not a tuned value」と明示しているのは誠実。ログインは正当利用でも試行が少ない経路なので 10 は緩めだが、チューニング前提が明記されているため問題なし（Round 1 と同判断、再掲）。
</content>
</invoke>

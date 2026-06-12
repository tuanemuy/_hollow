# PR #662 Review — Security (Round 3 / ゼロベースフルレビュー)

対象: dev 専用 same-origin R2 プロキシ（`/dev/r2/*`）+ SigV4 presign 検証（fix コミット `147372ad` / `4667a6fd` 込み）。
`r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2Sigv4.ts` / `server.cloudflare.ts` / `docs/runtime_cloudflare.md` を実体精読し、SigV4 検証・期限・誤有効化攻撃面・credential 取扱いをゼロベースで再評価した。

## Round 2 修正の妥当性確認

- **W-001（コミット済みダミー credential = 公開された署名鍵）→ 対応済み・妥当。** `docs/runtime_cloudflare.md:74` に「dev サーバーを localhost 外に公開してはいけない」節が追加され、固定ダミー値が dev プロキシの署名鍵そのものであること、公開時は誰でも presigned URL を鋳造できること、やむを得ず公開する場合は `R2_*` をランダム値に差し替えることが明記された。提案の核心（前提の文書化）は満たされている。提案 (1) の `.dev.vars.example` 側コメントと (2) のプレースホルダ値化は未実施だが、docs が手順書の SSOT であり許容範囲（下記 N-006 参照）。

## Security

### Blockers

なし

### Warnings

- **[W-001]** `X-Amz-SignedHeaders` に不正なヘッダ名が含まれると `headers.get()` が `TypeError` を投げ、未認証リクエストが 403 ではなく未処理例外（500）になる
  - 場所: `app/core/adapters/cloudflare/r2PresignVerify.ts:113-119`（`headers.get(name)`）/ 呼び出し元 `devObjectStorageHandler.ts:90-95`（try/catch なし）
  - 理由: `X-Amz-SignedHeaders` はクエリ由来の未検証文字列で、署名検証より**前**に `headers.get(name)` の引数として使われる。Fetch 仕様により無効なヘッダ名（空文字 `X-Amz-SignedHeaders=`、`%20` を含む名前、`(` 等）では `Headers.get` が `TypeError` を投げることを確認済み（Node で再現）。`split(";")` の結果が `[""]` になる空値ケースも同様。例外は `verifyPresignedRequest` → ハンドラ → エントリまで素通りし 500 になる。署名鍵なしで誘発できる点で Round 1 W-002（`URIError` → 500）と同型の残穴。実害は dev サーバーのエラーノイズ止まりで、本番誤有効化時でも情報漏えい・認可バイパスはない（fail-closed 方向の崩れではなく fail-noisy）。
  - 提案: `signedHeaderNames` を `headers.get` に渡す前に `/^[a-z0-9-]+$/`（小文字化済み token）で検証し、不一致は `{ ok: false, reason: "malformed" }` を返す。または canonical headers ループ全体を try/catch で包み `malformed` に正規化する。signer は常に妥当な名前（`host` / `content-type`）しか発行しないため正規 URL への影響はない。

### Notes

- **[N-001]** SigV4 検証の構造は引き続き健全。必須パラメータの null チェック → 形式検証（`X-Amz-Date` 正規表現 + Invalid Date 拒否、`X-Amz-Expires` strict 10進 + 1〜604800 秒）→ credential scope 完全一致 → 期限 → canonical request 再構築 → 定数時間比較、の順で fail-closed。canonical query は `X-Amz-Signature` 以外の全パラメータを折り込むため後付けパラメータは署名不一致、`host` は `url.host` 由来でホスト差し替え不可、path は raw `url.pathname` を署名対象とし binding 操作のみ decode 済みキーを使う対称性が維持されている。
- **[N-002]** 期限検証: `Date.now() > issuedAt + expiresSec * 1000` の境界（ちょうど期限時刻は有効）はテストで固定済み。`MAX_EXPIRES_SECONDS = 604800` は S3 本家と同等。not-before 検証の見送り（ADR-005）は Round 2 の評価どおり妥当 — 未来日付 URL を鋳造できるのは鍵保持者のみで脅威の増分がない。
- **[N-003]** 誤有効化攻撃面: エントリゲートは `R2_DEV_OBJECT_PROXY === "true"` の厳密比較、binding / presign config 欠落時は 404 へ fail-closed。`wrangler.staging.toml` / `wrangler.production.toml` に当該 env の追加なし。本番で誤って有効化されても、(a) 全リクエストに有効 SigV4 署名が必要（鍵は SOPS 管理の実 credential であり非公開）、(b) GET は `nosniff` + デフォルト `attachment` で user-uploaded HTML/SVG の same-origin レンダリング不可、の二段で守られている。前提（鍵の秘匿）が崩れる dev ダミー値のケースは docs で文書化済み（Round 2 W-001 対応）。
- **[N-004]** credential 取扱い: `R2PresignConfig`（secret 含む）は DI → エントリ → ハンドラ → verifier の引数渡しに閉じ、ログ出力・レスポンス・エラーメッセージへの漏出経路なし。403 ボディの `reason` 文字列は S3 本家のエラーコード粒度と同等で情報漏えいにあたらない。`constantTimeEqualHex` は長さチェック（期待値は常に 64 hex 固定長なので early return は無害）+ XOR 累積で適切。
- **[N-005]** 検証側 canonical query の decode → 再 encode により `+` / `%20` 等の同値別表現が同一署名で通る点（Round 2 N-002）は仕様として維持。値自体は署名に拘束されており悪用不可。
- **[N-006]** Round 2 W-001 の提案 (1)(2)（`.dev.vars.example` のコメント追記・プレースホルダ値化）は未実施。docs の警告で実質カバーされているが、`.dev.vars.example` だけを見て値を流用する開発者は docs の警告に到達しない可能性がある。example のコメントに docs 該当節への一行ポインタ（「これらの値は dev プロキシの署名鍵を兼ねる。公開時の注意は docs/runtime_cloudflare.md を参照」）を足すとより堅い（任意）。
- **[N-007]** PUT/GET のボディ全量バッファ（Round 2 N-007）と GET の `Cache-Control` 不在（Round 2 N-006）の評価を維持。いずれも到達に有効署名が必要で dev 用途では許容。

## 結論

Blocker なし。Round 2 W-001 は docs への明記で妥当に対応されている。新規指摘は W-001（不正な `X-Amz-SignedHeaders` ヘッダ名による未認証 500）のみで、Round 1 W-002 と同型の例外正規化漏れ — 認可バイパスではなく dev 専用のエラーノイズであり、マージブロックではないが安価に塞げるため対応を推奨する。

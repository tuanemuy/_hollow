# PR #662 Review — Security (Round 2 / ゼロベースフルレビュー)

対象: dev 専用 same-origin R2 プロキシ（`/dev/r2/*`）+ SigV4 presign 検証。
Round 1 指摘の修正確認と、ゼロベースでの再レビューを実施した。

## Round 1 修正の妥当性確認

- **W-001（GET がアプリオリジンで配信）→ 修正済み・妥当。** `devObjectStorageHandler.ts:121-126` で `X-Content-Type-Options: nosniff` を常時付与し、`response-content-disposition`（署名済みクエリ）が無い場合は `Content-Disposition: attachment` をデフォルト化。`attachment` はサブリソース読み込み（`<img>` 等）に影響しないため dev プレビューも壊さない。presign 側の `buildAttachmentDisposition` は常に `attachment` を発行するため、署名済み disposition 経由で inline を注入する経路も存在しない。
- **W-002（不正 percent-encoding で URIError → 500）→ 修正済み・妥当。** `devObjectStorageHandler.ts:72-80` で `decodeURIComponent` を try/catch で包み 404 に正規化。
- **W-003（期限検証の defense-in-depth）→ 概ね修正済み・妥当。** `r2PresignVerify.ts:89-92` で Invalid Date（実在しない暦日）を `malformed` で拒否、`:76-83` で `X-Amz-Expires` を strict 10進パース + 上限 604800 秒（S3 同等）で拒否。not-before（未来 `X-Amz-Date`）の見送り（ADR-005）は妥当 — 未来日付の URL を鋳造できるのは署名鍵保持者のみで、同じ鍵保持者は任意に再 presign できるため脅威の増分がなく、クロックスキュー誤判定のコストの方が大きい。

## Security

### Blockers

なし

### Warnings

- **[W-001]** `.dev.vars.example` のダミー credential は「公開された署名鍵」であり、dev プロキシ上では機能する認証情報になる
  - 場所: `.dev.vars.example:139-141`（`R2_ACCOUNT_ID="local-dev-account"` 等の固定値）/ `.issue/657/adr.md` ADR-003
  - 理由: Round 1 N-005 は「ダミー値は実 R2 に対して無効なので漏れても安全」と評価したが、逆方向の評価が抜けている。dev プロキシでは **この値自体が sign/verify の鍵** であり、リポジトリにコミットされた既知の値である以上、世界中の誰でも有効な presigned URL を鋳造できる。`wrangler dev` がデフォルトの localhost バインドである限り実害はないが、`--ip 0.0.0.0` での LAN 公開や cloudflared トンネル経由のデモ共有をした瞬間、ローカルバケットの全 read/write が事実上無認証で開く（SigV4 検証は形式上通るが鍵が公開なので安全性を提供しない）。ADR-002/ADR-004 が「署名検証があるから誤公開でも安全」と読める書き方になっており、この前提（鍵が秘密であること）の崩れが文書化されていない。
  - 提案: (1) `.dev.vars.example` のコメントに「これらの値は dev プロキシの署名鍵を兼ねる。dev サーバーを localhost 外へ公開する場合は各自ランダム値に差し替えること」を明記する。(2) 可能なら example の値を「プレースホルダであること」が明確な文字列（例: `replace-with-random-value`）にし、`docs/runtime_cloudflare.md` のローカルプロキシ節にも同様の注意を一文入れる。コード変更は不要。

### Notes

- **[N-001]** SigV4 検証の網羅性は引き続き良好。canonical query は `X-Amz-Signature` を除く全パラメータを折り込み（whitelist バイパス不可、`X-Amz-Signature` の重複付与も canonical から全て除外されるため無害）、canonical headers は署名済み `X-Amz-SignedHeaders`（それ自体が署名対象クエリ）に従い実リクエストから取得、`host` は `url.host` 由来でホスト差し替えを拒否、path は raw pathname を署名対象とするため別エンコーディングは fail-closed。PUT presign は `content-type` を signed headers に含む（`r2ObjectStorage.ts:200-203`）ため、Content-Type 差し替えも署名不一致で落ち、`bucket.put` に渡る contentType（`devObjectStorageHandler.ts:101-102`）は検証済みの値になる。
- **[N-002]** 検証側の canonical query 再構築は「decode → 再 encode」のため、`+` と `%20` のような**同値別表現**の URL は同一署名で通る。値そのものは署名に拘束されており改竄にはならないので悪用不可。仕様としては「エンコーディングの正規化を許す」挙動であることだけ記録しておく。
- **[N-003]** 定数時間比較（`constantTimeEqualHex`）は固定 64 文字長チェック + XOR 累積で適切。大文字 hex の正規署名は不一致（fail-closed）になるが、signer は常に小文字を発行するため機能上問題なし。`X-Amz-Credential` の `!==` 比較は URL に平文で載る公開情報の比較であり、タイミング面の懸念なし。
- **[N-004]** ハンドラの処理順序: bucket 照合(404) → メソッド制限(405) → 署名検証(403) → ボディ/ストレージ操作。署名検証前に触れる未検証入力は文字列操作のみ（decode は try/catch 済み）で、ボディのバッファは検証後のみ。403 ボディの `reason` 文字列（malformed/expired/signature_mismatch）は S3 自身のエラーコード粒度と同等で情報漏洩にはあたらない。
- **[N-005]** エントリ側ゲート（`server.cloudflare.ts:81-97`）: `R2_DEV_OBJECT_PROXY === "true"` の厳密比較、binding/presign config 欠落時は 404 へ fail-closed、`wrangler.staging.toml` / `wrangler.production.toml` に当該 env の追加なしを確認。presign config（secret 含む）はハンドラ内に閉じておりログ・レスポンスへの漏出なし。
- **[N-006]** GET レスポンスに `Cache-Control` がない。署名がクエリに含まれるためキャッシュキーは URL 単位で分離され、有効 URL 保持者以外がキャッシュから取り出すことはできないが、本番誤有効化時の共有キャッシュ滞留を避ける意味で `Cache-Control: private, no-store` を付けておくとより堅い（任意）。
- **[N-007]** PUT/GET ともボディを全量バッファするが、到達には有効署名が必要で、dev 用途では Workers のメモリ上限が実質キャップ。Round 1 N-006 の評価を維持。

# PR #662 レビュー — Round 4（Adapter / Infrastructure）

レビュー観点: Infrastructure / Adapter 層（SigV4 署名生成・検証の整合、R2 binding 操作、レイヤー配置・依存方向、DI 配線、wrangler 設定、受け入れ基準充足）。ゼロベースのフルレビュー。

検証実施内容:
- PR ブランチ実体（HEAD = `fc28df2c`、Round 3 指摘対応込み）で `r2Sigv4.ts` / `r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2ObjectStorage.ts` / `serverCloudflare.ts`（DI）/ `server.cloudflare.ts`（エントリ）/ `wrangler.toml` / `.dev.vars.example` を精読
- 署名生成（`presign()`）と検証（`verifyPresignedRequest`）の canonical form を手動で突き合わせ: raw pathname（エンドポイントのパスプレフィックス保持込み）、`X-Amz-Signature` 除外の全クエリ decode→`encodeRfc3986` 再エンコード→sort、SignedHeaders（host は URL から、その他は実リクエストヘッダから）、`UNSIGNED_PAYLOAD` — 乖離なし
- 新規・変更4テストファイルを実行 → **162 件全 PASS**（Round 3 時点の 159 件 + SignedHeaders 不正トークン拒否 3 件）

## Round 3 指摘の修正確認

- **[SignedHeaders 不正ヘッダ名 → malformed 正規化]（fc28df2c）修正済み・妥当。** `r2PresignVerify.ts` L110-118 で `X-Amz-SignedHeaders` の各名前を `/^[a-z0-9-]+$/` で検証し、非トークン名（空文字・空白・`(` 等）は `Headers.get()` が `TypeError` を投げる前に `malformed` で 403 に正規化される。signer は常に小文字トークン（`host` / `content-type`）しか発行しないため正規 URL への影響はゼロ。`r2PresignVerify.test.ts` L290-301 にパラメタライズドテストで固定済み。

## Adapter

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 受け入れ基準の最終確認（ゼロベース再検証）:
  - AC-1/AC-2: `presign()` のエンドポイント・パスプレフィックス保持（`r2ObjectStorage.ts` L187-194）+ dev プロキシが同一 SigV4 検証の上で同一 miniflare `OBJECT_STORAGE` binding に終端、で構造的に充足。手動 E2E（TC-1: same-origin PUT 200・リモート R2 へのリクエスト 0 件・finalize 200）の記録とも一致。
  - AC-4: verify の 4 拒否理由（malformed / credential_mismatch / expired / signature_mismatch）+ ハンドラの一律 403、Expires 7 日上限・Invalid Date 拒否・非 decimal 拒否・定数時間比較までユニットテストで固定。
  - AC-5: (a) デフォルトエンドポイント出力のゴールデン byte-identical テスト、(b) DI は `R2_S3_ENDPOINT` 未設定時に `endpoint` キー自体を spread しない（`serverCloudflare.ts` L371、`exactOptionalPropertyTypes` 整合）、(c) 新規 env 2 件は LOCAL DEV ONLY の `wrangler.toml [vars]` のみ（staging/production への追加禁止コメント付き）で充足。
- **[N-002]** レイヤー配置・依存方向: ハンドラと verify は `app/core/adapters/cloudflare/` に置かれ、エントリ（`server.cloudflare.ts`）から直接 import（`InlineRelayTrigger` の前例どおり）。presentation → adapters 依存は発生していない。`/dev/r2/` 分岐は `storage.run` 内・sitemap インターセプト前で、純関数ゲート `resolveDevObjectStorageGate` により flag 厳密一致（`"true"` のみ）+ binding/config 不揃いは 404 に機械的に分岐する。
- **[N-003]** ゲートの再ナローイング（`devProxyGate === "handle" && objectStorageBucket && r2PresignConfig`）は TypeScript 制約上の重複であり挙動分岐ではない（`hasBucket`/`hasPresignConfig` がゲート入力なので "handle" 時に両者は必ず定義済み）。問題なし。
- **[N-004]** dev プロキシの raw-pathname 検証 / decoded-key 格納の非対称は JSDoc で仕様化され、percent-decode が必要なキーの store-and-serve ラウンドトリップテストで両方向固定済み。`%zz` 等の不正エンコードは URIError を 404 に正規化。
- **[N-005]** dev プロキシ内の `bucket.put`/`bucket.get`/`request.arrayBuffer()` の例外非捕捉（素の 500）は、アプリケーション層を経由しない dev 専用終端であり `ObjectStorage` ポートのエラー契約の適用対象外で妥当（Round 3 N-002 の判断を再確認、変更なし）。
- **[N-006]** `wrangler.toml` の `[env.relay]` / `[env.consumer]` に新 env 2 件は複製されていないが、worker 系に presign 利用はないため不要で正しい。`.dev.vars.example` の R2 ダミー値化は `r2PresignReady` の truthy 全揃い判定（空文字 → unavailable アダプター降格）と整合し、キー集合も `infra/src/secrets.ts` 同期前提を壊していない（キー追加なし、`R2_S3_ENDPOINT`/`R2_DEV_OBJECT_PROXY` は `[vars]` 行きで ADR-006 と整合）。

## 結論

Blocker・Warning なし。Round 3 の指摘（SignedHeaders 不正トークンの malformed 正規化）は修正済みかつテストで固定されている。署名生成/検証の整合・staging/production 不変・レイヤー配置・DI 配線・wrangler 設定はコード精読とテスト 162 件 PASS で裏付けられており、Adapter / Infrastructure 観点で本 PR はマージ可能。

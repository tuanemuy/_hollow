# PR #662 Review — Security (Round 4 / ゼロベースフルレビュー)

対象: dev 専用 same-origin R2 プロキシ（`/dev/r2/*`）+ SigV4 presign 検証。
`r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2Sigv4.ts` / `r2ObjectStorage.ts` / `app/server.cloudflare.ts` / `wrangler.toml` / `docs/runtime_cloudflare.md` / 関連テストを実体精読し、SigV4 検証・期限・誤有効化攻撃面・credential 取扱いをゼロベースで再評価した。

## Round 3 修正の妥当性確認

- **W-001（不正な `X-Amz-SignedHeaders` ヘッダ名 → `Headers.get()` の `TypeError` → 未認証 500）→ 対応済み・妥当。** `r2PresignVerify.ts:112-118` で、署名検証より前に各 `signedHeaderNames` を `/^[a-z0-9-]+$/` で検証し、不一致（空文字含む）は `{ ok: false, reason: "malformed" }` に正規化されている。`split(";")` が `[""]` になる空値ケースもこの正規表現で拒否される。signer（`r2ObjectStorage.ts:196-206`）が発行するのは `host` / `content-type` のみなので正規 URL への影響はない。テスト（`r2PresignVerify.test.ts:292-303`：空値・空白含み・記号含みの 3 ケース）も追加されており、回帰は固定済み。

## Security

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** SigV4 検証の構造は健全。必須パラメータの null チェック → `X-Amz-Date` 形式 + Invalid Date 拒否 → `X-Amz-Expires` strict 10進（`1e3` 等を排除）+ 1〜604800 秒上限 → credential scope 完全一致 → 期限（`Date.now() > issuedAt + expiresSec * 1000`、境界はテスト固定） → SignedHeaders token 検証 → canonical request 再構築 → 定数時間署名比較、の順で全経路 fail-closed。canonical query は `X-Amz-Signature` 以外の**全**クエリパラメータを折り込むため、`response-content-disposition` を含め後付け・改ざんパラメータはすべて署名不一致になる。`host` は `url.host` 由来でホスト差し替え不可。
- **[N-002]** path の取扱いの対称性は維持されている。署名検証は raw `url.pathname`（URL パーサが dot-segment を正規化した後の形）に対して行い、binding 操作のみ segment 単位で `decodeURIComponent` した key を使う。`%zz` 等の不正エンコードは `URIError` を catch して 404 に正規化（`devObjectStorageHandler.ts:70-80`）。`..` によるトラバーサルは、正規化後の pathname がそのまま署名対象になるため、鍵保持者以外は有効な署名を提示できず成立しない。
- **[N-003]** 誤有効化攻撃面: エントリゲートは `R2_DEV_OBJECT_PROXY === "true"` の厳密比較（`"TRUE"` 等は無効側に倒れる）、binding / presign config 欠落時は 404 へ fail-closed、メソッドは PUT/GET のみ（他は 405）。当該 env は LOCAL DEV ONLY の `wrangler.toml [vars]` にのみ存在し、デプロイ用の per-stage `wrangler.<stage>.toml` には追加されていない（docs にも追加禁止を明記）。仮に本番で誤有効化されても (a) 全リクエストに SOPS 管理の実 credential による有効 SigV4 署名が必要、(b) GET は `nosniff` + デフォルト `attachment`（`response-content-disposition` 上書きは署名済みパラメータのみ）で user-uploaded HTML/SVG の same-origin レンダリング不可、の二段防御。
- **[N-004]** credential 取扱い: `R2PresignConfig`（secret 含む）は DI → エントリ → ハンドラ → verifier の引数渡しに閉じ、ログ・レスポンス・エラーメッセージへの漏出経路なし。403 ボディの `reason`（malformed / credential_mismatch / expired / signature_mismatch）は S3 本家のエラーコード粒度と同等で情報漏えいにあたらない。credential scope の `!==` 比較は非定数時間だが、access key id は presigned URL に平文で載る公開情報であり問題ない。`constantTimeEqualHex` は長さチェック + XOR 累積で適切（期待値は常に 64 hex 固定長）。
- **[N-005]** コミット済みダミー credential（`.dev.vars.example` の `local-dev-account` 等）= 公開された署名鍵という前提は `docs/runtime_cloudflare.md` の「dev サーバーを localhost 外に公開してはいけない」節で明示済み（Round 2 W-001 対応の維持を確認）。`.dev.vars.example` 側のコメントは「ダミー値で動く理由」までで、公開禁止の警告自体は docs 側にのみある — example だけ読む開発者向けに docs 該当節への一行ポインタがあるとなお堅い（任意、Round 3 N-006 の維持）。
- **[N-006]** 期限まわりの設計判断の維持を確認: `MAX_EXPIRES_SECONDS = 604800` は S3 本家と同等、not-before 検証の見送り（未来日付 URL を鋳造できるのは鍵保持者のみ）は妥当。presigned URL の TTL 内リプレイ可能性は presigned URL セマンティクスそのものであり本 PR の増分リスクではない。
- **[N-007]** PUT/GET のボディ全量バッファ（workerd の `R2Bucket.put` 制約による）と GET レスポンスの `Cache-Control` 不在は dev 用途で許容（到達には有効署名が必要）。重複クエリパラメータ（`X-Amz-Signature` 二重付与等）も canonical query が全エントリを折り込むため悪用不可。

## 結論

Blocker・Warning ともになし。Round 3 W-001 は regex 検証 + テストで妥当に修正されており、SigV4 検証・期限・誤有効化防御・credential 取扱いのいずれにも新規の問題は見つからなかった。残るのは任意改善の Note のみで、セキュリティ観点ではマージ可能。

# PR #662 レビュー — Round 3（Adapter / Infrastructure）

レビュー観点: Infrastructure / Adapter 層（SigV4 署名生成・検証の整合、R2 binding 操作、レイヤー配置・依存方向、DI 配線、wrangler 設定、受け入れ基準充足）。ゼロベースのフルレビュー。

検証実施内容:
- `gh pr diff 662` 全差分と PR ブランチ実体（`r2Sigv4.ts` / `r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2ObjectStorage.ts` / `serverCloudflare.ts`（DI）/ `server.cloudflare.ts`（エントリ）/ `wrangler.toml` / `.dev.vars.example` / `docs/runtime_cloudflare.md`）を精読
- 署名生成と検証の canonical form（raw pathname、query 再構築の decode→re-encode→sort、SignedHeaders、host 導出、`response-content-disposition` の署名包含）を手動で突き合わせ — 乖離なし
- 新規・変更4テストファイル（`r2PresignVerify.test.ts` / `devObjectStorageHandler.test.ts` / `r2ObjectStorage.test.ts` / `serverCloudflare.test.ts`）を実行 → **159 件全 PASS**（Round 2 時点の 158 件 + GET store-and-serve ラウンドトリップ 1 件）

## Round 2 指摘の修正確認

- **[security W-001] 修正済み・妥当。** `docs/runtime_cloudflare.md` に「dev サーバーを localhost 外に公開してはいけない」節が追加され、コミット済み固定ダミー credential が「公開された署名鍵」に等しいこと、`--ip 0.0.0.0` / トンネル共有の禁止、やむを得ず公開する場合の `R2_*` ランダム値差し替えまで具体的に記載されている。
- **[test W-001] 修正済み・妥当。** `devObjectStorageHandler.test.ts` に percent-decode が必要なキーでの store-and-serve ラウンドトリップテスト（presigned PUT → presigned GET でボディ・content-type が復元される）が追加され、raw-pathname 検証 / decoded-key 格納の対称性が両方向で固定された。

## Adapter

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 受け入れ基準の最終確認: AC-1/AC-2 は signer（`presign()` のパスプレフィックス保持）と dev プロキシ（同一 SigV4 検証 → 同一 miniflare `OBJECT_STORAGE` binding 終端）で構造的に充足。AC-4 は verify 拒否（malformed / credential_mismatch / expired / signature_mismatch）+ ハンドラ 403 のユニットテストで充足。AC-5 は (a) デフォルトエンドポイント出力のゴールデン byte-identical テスト、(b) DI の `R2_S3_ENDPOINT` 条件付き spread（unset 時はキー不在をテストで固定）、(c) 新規 env 2 件が LOCAL DEV ONLY の `wrangler.toml [vars]` のみに追加（staging / production への追加禁止コメント付き）で充足。なお `wrangler.staging.toml` / `wrangler.production.toml` はリポジトリに存在しないファイルであり（PR 前から不在）、「追加しない」条件は自明に成立している。
- **[N-002]** dev プロキシ内の `bucket.put` / `bucket.get` / `request.arrayBuffer()` の例外は捕捉せずエントリまで伝播し、workerd の素の 500 になる。本ルートはアプリケーション層を経由しない dev 専用終端であり、`ObjectStorage` ポートのエラー契約（`StorageUnavailableError` 等への翻訳）の適用対象外なので、このままで妥当。CLAUDE.md の「broad catch は境界のみ」方針とも整合（ここで catch を増やす必要はない）。
- **[N-003]** `constantTimeEqualHex` は小文字 hex 同士の比較前提だが、signer は常に小文字 hex を発行し、大文字に変えた署名は単に不一致で 403 になるだけなので正規化不要。`X-Amz-Signature` 自体は canonical query から除外されるため、casing 操作で検証を迂回する経路もない。
- **[N-004]** エントリの dev プロキシ分岐は `resolveDevObjectStorageGate`（純関数）の戻り値で機械的に分かれ、`handle` 時の `objectStorageBucket && r2PresignConfig` の再ナローイングは TypeScript の制約上の重複であって挙動の分岐ではない。sitemap インターセプトより前段だが `/dev/r2/` はルート・アセットと競合しない。adapters 層配置・エントリからの直接 import は `InlineRelayTrigger` の前例どおりで presentation → adapters 依存は発生していない。
- **[N-005]** verifier は `Headers.get()` の値を `trim()` して canonical headers を組むが、SigV4 仕様の連続空白圧縮は実装していない。signer / verifier が同一ペアで完結する閉じた系（外部 S3 実装との相互運用なし）なので内部整合のみで十分であり、問題なし。

## 結論

Blocker・Warning なし。Round 2 の指摘 2 件（security W-001 / test W-001）はいずれも修正済みで妥当。署名生成/検証の整合・staging/production 不変・レイヤー配置・DI 配線はコード・テスト（159 件 PASS）・手動 E2E 記録（TC-1〜TC-5）で裏付けられている。Adapter / Infrastructure 観点で本 PR はマージ可能。

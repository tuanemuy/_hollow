# 実装計画 — Issue #657: ローカル検証環境で presigned アップロードフローを E2E 完走できるようにする（R2 CORS / presign-finalize ストア不一致）

**Issue:** #657
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ローカル検証環境（`pnpm build && pnpm start` = wrangler dev）で、MediaUploader の presigned アップロードフロー（presign → ブラウザ PUT → finalize → 表示）を E2E 完走できる構成を整備する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ローカル環境で presign が返す URL に対し、ブラウザ XHR の PUT が CORS preflight に阻まれず成功する（same-origin 化により preflight 自体が発生しない） | Issue 問題点1 | 1, 2, 3, 4, 5, 6 |
| AC-2 | presign の PUT 先と finalize の `stat`（head）が同一ストア（ローカル miniflare の `OBJECT_STORAGE` binding）を参照し、PUT 成功後の finalize が 200 で完了する | Issue 問題点2 | 2, 3, 4, 5, 6 |
| AC-3 | アップロード後の表示経路（`/media/<id>` → presigned GET への 302）もローカルで完走する（presigned GET がローカルストアから配信される） | フロー完走の含意（`view.ts` / `$mediaId.tsx` は presignDownload に依存） | 3, 4, 5, 6 |
| AC-4 | 不正な署名・期限切れの presigned URL は dev プロキシで 403 になる（presigned URL のセマンティクスをローカルでも維持）。充足判定はステップ2・3 のユニットテスト（verify 拒否ケース + ハンドラ 403）の PASS をもって行い、手動 E2E には含めない | フロー完走の「正しい」検証のため | 2, 3 |
| AC-5 | staging / production の挙動は不変（新規 env が未設定なら従来どおりリモート R2 の S3 エンドポイントに presign し、dev プロキシルートは無効）。充足判定はステップ4 の DI テスト（env 未設定時に従来構成）+ ステップ5 の byte-identical テストの PASS、および `wrangler.staging.toml` / `wrangler.production.toml` に新規 env を追加しないことのレビュー確認をもって行う（ステップ7 は周知目的のドキュメント化であり検証手段ではない） | 検証環境構成の変更であり本番影響ゼロが前提 | 4, 5, 7 |
| AC-6 | 整備後、`.issue/655/testing.md` の確認項目1（determinate 進捗バーの E2E）を再実行して PASS する | Issue「やること」 | 8 |

## スコープ

### 対象とする検証環境

本 Issue の要件である `pnpm build && pnpm start`（wrangler dev, `http://localhost:8787`）での E2E 完走を対象とする。`pnpm dev`（vite dev, `http://localhost:3000`）はアプリのオリジンが presign 先（:8787）と異なるため same-origin 化が成立せず、**本 Issue の対象外**（下記「含まれないもの」参照）。

### 含まれないもの
- `pnpm dev`（vite dev, :3000）での presigned フロー完走 — `R2_S3_ENDPOINT` を `wrangler.toml [vars]` の固定 URL（:8787）で与える本方式では、:3000 のアプリから見て cross-origin になり前提が崩れる。Issue の検証環境は `pnpm build && pnpm start` であり要件外。将来必要になればリクエストオリジンから endpoint を動的導出する方式（per-request thread）への拡張で対応可能だが、本 Issue では行わない。
- リモート R2 バケット（`hollow-local-objects`）への CORS ルール設定 — dev クレデンシャルに PutBucketCors 権限がなく開発者側で実施不可（Issue 本文）。ADR-001 で代替案として棄却。
- `experimental_remote`（remote bindings）への移行 — ローカル開発がリモートバケットを汚染する上、CORS 問題は残る。ADR-001 で棄却。
- MediaUploader / ProgressBar 等 #655 実装側の変更 — 実装不具合ではないことが検証済み。
- temp files（`TEMP_FILES`）バケットの presign — そもそも presign 経路がない（binding データプレーンのみ）。
- `.issue/655/testing.md` 確認項目2・3 の再実行 — TC-2 / TC-3 は既に PASS 済み。回帰がないことは、フロントエンド（MediaUploader / ProgressBar）に変更がないことに加え、ステップ5 の「デフォルトエンドポイント出力 byte-identical テスト」とステップ4 の DI テスト（env 未設定時に従来構成）で機械的に担保する。

## 調査結果

- 関連ファイル:
  - `app/core/adapters/cloudflare/r2ObjectStorage.ts` — `ObjectStorage` ポートの R2 実装。データプレーン（put/get/stat/delete）は Worker binding、presign は S3 互換エンドポイントへの SigV4 クエリ署名を自前実装。`R2PresignConfig.endpoint` というオーバーライド項目が既にあるが、**現状 DI から渡す経路がない**。さらに `presign()` 内で `url.pathname = /<bucket>/<key>` と上書きするため、パス付きエンドポイント（例 `http://localhost:8787/dev/r2`）を渡してもパスプレフィックスが落ちる。
  - `app/core/application/di/serverCloudflare.ts` — `readRequestServerConfig` が `OBJECT_STORAGE` binding + `R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_OBJECT_BUCKET_NAME` の全揃いで `R2ObjectStorage` を wire。endpoint オーバーライド用の env は未定義。
  - `app/core/application/media/finalizeUpload.ts` — `container.objectStorage.stat(storageKey)`（= binding の head）で着地確認。presign 先と binding のストアが一致していれば問題なし。
  - `app/core/application/media/view.ts` / `app/routes/media/$mediaId.tsx` — 表示は `/media/<id>` → presignDownload URL への 302。presign 先がローカルに向けば GET も同経路で完結する。
  - `app/server.cloudflare.ts` — fetch エントリ。`/sitemap.xml` を defaultEntry 前にインターセプトする前例あり（presentation 層の `sitemapHandler` に委譲）。dev プロキシルートも同じインターセプトパターンで差し込めるが、委譲先は adapters 層に置く（後述。エントリが adapters を直接 import する前例として `InlineRelayTrigger` がある）。
  - `wrangler.toml` — LOCAL DEV ONLY と明記されたローカル専用設定。`[vars]` に `R2_OBJECT_BUCKET_NAME = "hollow-local-objects"`、`[[r2_buckets]]` で `OBJECT_STORAGE` をローカル miniflare に bind。
  - `.dev.vars` / `.dev.vars.example` — `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` をローカル secrets として供給（現状リモート R2 の実クレデンシャル前提）。
  - `.issue/655/manual-test/results/summary.md` / `TC-1.md` — 環境ブロックの一次記録。curl PUT 200（URL 有効）・preflight 403・finalize は binding 参照、を確認済み。
  - `docs/runtime_cloudflare.md` — R2 presign クレデンシャルの運用ガイド（更新対象）。
- あるべきアーキテクチャ: ヘキサゴナル。ドメイン/アプリケーションは `ObjectStorage` ポート越しにストレージを見るだけで、presign の実体（どのホストに署名するか）はアダプター構成の関心事。dev プロキシは `R2Bucket` binding と SigV4 検証という provider 固有の関心事を扱うため adapters 層（`app/core/adapters/cloudflare/`）の責務であり、presentation 層には置かない（presentation → adapters の直接依存はレイヤー違反）。エントリポイントが adapters を直接 import して配線するのは `InlineRelayTrigger` の前例どおりで、「ランタイム差し替えはエントリ + DI 配線で吸収する」方針（CLAUDE.md「Reference runtime」）とも一致。
- 既存実装の状態: アダプターに `endpoint` オーバーライドの受け口が既にあり、設計意図（エンドポイントは構成可能）と整合。乖離は (a) DI がそれを配線していない、(b) `presign()` がエンドポイントのパスを保持しない、(c) ローカルに presigned PUT/GET を受ける口がない、の3点。本 Issue でこの3点を埋める。
- 依存関係: media アップロード（MediaUploader）、media 表示（`/media/<id>`）、export ダウンロード（`downloadExportArtifact` → presignDownload）が presign 経路を共有。すべて同じ endpoint オーバーライドで一括してローカル完結する。

## 設計

方針（ADR-001）: **presign をローカル（same-origin の dev プロキシルート）に向ける。** アプリ自身が `R2_S3_ENDPOINT`（汎用エンドポイントオーバーライド）で `http://localhost:8787/dev/r2` に presign し、dev 専用ルート（`R2_DEV_OBJECT_PROXY = "true"` のときのみ有効）が SigV4 署名を検証した上でローカル miniflare の `OBJECT_STORAGE` binding に読み書きする。same-origin なので CORS preflight は発生せず（AC-1）、PUT 先と finalize の head が同一 binding になる（AC-2）。

### ドメインモデルへの影響
なし。`ObjectStorage` ポートのシグネチャ・セマンティクスは不変（presign URL の宛先ホストはポート契約の外側）。

### ユースケース / アプリケーションロジック
ユースケース変更なし。DI（`serverCloudflare.ts`）に optional env `R2_S3_ENDPOINT` / `R2_DEV_OBJECT_PROXY` を追加し、前者を `r2PresignConfig.endpoint` に thread するのみ。

### アダプター / 永続化 / 外部連携
- `R2ObjectStorage.presign()` をエンドポイントのパスプレフィックス保持に修正（`url.pathname = joinPath(endpointBasePath, bucket, encodeKey(key))`）。canonical request はこの最終 pathname を署名するので、署名整合は自動的に保たれる。デフォルトエンドポイント（パスなし）では従来と同一の URL になる（AC-5）。
- SigV4 プリミティブ（`encodeRfc3986` / `encodeKey` / `sha256Hex` / `hmac*` / `deriveSigningKey` / `toAmzDate`）を `r2Sigv4.ts` に抽出し、presign（既存）と verify（新規）で共有する。
- 新規 `verifyPresignedRequest`（`app/core/adapters/cloudflare/r2PresignVerify.ts`）: canonical query は **`X-Amz-Signature` を除く全クエリパラメータ**（`X-Amz-Algorithm` を含む）から、presign と同一の構築規則（デコード後に共有プリミティブ `encodeRfc3986` でキー・値を再エンコードし、エンコード済み `k=v` 文字列を sort して join — `URLSearchParams` の正規化差（`+`/`%20` 等）を踏まないため）で再構築する。これと署名対象ヘッダから canonical request を組み、同一クレデンシャルで署名を再計算して比較。全クエリを取り込むため、ホワイトリスト外の後付けパラメータは自動的に署名不一致で落ちる。期限（`X-Amz-Date + X-Amz-Expires`）と HTTP メソッドも検証。

### UI / プレゼンテーション
- presentation 層への追加なし。dev プロキシハンドラは adapters 層（次項）に置き、エントリポイントから直接配線する。
- 新規 `app/core/adapters/cloudflare/devObjectStorageHandler.ts`（インターセプトの形は `sitemapHandler` と同型だが、`R2Bucket` / SigV4 検証という provider 固有の関心事を扱うため adapters 層に配置。エントリが adapters を直接 import する前例は `InlineRelayTrigger`）:
  - `PUT /dev/r2/<bucket>/<key...>` — 署名検証 OK なら `bucket.put(key, body, { httpMetadata: { contentType } })`（content-type は署名済みヘッダと一致必須）→ 200。検証 NG / 期限切れ → 403。bucket 名不一致 → 404。
  - `GET /dev/r2/<bucket>/<key...>` — 署名検証 OK なら `bucket.get(key)` を content-type（+ 署名済み `response-content-disposition` があれば反映）付きで返す。オブジェクト無し → 404。
- `app/server.cloudflare.ts` の fetch で、`env.R2_DEV_OBJECT_PROXY === "true"` かつパスが `/dev/r2/` 配下のときのみハンドラへ委譲（インターセプト位置は sitemap と同じ、import 元は adapters）。フラグ未設定（staging/production）ではコードパスに入らない（AC-5）。
- フロントエンドコンポーネント変更なし。

### 構成・ドキュメント
- `wrangler.toml [vars]`（LOCAL DEV ONLY ファイル）に `R2_S3_ENDPOINT = "http://localhost:8787/dev/r2"` と `R2_DEV_OBJECT_PROXY = "true"` を追加。`wrangler.staging.toml` / `wrangler.production.toml` には追加しない。
- `.dev.vars.example` のコメント更新: ローカルプロキシ利用時は `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` はダミー値で足りる（presign と verify が同じ値を使うため整合すればよい）旨を明記。
- `docs/runtime_cloudflare.md`（と必要なら `docs/test.md`）にローカル presign プロキシの節を追記。

## 実装ステップ

### 1. SigV4 プリミティブの抽出

- **対象ファイル:** `app/core/adapters/cloudflare/r2Sigv4.ts`（新規）、`app/core/adapters/cloudflare/r2ObjectStorage.ts`
- **変更内容:** `toAmzDate` / `encodeRfc3986` / `encodeKey` / `sha256Hex` / `hmacSha256` / `hmacHex` / `deriveSigningKey` / 定数（`R2_REGION` / `S3_SERVICE` / `UNSIGNED_PAYLOAD`）を新モジュールに移し、`r2ObjectStorage.ts` はそこから import する。`buildAttachmentDisposition` の export 位置は据え置き（既存テスト互換）。
- **理由:** 署名生成と署名検証で同一プリミティブを共有し、実装の二重化（=検証ずれ）を防ぐ。

### 2. presigned URL 検証ヘルパーの追加

- **対象ファイル:** `app/core/adapters/cloudflare/r2PresignVerify.ts`（新規）+ ユニットテスト
- **変更内容:** `verifyPresignedRequest({ method, url, headers, config })` を実装。canonical query は `X-Amz-Signature` を除く全クエリパラメータから presign と同一規則（`encodeRfc3986` 再エンコード + sort、設計節参照）で再構築 → canonical request 組み立て → 署名再計算 → 比較、`X-Amz-Date + X-Amz-Expires` の期限チェック、credential scope（accessKeyId / 日付 / region / service）の一致チェック。結果は判別可能な戻り値（ok / expired / signature_mismatch 等）で返す。署名の比較は定数時間比較（両 hex を bytes 化して XOR 集約する等）で行い、`===` の文字列比較によるタイミング差を残さない — ADR-001 が「誤有効化されても SigV4 検証があるため無認証口にはならない」を安全根拠に挙げている以上、verify は本番品質にする。テストは `R2ObjectStorage.presignUpload` / `presignDownload` が発行した URL をそのまま verify に通すラウンドトリップで検証する（生成と検証の同一性を保証）。
- **理由:** dev プロキシでも presigned URL のセマンティクス（署名必須・TTL・Content-Type 固定）を維持する（AC-4）。署名済みクエリの後付け改竄が落ちることもラウンドトリップ + 改竄ケースで確認できる。

### 3. dev プロキシハンドラの追加

- **対象ファイル:** `app/core/adapters/cloudflare/devObjectStorageHandler.ts`（新規）+ テスト
- **変更内容:** `buildDevObjectStorageResponse({ request, bucket, bucketName, presignConfig })` を実装。パスから `<bucket>/<key>` を抽出し bucket 名を照合（不一致 404）、ステップ2 の verify を通し（NG 403）、PUT は `Content-Type` ヘッダが署名済み値と一致することを確認して `bucket.put`（200）。PUT のボディは `await request.arrayBuffer()` で確定長にしてから `bucket.put` に渡す — workerd の `R2Bucket.put` は未知長の `ReadableStream` を受け付けない（"Provided readable stream must have a known length"）。dev 用途のサイズなら全バッファで問題なく、ストリームのまま渡したい場合は `Content-Length` 由来の `FixedLengthStream` が必要。GET は `bucket.get` をメタデータ付きで返す（無ければ 404）。**キー抽出の対称性:** presign 側は `encodeKey` でセグメント単位に RFC 3986 エンコードした pathname を署名・発行するため、署名検証（verify）は「リクエストの生 pathname」に対して行い（presign と対称）、binding 操作（`put`/`get`）には「percent-decode 済みキー」を渡す。この非対称を守らないと、エンコードが発生するキーで「verify は通るが finalize の `stat` と不一致」になる（現行キーは ASCII セーフだが、presign 経路は export アーティファクト等と共有のため仕様として固定する）。
- **理由:** ローカル miniflare binding を presigned PUT/GET の終端にすることで、CORS（same-origin 化）とストア不一致（binding 一本化）を同時に解消する（AC-1, AC-2, AC-3）。配置は adapters 層 — `R2Bucket` / SigV4 検証という provider 固有の関心事のため。presentation に置くと presentation → adapters の依存になりレイヤー規約違反（ADR-001 参照）。

### 4. DI / env の配線

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`、`app/core/application/di/__tests__/serverCloudflare.test.ts`
- **変更内容:** `ServerEnv` に `R2_S3_ENDPOINT?: string` / `R2_DEV_OBJECT_PROXY?: string` を追加（JSDoc コメントで dev 専用である旨と公開情報である旨を明記）。`readRequestServerConfig` で `R2_S3_ENDPOINT` が truthy のとき `r2PresignConfig.endpoint` に thread。`r2PresignReady` の判定条件は変えない（endpoint は optional）。
- **理由:** 既にアダプターが持つ `endpoint` オーバーライドの受け口を構成可能にする。staging/production は env 未設定のため従来挙動（AC-5）。

### 5. presign のエンドポイントパス保持 + エントリポイント配線

- **対象ファイル:** `app/core/adapters/cloudflare/r2ObjectStorage.ts`、`app/core/adapters/cloudflare/__tests__/r2ObjectStorage.test.ts`、`app/server.cloudflare.ts`
- **変更内容:**
  - `presign()` の `url.pathname = /<bucket>/<key>` を、エンドポイント URL のパスプレフィックスを保持する形に修正（末尾スラッシュの正規化込み）。デフォルトエンドポイント時に出力 URL が従来と byte-identical であることをテストで固定。`presign()` は内部で `new Date()` を呼ぶため、`vi.useFakeTimers()` + `vi.setSystemTime()`（既存テストでの使用前例あり）で時刻を固定し、**変更前の実装が同時刻で生成した URL 文字列をゴールデン値としてテストに埋め込んで**完全一致比較する（URL 構造の部分比較に弱めない）。パス付きエンドポイント時に `/dev/r2/<bucket>/<key>` を署名することもテスト。
  - `app/server.cloudflare.ts` の fetch に、`env.R2_DEV_OBJECT_PROXY === "true" && url.pathname.startsWith("/dev/r2/")` のときステップ3 のハンドラへ委譲する分岐を `/sitemap.xml` インターセプトと同列に追加（`OBJECT_STORAGE` binding / presign env が欠けていれば 404）。
- **理由:** パス付きローカルエンドポイントに署名できないと same-origin 化が成立しない。エントリ分岐は既存の sitemap パターン踏襲で、本番ビルドでもフラグ未設定なら不活性（AC-5）。

### 6. ローカル構成ファイルの更新

- **対象ファイル:** `wrangler.toml`、`.dev.vars.example`
- **変更内容:** `wrangler.toml [vars]` に `R2_S3_ENDPOINT = "http://localhost:8787/dev/r2"` / `R2_DEV_OBJECT_PROXY = "true"` を追加（コメントで「LOCAL DEV ONLY、staging/production の wrangler 設定には追加しないこと」を明記）。`.dev.vars.example` の R2 クレデンシャル節に「ローカルプロキシ利用時はダミー値で可（空文字は不可 — DI が unavailable アダプターに落ちる）」を追記。
- **注意:** `.dev.vars.example` 冒頭の「キー集合を `infra/src/secrets.ts`（`workerSecretSpecs`）と同期せよ」という前提を壊さないこと。今回キー集合は増えない（`R2_S3_ENDPOINT` / `R2_DEV_OBJECT_PROXY` は公開情報なので `[vars]` 行きで secrets ではない）が、クレデンシャル節の説明を書き換える際にこの同期コメントとの整合を確認する。
- **理由:** `pnpm build && pnpm start`（wrangler dev, :8787）でゼロ追加手順のままフローが完走する構成にする。`pnpm dev`（vite, :3000）はオリジンが異なるため対象外（スコープ節参照）。

### 7. ドキュメント更新

- **対象ファイル:** `docs/runtime_cloudflare.md`（必要に応じて `docs/test.md`）
- **変更内容:** 「ローカルでの presigned フロー」節を追加: 仕組み（same-origin dev プロキシ + miniflare binding）、有効化条件（`R2_DEV_OBJECT_PROXY` / `R2_S3_ENDPOINT`）、ダミークレデンシャルで動く理由、staging/production では無効であること、**対象は `pnpm build && pnpm start`（:8787）であり `pnpm dev`（:3000）では cross-origin になるため動作しないこと**、**ブラウザでのアクセスは `http://localhost:8787` 表記必須であること（`http://127.0.0.1:8787` で開くと presign URL のオリジン（`localhost`）と食い違い、same-origin 前提が崩れて preflight が復活する／host 署名不一致で 403 になる）**、**検証サーバーは必ずポート 8787（`wrangler dev` のデフォルト。明示するなら `--port 8787`）で起動し、`APP_URL` / `R2_S3_ENDPOINT` のポートと一致させること（8787 が使用中で wrangler が別ポートにフォールバックすると presign 先とアプリオリジンが食い違い、フローが完走しない）**。
- **理由:** 検証環境構成の知識を `.issue/` の検証記録ではなく恒久ドキュメントに残す。

### 8. E2E 再検証

- **対象:** `.issue/655/testing.md` 確認項目1（determinate 進捗バーの E2E）
- **変更内容:** `pnpm build && pnpm start` でサーバーを起動し（**必ずポート 8787 で起動すること** — 8787 が使用中で別ポートにフォールバックすると presign 先（`R2_S3_ENDPOINT` の :8787）とアプリオリジンが食い違いフローが完走しない。明示するなら `--port 8787`。manual-test スキル等の「空きポート自動検出」起動は使わない）、**ブラウザでは必ず `http://localhost:8787` 表記でアクセスして**（`127.0.0.1` 不可 — presign URL のオリジン / host 署名と食い違う。ステップ7 参照）確認項目1 を再実行。presign → XHR PUT（進捗バー determinate）→ finalize 200 → `<img src="/media/<id>">` 挿入 → 画像表示、まで完走することを確認し、結果を `.issue/657/manual-test/results/` に #655 と同形式（`TC-1.md` + `summary.md`、環境ブロック付き）で記録する。
- **ファイルサイズ方針:** `maxNoteBytes`（`instance_settings` の 1 MiB 制限）の一時変更は行わず、**制限内のファイル（数百 KB の画像）+ DevTools のネットワーク throttling** で determinate 進捗の遷移を観察する（testing.md 記載の throttling 手順に従う）。前回検証（27MB で制限に衝突）の手戻りを避ける。
- **理由:** AC-6（Issue の「やること」そのもの）。

## 設計判断

- ADR-001: リモート R2 + CORS 設定ではなく「presign をローカル dev プロキシに向ける」を採用（詳細は `adr.md`）。
- ADR-002: dev プロキシでも SigV4 署名検証を行う（素通しにしない）（詳細は `adr.md`）。

## リスクと注意点

- **デフォルト挙動の回帰**: `presign()` のパス組み立て変更は本番経路にも触れる。デフォルトエンドポイントでの出力 URL が変更前と完全一致することをユニットテストで固定する（ステップ5）。既存の presign テスト（`r2ObjectStorage.test.ts`）と Issue #452 の `response-content-disposition` 署名順序の不変条件を壊さないこと。
- **検証ずれ**: 署名生成と検証のロジックが乖離すると「生成した URL が自分の verify で落ちる」事故になる。ラウンドトリップテスト（presign 出力 → verify）を必須にする（ステップ2）。
- **本番での誤有効化**: `R2_DEV_OBJECT_PROXY` が staging/production の wrangler 設定に紛れ込むと、本番 Worker が R2 オブジェクトを直接配信してしまう。`wrangler.staging.toml` / `wrangler.production.toml` に追加しないことをコメントで明示し、レビューで確認する。なお誤有効化しても SigV4 検証（ADR-002）があるため無認証の読み書き口にはならず、実害は「Worker 経由配信になる」程度に留まる（実害評価は ADR-001 に記載）。
- **`pnpm dev`（vite, :3000）非対応**: presign 先は `wrangler.toml [vars]` の固定 URL（:8787）なので、`pnpm dev` ではアプリオリジン（:3000）と異なり cross-origin になる。本 Issue は `pnpm build && pnpm start` のみを対象とし、ドキュメント（ステップ7）にも明記する。
- **大きいファイルの PUT**: dev プロキシは Worker 経由になるため、wrangler dev のリクエストボディ上限内である必要がある。ローカル検証用途（数 MB〜数十 MB）では問題ないが、ドキュメントに一言残す。
- **TanStack Router / assets との競合**: `/dev/r2/` はファイルベースルートに存在しないパスであり、defaultEntry 前のインターセプトなので競合しないが、`[assets]` の静的配信が GET を先取りしないこと（該当ファイルが存在しないため実害なし）を動作確認で見る。
- **進捗バー表示の前提**: same-origin XHR でも `upload.onprogress` は発火するが、ローカルは転送が速く determinate 表示の観察には DevTools throttling が必要（testing.md 記載済みの手順に従う）。
- **maxNoteBytes 制限**: 前回検証で 27MB 画像が `instance_settings` の 1 MiB 制限に当たった。再検証では制限内のファイル + throttling を使う（ステップ8 のファイルサイズ方針で確定済み）。

## テスト方針

- ユニット（adapter）:
  - presign デフォルトエンドポイント出力の不変性（変更前後で byte-identical）。時刻は `vi.useFakeTimers()` + `vi.setSystemTime()` で固定し、変更前実装のゴールデン値と完全一致比較（ステップ5 参照）。
  - パス付きエンドポイント（`http://localhost:8787/dev/r2`）で `/dev/r2/<bucket>/<key>` が署名されること。
  - verify ラウンドトリップ: `presignUpload` / `presignDownload`（`downloadFileName` あり/なし）の URL が verify を通る。
  - verify 拒否: 署名改竄、期限切れ（クロック前進）、メソッド不一致、別クレデンシャル、Content-Type 不一致。
- ユニット（adapter, dev プロキシ）: `devObjectStorageHandler` — PUT 200 + binding 格納（contentType 込み）、GET 200 + content-type / content-disposition、署名 NG 403、bucket 名不一致 404、オブジェクト無し GET 404。R2 binding はテスト用フェイク（既存テストの流儀に合わせる）。verify 拒否ケースとあわせて AC-4 の充足判定はこれらユニットテストの PASS をもって行う。
- DI: `R2_S3_ENDPOINT` が `r2PresignConfig.endpoint` に thread されること / 未設定時に従来構成であることを `serverCloudflare.test.ts` に追加。
- 手動（E2E）: ステップ8 のとおり `.issue/655/testing.md` 確認項目1 を再実行。あわせて `/media/<id>` の表示（presigned GET 302 経路）も目視確認。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`。

## レビュー履歴

### 1周目
**修正した点**:
- coverage P-001 / arch-risk P-001（同一問題）への対応: 「`pnpm dev` / `pnpm build && pnpm start` の両方でゼロ追加手順」の主張を削除し、本 Issue の対象を `pnpm build && pnpm start`（wrangler dev, :8787）に限定。`pnpm dev`（vite, :3000）は cross-origin になるためスコープ外として「スコープ」「リスクと注意点」「ステップ6・7」に明記（endpoint のオリジン動的導出方式への拡張は将来案としてスコープ外に記載するに留めた）。
- arch-risk P-002 への対応: dev プロキシハンドラの配置を `app/core/presentation/` から `app/core/adapters/cloudflare/devObjectStorageHandler.ts` に変更（`R2Bucket` / SigV4 検証は provider 固有の関心事のため）。エントリポイント（`app/server.cloudflare.ts`）から直接 import して配線する設計に修正（`InlineRelayTrigger` の前例に倣う）。テスト分類も「ユニット（presentation）」から「ユニット（adapter, dev プロキシ）」に変更。adr.md の ADR-001 にも配置判断を反映。

**取り込んだ改善提案**:
- coverage S-001: AC-4 の充足判定を「ステップ2・3 のユニットテスト PASS をもって判定（手動 E2E に含めない）」と AC 表・テスト方針に明記。
- coverage S-002: AC-6 のファイルサイズ方針を「maxNoteBytes の一時変更はせず、制限内ファイル + DevTools throttling」に確定（ステップ8）。
- coverage S-003: testing.md 確認項目2・3 非再実行の根拠として、スコープ節からステップ5 の byte-identical テスト・ステップ4 の DI テストを参照。
- arch-risk S-001: byte-identical テストの時刻固定手段を明記（`vi.useFakeTimers()` + `vi.setSystemTime()`、リポジトリ内に使用前例あり。変更前実装のゴールデン値と完全一致比較）。
- arch-risk S-002: ADR-001 にフラグ誤有効化時の実害評価（SigV4 検証により無認証口にはならず、実害は Worker 経由配信に留まる）を追記。
- arch-risk S-003: ステップ6 に `.dev.vars.example` と `infra/src/secrets.ts`（`workerSecretSpecs`）の同期前提を壊さない旨を注記。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 2周目
**修正した点**:
- arch-risk P-001 への対応: verify の署名対象クエリの再構築方法を、ホワイトリスト列挙（`X-Amz-Algorithm` が漏れていた）から「**`X-Amz-Signature` を除く全クエリパラメータ**を presign と同一規則（デコード後に `encodeRfc3986` で再エンコード + sort + join）で再構築する」方式に修正（設計節・ステップ2）。これにより正規 URL のラウンドトリップ成立と後付けパラメータの改竄耐性が同時に保証される。`URLSearchParams` の正規化差（`+`/`%20`）を踏まないための再エンコード注記も追加。

**取り込んだ改善提案**:
- coverage S-001: AC-1 / AC-2 の「対応ステップ」列にステップ2（presigned URL 検証ヘルパー）を追加（verify が動かない限りブラウザ PUT は 403 になるため）。
- arch-risk S-001: ローカル検証は `http://localhost:8787` 表記必須（`127.0.0.1` だと presign URL のオリジン / host 署名と食い違い、preflight 復活または 403 になる）をステップ7（ドキュメント更新内容）とステップ8（E2E 再検証手順）に明記。
- arch-risk S-002: ハンドラのキー抽出の対称性（verify は生 pathname に対して行い、binding 操作は percent-decode 済みキーで行う）をステップ3 に仕様として明記。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 3周目: 問題点ゼロ（改善提案5件を反映）で終了

**取り込んだ改善提案**:
- coverage S-001: AC-5 の充足判定方法（ステップ4 DI テスト + ステップ5 byte-identical テストの PASS + staging/production wrangler 設定への env 非追加のレビュー確認。ステップ7 は周知目的）を AC 表に明記。
- coverage S-002: ステップ8 の検証結果の記録先を `.issue/657/manual-test/results/`（#655 と同形式: `TC-1.md` + `summary.md`）に確定。
- arch-risk S-001: dev プロキシの PUT ボディは `await request.arrayBuffer()` で確定長にしてから `R2Bucket.put` に渡す旨をステップ3 に明記（未知長 `ReadableStream` は workerd が拒否する）。
- arch-risk S-002: 検証サーバーはポート 8787 固定（`--port 8787`）で起動し `APP_URL` / `R2_S3_ENDPOINT` と一致させる前提をステップ7・8 に明記。
- arch-risk S-003: verify の署名比較は定数時間比較で行う旨をステップ2 に明記。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

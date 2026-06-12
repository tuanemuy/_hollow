# ADR — Issue #657: ローカル検証環境で presigned アップロードフローを E2E 完走できるようにする

## ADR-001: presign をローカル same-origin dev プロキシに向ける

### Status
Proposed

### Context
ローカル（wrangler dev）で presigned フローが完走しない原因は (1) リモート R2 バケットの CORS 未設定（preflight 403）、(2) presign 先（リモート R2）と finalize の head（ローカル miniflare binding）のストア不一致。選択肢:

- **A. リモート R2 に CORS 設定 + remote bindings（`experimental_remote`）に統一** — dev クレデンシャルに PutBucketCors 権限がなく開発者側で設定不可（Issue 本文）。仮に設定できても、ローカル開発が共有リモートバケットを汚染する（前回検証でも残骸オブジェクトが発生）。ネットワーク必須・遅い。
- **B. presign をローカルに向ける: アプリ自身に dev 専用の S3 風 PUT/GET ルート（`/dev/r2/<bucket>/<key>`）を生やし、既存の `R2PresignConfig.endpoint` オーバーライドでそこへ署名する。終端はローカル miniflare の `OBJECT_STORAGE` binding。**
- **C. 外部の S3 互換エミュレータ（MinIO 等）を立てる** — finalize の head は binding を見るため、ストア不一致が解消しない。開発環境の追加依存も増える。

### Decision
B を採用。same-origin（`APP_URL` と同一オリジン）への PUT なので CORS preflight が消滅し（問題1）、終端が finalize と同じ binding なのでストア不一致も消える（問題2）。アダプターには `endpoint` オーバーライドの受け口が既にあり、DI 配線（`R2_S3_ENDPOINT`）とエンドポイントパス保持の修正だけで presign 側は完結する。dev ルートは `R2_DEV_OBJECT_PROXY = "true"`（ローカル専用 `wrangler.toml [vars]` のみ）で明示的にゲートし、staging/production では不活性。

ハンドラの配置は adapters 層（`app/core/adapters/cloudflare/devObjectStorageHandler.ts`）とする。`R2Bucket` binding と SigV4 検証は provider 固有の関心事であり、presentation 層に置くと presentation → adapters の直接依存というレイヤー違反になるため。エントリポイント（`app/server.cloudflare.ts`）でのインターセプト位置は既存の `/sitemap.xml` パターンを踏襲しつつ、委譲先はエントリから adapters を直接 import する（`InlineRelayTrigger` と同じ前例）。

対象環境は `pnpm build && pnpm start`（wrangler dev, :8787）のみ。`pnpm dev`（vite, :3000）は presign 先の固定 URL とオリジンが異なり same-origin 化が成立しないためスコープ外（必要になればリクエストオリジンからの endpoint 動的導出で拡張可能だが、本 Issue では行わない）。

### Consequences
- 良い点: ネットワーク・リモートリソース・追加ツール不要でフローが完走。リモートバケットを汚さない。ドメイン/アプリケーション層は無変更（ポート契約不変）。`R2_S3_ENDPOINT` は汎用オーバーライドとして将来のカスタムドメイン等にも転用可能。
- トレードオフ: ローカルの PUT/GET が Worker を経由するため、本番（R2 直）と転送経路が異なる。リモート R2 の CORS 挙動そのものはローカルで検証できない（本番相当の検証は staging に委ねる）。dev 専用コードがコードベースに常駐する（env ゲートで隔離）。`pnpm dev`（vite, :3000）ではフローが完走しない（上記スコープ外）。
- 誤有効化時の実害評価: ガードは「`R2_DEV_OBJECT_PROXY` を staging/production の wrangler 設定に書かないこと + レビュー」という運用ガードのみだが、仮に本番で誤有効化されても SigV4 署名検証（ADR-002）が必須のため無認証の読み書きエンドポイントにはならない。実害は「有効な presigned URL の転送が R2 直ではなく Worker 経由になる」程度（パフォーマンス・ボディサイズ上限の差）に留まる。

---

## ADR-002: dev プロキシでも SigV4 署名を検証する

### Status
Proposed

### Context
dev ルートは「署名を見ずに何でも受ける」素通し実装でもフローは完走する。しかし presigned URL のセマンティクス（署名必須・TTL・Content-Type 固定）が検証対象から消え、署名生成側のバグ（Issue #452 のような署名順序ミス等）をローカルで検知できなくなる。また無認証の書き込みエンドポイントになる。

### Decision
presign と同じ SigV4 プリミティブ（`r2Sigv4.ts` に抽出して共有）で署名を再計算・検証する。期限・credential scope・メソッド・署名済み Content-Type の一致もチェックし、NG は 403。検証ロジックの正しさは「presign が発行した URL がそのまま verify を通る」ラウンドトリップテストで担保する。

### Consequences
- 良い点: ローカル検証が presigned URL の実セマンティクスをカバーする。署名生成バグの早期検知。dev とはいえ書き込み口が無認証にならない。
- トレードオフ: 実装量が増える（canonical request の再構築）。R2 本体の検証実装とは独立なので「自前 verify は通るが R2 では落ちる」差異は理論上残る（既存の presign テスト + staging 検証で補完）。

---

## ADR-003: `.dev.vars.example` の R2 クレデンシャルにダミー初期値を入れる

### Status
Accepted（実装時判断）

### コンテキスト
計画ステップ6 は `.dev.vars.example` の「コメント更新」のみを指示していた。しかし R2 クレデンシャルの初期値が空文字のままだと、`cp .dev.vars.example .dev.vars` 直後は DI が unavailable アダプターに落ち、presigned フローが完走しない（追加手順が必要になる）。

### 決定内容
`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` の初期値を空文字から非空のダミー値（`local-dev-account` 等）に変更し、コメントでダミーで足りる理由（presign と verify が同一値を使う）を明記した。

### 理由
`SECRET_BOX_MASTER_KEY` が「fresh copy で即使えるローカル専用プレースホルダ」を同ファイル内で既に採用している前例に揃え、計画の目的（ゼロ追加手順でフロー完走）を満たすため。dev プロキシ利用時にこれらの値が外部に対して認証情報として機能することはない。

---

## ADR-004: verify のメソッド・Content-Type 不一致は署名検証で吸収する

### Status
Accepted（実装時判断）

### コンテキスト
計画ステップ2 は「HTTP メソッドも検証」「署名済み Content-Type の一致チェック」を挙げていた。

### 決定内容
独立したメソッド比較・Content-Type 比較は実装せず、canonical request に実リクエストのメソッドと署名済みヘッダ（`X-Amz-SignedHeaders` 記載のヘッダの実値）を組み込んで署名を再計算する方式で吸収した。不一致は `signature_mismatch` として 403 になる。明示チェックは presign URL のパラメータ存在・形式（`malformed`）、credential scope（`credential_mismatch`）、期限（`expired`）のみ。

### 理由
SigV4 の仕様上、メソッドとヘッダ値は canonical request の構成要素であり、署名再計算が唯一の正であるべき。独立比較を足すと署名ロジックとの二重管理（検証ずれの温床）になる。テストではメソッド不一致・Content-Type 不一致がともに拒否されることを確認している。

---

## ADR-005: dev GET 配信のレスポンスヘッダ硬化と期限検証の defense-in-depth（Round 1 レビュー対応）

### Status
Accepted（レビュー対応時判断）

### コンテキスト
PR #662 Round 1 レビューで、(a) dev プロキシの GET が**アプリオリジン上で**オブジェクトを配信するため、本番誤有効化時に stored XSS の足場になり得る（security W-001）、(b) `X-Amz-Date` の NaN 日付素通り・`X-Amz-Expires` 上限なし・not-before なし（security W-003）が指摘された。

### 決定内容
- GET レスポンスに `X-Content-Type-Options: nosniff` を常時付与し、`response-content-disposition` 未指定時は `Content-Disposition: attachment` をデフォルトにする。`attachment` はナビゲーション時のみ作用し `<img>` 等のサブリソース読み込みには影響しないため、dev の画像プレビューは壊れない。
- verify は shape-valid だが実在しない `X-Amz-Date`（Invalid Date）を `malformed` で拒否し、`X-Amz-Expires` に S3 本家と同じ 7 日（604800 秒）上限を設けた。
- not-before（未来日付 `X-Amz-Date` の拒否）は**見送り**。改竄には署名再計算が必要で外部攻撃者には悪用できず、dev 用途の安全網としては過剰（クロックスキュー誤判定のリスクの方が高い）と判断した。

### 理由
ADR-001 が誤有効化時の安全根拠を署名検証に置いている以上、レスポンス側ヘッダと期限検証単体の正しさも安全網の一部であるべき、というレビュー指摘に同意したため。誤有効化時、有効な presigned GET URL の終端が R2 の別オリジンではなくアプリの Cookie が効くオリジンになる点が ADR-001 の評価から漏れていた。

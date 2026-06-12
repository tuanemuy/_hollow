# Round 3 レビュー — アーキテクチャ整合性・実現可能性・リスク

**対象:** `.issue/657/plan.md` / `.issue/657/adr.md`（2周レビュー反映済み）
**レビュー観点:** レイヤー配置・依存方向・手順の実現性・見落とし依存・エッジケース・設計トレードオフ

## 検証したこと（コード照合）

- `app/core/adapters/cloudflare/r2ObjectStorage.ts` — `R2PresignConfig.endpoint` の存在、`presign()` の `url.pathname` 上書き（パス保持されない）、署名対象ヘッダ（host + PUT 時 content-type）、`signedUrl.searchParams.set()`（URLSearchParams 正規化）と canonical query（`encodeRfc3986`）の差。plan の調査結果・設計節の記述はすべて実コードと一致。
- `app/server.cloudflare.ts` — `/sitemap.xml` インターセプト位置、`InlineRelayTrigger` の adapters 直接 import 前例。plan の配線案はそのまま成立する。
- `app/core/application/di/serverCloudflare.ts` — `r2PresignReady` の4条件、endpoint 未配線の事実。ステップ4 の「判定条件は変えない」は妥当。
- `wrangler.toml` — `[vars]` / `[assets]` / `OBJECT_STORAGE` binding。`[env.consumer]` 等のサイブリング Worker は presign しない（presign は request path の DI のみ）ため、新規 vars をサイブリング env に複製不要という暗黙の前提も成立している。
- `package.json` — `start = wrangler dev`（:8787 デフォルト）。

レイヤー配置（dev プロキシハンドラ = adapters 層、エントリから直接配線）、依存方向、AC とステップの対応、ロールバック容易性（env ゲート1点）に問題なし。1〜2周目の指摘（vite dev スコープ外化、presentation→adapters 違反回避、canonical query 全パラメータ方式、localhost/127.0.0.1 表記、キー抽出の対称性）はいずれも正しく反映されている。

## 問題点（P-）

なし。

## 改善提案（S-）

### S-001: dev プロキシの PUT ボディ取り扱いを明記する（`R2Bucket.put` のストリーム長制約）

- **理由:** workerd の `R2Bucket.put` に `ReadableStream` を渡す場合、長さが既知である必要がある（未知長ストリームは "Provided readable stream must have a known length" で落ちる）。ステップ3 は `bucket.put(key, body, ...)` とだけ書いており、`request.body` をそのまま渡すと実装時にここで詰まる可能性がある。
- **提案:** ステップ3 に「ボディは `await request.arrayBuffer()` で確定長にしてから `put` する（dev 用途のサイズなら全バッファで問題ない）。ストリームのまま渡すなら `Content-Length` 由来の `FixedLengthStream` が必要」と一文加える。既存の「大きいファイルの PUT」リスク項とも整合する。

### S-002: ポート 8787 固定の前提を明示し、検証手順でポートを固定する

- **提案理由:** `R2_S3_ENDPOINT = "http://localhost:8787/dev/r2"` は wrangler dev がポート 8787 で起動する前提。8787 が使用中の場合 wrangler は別ポートにフォールバックし得るし、manual-test スキル（AC-6 の再検証経路）は「空きポート自動検出」でサーバーを起動するため、:8787 以外で立ち上がると presign 先とアプリオリジンが食い違い、127.0.0.1 問題と同型の失敗（cross-origin 化 / host 署名不一致）が再発する。
- **提案:** ステップ7・8 に「検証サーバーは必ず `--port 8787`（`wrangler dev` デフォルト）で起動し、`APP_URL` / `R2_S3_ENDPOINT` のポートと一致させること。別ポートで起動した場合はフローが完走しない」を追記する。

### S-003: 署名比較は定数時間比較にしておく（軽微）

- **理由:** `verifyPresignedRequest` の署名比較を `===` の文字列比較で行うとタイミング差が理論上残る。dev 専用ゲート下なので実害はほぼないが、ADR-001 が「誤有効化されても SigV4 検証があるため無認証口にはならない」を安全根拠に挙げている以上、verify 自体は本番品質にしておくのが整合的。
- **提案:** ステップ2 に「署名比較は定数時間比較（例: 両 hex を bytes 化して XOR 集約、または `crypto.subtle.timingSafeEqual` 相当）で行う」と一文加える。

## 結論

P-level の問題点ゼロ。S-001〜S-003 はいずれも実装ステップへの一文追記で済む軽微な補強であり、計画の構造・方針の変更は不要。実装に進んでよい。

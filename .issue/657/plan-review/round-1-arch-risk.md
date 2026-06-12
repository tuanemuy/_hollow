# Plan Review — Issue #657 / Round 1（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/657/plan.md` / `.issue/657/adr.md`
レビュー観点: レイヤー構造との整合・依存方向・実現可能性・見落とされた依存関係/副作用・トレードオフの妥当性

## 検証した事実（コード調査）

- `app/core/adapters/cloudflare/r2ObjectStorage.ts` — `R2PresignConfig.endpoint` の受け口は実在し、`presign()` が `url.pathname = /<bucket>/<key>` で上書きするためパス付きエンドポイントのプレフィックスが落ちる、という plan の調査結果はコードと一致（L178-179）。
- `app/core/application/di/serverCloudflare.ts` — `r2PresignReady` は 5 要素の全揃い判定（L314-319）で、endpoint を thread する経路がないことも一致。
- `app/server.cloudflare.ts` — `/sitemap.xml` のインターセプトパターン（`storage.run` 内、defaultEntry 前）は plan の踏襲先として実在。
- `wrangler.toml` は LOCAL DEV ONLY、`APP_URL = "http://localhost:8787"`、`OBJECT_STORAGE` binding と `R2_OBJECT_BUCKET_NAME` の組も plan どおり。
- worker 系（`app/worker/`, `app/core/application/workers/`）に presign 利用は無い — `[env.*]` ブロックへの新 env 複製は不要、という暗黙の前提は正しい。
- `[assets]` は該当パスにファイルが無ければ worker に落ちるため `/dev/r2/` 競合なし、という plan の認識も妥当。

#### 問題点（要修正）

- **[P-001]** `pnpm dev`（vite, port 3000）では `R2_S3_ENDPOINT = "http://localhost:8787/dev/r2"` が機能しない可能性が高いのに、ステップ6 が「`pnpm dev` / `pnpm build && pnpm start` の両方でゼロ追加手順のまま完走」と主張している
  - 理由: `package.json` の `dev` は `vite dev --config vite.config.cloudflare.ts` で、`vite.config.cloudflare.ts` は `server.port = 3000`。`@cloudflare/vite-plugin` は `wrangler.toml [vars]` を読み込むので、`pnpm dev` 中も presign は `http://localhost:8787/dev/r2/...` を指す。アプリは :3000 で動いているため、(a) :8787 が起動していなければ接続失敗、(b) ブラウザから見れば cross-origin になり same-origin 化（AC-1 の根拠）が崩れる。また署名対象の `host` ヘッダも実リクエストと不一致になる。Issue の検証環境は `pnpm build && pnpm start`（= :8787）なので AC 自体は満たせるが、plan のステップ6 の記述と「ゼロ追加手順」の主張が事実に反する。
  - 提案: いずれかを明示する。
    1. ステップ6 の主張を「`pnpm start`（wrangler dev, :8787）で完走。`pnpm dev` はポートが異なるため対象外」とスコープダウンし、ドキュメント（ステップ7）にも明記する（Issue 要件は `pnpm build && pnpm start` なのでこれで十分）。
    2. もしくは `R2_S3_ENDPOINT` を固定 URL ではなく「dev プロキシ有効時はリクエストの origin から導出」（`server.cloudflare.ts` で `new URL(request.url).origin + "/dev/r2"` を per-request に config へ thread）にして両モードで動くようにする。この場合 env は `R2_DEV_OBJECT_PROXY` 1 つで足り、ポートのハードコードも消える。
    どちらでもよいが、現行 plan のまま実装すると「pnpm dev で動くはず」という誤った期待がドキュメントに固定される。

- **[P-002]** `devObjectStorageHandler` を `app/core/presentation/` に置くと依存方向の規約に反する（presentation → adapters の直接依存）
  - 理由: ハンドラのシグネチャは `{ request, bucket, bucketName, presignConfig }` で、`R2Bucket`（`@cloudflare/workers-types`）と `R2PresignConfig` / `verifyPresignedRequest`（`app/core/adapters/cloudflare/`）への import が必須になる。CLAUDE.md の層定義では presentation は「presentation → application → domain」の内向き依存であり、既存の `sitemapHandler` も application（`RequestContainer` / usecase）にしか依存していない。R2 binding と SigV4 検証という provider 固有の関心事は adapters 層の責務で、これを presentation に置くと architecture-audit 的にはレイヤー違反になる。
  - 提案: ハンドラを `app/core/adapters/cloudflare/devObjectStorageHandler.ts`（または `r2DevProxy.ts`）として adapters 層に置き、`app/server.cloudflare.ts`（エントリ）から直接 import して分岐する。エントリは既に `InlineRelayTrigger` を adapters から直接 import しており（dev 専用機能の前例としてもこちらが適切）、「ランタイム差し替えはエントリ + DI 配線で吸収する」という CLAUDE.md の方針とも一致する。plan のステップ3 の置き場所とテスト分類（「ユニット（presentation）」）を adapter 側に書き換えるだけで、設計の他の部分は変更不要。

#### 改善提案（検討推奨）

- **[S-001]** 「デフォルトエンドポイントで出力 URL が byte-identical」テストの実現方法を明記する
  - 理由: `presign()` は `new Date()` を内部で呼ぶため、変更前後の URL を素朴に比較しても `X-Amz-Date` / 署名が毎回変わり byte-identical 比較は成立しない。fake timers で時刻を固定して「変更前の実装が生成した既知の URL 文字列（ゴールデン値）」と比較する、または時刻固定下で旧ロジック相当の期待値を組み立てて比較する、のどちらかを実装ステップに書いておかないと、実装時に「URL 構造（pathname / クエリキー集合）の比較」程度に弱められて AC-5 の担保が薄くなるリスクがある。

- **[S-002]** dev プロキシの defense-in-depth として、ハンドラ有効化条件に「`import.meta.env.DEV` ではなく env フラグのみ」を選んだ理由と、誤設定時の挙動を ADR-001 に一行追記する
  - 理由: リスク欄に「staging/production の wrangler 設定に紛れ込むと本番 Worker が R2 を直接配信」とあるとおり、唯一のガードが「toml に書かないこと + レビュー」という運用ガードになっている。SigV4 検証（ADR-002）があるため誤有効化しても無認証口にはならない — つまり実害は「Worker 経由配信になる」程度 — という安全性の評価を ADR に明記しておくと、将来このフラグを見た人がリスクを正しく見積もれる。コード変更は不要。

- **[S-003]** `.dev.vars.example` の「ダミー値で可」追記時に、`infra/src/secrets.ts`（`workerSecretSpecs`）との同期コメントとの整合を確認する
  - 理由: `.dev.vars.example` 冒頭に「キー集合を `infra/src/secrets.ts` と同期せよ」とある。今回キーは増えない（`R2_S3_ENDPOINT` / `R2_DEV_OBJECT_PROXY` は公開情報なので `[vars]` 行き = ADR-006 の既存判断とも整合）が、R2 クレデンシャル節の説明を書き換える際にこの同期前提を壊さないよう、ステップ6 の注意点として一言あるとよい。

#### 良い点

- 原因分析（CORS / ストア不一致が同根）から導いた「same-origin 化 + binding 一本化」という解法は、2 つの問題を 1 つの機構で同時に解消しており筋がよい。ADR-001 の代替案（リモート CORS / remote bindings / MinIO）の棄却理由も、それぞれ実在する制約（PutBucketCors 権限なし、finalize は binding を見る）に基づいていて妥当。
- レイヤーの内側から設計されている: ドメイン（`ObjectStorage` ポート契約）不変 → ユースケース不変 → アダプター（endpoint 構成 + 検証）→ エントリ/構成、という影響範囲の整理が正確で、実装ステップ 1→5 も依存方向の順（共有プリミティブ → 検証 → ハンドラ → DI → エントリ）になっている。
- ADR-002（素通しにせず SigV4 検証）は「ローカル検証が presigned URL の実セマンティクスをカバーする」「無認証書き込み口を作らない」という二重の価値があり、Issue #452 型の署名バグの早期検知という具体的な過去事例で裏づけられている。ラウンドトリップテスト必須化は「生成と検証の乖離」という本方式固有のリスクへの正しい打ち手。
- 改竄耐性の構造も健全: canonical query は `X-Amz-Signature` 以外の全クエリから再構築されるため、後付けパラメータは自動的に署名不一致で落ちる — plan のテスト方針（改竄・期限切れ・メソッド/クレデンシャル/Content-Type 不一致）はこの性質を網羅している。
- AC-5（本番不変）の担保が「env 未設定なら従来挙動」＋「デフォルトエンドポイント出力の固定テスト」の二段構えで、回帰リスク（presign パス組み立ては本番経路に触れる）を正しく認識している。
- スコープ管理が適切: temp files の presign 非対象、testing.md TC-2/3 の再実行省略の根拠、リモート CORS 検証は staging に委ねる旨など、Issue 範囲を超えない線引きが明示されている。

## サマリー

- 問題点: 2 / 改善提案: 3
- [P-001] `pnpm dev`（:3000）では固定 `R2_S3_ENDPOINT`（:8787）が成立しない — 主張のスコープダウンか origin 導出への変更が必要
- [P-002] dev プロキシハンドラの置き場所が presentation 層だと依存方向規約違反 — adapters/cloudflare に置きエントリから直接配線すべき
- [S-001] byte-identical テストは時刻固定の方法を明記しないと成立しない
- [S-002] 誤有効化時の実害評価（SigV4 検証があるため無認証口にはならない）を ADR に追記
- [S-003] `.dev.vars.example` 更新時の `infra/src/secrets.ts` 同期前提の確認

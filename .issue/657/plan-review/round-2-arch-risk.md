# Plan Review — Issue #657 / Round 2（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/657/plan.md` / `.issue/657/adr.md`（1周目レビュー反映済み）
レビュー観点: レイヤー構造との整合・依存方向・実現可能性・見落とされた依存関係/副作用・トレードオフの妥当性

## 1周目指摘の反映確認

- P-001（`pnpm dev` 非対応の明示）: 反映済み。スコープ節・ステップ6/7・リスク欄・ADR-001 に「対象は `pnpm build && pnpm start`（:8787）のみ」が一貫して記載されている。
- P-002（ハンドラの配置）: 反映済み。`app/core/adapters/cloudflare/devObjectStorageHandler.ts` + エントリ直接配線（`InlineRelayTrigger` 前例）に変更され、テスト分類も adapter に修正。CLAUDE.md の依存方向規約と整合する。
- S-001〜S-003: いずれも plan / adr に取り込まれていることを確認（ゴールデン値 + fake timers、誤有効化時の実害評価、`infra/src/secrets.ts` 同期注記）。

## 追加で検証した事実（コード調査）

- `r2ObjectStorage.ts` の `presign()` は canonical query を「`encodeRfc3986(k)=encodeRfc3986(v)` の文字列を sort して join」で構築しており、署名対象クエリには **`X-Amz-Algorithm` を含む** 5+1 パラメータ全部が入る（L193-216）。
- `MediaUploader.tsx` L54 で XHR は `setRequestHeader("Content-Type", file.type)` を明示送信しており、dev プロキシの「署名済み Content-Type 一致チェック」は成立する。
- `app/server.cloudflare.ts` の sitemap インターセプトは `storage.run` 内・defaultEntry 前。dev プロキシ分岐の挿入位置として実在し、`env` は `AppEnv = ServerEnv` 型なので `ServerEnv` への optional env 追加（ステップ4）で型も通る。
- `wrangler.toml` の `[env.relay]` / `[env.consumer]` は vars/bindings を意図的に複製しているが、worker 側に presign 利用はないため新 env の複製は不要（1周目調査の再確認）。
- ストレージキーは `buildStorageKey` = `${userId}/${kind}/${id}`（`uploadMedia.ts` L97-103）で ASCII セーフ。パスのキー抽出で encoding 起因の事故は実運用上起きにくい。

#### 問題点（要修正）

- **[P-001]** ステップ2 の verify が再構築する署名対象クエリの列挙から `X-Amz-Algorithm` が漏れている
  - 理由: plan L67 は「リクエスト URL のクエリ（`X-Amz-Credential` / `X-Amz-Date` / `X-Amz-Expires` / `X-Amz-SignedHeaders` / `X-Amz-Signature` / `response-content-disposition`）…から canonical request を再構築」と列挙するが、`presign()` の canonical query には `X-Amz-Algorithm=AWS4-HMAC-SHA256` も含まれて署名されている（`r2ObjectStorage.ts` L193-216）。この列挙どおりホワイトリスト方式で再構築すると、(a) 正規の URL ですら署名不一致になる（ラウンドトリップテストで即発覚するが実装手戻り）、(b) ホワイトリスト外の後付けパラメータが検証をすり抜ける — plan が主張する「署名済みクエリの後付け改竄が落ちる」性質はホワイトリスト方式では成立しない。
  - 提案: 列挙をやめ、「canonical query は **`X-Amz-Signature` を除く全クエリパラメータ** から、presign と同一の構築規則（`encodeRfc3986` でキー・値を再エンコードし、エンコード済み `k=v` 文字列を sort して join）で再構築する」と明記する。これで `X-Amz-Algorithm` の取り込みと改竄耐性（任意の追加パラメータ＝署名不一致）が同時に保証される。パース時に `URLSearchParams` の正規化差（`+`/`%20` 等）を踏まないよう、デコード後に共有プリミティブ `encodeRfc3986` で再エンコードする旨も一言あるとよい。

#### 改善提案（検討推奨）

- **[S-001]** ローカル検証は `http://localhost:8787`（`APP_URL` と同一表記）でアクセスする前提をドキュメント（ステップ7）に明記する
  - 理由: presign は `wrangler.toml [vars]` の固定 `R2_S3_ENDPOINT`（host = `localhost:8787`）に対して `host` ヘッダを署名する。開発者がブラウザで `http://127.0.0.1:8787` を開くと、アプリは動くが presign URL のオリジン（`localhost`）と食い違い、(a) same-origin 前提が崩れて preflight が復活（dev プロキシは OPTIONS を扱わないので失敗）、(b) 仮に通っても host 署名不一致で 403、という分かりにくい失敗になる。一行の注意書きで防げる。

- **[S-002]** ハンドラのキー抽出時、パスセグメントを percent-decode してから binding（`put`/`get`）に渡すことをステップ3 に明記する
  - 理由: presign 側は `encodeKey` でセグメント単位に RFC 3986 エンコードした pathname を署名・発行する。署名検証は「リクエストの生 pathname」に対して行い（presign と対称）、binding 操作は「デコード済みキー」で行う、という非対称を実装者が意識していないと、エンコードが発生するキーで「verify は通るが finalize の `stat`（生キーで head）と不一致」になる。現行キーは ASCII セーフ（`userId/kind/id`）なので顕在化しないが、export アーティファクト等へ presign 経路が共有されている以上、対称性は仕様として書いておくのが安全。

#### 良い点

- 1周目の P-001/P-002 への対応が表面的な文言修正でなく、スコープ定義（AC-1 の根拠説明込み）・ADR・テスト分類まで一貫して波及しており、計画全体の整合が取れている。
- AC-5 の担保が「env 未設定時の従来構成（DI テスト）」+「デフォルトエンドポイント出力のゴールデン値完全一致（時刻固定手段まで指定）」の二段構えで、`presign()` パス組み立て変更という本番経路への唯一の接触点を機械的に固定できている。
- `R2_DEV_OBJECT_PROXY` と `R2_S3_ENDPOINT` を分離した設計（前者はルート有効化、後者は汎用 endpoint オーバーライド）は、将来のカスタムドメイン presign への転用余地を残しつつ dev 専用コードのゲートを明示的に保つ、適切な粒度の分割。
- `.dev.vars.example` の「ダミー値で可、ただし空文字は不可（DI が unavailable アダプターに落ちる）」という注記は、`r2PresignReady` の truthy 全揃い判定（`serverCloudflare.ts`）という実装の落とし穴を正確に捉えている。
- 実装ステップの順序（プリミティブ抽出 → verify → ハンドラ → DI → presign 修正 + エントリ → 構成 → docs → E2E）が依存順になっており、各ステップが独立にテスト可能。

## サマリー

- 問題点: 1 / 改善提案: 2
- [P-001] verify の署名対象クエリ列挙から `X-Amz-Algorithm` が漏れ — 「`X-Amz-Signature` 以外の全クエリから presign と同一規則で再構築」に修正すべき
- [S-001] ローカル検証は `localhost:8787` 表記必須（`127.0.0.1` だと same-origin / host 署名が崩れる）旨をドキュメントに明記
- [S-002] ハンドラのキー抽出は「verify は生 pathname、binding はデコード済みキー」という対称性をステップ3 に明記

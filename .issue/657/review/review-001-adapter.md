# PR #662 レビュー — Round 1

レビュー観点: Infrastructure / Adapter 層（SigV4 署名生成・検証、R2 binding 操作、エラー翻訳、レイヤー配置・依存方向、DI 配線、wrangler 設定）

検証実施内容:
- `gh pr diff 662` 全差分精読
- `r2Sigv4.ts` / `r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2ObjectStorage.ts` / `serverCloudflare.ts`（DI）/ `server.cloudflare.ts` / `wrangler.toml` をブランチ実体で精読
- PR ブランチを一時 worktree に展開し、新規・変更4テストファイル（`r2PresignVerify.test.ts` / `devObjectStorageHandler.test.ts` / `r2ObjectStorage.test.ts` / `serverCloudflare.test.ts`）を実行 → **135 件全 PASS**
- 署名生成と検証の canonical form を手動で突き合わせ（query 再構築の `+`/`%20` 往復、raw pathname 署名、signed headers の live 取得）— 乖離なし

## Adapter

### Blockers

なし

### Warnings

- **[W-001]** 不正な percent-encoding を含むキーで `decodeURIComponent` が `URIError` を投げ、ハンドラが 500 で落ちる
  - 場所: `app/core/adapters/cloudflare/devObjectStorageHandler.ts:49-52`（`rawKey.split("/").map((segment) => decodeURIComponent(segment))`）
  - 理由: キーの decode は署名検証**より前**に実行される。`GET /dev/r2/media/%zz` のような無署名・不正エンコードのリクエストで `decodeURIComponent("%zz")` が `URIError` を投げ、`buildDevObjectStorageResponse` から例外が漏れて fetch エントリで未処理 reject（500）になる。dev 専用ルートなので実害は限定的だが、計画は「verify NG / 不正は 403・404 に正規化」というセマンティクスを謳っており、ここだけ例外が素通りするのは穴。ハンドラ内で broad catch を持たない方針自体は正しいので、decode を局所的にガードするのが筋。
  - 提案: decode を `try / catch` で包み、`URIError` 時は 404（または 400）を返す。あるいは decode を署名検証の後（verify は raw pathname に対して行うので順序の入れ替えは無害）に移し、かつガードする。

### Notes

- **[N-001]** SigV4 プリミティブの抽出（`r2Sigv4.ts`）は diff 上 verbatim 移動であることを確認。署名ロジック本体（canonical query / headers / stringToSign / key derivation）は一切変更されておらず、生成と検証が単一実装を共有するという計画ステップ1 の意図どおり。
- **[N-002]** AC-2/AC-5 の柱である presign のパス保持修正は構造的に安全: デフォルトエンドポイントの `pathname` は `"/"` → `replace(/\/+$/, "")` で空文字 → `/<bucket>/<key>` となり旧実装 `url.pathname = \`/${bucket}/${key}\`` と文字列レベルで一致する。fake-timers + ゴールデン文字列の byte-identical テスト（upload / download+disposition の2本）もこれを固定しており、Issue #452 の `response-content-disposition` 署名順序テストも温存されている。
- **[N-003]** verify の canonical query 再構築（`X-Amz-Signature` 除外の全パラメータ・decode → `encodeRfc3986` 再エンコード → sort → join）を署名側と突き合わせた。署名側が `URLSearchParams.set` でスペースを `+` にシリアライズする一方、canonical string は `%20` で署名している非自明な往復も、verify 側が `searchParams.entries()`（`+` → space に decode）→ `encodeRfc3986`（space → `%20`）で正しく復元する。ホワイトリスト不要の改竄耐性（後付けパラメータは署名不一致）もテストで実証済み。計画2周目の指摘（arch-risk P-001）への対応として正確。
- **[N-004]** 署名比較は長さ一致チェック + 全文字 XOR 集約の定数時間比較で、期待値（自前計算の hex）の長さは固定なので early-return による情報漏えいはない。Content-Type は `X-Amz-SignedHeaders` 経由で live リクエストヘッダから canonical headers に取り込まれるため、署名済み値との不一致・欠落が署名不一致として落ちる設計も正しい（テストあり）。
- **[N-005]** verify/binding のキー対称性（verify は raw pathname、`bucket.put/get` は percent-decode 済みキー）が実装・コメント・テスト（`file name.png` ケース）の三点で揃っており、計画ステップ3 の仕様明記に忠実。`finalizeUpload` の `stat` との不一致リスクは塞がれている。
- **[N-006]** レイヤー配置・依存方向は計画どおり: dev プロキシは adapters 層（`R2Bucket` + SigV4 という provider 固有関心事）、エントリ `server.cloudflare.ts` からの直接 import は `InlineRelayTrigger` の前例に沿う。presentation → adapters の依存は発生していない。DI は `R2_S3_ENDPOINT` truthy 時のみ `endpoint` キーを条件付き spread し、`r2PresignReady` の判定は不変（unset 時に `endpoint` キー自体が存在しないことまでテストで固定）。
- **[N-007]** AC-5 確認: `wrangler.staging.toml` / `wrangler.production.toml` は本 PR で未変更（diff に含まれない）。新規 env は `wrangler.toml`（LOCAL DEV ONLY）にのみ追加され、staging/production へ追加禁止のコメントも明記。DI テスト（env 未設定時は従来構成）+ byte-identical テストと合わせ、AC-5 の充足判定要件をすべて満たす。
- **[N-008]** `InlineRelayTrigger` と異なり、dev プロキシ分岐は `import.meta.env.DEV` ではなく実行時 env フラグでゲートするため、ハンドラ + verify コードは staging/production バンドルにも残る（DCE されない）。これは「`pnpm start`（vite build 後の wrangler dev）でも動かす」という本 Issue の要件上必然であり、誤有効化時も SigV4 検証が無認証口化を防ぐ（ADR-001/002 で評価済み）。コードサイズ増は軽微。参考情報として記録。
- **[N-009]** dev プロキシの PUT は `request.arrayBuffer()` で全バッファ、GET も `object.arrayBuffer()` で全バッファ。workerd の未知長 ReadableStream 制約への対処（計画3周目 arch-risk S-001）として正しく、dev 専用なら妥当。GET は `R2ObjectBody.body`（stream）をそのまま `Response` に渡す方が安いが、改善の域。
- **[N-010]** `[assets]` は `run_worker_first` 未設定だが、`/dev/r2/*` に一致する静的ファイルは存在しないため Worker が受ける。計画のリスク項目どおりで、手動 E2E（TC-1〜TC-5 PASS 記録あり）でも裏付けられている。
- **[N-011]** verify は期限切れを署名検証より先に判定し `expired` を返す。S3 本家も期限切れ/署名不一致を区別したエラーを返すためセマンティクス上問題なく、403 への正規化はハンドラ側で一元化されている。

## 結論

Blocker なし。W-001（不正 percent-encoding での未処理 `URIError` → 500）のみ修正推奨。署名生成/検証の整合・byte-identical 不変・staging/production 不変（AC-1/AC-2/AC-5）はコード・テスト・実行確認の三点で充足している。

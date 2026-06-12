# PR #662 Review — Security

対象: dev 専用 same-origin R2 プロキシ（`/dev/r2/*`）+ SigV4 presign 検証の追加。
評価では「本番影響」と「dev 限定リスク」を区別している。コアの SigV4 検証ロジック
（`r2PresignVerify.ts`）は ADR-004 のとおり「署名再計算が唯一の正」という設計で、
メソッド差し替え・Content-Type 差し替え・クエリ追加・ホスト差し替え・バケット差し替えの
いずれも canonical request に折り込まれて `signature_mismatch` で落ちることを確認した。
ラウンドトリップ＋否定系のテスト（13 ケース）も AC-4 を直接カバーしている。

### Security

#### Blockers

なし

#### Warnings

- **[W-001]** 誤有効化時の実害評価が「転送経路の差」に矮小化されている — GET が**アプリオリジン上で**オブジェクトを配信する点が抜けている
  - 場所: `app/core/adapters/cloudflare/devObjectStorageHandler.ts:96-104`（GET レスポンス組み立て）/ `.issue/657/adr.md` ADR-001 Consequences
  - 理由: 本番で誤有効化された場合、署名検証により無認証エンドポイントにはならない（ここは ADR の主張どおり正しい）。しかし正規ユーザーが取得した有効な presigned GET URL の終端が、R2 の別オリジンではなく **アプリの Cookie/セッションが効くオリジン**になる。レスポンスには `X-Content-Type-Options: nosniff` がなく、`Content-Disposition` も `response-content-disposition` 未指定時はデフォルトで inline 相当。保存済み Content-Type（presign 時にユーザー入力由来で署名された値）が `text/html` や `image/svg+xml` を許す経路があれば、自分のアップロードを同一オリジンで実行させる stored XSS → セッション奪取の足場になり得る。dev では実害なし。本番誤有効化シナリオ限定だが、ADR-001 がこのルートの安全性根拠を署名検証「のみ」に置いている以上、レスポンス側のヘッダ固めは安全網の一部であるべき。
  - 提案: GET レスポンスに `X-Content-Type-Options: nosniff` を常時付与し、`response-content-disposition` がない場合は `Content-Disposition: attachment` をデフォルトにする（dev の画像プレビュー用途で inline が必要なら、許可 Content-Type の allowlist（image/* 等）に限り inline を許す）。あわせて ADR-001 の誤有効化評価に「配信オリジンがアプリオリジンになる」点を追記。

- **[W-002]** 不正な percent-encoding を含むパスで `decodeURIComponent` が未捕捉の `URIError` を投げる
  - 場所: `app/core/adapters/cloudflare/devObjectStorageHandler.ts:49-52`
  - 理由: `/dev/r2/<bucket>/%zz` のような不正シーケンスは WHATWG URL パーサを素通りし、`decodeURIComponent` が throw して 500 になる。ストレージ操作前の例外なので fail-closed ではあるが、署名検証**前**に到達する未認証入力起点の例外パスであり、403/404 で落とすべき入力が Worker エラーとして表面化する。dev 限定の堅牢性問題で、攻撃価値は低い。
  - 提案: key のデコードを `try/catch` で包み `malformed` 系の 404/403 を返す。ついでにデコード処理自体を署名検証の後ろへ移すと「未検証入力に触れるコード」が最小化される。

- **[W-003]** 期限検証の defense-in-depth が薄い: NaN 日付の素通り・`X-Amz-Expires` 上限なし・not-before チェックなし
  - 場所: `app/core/adapters/cloudflare/r2PresignVerify.ts:79-90, 137-140`
  - 理由: (1) `20251399T000000Z` のような正規表現は通るが実在しない日付は `parseAmzDate` が Invalid Date を返し、`Date.now() > NaN` は false なので `expired` 判定を**素通り**する（後段の署名検証で落ちるため現状エクスプロイト不能だが、期限チェック単体としては壊れている）。(2) `X-Amz-Expires` に上限がない（S3 は 7 日上限）、(3) 未来日付の `X-Amz-Date` を拒否しない（not-before なし）ため、署名鍵保持者が事実上無期限の URL を作れる。いずれも改竄には署名再計算が必要で外部攻撃者には悪用できないが、ADR-001 がこの verify を本番誤有効化時の安全網と位置づけている以上、期限まわりは単体で正しくあるべき。
  - 提案: `parseAmzDate` の結果を `Number.isNaN(issuedAt.getTime())` で `malformed` に落とす。`expiresSec` に上限（例: 604800）を設け、`issuedAt` が現在時刻より大きく未来（クロックスキュー許容 +15 分程度超）なら拒否する。

#### Notes

- **[N-001]** 署名比較は固定長チェック＋ XOR 累積の定数時間実装（`constantTimeEqualHex`）で適切。長さ比較の early-return は漏れる情報が「64 hex 文字でない」という非機密のみで問題ない。`X-Amz-Credential` の比較は `!==` だが、accessKeyId は presigned URL に平文で載る公開情報なのでタイミング面の懸念なし。
- **[N-002]** ADR-004 の「メソッド・Content-Type の独立比較をせず署名再計算で吸収」は正しい設計。canonical query は `X-Amz-Signature` 以外の**全**パラメータを折り込むため、署名後のパラメータ追加・whitelist バイパスの余地がない（テスト `rejects a query parameter appended after signing` で確認済み）。`X-Amz-SignedHeaders` 自体が署名対象クエリに含まれるため、署名ヘッダ集合の縮小攻撃も不可。
- **[N-003]** リプレイ/混同耐性: canonical headers の `host` を実リクエストの `url.host` から取るため、別ホストへのリプレイは署名不一致で落ちる。バケットは `requestedBucket !== bucketName` で 404、かつパス全体が署名に拘束される。R2 のキーはフラットな不透明文字列なので `%252e%252e` → `..` の二重デコードもファイルシステム的トラバーサルにはならない。署名対象は raw pathname、binding 操作はデコード済みキーという非対称も正しく扱われている（別エンコーディングのパスは署名不一致で fail-closed）。
- **[N-004]** ハンドラの処理順序が安全: バケット確認 → メソッド制限（PUT/GET のみ 405）→ 署名検証 → 初めてボディ読み取り/ストレージ操作。未検証リクエストのボディをバッファしない。entry 側のゲートは `env.R2_DEV_OBJECT_PROXY === "true"` の厳密比較で、binding/presign 設定欠落時は 404 にフォールバック。
- **[N-005]** `.dev.vars.example` のダミー credential（ADR-003）は安全。値は実 R2 に対して無効であり、dev プロキシでは同一値で sign/verify が閉じるため外部に漏れても認証情報として機能しない。本物のトークンを example に書かない方針の維持としても正しい。
- **[N-006]** PUT ボディの全量バッファにサイズ上限がない点は、有効署名保持者しか到達できず Workers の 128MB メモリ上限が事実上のキャップになるため dev 用途では許容。本番誤有効化シナリオでも DoS 面の増分は限定的。

---

対応記録（Round 1 修正）: W-001/W-002/W-003 対応済み。ただし W-003 の not-before（未来 `X-Amz-Date` の拒否）は dev 用途の安全網としては過剰（署名再計算が必要で外部悪用不能、クロックスキュー誤判定リスクの方が大）と判断し見送り（ADR-005 参照）。

# PR #662 レビュー — Test 観点（Round 3 / ゼロベース）

レビュー対象: `feat(dev): presigned アップロードを same-origin dev プロキシで終端しローカル E2E を完走可能に`（fix コミット `147372ad`, `4667a6fd` 含む）
計画: `.issue/657/plan.md`

検証実施: 対象 4 テストファイル（`r2PresignVerify.test.ts` / `devObjectStorageHandler.test.ts` / `r2ObjectStorage.test.ts` / `serverCloudflare.test.ts`）を実行し **159 件全 PASS** を確認（Round 2 の 158 件 + 新規 store-and-serve ラウンドトリップ 1 件）。

## Round 2 指摘（W-001）の修正妥当性

- **W-001 → 修正済み・妥当。** `devObjectStorageHandler.test.ts:297-325` に store-and-serve ラウンドトリップが追加された。percent-decode が必要なキー（`"owner/source/file name.png"`）で「presignUpload URL の PUT → 同一ストアに対する presignDownload URL の GET → 200 + body バイト一致」まで通しで検証しており、提案どおり。GET 側が `decodeURIComponent` を外す / raw キーで `get` する片側回帰はこのテストで検知できる（フェイク R2 は decoded キーで格納しているため、GET 経路のデコードがずれると `get` が null → 404 で落ちる）。AC-3（表示経路完走）の核心がユニットで固定された。

## 計画との照合

- **AC-4**（不正署名・期限切れは 403）: verify 拒否系 — 署名改竄 / 後付けクエリ / 期限切れ / 境界 2 点（ちょうど = ok, +1ms = expired）/ メソッド不一致 / 別 accessKeyId（credential_mismatch）/ 別 secret / Content-Type 不一致・欠落 / SigV4 パラメータ皆無 / malformed 各分岐（Date 形状・NaN 日付・Expires 5 値 + 7 日上限・SignedHeaders 欠落・別 Algorithm）。ハンドラ側 — PUT/GET の 403（改竄・期限切れ・未署名、403 時に store 未汚染の副作用検証付き）。計画ステップ2・3 のテスト方針列挙を超過カバー。**充足。**
- **AC-5**（staging/production 不変）: DI テスト（`serverCloudflare.test.ts:195-217` — thread / 未設定時 `endpoint` キー不在（`Object.hasOwn` で `exactOptionalPropertyTypes` 整合まで）/ `r2PresignReady` を flip しない）+ byte-identical ゴールデン 2 本（`r2ObjectStorage.test.ts:102-122`、変更前実装由来の完全一致比較・fake timers 固定）+ ゲート pass-through（flag `{undefined,"false","TRUE","1"}` / prefix 外パス / env 半端揃い 3 通り → not_found）。`wrangler.staging.toml` / `wrangler.production.toml` に `R2_S3_ENDPOINT` / `R2_DEV_OBJECT_PROXY` が追加されていないことを grep で確認。**充足。**
- **ラウンドトリップ保証**（ADR-002）: presignUpload / presignDownload（downloadFileName あり・非 ASCII 含む・なし）/ デフォルトエンドポイントの 4 形態が verify を通ることを実発行 URL で固定。パス付きエンドポイント（末尾スラッシュ正規化込み）の署名 pathname も固定済み。
- **AC-6**: `.issue/657/manual-test/results/`（TC-1〜TC-5 + summary）が PR に含まれ、計画ステップ8 の記録形式どおり。
- テスト対象とエントリ実装の一致: `app/server.cloudflare.ts:81-97` が `resolveDevObjectStorageGate` / `buildDevObjectStorageResponse` をそのまま配線しており、ユニットテストの回帰検知がエントリ挙動に効く構造を維持。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `R2_S3_ENDPOINT: ""`（空文字）が truthiness で「未設定」扱いになる仕様への直接テストは依然ない（Round 2 N-001 の持ち越し）。`.dev.vars.example` が空文字クレデンシャルの挙動に言及する env 群なので、空文字 → `endpoint` キー不在を 1 ケース足すと既存 3 テストの並びに自然に収まる。
- **[N-002]** `constantTimeEqualHex` の長さ不一致 early return（`r2PresignVerify.ts:160`）は間接カバレッジのみ（改竄テストは全て同長 64 hex）。短い/長い署名で `signature_mismatch` の 1 ケースは安価（Round 1 N-007 から持ち越し。用途上は許容）。
- **[N-003]** パス分解の `slash === 0`（`/dev/r2//key` — 空 bucket セグメント）は未踏のまま（Round 2 N-003 持ち越し）。実装上 404 で安全に落ちることは明らかで優先度低。
- **[N-004]** Round 2 fix で追加された store-and-serve テストは PUT 成功（200）を前提アサートしてから GET に進む構成で、失敗時の原因切り分けが明確。テスト設計として適切。
- **[N-005]** verify は `url.host` を host ヘッダ値として canonical headers に採用するため、Host ヘッダ偽装系のテストは原理的に不要（リクエストヘッダを参照しない）。現状のテスト面で過不足なし。

## 判定

Blocker なし、Warning なし。Round 2 の W-001（GET 経路の percent-decode 対称性）は提案どおり store-and-serve ラウンドトリップで修正され妥当。AC-4 / AC-5 の充足判定に必要なテストは計画どおり（一部超過して）揃い、159 件全 PASS。残る Notes はいずれも持ち越しの低優先項目で、マージを妨げない。

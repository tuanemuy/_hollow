# PR #662 レビュー — Test 観点（Round 4 / ゼロベース）

レビュー対象: `feat(dev): presigned アップロードを same-origin dev プロキシで終端しローカル E2E を完走可能に`（fix コミット `147372ad`, `4667a6fd`, `fc28df2c` 含む、HEAD = `fc28df2c`）
計画: `.issue/657/plan.md`

検証実施: PR ブランチを worktree に展開し、対象 4 テストファイル（`r2PresignVerify.test.ts` / `devObjectStorageHandler.test.ts` / `r2ObjectStorage.test.ts` / `serverCloudflare.test.ts`）を実行 — **162 件全 PASS**（Round 3 の 159 件 + SignedHeaders 不正トークン 3 件）。テスト実装と被テスト実装（`r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2ObjectStorage.ts` / DI）を突き合わせて確認した。

## Round 3 指摘（security W-001）の修正妥当性

- **修正済み・妥当。** `r2PresignVerify.ts:112-118` で `X-Amz-SignedHeaders` 由来のヘッダ名を `/^[a-z0-9-]+$/` で検証し、不正トークンは `Headers.get()` に到達する前に `malformed` で fail-closed する。テストは `r2PresignVerify.test.ts:292-302` に `it.each` 3 ケース（空値 = `[""]` 分割結果 / 空白含み名 / 記号 `(` 含み名）が追加され、提案（TypeError → 未処理 500 の経路を `malformed` に正規化）と正確に対応。正規 URL のラウンドトリップ 4 形態は引き続き PASS しており、正規発行ヘッダ名（`host` / `content-type`）への副作用がないことも回帰的に保証されている。

## ゼロベースでの網羅性・AC 充足確認

- **AC-1 / AC-2 / AC-3**: signer のパスプレフィックス保持（パス付き・末尾スラッシュ正規化の 2 テスト）、verify ラウンドトリップ（presignUpload / presignDownload disposition あり非 ASCII 含む・なし / デフォルトエンドポイントの 4 形態）、ハンドラの PUT 200 + 格納（contentType 込み）/ GET 200 + content-type・nosniff・disposition、percent-decode キーの store-and-serve ラウンドトリップ（raw-pathname 署名検証 / decoded-key 格納の対称性を両方向で固定）。手動 E2E（TC-1〜TC-5 + summary、`.issue/657/manual-test/results/`）も PR に含まれる。**充足。**
- **AC-4**: verify 拒否系 — 署名改竄 / 後付けクエリ / 期限切れ + 境界 2 点（ちょうど = ok, +1ms = expired）/ メソッド不一致 / 別 accessKeyId（credential_mismatch）/ 別 secret / Content-Type 不一致・欠落 / SigV4 パラメータ皆無 / malformed 全分岐（Date 形状・NaN 日付・Expires 5 値 + 7 日上限・SignedHeaders 欠落・不正トークン 3 種・別 Algorithm）。ハンドラ 403（改竄・期限切れ・未署名・Content-Type 不一致、403 時 store 未汚染の副作用検証付き）、404（bucket 不一致・キーなし・不正 percent-encoding・オブジェクトなし）、405。計画ステップ2・3 の列挙を超過カバー。**充足。**
- **AC-5**: byte-identical ゴールデン 2 本（fake timers 固定、変更前実装由来の URL 文字列と完全一致 — 計画ステップ5 の指定どおり部分比較に弱めていない）+ DI 3 テスト（thread / unset 時 `endpoint` キー不在を `Object.hasOwn` で固定 / `r2PresignReady` を flip しない）+ ゲートテスト（flag `{undefined,"false","TRUE","1"}` の厳密比較 / prefix 外パス pass / env 半端揃い 3 通り → not_found / 完全揃い → handle）。`wrangler.toml` のみに新規 env が追加され staging/production 設定ファイルへの追加なし。**充足。**
- **AC-6**: `.issue/657/manual-test/results/` に計画ステップ8 指定の形式で記録済み。**充足。**
- テスト設計: 実発行 URL を変異させる `verifyWith` ヘルパーで malformed 系を「署名検証より前に落ちる」ことまで reason 判別で固定しており、分岐の到達順序が仕様としてテストに残っている。フェイク R2 は put/get の必要最小面に絞られ既存アダプターテストの流儀と一致。エントリ（`server.cloudflare.ts`）は `resolveDevObjectStorageGate` / `buildDevObjectStorageResponse` をそのまま配線しているため、ユニットの回帰検知がエントリ挙動に効く構造も維持。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `R2_S3_ENDPOINT: ""`（空文字 → truthiness で未設定扱い）の直接テストは依然ない（Round 2 N-001 から持ち越し）。1 ケースで既存 DI テストの並びに収まる。任意。
- **[N-002]** `constantTimeEqualHex` の長さ不一致 early return は間接カバレッジのみ（改竄テストは全て 64 hex 同長。`"0".repeat(64)` 改竄もハンドラ側で同長）。短い/長い署名 → `signature_mismatch` の 1 ケースは安価（Round 1 N-007 持ち越し）。任意。
- **[N-003]** パス分解の `slash === 0`（`/dev/r2//key`）は未踏のまま（Round 2 N-003 持ち越し）。`slash <= 0` で 404 に落ちることは実装上明らかで優先度低。
- **[N-004]** 新規 SignedHeaders 3 ケースは「大文字含みトークン」（例 `Host`、signer は小文字のみ発行・regex は小文字限定なので malformed になる）を含まないが、いずれのトークンでも `Headers.get` は throw しない（500 経路の塞ぎ漏れではない）ため、追加は不要と判断。

## 判定

Blocker なし、Warning なし。Round 3 の security W-001（不正 `X-Amz-SignedHeaders` による未処理 500）は提案どおり regex 事前検証 + 3 テストケースで修正され妥当。AC-1〜AC-6 の充足判定に必要なテストは計画を一部超過して揃い、162 件全 PASS。残る Notes は全て持ち越しの低優先項目で、Test 観点で本 PR はマージ可能。

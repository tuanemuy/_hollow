# PR #662 レビュー — Test 観点（Round 2 / ゼロベース）

レビュー対象: `feat(dev): presigned アップロードを same-origin dev プロキシで終端しローカル E2E を完走可能に`（fix コミット `147372ad` 含む）
計画: `.issue/657/plan.md`（AC-4 / AC-5 のユニット充足、byte-identical ゴールデン、presign↔verify ラウンドトリップ）

検証実施: 対象 4 テストファイル（`r2PresignVerify.test.ts` / `devObjectStorageHandler.test.ts` / `r2ObjectStorage.test.ts` / `serverCloudflare.test.ts`）を実行し **158 件全 PASS** を確認。ゴールデン値（`r2ObjectStorage.test.ts:109-121`）は Round 1 で main の変更前実装から独立再生成して byte-identical を確認済みで、以降テストファイルのゴールデン文字列に変更はない（git log で確認）。

## Round 1 指摘（W-001〜W-003）の修正妥当性

- **W-001 → 修正済み・妥当。** 提案どおりエントリ前段の判定が純関数 `resolveDevObjectStorageGate`（`app/core/adapters/cloudflare/devObjectStorageHandler.ts:17-28`）に切り出され、`devObjectStorageHandler.test.ts:310-368` で flag `{undefined, "false", "TRUE", "1"}` の pass-through（厳密 `"true"` 比較の固定）、prefix 外パスの pass、env 半端揃い 3 通りの `not_found`、全揃いの `handle` を網羅。`app/server.cloudflare.ts:81-97` がこの関数を実際に配線していることも確認した。テスト対象とエントリ実装が同一関数なので回帰検知が効く。
- **W-002 → 修正済み・妥当。** `r2PresignVerify.test.ts:235-296` に malformed 専用 describe が追加され、(a) X-Amz-Date 形状不正、(a') 形状は合うが存在しない日付（NaN Date — 実装側にも新規ガード `r2PresignVerify.ts:89-92` が追加され、テストとペアで入った）、(b) Expires `"60.5" / "" / "1e3" / "0" / "-60"` の `it.each` + 7日上限超過（`MAX_EXPIRES_SECONDS`、これも実装強化とペア）、(c) SignedHeaders 欠落、(d) Algorithm 別値、をすべて `reason: "malformed"` の完全一致で固定。指摘した `Number()` の罠（`"1e3"` 等）も実装の `/^\d+$/` ガードとテスト両方で潰されている。
- **W-003 → 修正済み・妥当。** 期限境界の 2 点テスト（ちょうど期限時刻 = ok（`r2PresignVerify.test.ts:197-207`）、+1ms = expired（:209-219））が追加され、`>` 仕様（境界有効）が固定された。`>=` への変更で落ちる。ハンドラ側 GET の期限切れ 403 も追加（`devObjectStorageHandler.test.ts:188-204`）。

## 計画との照合

- **AC-4**: verify 拒否（署名改竄・後付けクエリ・期限切れ・メソッド不一致・別 accessKeyId・別 secret・Content-Type 不一致/欠落・malformed 各分岐）+ ハンドラ 403（PUT/GET、未署名含む）/404（bucket 不一致・キー無し・オブジェクト無し・不正 percent-encoding）/405 — 計画のテスト方針の列挙をすべて満たし、超過カバーしている。**充足。**
- **AC-5**: DI テスト（thread / 未設定時キー不在を `Object.hasOwn` で `exactOptionalPropertyTypes` 整合まで確認 / `r2PresignReady` を flip しない、`serverCloudflare.test.ts:183-217`）+ byte-identical ゴールデン 2 本 + ゲート pass-through テスト。**充足。**
- **ゴールデン / ラウンドトリップ**: 計画ステップ2・5 の要求（実発行 URL を verify に通す、変更前実装由来ゴールデンの完全一致比較、fake timers 固定）どおり。パス付きエンドポイント（末尾スラッシュ正規化込み）も固定済み。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** GET 経路の percent-decode 対称性（署名は生 pathname / `bucket.get` はデコード済みキー）がテストされていない
  - 場所: `app/core/adapters/cloudflare/devObjectStorageHandler.test.ts:279-295`（PUT のみ）/ 実装 `devObjectStorageHandler.ts:55-80, 107`
  - 理由: 「raw で verify / decoded で put」の対称性は PUT 側（`"owner/source/file name.png"`）で固定されているが、GET 側は ASCII 安全なキーのみ。デコードが必要なキーで「PUT で格納 → 同じキーの presignDownload → GET 200 で同一バイト」が通ることは AC-3（表示経路完走）の核心であり、GET だけ `decodeURIComponent` を外す・raw キーで `get` する、といった片側回帰を現状のテストは検知できない。
  - 提案: 既存の PUT 対称性テストを拡張し、格納後に同キーの presignDownload URL で GET して 200 + body 一致まで確認する store-and-serve ラウンドトリップ 1 本を追加する。

#### Notes

- **[N-001]** `R2_S3_ENDPOINT: ""`（空文字）が truthiness（`serverCloudflare.ts:371`）で「未設定」扱いになる仕様に直接のテストがない。`.dev.vars.example` が空文字クレデンシャルを前提に説明している env 群なので、空文字 endpoint → `endpoint` キー不在を 1 ケース固定しておくと安心（既存 3 テストの並びに自然に足せる）。
- **[N-002]** `constantTimeEqualHex` の長さ不一致 early return は依然間接カバレッジのみ（改竄テストはすべて同長 64 hex）。短い/長い署名でも `signature_mismatch` になることの 1 ケースは安価（Round 1 N-007 の持ち越し。用途上は許容）。
- **[N-003]** パス分解の `slash <= 0` 分岐のうち `slash === 0`（`/dev/r2//key` — 空 bucket セグメント）は未踏（末尾スラッシュ = キー無しのみテスト）。404 で安全に落ちることは実装上明らかで優先度低。
- **[N-004]** fix コミットで実装に追加された防御（NaN 日付ガード・7日上限・`URIError` → 404 正規化・GET の `nosniff` + `attachment` デフォルト）がすべて対応テストとペアで入っている点は良い。テスト無しの「ついで実装強化」が無い。
- **[N-005]** 405 テスト（DELETE）は署名検証より前段で返る実装順序に依存するが、ステータスのみの検証なので実装順序を入れ替えても壊れない適切な強度。
- **[N-006]** R2 フェイク（in-memory Map、`put`/`get` 最小面 + `as unknown as R2Bucket`）と presign 側 bare cast の使い分けは既存アダプターテストの流儀どおりで過不足なし。403 時 `store.size === 0` の副作用検証も維持されている。

## 判定

Blocker なし。Round 1 の W-001〜W-003 はいずれも提案どおり（またはそれ以上に）修正されており妥当。AC-4 / AC-5 の充足判定に必要なテストは計画どおり揃い、158 件全 PASS。W-001（GET 経路の decode 対称性）は対応推奨だがマージブロックではない。

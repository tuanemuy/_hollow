# PR #662 レビュー — Round 2（Adapter / Infrastructure）

レビュー観点: Infrastructure / Adapter 層（SigV4 署名生成・検証、R2 binding 操作、エラー翻訳、レイヤー配置・依存方向、DI 配線、wrangler 設定）。ゼロベースのフルレビュー。

検証実施内容:
- `gh pr diff 662` 全差分精読、plan.md 受け入れ基準（AC-1/2/5）との照合
- PR head（`147372ad`）を一時 worktree に展開し、`r2Sigv4.ts` / `r2PresignVerify.ts` / `devObjectStorageHandler.ts` / `r2ObjectStorage.ts` / DI（`serverCloudflare.ts`）/ エントリ（`server.cloudflare.ts`）/ `wrangler.toml` を実体で精読
- 新規・変更4テストファイル（`r2PresignVerify.test.ts` / `devObjectStorageHandler.test.ts` / `r2ObjectStorage.test.ts` / `serverCloudflare.test.ts`）を実行 → **158 件全 PASS**（Round 1 の 135 件から境界・malformed・ゲートテストが追加）
- 署名生成と検証の canonical form（query 再構築、raw pathname、SignedHeaders 順序依存、ホスト導出）を手動で突き合わせ — 乖離なし
- presign 呼び出し箇所を全数 grep し、consumer ワーカー側に presign 経路がないことを確認

## Round 1 指摘の修正確認

- **W-001（不正 percent-encoding で `URIError` → 500）: 修正済み・妥当。** `devObjectStorageHandler.ts` のキー decode が `try / catch` で包まれ、`URIError` を 404 に正規化（コメントで WHY も明記）。修正コミット `147372ad` には併せて GET レスポンスの硬化（`x-content-type-options: nosniff` + デフォルト `content-disposition: attachment`）、期限検証の強化（`X-Amz-Expires` の strict-decimal チェック・7日上限・非実在カレンダー日付の malformed 化）、ゲート抽出（`resolveDevObjectStorageGate`）と境界テスト追加が含まれる。いずれも検証セマンティクスを弱めておらず、テストで固定されている。

## Adapter

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** AC-1/AC-2 充足確認: presign は `R2_S3_ENDPOINT` のパスプレフィックスを保持して `/dev/r2/<bucket>/<key>` を署名し、dev プロキシが同一 SigV4 検証の後にローカル miniflare の `OBJECT_STORAGE` binding に put/get する。finalize の `stat` と同一 binding（verify は raw pathname、binding 操作は decode 済みキーという対称性も実装・コメント・テストで固定）。same-origin 終端のため preflight は構造的に発生しない。手動 E2E 記録（TC-1〜TC-5 PASS）とも整合。
- **[N-002]** AC-5 充足確認: `wrangler.staging.toml` / `wrangler.production.toml` は本 PR で未変更（差分ファイル一覧で確認）。新規 env 2 件は LOCAL DEV ONLY の `wrangler.toml [vars]` のみに追加され、staging/production への追加禁止コメントあり。DI は `R2_S3_ENDPOINT` truthy 時のみ `endpoint` キーを条件付き spread し（unset 時はキー自体が不在であることをテストで固定）、`r2PresignReady` の判定条件は不変。デフォルトエンドポイントの presign 出力は fake-timers + ゴールデン文字列の byte-identical テストで旧実装と完全一致が固定されている。
- **[N-003]** Round 1 修正で追加された `resolveDevObjectStorageGate`（純関数）への抽出は良い設計: フラグの strict `"true"` 比較・プレフィックス判定・binding/presign 構成の欠落時 404 がエントリから単体テスト可能になり、`server.cloudflare.ts` 側の分岐は gate の戻り値で機械的に分かれる。adapters 層配置・エントリからの直接 import は `InlineRelayTrigger` の前例どおりで、presentation → adapters の依存は発生していない。
- **[N-004]** verify の canonical headers は `X-Amz-SignedHeaders` パラメータの順序をそのまま使い、明示的な再ソートをしない。これは安全: パラメータ自体が署名対象なので、順序を改竄すれば canonical request が変わり署名不一致で落ちる。正規の URL は signer がソート済み順で発行するため一致する。内部整合がテスト（SignedHeaders 改竄ケース）で確認済み。
- **[N-005]** 403 レスポンスボディに verify の `reason`（malformed / expired / signature_mismatch 等）を含めて返す。攻撃者に期限切れと署名不一致を区別させるが、S3 本家も同等のエラー区別を返すためセマンティクス上の問題はなく、dev 専用ルートでは診断性の利点が勝る。
- **[N-006]** `wrangler.toml` の `[env.consumer]` には `R2_S3_ENDPOINT` を追加していないが、これは正しい: presign 呼び出し（`uploadMediaPresigned` / `downloadExportArtifact` / `view` / `downloadMedia` / `uploadMedia`）はすべてリクエストパスのユースケースで、consumer ワーカーに presign 経路はない。将来 consumer 側で presign する場合のみ追従が必要（現状対応不要）。
- **[N-007]** GET 硬化（`nosniff` + デフォルト `attachment`）は本番誤有効化時に user-uploaded HTML/SVG の same-origin レンダリングを防ぐ追加防御で、`attachment` は `<img>` 等のサブリソース読み込みに影響しないため `/media/<id>` 表示経路（AC-3 側）は壊れない。署名済み `response-content-disposition` の反映も R2 本体の挙動と一致。
- **[N-008]** `constantTimeEqualHex` の長さ不一致 early-return は、期待値（自前計算 hex）が固定長 64 のため情報漏えいにならない。`X-Amz-Expires` の strict-decimal 化（`1e3` 排除）と `parseAmzDate` の Invalid Date 排除（NaN 比較による期限チェック素通りの穴）は Round 1 後の自主的強化として正しい。

## 結論

Blocker・Warning なし。Round 1 W-001 は修正済みで、修正コミットに含まれる追加硬化（GET ヘッダ・期限検証・ゲート抽出）もすべて妥当。署名生成/検証の整合、presign 出力の byte-identical 不変、staging/production 不変（AC-1/AC-2/AC-5）はコード・テスト（158 件 PASS）・手動 E2E 記録の三点で充足している。Adapter 観点で本 PR はマージ可能。

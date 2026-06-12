# PR #662 レビュー — Test 観点（Round 1）

レビュー対象: `feat(dev): presigned アップロードを same-origin dev プロキシで終端しローカル E2E を完走可能に`
計画: `.issue/657/plan.md`（AC-4 / AC-5 のユニットテスト充足、byte-identical ゴールデン、presign↔verify ラウンドトリップ）

検証実施: 対象 4 テストファイルを実行（135 件全 PASS）。さらに **ゴールデン値の出自を独立検証** — `git show main:app/core/adapters/cloudflare/r2ObjectStorage.ts`（変更前実装）を取り出し、同一固定時刻（`2026-06-13T00:00:00Z`）・同一クレデンシャルで presignUpload / presignDownload を実行し、テスト内のゴールデン文字列（署名 hex 含む）と byte-identical であることを確認した。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** エントリポイントの dev プロキシゲート（`R2_DEV_OBJECT_PROXY === "true"` && `/dev/r2/` プレフィックス分岐、および binding / presign env 欠落時の 404 フォールバック）に自動テストがない
  - 場所: `app/server.cloudflare.ts`（PR 内で追加された fetch 分岐）
  - 理由: AC-5 の「フラグ未設定なら dev プロキシルートは無効」という主張のうち、DI 側（`serverCloudflare.test.ts`）と presign 出力（byte-identical）はテストで固定されているが、ルートが実際に不活性になるかは「wrangler 設定レビュー + 手動 E2E」のみに依存している。フラグ判定が `=== "true"` の厳密比較であること（`"TRUE"` / `"1"` では無効）や、env 半端揃い時に 404 へ落ちる分岐は回帰検知の網の外。計画の AC-5 充足判定の定義上は plan 準拠だが、安全ゲートとしてはユニットで固定する価値が高い。
  - 提案: `buildDevObjectStorageResponse` を呼ぶ前段の判定（フラグ値・パス・必須 env の揃い）を小さな純関数として切り出し、`{ flag: undefined / "false" / "true" } × { binding あり/なし }` の表でテストする。エントリ全体の統合テストまでは不要。

- **[W-002]** `verifyPresignedRequest` の `malformed` 系分岐のカバレッジが「SigV4 パラメータ皆無」の 1 ケースのみ
  - 場所: `app/core/adapters/cloudflare/r2PresignVerify.ts:71-77` / `app/core/adapters/cloudflare/__tests__/r2PresignVerify.test.ts:197-205`
  - 理由: 実装には (a) `X-Amz-Date` フォーマット不正（regex 不一致）、(b) `X-Amz-Expires` が非整数・0・負、(c) 必須パラメータの個別欠落（例: `X-Amz-SignedHeaders` だけ無い）、(d) `X-Amz-Algorithm` が別値、という独立した `malformed` 分岐があるが、テストは「クエリが一切ない URL」しか踏まない。これらは攻撃者制御の入力を最初に受ける防御線であり、ADR-002 が「本番誤有効化時の安全根拠」として verify を本番品質と位置づけている以上、分岐ごとの拒否テストが欲しい。特に (b) は `Number("60.5")` / `Number("")` / `Number("1e3")` のような JS の数値変換の罠を含む。
  - 提案: presign 済み URL の該当パラメータを書き換える形で、(a)〜(d) を各 1 ケース追加する（書き換えにより署名も壊れるが、`malformed` 判定は署名検証より前なので reason の判別可能性を検証できる）。

- **[W-003]** 期限切れ判定の境界値（ちょうど期限時刻）と GET 経路の期限切れがテストされていない
  - 場所: `app/core/adapters/cloudflare/r2PresignVerify.ts:86`（`Date.now() > issuedAt + expires*1000` — 境界は有効扱い）/ `__tests__/r2PresignVerify.test.ts:118-128`（期限+1秒のみ）/ `devObjectStorageHandler.test.ts:119-138`（期限切れは PUT のみ）
  - 理由: fake timers で時刻を完全制御できる環境なのに、`>`（境界は有効）という仕様が「期限ちょうど」のテストで固定されていない。誰かが `>=` に変えても全テストが通ってしまう。AWS SigV4 の実挙動（期限時刻ちょうどは有効）との整合を仕様として固定すべき。
  - 提案: `vi.setSystemTime(issuedAt + 60_000)` で `{ ok: true }`、`+ 60_001` で `expired` の 2 点境界テストを追加。ハンドラ側 GET の期限切れは verify 共有のため必須ではない（Note 相当）が、追加コストはほぼゼロ。

#### Notes

- **[N-001]** ゴールデン値は本物。`r2ObjectStorage.test.ts:102-122` の 2 本のゴールデン URL（署名 hex 含む）を、main の変更前実装 + 同一固定時刻で再生成して完全一致を確認した。計画ステップ5 の「変更前実装由来のゴールデン値で byte-identical 固定」は誠実に実装されている。`vi.useFakeTimers()` + `vi.setSystemTime()` の使い方（beforeEach で固定 / afterEach で `useRealTimers`）も全ファイルで一貫しており正しい。
- **[N-002]** ラウンドトリップテストの設計が良い。`presignUpload` / `presignDownload`（filename あり/なし、非 ASCII filename、デフォルトエンドポイント、パス付きエンドポイント）の実発行 URL をそのまま verify に通しており、「生成と検証の同一 canonical 形」という ADR-002 の核心を直接固定している。署名後のクエリ後付け（`response-content-disposition` 追加）が落ちるテスト（test:106-116）は Issue #452 型の改竄を回帰検知できる。
- **[N-003]** 拒否テストの reason 判別（`signature_mismatch` / `credential_mismatch` / `expired` / `malformed`）を `toEqual` の完全一致で固定しているため、「拒否はされるが理由が違う」誤実装も検知できる。secret 違い（accessKeyId 一致）→ `signature_mismatch`、accessKeyId 違い → `credential_mismatch` の区別テストも丁寧。
- **[N-004]** ハンドラテストの副作用検証が堅い。403 ケースで `store.size === 0`（拒否時に格納されない）まで確認しており、ステータスコードだけの表面的テストになっていない。percent-decode 対称性（生 pathname で verify / デコード済みキーで put — `devObjectStorageHandler.test.ts:256-272`）は計画ステップ3 で「仕様として固定する」とされた非対称をそのままテスト化している。
- **[N-005]** R2 binding のフェイクは in-memory Map で `put`/`get` の最小面のみ実装し `as unknown as R2Bucket` でキャスト — 既存アダプターテストの流儀どおりで、モック過剰でも不足でもない。presign 側は binding に触れないことをコメントで明示した上で bare cast（`r2ObjectStorage.test.ts:54-57`）。
- **[N-006]** DI テスト（`serverCloudflare.test.ts:183-219`）は thread / 未設定時のキー不在（`Object.hasOwn` で `exactOptionalPropertyTypes` 整合まで確認）/ `r2PresignReady` を flip しない、の 3 点を押さえており AC-5 の DI 側充足として十分。
- **[N-007]** `constantTimeEqualHex` の長さ不一致 early return は許容（署名長は公開情報）。ただし同関数自体の直接テストはなく、tampered-signature テスト経由の間接カバレッジのみ。現状の用途では十分。

## 判定

Blocker なし。AC-4（verify 拒否 + ハンドラ 403/404 のユニット PASS）と AC-5（DI テスト + byte-identical ゴールデン）は計画どおり充足。ゴールデン値の真正性も独立検証済み。W-001〜W-003 は防御線の網羅性強化であり、対応推奨だがマージブロックではない。

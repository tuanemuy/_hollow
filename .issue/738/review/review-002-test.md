# PR #765 レビュー（2回目・フルレビュー） — Test 観点

対象 PR: #765 / Issue #738 / 計画: `.issue/738/plan.md`
観点: Test（adapter 境界網羅・ping・registry dispatch・構成解決の自動テスト・命名規約・フレーク・assertion の質）
検証する受け入れ基準: AC-7（構成解決の自動テスト）/ AC-8（adapter 境界・ping・registry dispatch）。AC-1（registry 網羅）の自動テスト部分も含む。
前回レビュー: review-001-test.md（N-001 WHY コメント済み、ping err_code 接頭辞テスト更新済み — 本レビューで再確認・蒸し返さない）

## 総評

ゼロベースで再検証した結果、AC-7 / AC-8 はいずれも満たされている。Blocker なし。

- 実行確認: 単体（deepgram / registry / buildSpeechRecognitionProvider / valueObject / schema）129 件 green、構成解決の integration 21 件 green。計 150 件すべて通過。
- adapter 境界（2xx transcript 抽出 / 401+category / 429 / 500 / timeout(DOMException) / 空発話4種 / 空 apiKey 事前ガード / 非 JSON 2xx / secret マスク）が OpenAI と対称に揃う。
- ping（2xx→ok:true + Token ヘッダ / 401 err_code 接頭辞 / err_code 無しは接頭辞省略 / 非 JSON→HTTP502 fallback / timeout→timed out / TypeError→network カテゴリ / secret マスク / 空 apiKey / 空 model）が網羅。
- registry dispatch 専用テスト（`speech/__tests__/registry.test.ts`）が実 registry を**モックせず** import し、`speechProviderRegistry.deepgram === deepgramSpeechAdapter`・`lookupSpeechAdapter("deepgram")` non-undefined・未知/空文字列→undefined を検証。計画 [arch S-003] どおり、`lookupSpeechAdapter` をモックする既存 `speechConnectionTester.test.ts` の穴を正しく埋めている。
- 構成解決（env>db>stub・SecretBox 復号・deepgram の registry 流入）が fake env / 実 WebCryptoSecretBox / 実 Miniflare D1 で CI 化されている。`resolveConsumerSpeechConfig` 直叩きで env>db の軸別優先まで seam 検証。
- assertion は実体クラス / status 文字列 / sanitize category(`auth_failed`) / timeout wording(`timed out`) / network category / secret 非含有(`***`) まで踏み込んでおり、緩すぎる箇所は無い。
- 前回更新点を実検証で再確認: ①ping `INVALID_AUTH: bad credentials` 接頭辞は `maskSecrets`-only パス（カテゴリ付与なし）の実装と一致。②entity.test.ts / valueObject.test.ts の「unknown provider 拒否」ケースが `deepgram` から `whisper-x` に正しく差し替わっている（deepgram が valid になったため必須の修正）。

下記は意図的非対称の明示と軽微な未カバー分岐の Note のみ。

## Test

### Blockers

なし

### Warnings

なし

### Notes

#### [N-001] ping で「err_code あり / message 無し」の error body は err_code 接頭辞が落ちて `HTTP {status}` に縮退する（未カバー分岐）

- 場所: `app/core/adapters/deepgram/speechConnectionPing.ts:101-112`
- 内容: `code` は `body.err_code` から抽出されるが、`detail` への反映は `if (message)` ブロック内でのみ行われる。したがって error body が `{ err_code: "INVALID_AUTH" }`（message/err_msg/reason がすべて欠落）の場合、err_code 接頭辞は適用されず `reason: "HTTP {status}"` になる。これは合理的なフォールバック（コード単独より status の方が情報量がある場面もある）で実害は無いが、テストは「err_code + message あり」（接頭辞付与）と「err_code 無し + message あり」（接頭辞省略）の2系のみで、この第3系（err_code のみ）が未カバー。Deepgram の 401 は実運用で `err_msg` を伴うことが多いため優先度は低い。
- 提案: ブロッカーではない。任意で `{ err_code: "X" }`（message 無し）→ `reason: "HTTP 401"` を1ケース足すと、err_code 抽出のスコープ（message に依存する）が回帰で固定される。transcribe 側の error mapping も同じ構造だが、こちらは `detail` の category 化のみで err_code を使わないため影響無し。

#### [N-002] OpenAI 側のサイズ上限ガードのテスト（境界値3ケース）に Deepgram の対称物が無い（意図的非対称・確認済み）

- 場所: `app/core/adapters/deepgram/__tests__/speechRecognitionProvider.test.ts`（`pre-flight guards` describe）/ 対比 `app/core/adapters/openai/__tests__/speechRecognitionProvider.test.ts:153-175`
- 内容: OpenAI adapter は 25 MiB 事前サイズガードを持ちテスト3ケース（超過で fetch 未呼び / 境界ちょうど通過）を押さえるが、Deepgram は plan.md:87・実装コメント（`speechRecognitionProvider.ts:124-126`「No pre-flight size guard ... left to the request timeout（ADR-001 / plan.md）」）どおりサイズガードを実装していない。テスト不在は実装と一致しており**正しい**。前回 review-001 [N-001] で要望された WHY コメントは既にコード上に存在することを確認。テスト追加不要。
- 提案: 対応不要。記録のみ。

#### [N-003] 既存 dispatch テストの「unregistered」ケースが `provider: "deepgram"` ラベルを使い、registry 登録後は文言がねじれる

- 場所: `app/core/application/di/__tests__/speechConnectionTester.test.ts:106-114`（本 PR の diff 対象外ファイル）
- 内容: 当該ケースは `mockedLookup.mockReturnValueOnce(undefined)` で lookup を強制 undefined にして tester の防御パス（未登録 provider → `ok:false`）を検証する。冒頭で `lookupSpeechAdapter` を `vi.mock` しているためラベルは実 registry と無関係だが、本 PR で deepgram が実 registry に登録された後は「provider is unregistered」+ `provider:"deepgram"` が事実とねじれて読める。registry dispatch の実検証は新設 `speech/__tests__/registry.test.ts` が担保しており機能的な穴は無い。
- 提案: 任意。ダミー provider（例 `"whisper-x"` — buildSpeechRecognitionProvider.test.ts:53 / registry.test.ts:33 と同じ慣習）に差し替えると意図が明確になる。本 PR スコープ外ファイルのため見送り可。

#### [N-004] timeout テストは実 setTimeout 依存だがフレーク要因は実務上無視できる（確認済み）

- 場所: `speechRecognitionProvider.test.ts:202-226` / `speechConnectionPing.test.ts:103-122`
- 内容: `timeoutMs: 5` の実タイマーで abort を発火、fetch モックは abort イベントでのみ reject する。fake timer 不使用で実時間依存だが、解決待ち Promise は abort 以外に resolve/reject 経路を持たないため、CI 遅延で 5ms を超過しても最終的に必ず abort→reject に到達する。早発火で誤判定する経路も無い。実害のあるフレークにはならない。OpenAI 側も同方式で一貫。
- 提案: 対応不要。記録のみ。

## 観点別チェック結果（参考）

- adapter 境界網羅（AC-8）: 2xx（transcript 抽出 + raw body 直送・`init.body === INPUT.audioBytes`・`not.toBeInstanceOf(FormData)` の assertion）/ 401（`HTTP 401` + `auth_failed` category）/ 429 / 500（`HTTP 500`）/ timeout（DOMException AbortError → `timed out`）/ 空発話（transcript 欠落 `{results:{}}` ・空配列 alternatives ・whitespace-only → `""` の複数パターン）/ 空 apiKey（fetch 未呼び assertion）/ 非 JSON 2xx → SpeechFailureError / secret マスク（`sk-...` 非含有）。OpenAI と対称。✓
- ping（AC-8）: 2xx→`ok:true`（`/v1/projects` GET + `Token` ヘッダ検証）/ 401 err_code 接頭辞（`INVALID_AUTH: bad credentials`）/ err_code 無し→接頭辞省略 / 非 JSON→`HTTP 502` / timeout→`timed out` / TypeError→`network: ...` / secret マスク（`***` 残存）/ 空 apiKey→`API key is empty` / 空 model→`model is empty`（OpenAI UX 対称）。✓（[N-001] の err_code-only 分岐のみ未カバー）
- registry dispatch 専用テスト（AC-1/AC-8）: 実 registry をモックせず import し deepgram/openai の登録・解決・未知文字列 undefined を検証。✓
- 構成解決の自動テスト（AC-7）: integration で `ADMIN_SPEECH_PROVIDER=deepgram`→`DeepgramSpeechRecognitionProvider` インスタンス化を実 D1 + 実 SecretBox で検証。env>db 軸別優先・SecretBox 復号・model 欠落 Stub fallback・decrypt 失敗 Stub fallback を `resolveConsumerSpeechConfig` 直叩きで seam 検証。`buildSpeechRecognitionProvider.test.ts` が provider 文字列→adapter 実体（deepgram/openai/stub/未登録 typo→Stub）を網羅。✓
- ドメイン / schema（補助）: `valueObject.test.ts` が providers === ["openai","deepgram"]・deepgram+nova-3 受理・unknown(`whisper-x`)→`InvalidSpeechProvider` を検証。`schema.test.ts:197` が `SPEECH_PROVIDERS_TRANSPORT === ["openai","deepgram"]`（transport 二重定義の同期）を検証。`entity.test.ts` の reconstruct unknown-provider ケースも `whisper-x` に更新済み。✓
- 命名規約: stubbed fetch のユニットは `*.test.ts`、実 Miniflare D1 を使う構成解決は `*.integration.test.ts` で適切に分離。`errorCodeNaming.test.ts` への影響なし（新 ErrorCode 増加なし・既存 `InvalidSpeechProvider` 再利用）。✓
- assertion の質: `toBeInstanceOf` 止まりでなく status 文字列・sanitize category・timeout wording・network category・secret 非含有まで踏み込む。モックが本質を隠す箇所なし。✓
- 実行: 単体 129 件 + integration 21 件 = 150 件すべて green。✓

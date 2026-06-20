# PR #765 レビュー — Test（文字起こしプロバイダのテスト網羅）

対象 PR: #765 / Issue #738 / 計画: `.issue/738/plan.md`
観点: Test（adapter 境界網羅・ping・registry dispatch・構成解決の自動テスト）
検証範囲の受け入れ基準: AC-7（構成解決の自動テスト）/ AC-8（adapter 境界・ping・registry dispatch）

## 総評

AC-7 / AC-8 はいずれも満たされている。adapter 境界（2xx/4xx/5xx/timeout/空発話/空 apiKey）・ping（2xx→ok:true、非 2xx/timeout→ok:false+reason、secret マスキング、空 model→ok:false）が OpenAI テストと対称に揃っており、registry dispatch の専用テスト（実 registry import・モックなし）も新設、構成解決（env>db>stub・SecretBox 復号・deepgram の registry 流入）も fake env / 実 SecretBox / 実 D1 で CI 化されている。`pnpm vitest run`（deepgram / registry / buildSpeechRecognitionProvider）は 33 件すべて green。assertion は status 文字列・category（`auth_failed`）・wording（`timed out`）・実体クラスまで踏み込んでおり、緩すぎる箇所は見当たらない。Blocker なし。

下記は対称性の意図的な欠落（サイズガード）と、既存 dispatch テストの「deepgram」ラベルがやや誤読を招く点の Note のみ。

## Test

### Blockers

なし

### Warnings

なし

### Notes

#### [N-001] OpenAI 側に存在するサイズ上限ガードのテスト（境界値 3 ケース）に Deepgram の対称物が無い

- 場所: `app/core/adapters/deepgram/__tests__/speechRecognitionProvider.test.ts`（`pre-flight guards` describe）/ 対比 `app/core/adapters/openai/__tests__/speechRecognitionProvider.test.ts:153-175`
- 理由: OpenAI adapter は 25 MiB の事前サイズガードを持ち、テストで「上限超過で fetch 未呼び」「境界ちょうどで通過」の 3 ケースを押さえている。Deepgram adapter は計画 plan.md:87（「上限ガードは設けず timeout に委ねる」）どおりサイズガードを実装していないため、対応テストが無いのは実装と一致しており**正しい**。ただしレビュー観点「OpenAI と対称」の文面上は欠落に見えるため、意図的非対称であることを明示しておく。adapter 実装（`speechRecognitionProvider.ts`）にもサイズガード不在の WHY コメントが無く、将来「対称化漏れ」と誤読されうる。
- 提案: ブロッカーではない。任意で adapter 側に「サイズガードは設けず timeout に委ねる（ADR-001 / plan.md）」の 1 行コメントを置くと、テスト不在が意図であることがコード上でも追跡できる。テスト追加は不要。

#### [N-002] 既存 dispatch テストの「unregistered」ケースが `provider: "deepgram"` ラベルを使っており、registry に登録済みの今は誤読しやすい

- 場所: `app/core/application/di/__tests__/speechConnectionTester.test.ts:106-114`
- 理由: 当該ケースは `mockedLookup.mockReturnValueOnce(undefined)` で lookup 結果を強制 undefined にし、tester の防御パス（未登録 provider → `ok:false` + `Unsupported speech provider: deepgram`）を検証している。ファイル冒頭で `lookupSpeechAdapter` を `vi.mock` しているためラベルが実 registry 状態と無関係なのは設計どおりだが、本 PR で deepgram が実 registry に登録された後は「deepgram は未登録」と読める文言（テスト名 "provider is unregistered" + `provider:"deepgram"`）が事実とねじれる。registry dispatch の実検証は新設 `speech/__tests__/registry.test.ts` が担保しており、機能的な穴は無い。
- 提案: 任意。この防御ネットテストの provider ラベルを実在しないダミー（例 `"whisper-x"`、buildSpeechRecognitionProvider.test.ts:53 と同じ慣習）に変えると、「lookup が undefined を返したときの tester 挙動」という本来の意図が明確になる。

#### [N-003] timeout テストは実 setTimeout に依存するが、フレーク要因は実務上無視できる

- 場所: `speechRecognitionProvider.test.ts:202-226` / `speechConnectionPing.test.ts:88-107`
- 理由: `timeoutMs: 5` の実タイマーで abort を発火させ、fetch モックは abort イベントで reject する設計。fake timer ではなく実時間依存だが、解決を待つ Promise は abort 以外に resolve 経路を持たない（モックは abort でしか reject しない）ため、CI 遅延で 5ms を超過しても最終的に必ず abort→reject に到達する。早発火で誤判定する経路も無い。実害のあるフレークにはなりにくい。
- 提案: 対応不要。記録のみ。

## 観点別チェック結果（参考）

- adapter 境界網羅（AC-8）: 2xx（transcript 抽出 + raw body 直送 / FormData 不使用の assertion 含む）/ 401（status + `auth_failed` category）/ 429 / 500（status）/ timeout（DOMException AbortError → `timed out` wording）/ 空発話（transcript 欠落・空・空配列・whitespace → `""` の 4 パターン）/ 空 apiKey（fetch 未呼び）/ 非 JSON 2xx / secret マスキング — OpenAI と対称に揃う。✓
- ping（AC-8）: 2xx→`ok:true`（`/v1/projects` GET + `Token` ヘッダ検証）/ 401 provider message / 非 JSON→`HTTP 502` fallback / timeout→`timed out` / TypeError→`network:` category / secret マスキング（`***` 残存検証）/ 空 apiKey→`API key is empty` / 空 model→`model is empty`（OpenAI UX 対称）。✓
- registry dispatch 専用テスト（AC-1/AC-8）: `speech/__tests__/registry.test.ts` が実 registry を**モックせず** import し、`speechProviderRegistry.deepgram === deepgramSpeechAdapter`・`lookupSpeechAdapter("deepgram")` non-undefined・未知文字列/空文字列が `undefined` を検証。計画 [arch S-003] の意図どおり、`lookupSpeechAdapter` をモックする既存テストの穴を埋めている。✓
- 構成解決の自動テスト（AC-7）: `createConsumerContainer.integration.test.ts` が `ADMIN_SPEECH_PROVIDER=deepgram` で `DeepgramSpeechRecognitionProvider` がインスタンス化されることを実 D1 + 実 WebCryptoSecretBox で検証。さらに env>db 優先・SecretBox 復号・model 欠落 Stub fallback・decrypt 失敗 Stub fallback を `resolveConsumerSpeechConfig` 直叩きで seam 検証。`buildSpeechRecognitionProvider.test.ts` が provider 文字列 → adapter 実体（deepgram/openai/stub/未登録 typo→Stub）を網羅。✓
- ドメイン / schema（補助）: `valueObject.test.ts` が `SpeechRecognitionConfig.providers === ["openai","deepgram"]`・deepgram+nova-3 受理・未知 provider→`InvalidSpeechProvider` を検証。`schema.test.ts:197` が `SPEECH_PROVIDERS_TRANSPORT === ["openai","deepgram"]`（transport 二重定義の同期）を検証。✓
- テスト命名規約: stubbed fetch のユニットは `*.test.ts`、実 Miniflare D1 を使う構成解決は `*.integration.test.ts` で適切に分離。✓
- assertion の質: 単なる `toBeInstanceOf` に留めず、status 文字列・sanitize category・timeout wording・secret 非含有まで踏み込む。モックが本質を隠す箇所は無し。✓

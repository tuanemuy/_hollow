# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #766）

対象: `.issue/766/plan.md` / `.issue/766/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

実コードでの検証結果（要約）:
- `messagesClient.ts` の `callGeminiGenerate` は **REST `fetch` + `x-goog-api-key` ヘッダ**（SDK ではない）。timeout は `AbortController`、`isAbortError` は `DOMException`/`Error` 両対応で workerd AbortError を timeout 扱い、空 parts → `""`、エラーは注入 `mapper` に委譲（429→rateLimit / 401-403→quota / 5xx→unavailable / **その他（400 含む）→ unavailable**）。→ ADR-001 の「port 契約は `callGeminiGenerate` 流用で自動的に満たされる」は正しい。
- `pingGemini` は `maxOutputTokens:1` の最小 `generateContent`、空 apiKey で `ok:false`、never-throw の discriminated result。`geminiAdapter.ping` と同型。→ ADR-002 の probe 流用は `SpeechAdapter.ping` 契約（`(cfg, apiKey, timeoutMs) => Promise<{ok, error?}>`）と整合。
- `speech/registry.ts` の `SpeechAdapter` 契約 / `SpeechAdapterConfig = {apiKey, model}` / `Record<SpeechProvider, SpeechAdapter>` 網羅 / `lookupSpeechAdapter` — deepgram/openai と対称に gemini を 1 行追加で載る。
- DI: `buildSpeechRecognitionProvider`（request 経路、`provider ?? "openai"` → `lookupSpeechAdapter` → `adapter.create`）/ `resolveConsumerSpeechConfig`（consumer 経路、env>db>stub + SecretBox 復号）はいずれも **provider 完全非依存**。registry 登録だけで両経路・env>db>stub・SecretBox が generic に通る。→ 計画の AC-4「配線は既存コードが担う」は正しい。
- 二重リスト: domain `SPEECH_PROVIDERS` は registry 網羅と DTO `SpeechProviderName` を駆動。transport `SPEECH_PROVIDERS_TRANSPORT` は form の `ProviderId = (typeof SPEECH_PROVIDERS_TRANSPORT)[number]` と zod enum を駆動。**両リストは相互にコンパイル時チェックされない独立リスト**で、form の 3 Record は transport 側にのみ追従する。計画は両方（step 2 / step 6）+ default-model 2 箇所を原子的更新と明記しており、見落としなし。

---

#### 問題点（要修正）

- **[P-001]** E2E フルパス検証は AC-1（webm/opus 受理可否）の判定として偽陽性リスクがある
  - 理由: `runIngestionJob.ts` L596-614 は **configured provider の `SpeechFailureError` を握り潰して `""` を返し**、degraded preview を組んでコミット可能にする（L612 `if (isSpeechFailureError(error)) return ""`）。`callGeminiGenerate` は webm 拒否の 400 を `mapper.unavailable` → `SpeechFailureError` にマップするため、**Gemini が webm を 4xx 拒否しても「録音 → 文字起こし → 構造化 → プレビュー → ノート保存」は空 transcript で “成功” してしまう**。plan step 8 / テスト方針 4 の「audio 取り込みフルパス … ノート保存まで通す」だけで判定すると、拒否を「無発話」と取り違えて誤って Accepted にしうる。これは本 Issue の中核ゲート判断（ADR-003）の妥当性を損なう。
  - 提案: AC-1 の合否は **必ず Gemini への実 HTTP レスポンス（2xx か 4xx か）と非空 transcript をネットワーク/アダプタ層で確認**することを step 8・テスト方針に明示する（DevTools Network、または adapter に一時ログ、もしくはテスト方針 6 の「adapter を実 Gemini に直当てして 2xx + transcript」を**主**手段に格上げ）。「ノートが保存できた＝受理 OK」は禁止条件として明記する。

- **[P-002]** `MAX_AUDIO_BYTES = 20MiB`（raw）は Gemini inline の実上限を超えうる
  - 理由: ADR-001 は「Gemini inline 上限に合わせ保守的に 20MiB」とするが、`callGeminiGenerate` は音声を **base64 で JSON body に inline 投入**する。Gemini の inline 制約は「総リクエストサイズ 20MB 超は Files API を使え」であり、20MB は**エンコード後の総ペイロード**に効く。raw 20MiB は base64 で約 27〜28MB になり 20MB 制約を超える。録音 UI の `maxIngestionBytes` 既定は 32MiB、OpenAI は 25MiB プリフライトのため、15〜20MiB の実録音は現実的に発生し、**ガードを通過したのに Gemini が 4xx 拒否**する穴になる（しかも P-001 により E2E では空 transcript として隠れる）。OCR アダプタが 5MB に絞っているのは偶然ではない。
  - 提案: ガードを raw ではなく base64 後/総リクエストサイズ基準にするか、raw 上限を約 14MiB（base64 ≈ 19MB で 20MB 未満）に下げる。ADR-001 の「保守的に 20MiB」の根拠を base64 インフレ込みで再記述する。

#### 改善提案（検討推奨）

- **[S-001]** 計画本文の「Gemini SDK 配線」表現を REST に正す
  - 理由: Issue 背景 / plan.md 調査結果 L39 が「Gemini SDK の配線」「Gemini SDK 配線」と記すが、実体は `callGeminiGenerate` の **REST `fetch` + `x-goog-api-key`**（SDK 不使用）。ADR-001 は正しく `callGeminiGenerate` 流用（REST）と書けており設計方向は整合しているので、害は文言のみ。実装者が SDK 導入と誤読しないよう「REST `generateContent` 流用」に統一すると安全。

- **[S-002]** ADR-002 の「空 model は `pingGemini` 内で `ok:false`」は実装と厳密には不一致
  - 理由: `pingGemini` は空 apiKey は明示ガードするが、**空 model の明示ガードは無い**（model は URL に埋め込むだけ）。実害は無い—`SpeechRecognitionConfig.create` が model 非空を強制するため probe に空 model は到達せず、仮に到達しても 404 で `ok:false` になる。ただし ADR の記述精度として「空 model は VO で保証（probe では未ガードだが 404 で ok:false に落ちる）」と直すと正確。deepgram probe が UX 対称性のため明示的に空 model を弾いているのと挙動が割れる点も一言あると良い。

- **[S-003]** `geminiSpeechAdapter.create` が timeout/maxTokens を受け取れない点の明文化
  - 理由: registry の `SpeechAdapterConfig` は `{apiKey, model}` のみで、`timeoutMs=120_000` / `maxTokens=16_384` は `GeminiSpeechRecognitionProvider` コンストラクタ内で焼き込む必要がある（`GeminiSharedConfig` の既定は timeout 60_000 / maxTokens 4096 なので**明示上書きしないと openai/deepgram の 120s と非対称になる**）。OCR が `maxTokens ?? 16_384` で上書きしているのと同じパターン。plan step 3 / ADR-001 は値を挙げているが「既定を上書きする責務がコンストラクタにある」ことを実装注意として 1 行残すと取りこぼし防止になる。

#### 良い点

- 設計セクションが **domain union → transport list → adapter → registry → DI → UI → test → spec** とレイヤー内側→外側の順で構成され、ドメインに置くべきロジック（provider 列挙・default-model 不変条件）をドメインに、エラーマッピング/HTTP をアダプタに正しく配置している。ドメインロジックのアダプタ漏れは無い。
- 二重リスト（domain `SPEECH_PROVIDERS` / transport `SPEECH_PROVIDERS_TRANSPORT`）と default-model 2 箇所（valueObject INVARIANT コメント / UI `PROVIDER_DEFAULT_MODEL`）の独立性と原子的更新を正確に把握。実コードでも form の `ProviderId` は transport 側にのみ追従するため、計画の「両方を原子的に」は妥当。
- port 契約（`SpeechFailureError` のみ throw・空発話 `""`・workerd AbortError timeout）を `callGeminiGenerate` の既存実装が満たすという見立てが、実コード（`isAbortError`・`extractTextContent` 空→""・注入 mapper）と完全一致。独自 fetch を書かず ocr/pdf と対称にする判断は保守負荷最小で妥当。
- DI が provider 非依存 generic dispatch であり registry 登録だけで request/consumer 両経路・env>db>stub・SecretBox が通る、という分析が実コード（`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig`）通りで正確。ユースケース/DTO/DB スキーマ無変更の結論も正しい。
- implement-then-verify + コード差分を 1 独立コミット化 + 検証 NG 時 `git revert`、spec/ADR 更新は別コミットで revert 対象外、という戦略は diff-only な本変更と相性が良く現実的。`.issue/738` ADR-002 の Superseded/Accepted 分岐の引き継ぎも明記されている。

# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #766）

対象: `.issue/766/plan.md` / `.issue/766/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
前提: 1周目（`round-1-arch-risk.md`）指摘 P-001 / P-002 / S-001 / S-002 / S-003 の反映確認 + 新規問題の探索

## 1周目指摘の解消状況（実コード再検証つき）

- **P-001（E2E 偽陽性）— 解消。** `runIngestionJob.ts:612` に `if (isSpeechFailureError(error)) return "";` を実コードで再確認（L604-613 のコメントも「Only `SpeechFailureError` is swallowed … degrades to an empty transcript」と明記）。plan は AC-1 の合否を「ノート保存成功」から **「adapter／ネットワーク層で実 Gemini が 2xx + 非空 transcript を返したことの直接確認」** に書き換え済み（ステップ8 の「AC-1 の合否判定」節 / リスク節 / テスト方針 4・6 / ADR-003 Consequences）。「ノート保存成功＝受理 OK」を禁止条件として複数箇所に明記しており、ゲート判断（ADR-003）の妥当性が保たれている。テスト方針 6 の「adapter 直当てで 2xx + transcript」を主手段に格上げした点も round-1 提案どおり。
- **P-002（base64 サイズ）— 解消。** `messagesClient.ts` が `arrayBufferToBase64`（L122）で JSON body に inline 投入する点、400 が `throwForStatus` の最終フォールスルーで `mapper.unavailable`（L267）に落ちる点を再確認。plan / ADR-001 ともサイズガードを **「base64 後の総リクエストサイズで 20MB 評価、または raw 約 14MiB」** に修正済み（ADR-001 Decision / ステップ3 / アダプター節 P-002）。base64 ≈ 19MB < 20MB の算定根拠も明記。
- **S-001（SDK→REST 表現）— 解消。** 調査結果 L39 が「Gemini の REST `fetch` 配線（SDK は不使用。`callGeminiGenerate` は `x-goog-api-key` ヘッダ付き `generateContent` の REST 呼び出し）」に修正済み。レビュー履歴にも反映。
- **S-002（ADR-002 空 model）— 解消。** ADR-002 Decision が「空 model は `pingGemini` には明示ガードが無い（URL 埋め込みのみ）。`SpeechRecognitionConfig.create` が非空を強制するため probe に到達せず、到達しても 404 で `ok:false`。deepgram probe は UX 対称性のため空 model を明示的に弾く点だけ挙動が割れる」と正確に書き直し済み。
- **S-003（コンストラクタ既定の上書き責務）— 解消。** `DEFAULT_TIMEOUT_MS=60_000` / `DEFAULT_MAX_TOKENS=4096`（messagesClient L57/L60）と `SpeechAdapterConfig={apiKey, model}` のみ（registry L18-21）を再確認。plan アダプター節「コンストラクタ既定の明文化（S-003）」+ ステップ3 が、`GeminiSpeechRecognitionProvider` コンストラクタで timeout 120_000 / maxTokens 16_384 を内部設定する責務を明記済み（OCR の `maxTokens ?? 16_384` 上書きパターンと対応）。

→ 1周目の全 5 指摘が plan / ADR の両方に正しく反映され、いずれも実コードの挙動と整合している。レビュー履歴の「見送った提案: なし（全指摘を取り込み）」も事実と一致。

## 重点項目の再確認

- **レイヤー順序:** domain union → transport list → adapter → registry → DI → UI → test → spec。内側→外側で正しい。ドメインロジック（provider 列挙・default-model 不変条件）はドメイン、エラーマッピング/HTTP はアダプタに配置。漏れなし。
- **port 契約充足:** `callGeminiGenerate` の既存実装（`isAbortError`→timeout / 空 parts→"" / 注入 mapper）が `SpeechFailureError` のみ throw・空発話 ""・workerd abort=timeout の port 契約を満たす見立ては実コードと一致。`speechErrorMapper` が 4 カテゴリすべてを `SpeechFailureError` にまとめる方針も openai/deepgram と対称。
- **generic DI dispatch:** `buildSpeechRecognitionProvider`（request）/ `resolveConsumerSpeechConfig`（consumer）/ `HttpSpeechConnectionTester` / DTO 投影が provider 非依存である分析は round-1 で実コード確認済み。registry 登録だけで両経路・env>db>stub・SecretBox が通る AC-4 の結論は妥当。
- **二重リスト原子更新:** domain `SPEECH_PROVIDERS` と transport `SPEECH_PROVIDERS_TRANSPORT` は相互コンパイルチェックされない独立リストで、default-model も valueObject INVARIANT コメント / UI `PROVIDER_DEFAULT_MODEL` の 2 箇所。ステップ1/2/6 で原子的更新を明記しており見落としなし。
- **implement-then-verify / revert 戦略:** コード差分（ステップ1〜7）を 1 独立コミット化 → 検証 NG なら `git revert`、spec/ADR 更新（ステップ10）は別コミットで revert 対象外、という構成は diff-only 変更と相性が良く現実的。`.issue/738` ADR-002 の Superseded/Accepted 分岐も引き継がれている。

---

#### 問題点（要修正）

問題点ゼロ。

1周目の重大指摘 P-001 / P-002 はいずれもマージ可否ゲートの中核に関わるものだったが、plan・ADR の双方で実コードの挙動に整合する形に修正され、再発・取りこぼしは無い。新たなアーキテクチャ整合性・実現可能性・リスク上のブロッカーも検出されなかった。

#### 改善提案（検討推奨）

- **[S-001]** `speechConnectionPing.ts`（薄いラッパ）とその専用テストの費用対効果
  - 理由: deepgram の `speechConnectionPing.ts` は専用 auth エンドポイント（`GET /v1/projects`）という実ロジックを持つが、Gemini 側は ping ロジックが既存 `connectionPing.ts` の `pingGemini` に存在するため、新規 `speechConnectionPing.ts` は実質 re-export のみになる（plan も「中身は `pingGemini` 委譲・重複ロジックは書かない」と明記）。対称性・発見性のための薄いファイルは許容範囲だが、index.ts から `pingGemini` を直接呼べば新規ファイル + 専用テスト（ステップ7 の `speechConnectionPing.test.ts`、内容は connectionPing.test.ts と重複しがち）を省ける。「ファイルを置くか index 直呼びか」は実装時の軽い判断として残す程度でよい。ブロッカーではない。

- **[S-002]** base64 サイズガードの「総リクエストサイズ」に JSON エンベロープ + プロンプト分の余地を一言
  - 理由: ADR-001 / ステップ3 の「base64 後の総リクエストサイズで 20MB 評価、または raw 約 14MiB」は、Gemini の制約が base64 音声単体ではなく `generateContent` ボディ全体（プロンプト・JSON 構造込み）に効く点まで踏まえると、raw 14MiB（base64 ≈ 19MB）はエンベロープ分の headroom も実質確保できている。意図的に余裕を持たせた閾値であることを ADR に 1 行残すと、後で「なぜ 20MB ちょうどでなく 14MiB か」を再質問されずに済む（実装をブロックする話ではない）。

#### 良い点

- 1周目の最重要 2 件（P-001 偽陽性ゲート / P-002 base64 インフレ）を、文言だけでなく **実コードの根拠（`runIngestionJob.ts:612` の swallow、`messagesClient` の base64 + 400→unavailable フォールスルー）に紐づけて** plan・ADR の両面に反映できている。ゲート判断の合否根拠を「adapter 直当てで 2xx + 非空 transcript」に一本化した修正は、本 Issue の中核リスク（webm/opus 受理可否）を誤判定しないための要であり、的確。
- port 契約充足・generic DI dispatch・二重リスト独立性という 3 つの構造的要点が、いずれも round-1 で実コード確認済みの分析の上に立っており、ユースケース/DTO/DB スキーマ無変更という結論がぶれていない。diff-only の着地点（domain union 1 値 / transport 1 値 / registry 1 行 / adapter 1 ディレクトリ / UI 3 値）が正確。
- `SpeechAdapterConfig` が `{apiKey, model}` のみで timeout/maxTokens を運べない制約を踏まえ、コンストラクタで既定上書きする責務を明文化（S-003）。OCR の既存パターンに揃えており、長尺文字起こしの 4096 トークン途中切れ・60s timeout 非対称という実害を未然に潰している。
- implement-then-verify + 独立コミット + NG 時原子 revert + spec/ADR 別コミットという運用設計が、`.issue/738` ADR-002 の Status 引き継ぎ（OK=Superseded / NG=Accepted）まで含めて一貫している。

---

## 返答

- 問題点: 0 / 改善提案: 2
- [S-001] `speechConnectionPing.ts` 薄いラッパ + 専用テストは index 直呼びで省略可能（費用対効果、ブロッカー外）
- [S-002] base64 サイズガードの raw 14MiB 閾値に「JSON エンベロープ分の headroom 込み」と ADR へ 1 行補足すると後続の再質問を防げる
- 1周目指摘 P-001 / P-002 / S-001 / S-002 / S-003 はすべて実コード整合の形で解消済み。新規ブロッカーなし。

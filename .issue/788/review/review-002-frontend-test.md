# PR #813 レビュー — Frontend / Test 統合 (review-002 / round-2 フル再レビュー)

対象: Issue #788「Cloudflare Workers AI ルート（`deepgram-workers-ai`）文字起こしプロバイダ追加」
観点: Frontend（keyless 分岐 / a11y / Styling / 二重リスト不変条件 / REST 非波及）+ Test（AC-6 対称性 / 振る舞い検証 / node 安定性 / drift 検出）

## サマリ

- **Blockers: 0 / Warnings: 0 / Notes: 5**
- round-1 の 5 指摘（frontend W-001 / W-002、test W-001 / W-002 / W-003）は**すべて適切に対応済み**。修正はいずれも最小かつ正確で、新たな回帰は確認できなかった。
- 影響ユニットテストをローカル実行し **green を確認**（下記）。新規 `SpeechSettingsForm.keyless.test.ts` を含む frontend/adapter 3 ファイル 46 passed、domain/DI 5 ファイル 116 passed。keyless テストはクライアントコンポーネント（`"use client"` + server function import）を node プールでインポートするが、`createServerFn` はビルダー呼び出しのみで副作用が無く、安定して読み取れている（懸念だった node 安定性は問題なし）。
- 6 apiKey ゲートの keyless 分岐・二重リスト不変条件・adapter 境界・registry・DI 配線はいずれも**振る舞い**（戻り値・run 引数・永続化 D1 行・dispatch 引数）で固定されており写経・脆いモック依存に陥っていない。**APPROVE 相当。**

### round-1 指摘の反映確認

| 指摘 | 反映 | 場所 |
|---|---|---|
| frontend W-001（keyless 時 label htmlFor ダングリング + 文言矛盾）| ✓ | `SpeechSettingsForm/index.tsx:359`（`htmlFor={keyless ? undefined : apiKeyId}`）+ `:361`（`{keyless ? "API キー" : "新しい API キー"}`）|
| frontend W-002（`KEYLESS_PROVIDERS` ミラーに drift 検出なし）| ✓ | 名前付き export 化（`:43`）+ 新規 `SpeechSettingsForm.keyless.test.ts`（domain keyless 述語 / `keylessProviders` / transport 3 不変条件）|
| test W-001（model-ignored 挙動未検証）| ✓ | `workersAiSpeechRecognitionProvider.test.ts:71-78`（`model:"whisper-x"` 投入でも run は `@cf/deepgram/nova-3`）|
| test W-002（`run` reject 時 cause 保持未検証）| ✓ | 同 `:129-141`（`expect((error).cause).toBe(originalError)`）|
| test W-003（二重リスト直接比較なし）| ✓ | `schema.test.ts:211-215`（`SPEECH_PROVIDERS_TRANSPORT` ⇔ `SpeechRecognitionConfig.providers` set-equal）+ `valueObject.test.ts:433-438`（`requiresApiKey` は `keylessProviders` の完全補集合）|

## Frontend / Test

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** frontend W-001 の修正が正確で回帰なし。keyless 時 `htmlFor` を落とし（`:359`）関連コントロール無し label を解消、文言も中立化（`:361`）。keyless では `apiKeyRequired=false`（`:146` の `&& !keyless`）のため「必須」バッジも出ず、body は `<span data-keyless="">不要（Cloudflare が管理）</span>`（`:374-380`）で `name="apiKey"` を持つ input が unmount され FormData に鍵が載らない。REST 分岐（required 属性・placeholder・aria-invalid）は無改修で維持され keyless 免除が波及していない。
- **[N-002]** frontend W-002 の drift 安全網が他の二重リストと対称になった。`KEYLESS_PROVIDERS` を named export 化し、`SpeechSettingsForm.keyless.test.ts` が (1) domain `requiresApiKey` 述語の補集合、(2) `SpeechRecognitionConfig.keylessProviders`、(3) transport enum 包含、の 3 不変条件で固定。いずれも `.sort()` で順序非依存。domain が keyless provider を追加してクライアント Set を更新し忘れると赤くなる。`schema.test.ts` の provider set-equal と合わせ、UI ミラーの黙認ドリフトを塞いだ。
- **[N-003]** test W-003 の直接比較が実際に drift を検出できる。`schema.test.ts:211` は 2 本の独立ハードコード配列ではなく `SPEECH_PROVIDERS_TRANSPORT` と domain `SpeechRecognitionConfig.providers` の**両ソース定数**を set-equal 比較しており、片方に provider を足して他方を忘れた場合に確実に赤くなる（VO 境界 throw より前の速い unit で検出）。`schema.test.ts` が domain VO を import する形になったが、これはテスト側の import であり `schema.ts` 本体の「`@/core/domain/*` 非 import」規約は維持されている（規約違反なし）。
- **[N-004]** adapter 単体が AC-6 全ケースを振る舞いで網羅。正常 `.trim()` / 空 bytes 入力（`:103`）と 空 transcript 出力（`:91`）を別ケースに分離 / transcript 欠落（`:97`）/ binding 未注入 → `SpeechFailureError`（`:122`）/ `run` reject → `SpeechFailureError` + cause 保持（`:129`）/ timeout（実 5ms タイマー + never-resolve run で `Promise.race` を決定的に発火・`:143`）/ locale `ja-JP → ja` 主サブタグ抽出。fetch モックを `fakeAi`（run 差し替え）に正しく置換し、fake timer 非依存で flaky 耐性も妥当（ADR-007 整合）。ping は binding 有りで `ok:true` かつ run 未呼出（課金なし）、無しで `ok:false` を固定。
- **[N-005]** DI / usecase / domain service の keyless 分岐が seam・実 D1 で固定され linchpin を的確にカバー。`buildSpeechRecognitionProvider`（binding+model で非 Stub / binding 無し・model 無しで Stub / stray key 無視・`:67-111`）、`resolveConsumerSpeechConfig`（keyless を `apiKey=""` で解決・consumer 経路＝実文字起こし走行点）、`assertSpeechEnvOverride`（keyless carve-out で throw せず / REST は従来どおり `SpeechEnvOverrideMissingKey` throw の回帰・`service.test.ts:250,265`）、`updateSpeechConfig`（keyless 保存の env/null 正規化・旧 ciphertext 非引き継ぎ・stray key silent-drop を実 D1 行で・`adminSettings.integration.test.ts:1068,1093,1127`）、`testSpeechConnection`（keyless で鍵なしでも tester dispatch・`:1303`）。6 ゲートすべて keyless 分岐が押さえられている。

### 補足（低優先・情報）
- keyless provider 選択時に運用者が誤って `ADMIN_SPEECH_API_KEY` を設定していると、`envOverrides.apiKey === true` になり keyless の「API キー」label に「環境変数で固定中」ロックバッジが出る一方、欄本体は「不要（Cloudflare が管理）」を表示する軽微な文言不整合が起こりうる（`:367-371` vs `:374-380`）。keyless × env キー設定という矛盾した構成が前提で、鍵は usecase 側で silently drop されるため実害はなく、指摘化はしない（将来 UI を触る際の参考メモ）。

## ローカル検証

- `pnpm vitest run --config vitest.config.ts` — frontend/adapter 3 ファイル **46 passed**（`SpeechSettingsForm.keyless.test.ts` / `schema.test.ts` / `workersAiSpeechRecognitionProvider.test.ts`）。
- 同上 — domain/registry/DI 5 ファイル **116 passed**（`valueObject.test.ts` / `service.test.ts` / `registry.test.ts` / `buildSpeechRecognitionProvider.test.ts` / `speechConnectionTester.test.ts`）。
- integration（`adminSettings.integration.test.ts` / `createConsumerContainer.integration.test.ts`）は workers プール依存のため未実行だが、keyless 保存正規化・ciphertext 非引き継ぎ・stray-key silent-drop・consumer 解決・tester dispatch のケースがコード上そろっていることを確認。

# Round 1 レビュー — Issue #788（視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/788/plan.md` / `.issue/788/adr.md`
レビュー観点: あるべきアーキテクチャとの整合性・依存方向・実現可能性・見落とし・トレードオフ

総評: ADR-001〜006 の設計判断（案 B・binding は `deps` 別口注入・スコープを Deepgram Nova-3 に限定・型契約で PoC 代替）はいずれも妥当で、`@cloudflare/workers-types` の裏取りも正確（下記「検証済みの前提」参照）。依存順（domain → adapter → DI → UI）も守られている。ただし **「ユースケースはロジック変更なし」という中核前提が実コードと食い違っており、workers-ai を鍵なしで保存・接続テストする経路が application 層の 2 つの apiKey ガードでブロックされる**。ここが最大の穴で、AC-3（保存・接続テスト）が現計画のままでは満たせない。

---

#### 検証済みの前提（plan/ADR の裏取り結果 — すべて正しい）

- `@cloudflare/workers-types/index.d.ts`: `Ai`（L10762, `declare abstract class Ai`）/ `Ai_Cf_Deepgram_Nova_3_Input`（L9251）/ `Ai_Cf_Deepgram_Nova_3_Output`（L9405）/ `AiModels["@cf/deepgram/nova-3"]`（L10674）はすべて実在。`serverCloudflare.ts` は既に同パッケージから型を import しており `Ai` の `import type` も問題なし。
- `Ai_Cf_Deepgram_Nova_3_Output` の shape は `results?.channels?.[]?.alternatives?.[]?.transcript?` で、既存 REST `DeepgramSpeechRecognitionProvider`（`speechRecognitionProvider.ts` L205-211）の抽出ロジック `body.results?.channels?.[0]?.alternatives?.[0]?.transcript` と**完全一致**。ADR-006 の「型で REST 互換を確定」は正しい。抽出ロジック共有も型で担保できる。
- `Ai_Cf_Deepgram_Nova_3_Input` は `audio: { body: object; contentType: string }` 必須、`language?` / `smart_format?` / `encoding?: "opus"|...` 任意。plan の呼び出し `run("@cf/deepgram/nova-3", { audio: { body, contentType: input.mime }, language, smart_format: true })` は型適合。`SpeechTranscribeInput.audioBytes: ArrayBuffer` は `body: object` に代入可能（typecheck 通過）。
- `SpeechAdapter.create/ping` への `deps?` optional 追加は REST barrel（`deepgram/index.ts` の `create: (cfg) => ...` 等、arity 1〜3）を無改修に保てる（少ない引数の関数は多い引数の型に代入可能）。`satisfies SpeechAdapter` も維持される。plan の主張どおり。
- **audio 文字起こしは consumer で走る**は正しい: `transcribe` の実呼び出しは `runIngestionJob.ts` L598、その唯一の呼び出し元は `dispatchDomainEvent.ts` L175（consumer 経路）。`resolveConsumerSpeechConfig` / `[env.consumer]` の binding が E2E の要という plan の力点は妥当。
- registry の `Record<SpeechProvider, SpeechAdapter>` により、`SPEECH_PROVIDERS` に値を足すと registry エントリが**コンパイル時強制**される。domain 起点の網羅は機能する。

---

#### 問題点（要修正）

- **[P-001] `updateSpeechConfig` ユースケースの `SpeechProviderChangedRequiresApiKey` 不変条件が、workers-ai への切替（鍵なし）をサーバ側で拒否する。plan の「ユースケースはロジック変更なし」は誤り。**
  - 根拠: `app/core/application/adminSettings/updateSpeechConfig.ts` L69-77 に
    ```
    const providerChanged = env.provider === null && input.provider !== current.speech.provider;
    if (providerChanged && apiKeyCiphertext === null) {
      throw new BusinessRuleError(SpeechProviderChangedRequiresApiKey, ...);
    }
    ```
    既定 provider は `openai`。管理者が `/admin/speech` で `deepgram-workers-ai` に切り替えると必ず `providerChanged=true`、鍵不要ゆえ `apiKeyPlain=null → apiKeyCiphertext=null` となり、この `BusinessRuleError` で**保存が失敗**する。UI 側 `apiKeyRequired` を抑制するだけ（plan ステップ 8）ではクライアント検証を通すだけで、サーバの不変条件は残る。AC-3「選択・保存」が満たせない。
  - 追加問題: 仮にこのガードを workers-ai で免除しても、else 枝（L84-89）は `apiKeySource: current.speech.apiKeySource` / `apiKeyCiphertext: current.speech.apiKeyCiphertext` を流用するため、**旧 provider（例 openai/db）の ciphertext を workers-ai 行に引き継いでしまう**。plan が意図する「workers-ai は `apiKeySource: 'env'`・ciphertext null」に落とすには、免除に加えて保存値を明示的に `env`/null へ正規化する分岐が必要。よってこれは単なるガード削除では済まず、ユースケースに workers-ai 用の保存ロジックが要る。
  - 提案: `updateSpeechConfig` に「provider が keyless（workers-ai 系）なら providerChanged-requires-apiKey を免除し、draft を `apiKeySource: 'env', apiKeyCiphertext: null` で構築する」分岐を追加する。さらに `SpeechProviderChangedRequiresApiKey` は**ドメイン不変条件**なので、「この provider は鍵を要するか」の判定は application/DI 共有ヘルパ `isWorkersAiSpeechProvider` ではなく **domain（`valueObject.ts`）側の SSOT**（例: `SpeechRecognitionConfig.requiresApiKey(provider)` もしくは keyless provider 集合）として持ち、domain ガードと DI ゲートの両方が同一述語を参照する形にするのが依存方向的に正しい（ドメイン不変条件が application 層ヘルパに依存するのを避ける）。plan の ADR-004「判定の集約点は provider 識別子」を domain へ引き上げる。

- **[P-002] `testSpeechConnection` ユースケースと `HttpSpeechConnectionTester` の 2 段の apiKey ガードが、workers-ai の「binding 存在確認」ping に到達する前に短絡する。plan の tester 注入だけでは接続テストが成立しない。**
  - 根拠: `app/core/application/adminSettings/testSpeechConnection.ts` L82-88 に
    ```
    if (resolvedKey === null || resolvedKey.trim().length === 0) {
      return { ok: false, latencyMs: 0, error: "No api key available for the configured speech provider" };
    }
    const result = await container.speechConnectionTester.ping(cfg, resolvedKey);
    ```
    workers-ai は env override も ciphertext も持たないため `resolvedKey` は null/空 → **`speechConnectionTester.ping` を呼ばずに** `"No api key available"` を返す。さらに到達したとしても `HttpSpeechConnectionTester.ping`（`speechConnectionTester.ts` L36-39）が `trimmedKey.length === 0 → { ok:false, error:"API key is empty" }` で再度短絡する。したがって plan ステップ 7（tester に `ai` を注入し `adapter.ping` に渡す）と ADR-005（binding 存在で `ok:true`）の設計は、この 2 ガードのため**実行到達しない**。AC-3「接続テストできる」が満たせない。
  - 提案: (1) `testSpeechConnection` に workers-ai 分岐を追加し、鍵なしでも tester に到達させる（`resolvedKey` 空でも provider が keyless なら空文字で dispatch を続行）。(2) `HttpSpeechConnectionTester.ping` の empty-key 短絡を「keyless provider は素通し」に分岐する。判定は P-001 と同じ domain 述語を共有する。plan の「testSpeechConnection はロジック変更なし」を撤回し、この 2 箇所の修正をステップ 5/7 に明記する。

---

#### 改善提案（検討推奨）

- **[S-001] `env.AI.run` の timeout 記述が REST の DOMException/AbortError 契約と混線している。**
  - 根拠: `AiOptions`（index.d.ts L10695）には `AbortSignal` も timeout フィールドも**無い**（`queueRequest` / `websocket` / tags / gateway のみ）。よって plan の `Promise.race` + タイマー代替は正しい方向だが、plan ステップ 3 の「timeout は workerd `DOMException` 対応」という文言は fetch/`AbortController` 前提の REST アダプター固有ロジックで、workers-ai 経路には**該当しない**（AbortController を張らないので AbortError/DOMException は発生しない）。workers-ai の timeout は自前タイマーが `SpeechFailureError` を reject する経路になる。また `Promise.race` は下層の `run()` を**キャンセルしない**（実行は継続し課金され得る）点を JSDoc に明記すべき。既存 `isAbortError` ヘルパの流用は不要。plan の記述を「workers-ai は Promise.race + 自前タイマーで `SpeechFailureError`。DOMException 判定は REST 専用で流用しない」と正す。

- **[S-002] webm/opus 投入時に `encoding: "opus"` を明示指定するか、staging 検証項目として明記する。**
  - 根拠: `Ai_Cf_Deepgram_Nova_3_Input.encoding` は `"opus"` を受ける。REST Deepgram は content-type からのコンテナ検出に任せているが、Workers AI パートナーモデルが `audio.contentType` だけで webm/opus を判別できるかは未確定（ADR-006 の主要懸念そのもの）。受理 NG を減らす保険として、webm/opus 時に `encoding` を渡す選択肢を staging 検証の分岐として ADR-006 に一行足しておくと、NG 時の次アクションが明確になる（本 Issue 実装は据え置きでよい）。

- **[S-003] `deepgram-workers-ai` という命名で REST `deepgram` と UI 上 2 択並ぶ点の UX 注記。**
  - 根拠: ADR-001 Consequences で認識済みだが、`PROVIDER_LABEL` が "Deepgram" と "Deepgram (Workers AI)" の 2 つになる。model 欄の既定（`nova-3` vs `@cf/deepgram/nova-3`）取り違えは実 transcribe 時まで露見しない。フォームの provider 説明文で「Workers AI 版は Cloudflare アカウント認証・鍵不要」を明示する plan ステップ 8 の方針は妥当。加えて `@cf/deepgram/nova-3` を model 欄で編集可能にするか（自由入力だと typo で沈黙 Stub 化しうる）を一考。

- **[S-004] consumer 経路の apiKey-optional 分岐が `resolveConsumerSpeechConfig` の early-return と噛み合うか要確認。**
  - 根拠: `resolveConsumerSpeechConfig`（`serverCloudflare.ts` L1192）は `if (provider === null || model === null || apiKey === null) return null;`。workers-ai は apiKey が常に null になるためここで `null` を返し、`speechOverrides` が空 → **request 側の Stub のまま**になる（沈黙 Stub、plan リスク欄が警告するパターンそのもの）。plan ステップ 6 は「workers-ai のとき apiKey なしで解決成功」と書いているが、`apiKey: ""` を返すだけでは不十分で、この early-return 条件自体を「keyless provider は apiKey null を許容」に分岐させる必要がある。DI unit テスト（ステップ 9）でこの分岐を固める点は良いが、実装対象がこの 3 項 early-return であることをステップ 6 に具体化すると漏れが減る。

---

#### 良い点

- ADR-001 の案 B 採用理由（Gemini×workers-ai の非合法状態を型で排除・マイグレーション不要・既存 diff-only パターンと対称）は「make illegal states unrepresentable」に忠実で、実態調査（型付きカタログは Deepgram/Whisper のみ）に裏打ちされている。
- ADR-002 の「config は純データ据え置き・binding は `deps` 別口注入」は CLAUDE.md の「config は純データ / クロスカッティングは DI 注入」に正確に沿う。`deps?` optional で REST 側を無改修に保つ設計も型的に成立している（裏取り済み）。
- ADR-003 で Issue 前提の誤り（gpt-4o-transcribe が Workers AI 非対応）を型カタログで発見し、スコープを Deepgram に限定して別 Issue へ送る判断は、実現可能性リスクを的確に切り離している。
- ADR-006 の「型契約による静的 PoC + staging implement-then-verify/revert」と、`runIngestionJob` が `SpeechFailureError` を握り潰す**偽陽性**への警戒（受理判定を「ノート保存成功」で決めない）は #766 の教訓を正しく継承している。実 binding 到達不可という環境制約への現実的な着地。
- 依存順（domain union → registry 契約 → adapter → DI threading → UI → test → wrangler → spec）が内→外で整理され、consumer 経路の binding 配線を E2E の要と名指ししている点、契約シグネチャ変更の波及先（3 barrel + registry test + connectionTester）を列挙している点は blast radius 管理として的確。

---

#### まとめ

設計判断（ADR）と型裏取りは高品質。ただし plan の「ユースケースは provider 非依存で変更なし」という前提が、application 層の 3 つの apiKey ガード（`updateSpeechConfig` の provider-change-requires-key、`testSpeechConnection` の no-api-key、`HttpSpeechConnectionTester` の empty-key）と `resolveConsumerSpeechConfig` の early-return と衝突しており、workers-ai の鍵なし経路が保存・接続テスト・consumer 解決の各所でブロックされる。ADR-004 は DI ゲートの apiKey 前提だけを分岐対象に挙げているが、実際には **application ユースケース層にも同型の apiKey ゲートが 3 箇所ある**。これらを keyless-provider 述語（domain SSOT）で一貫分岐させることが AC-3/AC-4 達成の必須条件。P-001/P-002 を計画に反映すれば、他は妥当で実装可能。

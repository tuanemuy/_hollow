# Plan Review — Issue #738 (Round 1)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/738/plan.md` / `.issue/738/adr.md`
**レビュー日:** 2026-06-21

---

## サマリ

Issue #738 の「やること」5 項目・「受け入れ条件」5 項目を AC-1〜AC-9 にほぼ完全にマッピングできており、調査結果も実コード（registry.ts / DI / valueObject / SpeechSettingsForm / schema.ts）と正確に一致している。Gemini / Workers AI の見送りは Issue の「最低 1 本」許容と整合し、ADR-002 / ADR-003 で根拠も明文化されている。スコープ外作業の混入もない。要件カバレッジ観点では非常に高品質。指摘は軽微なもの 2 件（うち 1 件は事実誤認の修正、1 件は基準の検証可能性）に留まる。

---

## 検証した事実（実コードとの突合）

- `registry.ts`: `speechProviderRegistry: Record<SpeechProviderId, SpeechAdapter>`、`SpeechAdapterConfig = {apiKey, model}`（baseURL なし）、`lookupSpeechAdapter` が未登録で `undefined` を返す — 計画記述どおり。
- `valueObject.ts`: `SPEECH_PROVIDERS = ["openai"]`、INVARIANT コメント（258-267 行。計画は「268-267 行」と誤記だが実体は一致）。default-model マッピングのコメント追記要、という計画の指摘は妥当。
- `serverCloudflare.ts`: `buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` は完全に generic、`provider ?? "openai"`・未登録は Stub フォールバック — 計画の「無変更で AC-7 成立」は正しい。コメント 178 行「OpenAI speech adapter on the request path」が provider 中立でない点も計画が拾えている。
- `schema.ts`: `SPEECH_PROVIDERS_TRANSPORT = ["openai"]`、`testSpeechConnectionSchema` は LLM と違い `baseURL` 軸を持たない（refine なし）— 計画の transport 1 値追加で足りる。
- `SpeechSettingsForm/index.tsx`: `PROVIDER_LABEL: Record<ProviderId, string>`、placeholder `"sk-..."`（309 行）・model ヒント「例: gpt-4o-transcribe」（386 行）がハードコード — 計画の AC-4（provider 分岐）の対象として正確。
- `entity.ts`: `defaultSpeech()` は `provider:'openai', model:'gpt-4o-transcribe'` — 計画の「既定は openai 据え置き」と整合。
- spec ファイル `spec/adr/013-speech-provider.md` / `spec/domains/adminSettings.md` 実在 — AC-9 の対象が存在する。

---

## 問題点（要修正）

- **[P-001]** ステップ 5 / 設計「UI」節の「provider 変更で既定 model をリセット（LLM フォームの挙動に合わせる）」は、引き合いに出す precedent が事実と異なる。
  - 理由: 実際の `LLMSettingsForm/index.tsx`（241-246 行）の `onChange` は `setProvider(next)` のみで、**model のリセットは行っていない**（placeholder の切り替えだけ）。計画は「LLM フォームの挙動に合わせる」「LLM フォームの provider 分岐パターンを参照」と繰り返し書いているが、参照先にリセット挙動は存在しない。実装者がこの記述を信じて「既存パターンの踏襲」として model リセットを入れると、実は新規挙動の追加になり、レビュー時の認識齟齬・OpenAI フォームとの非対称を生む。なお AC-4 自体は「既定 model と placeholder が切り替わる」までしか要求しておらず、リセット挙動は AC に紐づいていない（受け入れ基準と実装ステップの紐づけ不整合）。
  - 提案: (a) 「LLM フォームに合わせる」という誤った precedent 記述を削る。(b) model リセットを採用するなら「LLM フォームには無い新規挙動。OpenAI フォームにも後追いで入れるか、Speech だけに入れて非対称を許容するかを決める」と明記し、対応する AC（例: AC-4 に「provider 切替時に既定 model へリセットされる」を追記）を立てて検証可能にする。採用しないなら「持ち越し回避は接続テストの 4xx で十分」とリスク節の整理に留める。

---

## 改善提案（検討推奨）

- **[S-001]** AC-6（音声→文字起こし→…→ノート保存が通る）・AC-7（env>db>stub と SecretBox 暗号化）は「実 Deepgram API キーが必要な手動検証」に依存しており、検証可能性が CI で担保されない。
  - 理由: Issue 受け入れ条件 2・3 由来の正当な基準だが、API キー前提の手動検証は再現性が弱く、レビュー時に「未検証のまま通った」になりやすい。AC-7 のうち「env>db>stub フォールバック」「SecretBox 復号経路」は `resolveConsumerSpeechConfig` の generic 性ゆえ provider 非依存なので、自動テスト（fake env / fake SecretBox）で `deepgram` 文字列が registry に正しく流れることまでは検証できる。手動検証は「実 transcribe の疎通」に限定し、構成解決ロジックは自動テストで押さえると基準が検証可能になる。
  - 補足: テスト方針節には既に「env > db > stub の確認」が挙がっているので、AC-7 の「対応ステップ」を「6 + 7（構成解決の自動テスト）」に広げるだけで紐づけが締まる。

- **[S-002]** AC-5 の「接続テスト probe が Deepgram に対応する」は、probe エンドポイント未確定（ADR-001 が `GET /v1/projects` を「など」付きで proposed）という不確実性を抱えたまま「検証可能な基準」として表に入っている。
  - 理由: スコープ漏れではないが、probe エンドポイントが実装時に変わると AC-5 の合否判定基準もぶれる。リスク節・ADR-001 にトレードオフは記載済みなので問題は小さいが、AC-5 を「2xx を疎通成功とみなす probe が dispatch される（具体エンドポイントは ADR-001 で確定）」と書けば、エンドポイント選定の揺れと基準の合否を分離できる。

---

## 良い点

- Issue「やること」5 項目（union 追加 / adapter 実装 / UI 自動増加＋ラベル / env override `ADMIN_SPEECH_PROVIDER`＋probe / 統合テスト対称性）と「受け入れ条件」5 項目が AC-1〜AC-9 に漏れなく落ちている。特に Issue「やること」の各項目に「由来」列で明示トレースしているのが秀逸で、カバレッジ監査がしやすい。
- Gemini（ADR-002）・Workers AI（ADR-003）・Google Cloud STT v2 の見送りを「含まれないもの」節に根拠付きで明記し、Issue の「最低 1 本・優先 Deepgram」と正しく整合させている。Workers AI は案 A/B の設計選択肢まで整理して別 Issue 送りにしており、Issue「検討事項」の `SpeechAdapter.create` 分岐 vs 別エントリの論点を正面から処理できている。
- 「ドメインサービス/ユースケース/DTO/DB スキーマ無変更」を調査で確認し、スコープを「VO 1 値 / transport 1 値 / registry 1 行 / adapter ディレクトリ / フォーム分岐 / spec」に厳密に閉じている。スコープ外作業の混入ゼロ。
- AC-9（spec 更新）の対象ファイルが実在し、ADR-013 と adminSettings.md の両方を具体的な更新内容付きで指定している（Issue 受け入れ条件 5 を確実にカバー）。
- transport / domain 二重リストのドリフト（ステップ 1・4 を同一 PR で対に）を明示し、Issue「やること」の「`SPEECH_PROVIDERS_TRANSPORT.map` で自動増加」を正確に反映している。

---

## 判定

要件カバレッジ・スコープ整合性ともに高水準。P-001（precedent 事実誤認 + AC 未紐づけ）の修正を必須、S-001/S-002 は検証可能性の補強として推奨。いずれも軽微で、計画の骨子は妥当。

# Plan Review — Issue #738（Round 2 / アーキテクチャ整合性・実現可能性・リスク）

レビュー観点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/738/plan.md` / `.issue/738/adr.md`
基準: `CLAUDE.md` / 既存実装（`speech/registry.ts`, `openai/*`, `serverCloudflare.ts`, `SpeechSettingsForm`, `LLMSettingsForm`, `speechConnectionTester*`）
前提: 1周目（round-1-arch-risk.md）の P-001/P-002/P-003・S-001/S-002/S-003 は反映済み

---

## 1周目指摘の反映確認

実コードと突き合わせて、すべての指摘が正しく反映されていることを確認した。

- **[P-001]（LLM フォームの model リセットは存在しない）** — 反映済み。`LLMSettingsForm/index.tsx` の provider select `onChange`（241 行）は `setProvider` 系のみで、`setModel`（458 行）は model 入力ハンドラ専用。plan は「placeholder 分岐は LLM フォームに先例あり／model 自動リセットは本 Issue 新規導入の Speech 固有挙動（LLM には無い・非対称許容）」と正しく書き直されている（plan 101-102, 137 行・レビュー履歴）。precedent 誤記は解消。
- **[P-002]（model リセット × env ロック衝突）** — 反映済み。plan は `if (!envOverrides.model) setModel(PROVIDER_DEFAULT_MODEL[next])` と条件付けし、AC-4・ステップ 5・設計 UI 節・リスク節に明記（plan 20, 103, 137, 174 行）。実コードで model 入力が `disabled={isPending || envOverrides.model}`（382 行）であること、`envOverrides.provider===true` 時は select 自体が `disabled`（223 行）でこのパスを通らないことも plan の記述（103 行）と一致。
- **[P-003]（接続テストが env キー固定）** — 反映済み。`onTest` が `apiKeySource:"env"`・`apiKeyCiphertext:null` をハードコード（フォーム 145-155 行）する制約を AC-6・ステップ 5・テスト方針・リスク節に明記（plan 22, 138, 175, 184 行）。#701 由来でスコープ不変とする判断も妥当。
- **[S-001]（locale 実入力は `ja`）** — 反映済み。plan は「実入力は `ja` 固定（`runIngestionJob.ts`/`previewPrompt.ts`）、OpenAI と対称に first-subtag 抽出は将来防御」と訂正（plan 52, 88 行）。OpenAI 実装の `localeToLanguage`（first-subtag を lower-case）とも対称。
- **[S-002]（webm/opus PoC 項目）** — 反映済み。ADR-001 の「PoC で確認する項目」節に「webm/opus の Content-Type で Deepgram prerecorded が 2xx を返すか」を ArrayBuffer 直送・probe 2xx と並べて追加（adr.md 19-22 行）。
- **[S-003]（registry dispatch 専用テスト）** — 反映済み。`speechConnectionTester.test.ts` が `vi.mock("@/core/adapters/speech/registry")`（10-12 行）で `lookupSpeechAdapter` をモックしており AC-1 を検証できないことを実コードで確認。plan は実 import する `speech/__tests__/registry.test.ts` 新設をステップ 7・テスト方針に追加（plan 149, 152, 181 行）。

---

#### 問題点（要修正）

問題点ゼロ。

1周目の要修正 3 件は局所修正で完了しており、残課題は無い。新たなアーキテクチャ違反・依存方向の逆転・port 契約逸脱・実現不能なステップも検出されなかった。以下、本ラウンドで重点確認した各論点の判定:

- **レイヤー内側からの設計・依存方向の順序** — 適合。ステップ 1（domain union）→ 2-3（adapter + registry）→ 4-5（transport/UI）→ 6（DI 確認）→ 7（test）→ 8（spec）は内向き依存順。ステップ 1 を先行させ registry 未登録をコンパイルエラー化する順序は `Record<SpeechProvider, SpeechAdapter>` 網羅性（registry.ts 47 行）の意図と一致。
- **OpenAI adapter への対称性** — 適合。`openaiSpeechAdapter`（openai/index.ts 53-67 行）の `create({apiKey, model})` / `ping(cfg, apiKey, timeoutMs)→{ok,error}` 畳み込み、`isAbortError` の DOMException 二重判定、`sanitizeErrorReason`（transcribe）vs `maskSecrets`（ping）の意図的非対称まで plan が対称コピー対象として正しく挙げている（plan 87, 89, 90 行）。barrel の `import type { SpeechAdapter }`（value cycle 回避）も openai/index.ts 4 行と同型。
- **port 契約（SpeechFailureError のみ throw）** — 適合。空 apiKey ガード・サイズ上限・timeout・非 2xx・JSON 不正すべて `SpeechFailureError` に集約、空発話 `""`、ping は throw せず discriminated result の方針が port（`speechRecognitionProvider.ts`）と OpenAI 実装に整合。
- **provider 切替時 model リセットと env ロック衝突回避** — 適合（[P-002] 反映で解消、上記）。
- **接続テスト probe の実現可能性** — 妥当。Deepgram に `GET /models/{model}` 相当が無い限界、`GET /v1/projects` 等で「key 有効」のみ確認、誤 model 名は実 transcribe の 4xx で判明、という非対称トレードオフを ADR-001 が正直に記載。具体エンドポイントは PoC 確定に委ね、AC-5 の合否条件を「probe が 2xx」と確定済み。
- **二重リスト（transport/domain）同期** — 適合。ステップ 1（`SPEECH_PROVIDERS`）・4（`SPEECH_PROVIDERS_TRANSPORT`）を同一 PR で対にし、ドリフト時は VO 構築で `InvalidSpeechProvider` fail-fast（既存エラーコード再利用で `errorCodeNaming.test.ts` 影響ゼロ）。schema.ts コメント規約と一致。
- **Workers AI / Gemini 見送り判断** — 妥当。Gemini は webm/opus・m4a 受理不確実で録音経路リスク（ADR-002）、Workers AI は `SpeechAdapterConfig`（現状 `{apiKey, model}`・registry.ts 17-20 行で確認）が env.AI バインディング参照を持てず #701 registry 契約への侵襲が大きい（ADR-003、案 A/B 整理付き）— いずれも実構造と一致した根拠でスコープ外化。

---

#### 改善提案（検討推奨）

- **[S-001]** ADR の Status が全件 `Proposed` のまま。実装着手前に少なくとも ADR-001（Deepgram 実装方針）の Status を更新する運用基準を明記しておくと、PoC 結果（ArrayBuffer 直送可否・webm/opus 2xx・probe エンドポイント）が出た時点での `Accepted` 化フローが追える。
  - 理由: ADR-001 は probe の具体エンドポイントと raw-body 可否を「PoC で確定」に委ねており、これらが未確定のまま実装に入ると AC-5（probe 2xx）の検証基準が PoC 待ちで宙づりになりうる。PoC → ADR-001 Accepted → 実装、という前後関係を plan のステップ順（または ADR）に 1 行添えると、実現可能性リスク（raw-body fetch が workerd で不成立だった場合の手戻り）の所在が明確になる。スコープ・設計判断自体への異論ではなく運用メモの提案。

- **[S-002]** `pingDeepgramSpeech` の `model` 未使用に伴う lint/型の扱いを一言補足すると実装がぶれない。
  - 理由: OpenAI の `pingOpenAISpeech` は `config.model` を `GET /models/{model}` の URL 構築と空チェック（speechConnectionPing.ts 69-73 行）に使う。Deepgram probe は `GET /v1/projects` 等で model を URL に使わないため、`SpeechAdapter.ping` シグネチャ上 `cfg.model` を受け取っても probe 内で参照しない可能性が高い。plan は「model 存在確認は probe で行わない」と明記済み（plan 89 行）で設計は正しいが、実装時に「model を空チェックだけ残すか／完全に無視するか」（OpenAI は空 model を `ok:false` にしている）を決めておくと、OpenAI との UX 非対称（Deepgram は空 model でも probe 成功しうる）が意図的選択だと分かる。軽微。

---

#### 良い点

- **1周目の事実誤認（[P-001]）を、precedent を削除しつつリセット挙動は残す形で正しく是正している。** 実コード（LLM フォーム 241 行 provider onChange に `setModel` 無し／458 行 model 入力ハンドラのみ）と完全に一致。「Speech 固有の新規挙動・OpenAI フォームとの非対称を許容」と非対称を隠さず明示した点が誠実で、レビュー視点（既存パターンへの対称性）として実装者が存在しない参照を探す迷いを排している。

- **env ロックとリセットの相互作用を state レベルまで詰めている。** `if (!envOverrides.model)` 条件に加え、「`envOverrides.provider===true` のとき select 自体が disabled でこのパスは通らない」（plan 103 行）まで踏み込んでおり、実コードの `disabled={isPending || envOverrides.provider}`（223 行）・`providerChanged = !envOverrides.provider && ...`（106 行）の既存ガード構造と整合。env ロック × provider 切替 × model リセットの三者交差を漏れなく潰している。

- **「触らないことの確認」を AC（AC-7）とテスト（構成解決の自動テスト）に昇格させている。** DI・ConnectionTester・usecase・DTO・DB が generic dispatch で provider 非依存である事実を、`resolveConsumerSpeechConfig`（1138-1189 行で provider 文字列を素通し）の実構造と一致させたうえで、fake env / fake SecretBox で `deepgram` の registry 流入を CI 担保する項目に落としている。#701 ADR-002 の「差分追加だけ」構造を正しく活用。

- **registry dispatch テストの欠落を実テストファイルの mock 構造から特定している。** `speechConnectionTester.test.ts` の `vi.mock(...registry, () => ({ lookupSpeechAdapter: vi.fn() }))`（10-12 行）を根拠に、実 registry を import する専用テスト新設へ正しく導いており、型レベル網羅（typecheck）とランタイム dispatch スモークの役割分担が明確。

- **probe の能力限界・raw-body fetch・webm/opus 受理を PoC 項目として ADR-001 に集約。** 実現可能性リスク（workerd の ArrayBuffer 直送・Deepgram のフォーマット受理）を「実装前に確認」と前倒しし、Gemini で警戒する webm/opus リスクを Deepgram でも明示確認する横展開ができている。

---

### 総評

1周目の要修正 3 件・改善 3 件はすべて実コードと照合して正しく反映されており、新たなアーキテクチャ違反・依存逆転・port 契約逸脱・実現不能ステップは検出されなかった。計画は #701 が確立した「差分追加だけ」構造を内側レイヤーから依存順で正しく組んでおり、OpenAI への対称性・二重リスト同期・見送り判断・probe トレードオフのいずれも実構造と一致している。要修正ゼロ。改善提案 2 件（ADR Status 運用・Deepgram probe の model 扱い）はいずれも任意で、本 Issue の実装着手を妨げない。実装可能な状態に達している。

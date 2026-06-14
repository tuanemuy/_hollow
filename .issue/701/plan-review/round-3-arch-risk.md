# Round 3（最終）レビュー — アーキテクチャ整合性・実現可能性・リスク

**Issue:** #701
**対象:** `.issue/701/plan.md` / `.issue/701/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-06-14

---

## 総評

Round 1・2 の指摘（arch P-001 / S-001〜005、coverage P-001〜002 / S-001〜002）はすべて反映済み。
実コードで以下の load-bearing な前提を再確認し、いずれも計画記述と一致した：

- `runPipeline`（`runIngestionJob.ts` 261-371 行）は `html` / `markdown` / `else`（LLM 必須）の 3 分岐で、`audio` は `else` を通る。`suggestMetadata`（335 行）は if/else の外＝全 kind 共通経路。→ ステップ5 の early-return 縮退方針（metadata ブロックごと回避）は正しい。
- `StubSpeechRecognitionProvider` は `BusinessRuleError(UnsupportedFormat, 'speech_recognition_not_implemented_in_mvp')` を投げる（`SpeechFailureError` ではない）。`classifyPipelineError`（540 行 `isBusinessRuleError → error.code`）で `markFailed` に落ちる。→ Round 2 P-001 の「縮退対象を `SpeechFailureError` のみに限定／未設定時は従来どおり fail」は実コードと整合。
- `extractText` の `case "audio"`（513-518 行）は実在し `deps.speech.transcribe(...)` を呼ぶ。
- barrel/registry の value-cycle 回避パターン（`openai/index.ts` が `import type { ProviderAdapter }` のみ、`llm/registry.ts` が adapter を value import）を確認。→ S-005 の「`openai/index.ts` に `openaiSpeechAdapter` を追加し型のみ依存維持」は既存パターンと一致。
- `maskApiKey(cfg: LLMConfig)`（`view.ts`）は実体として `apiKeySource`/`apiKeyCiphertext` しか参照しない。→ S-003 の「構造型へ汎用化して LLM/speech 双方で使う」は安全。

ブロッカーは残っていない。

---

#### 問題点（要修正）

- **問題点ゼロ**

実コードで検証した範囲では、アーキテクチャ整合性・実現可能性のいずれにも実装を止めるブロッカーは見当たらない。依存方向（presentation → application → domain、adapter は port 実装）、検証 2 点（transport / VO）、registry のコンパイル時網羅、env>db>stub フォールバック、`*ErrorCode` の lower_snake_case 規約など、本プロジェクトのあるべき構造に沿っている。

#### 改善提案（検討推奨）

- **[S-001]**（軽微・実装時メモ）ステップ6 の Workers multipart PoC（ADR-001 / リスク節でも筆頭に挙がっている OpenAI transcribe の Workers 上 multipart 未検証）は、計画上「実装前タスク」として正しく前倒しされている。これは指摘ではなく確認事項だが、**PoC が NG だった場合の退避先（ADR で後続最適化扱いの Workers AI `env.AI` 経由、または別プロバイダへの registry 差し替え）**を PoC 着手時点で念頭に置いておくと、唯一の実現可能性リスクに対する手戻りが最小化できる。計画には退避方針が散在して記述済み（スコープ除外節・リスク節）なので、新規修正は不要。

#### 良い点

- AC-6（文字起こし失敗時の縮退保存）が「実プロバイダの `SpeechFailureError` のみ縮退／未設定 Stub は従来どおり fail」と明確に切り分けられ、実コードの例外型・`classifyPipelineError` の分岐順と完全に一致している。空ノート量産・設定し忘れ隠蔽という副作用への配慮も妥当。
- `IngestionPreview` VO を変更せず注記方式（`class="ingestion-failure-note"` 固定 HTML・サニタイザ非経由）で失敗を表現する判断が、波及範囲（VO は 10〜15 箇所で消費）とサニタイザの `data-*` 剥がし挙動の両方を実コードで検証したうえで確定されている。
- `SpeechRecognitionConfig` を独立 VO + 対称サービス関数とする判断（ADR-003）、Speech registry の分離（ADR-002）、env binding 波及範囲の行番号付き列挙（ステップ10）が、既存 LLM 系の構造と対称で、実装者が迷わない粒度まで具体化されている。
- 接続テストを transcribe ではなく軽量 probe にし、AC-1 の合格境界（モデル存在/認証まで）と AC-3/手動の実音声疎通を分離した点（ADR-006）が、「接続テストは通るのに実録音で失敗」の誤判定を防いでいる。

---

## 返答

- 問題点: 0 / 改善提案: 1
- [S-001] Workers multipart PoC が NG の場合の退避先（Workers AI 経由 / 別プロバイダ差し替え）を PoC 着手時に念頭に置く（計画に記述済みのため新規修正不要・軽微）

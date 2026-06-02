# ADR — Issue #396: プロンプト設定の関心の分離

## ADR-001: 対応範囲は「限定フル」とし、port/DTO/DB は変えずアダプタの組み立て規則のみ変更する

### Status
Proposed

### Context
Issue #396 は「最小（文言整合のみ）」と「フル（DTO・resolver・admin UI・テスト横断）」の2案を提示している。核心は、現状 operator に①ロール宣言を *上書き* させている作りを改め、operator が触る関心を②「分析の意図」だけに絞ること。

- 最小案では `prompts.ts` の `input.prompt` 非空時に①が *置換* される構造が残るため、operator が依然①を壊せ、Issue の意図を満たさない。
- 最大フル案（`LLMStructureInput.prompt` の型変更、`PromptTemplate` VO・DTO・DB スキーマの再設計）まで行うと波及が大きい。

### Decision
`prompts.ts`（3プロバイダ共通の単一実装）の組み立て規則だけを変更する。①ロール宣言を常に固定で出力し、`input.prompt`（operator の意図）を *置換* ではなく *追記* に変える。port の `prompt` フィールドは `string` のまま、DTO・resolver・DB・`PromptTemplate` VO・migration は不変。意味論（空文字 = operator の追加意図なし）を JSDoc/spec/UI 文言で明文化する。

### Consequences
- 良い点: 型・スキーマ変更ゼロでリスク最小。ADR-002（空文字保持）/ ADR-006（空文字 update 不可）の既存契約をそのまま再利用できる。operator は③出力契約を構造的に壊せない。
- トレードオフ: 「operator の意図」を独立フィールドとして DTO/DB に明示する将来像とは異なり、引き続き `prompt` 一本に意味を載せる。型レベルで「意図フィールド」を表現しきれない点は JSDoc 補足で担保する。

### 追記セクションの前置きラベル
operator の意図文を役割宣言の後ろに追記する際は、固定の前置きラベル `"Additional analysis guidance from the operator:"` を必ず付ける。理由: 旧来「全文上書き」前提で①相当を自前で書いていた移行ユーザーの文と、システム固定の①ロール宣言が並んだとき、どこからが operator の追加指示かを LLM に明示し、二重ロール宣言の混乱を避けるため。このラベルが必ず付くことを `prompts.test.ts` で assert し、移行時の挙動をテストで固定する。

---

## ADR-002 (再掲・是正): 空文字の意味は「LLM プロバイダの自前既定指示」ではなく「operator の追加指示なし（システム既定の役割＋出力契約のみ）」

### Status
Proposed（Issue #218 ADR-002 の説明文の是正）

### Context
Issue #218 ADR-002 は「`BUILTIN_PROMPT_DEFAULTS.text` を空文字に保ち、空文字を *LLM プロバイダの自前既定指示* へのフォールバック合図とする」と説明していた。しかし実体は、空文字のときアダプタ層（`prompts.ts`）がハードコードした固定ロール文＋②③を組み立てるのであり、provider のデフォルトではない。この事実誤認が defaults.ts / getEffectiveIngestionPrompts.ts / PromptsForm / UploadDialog / 各 spec に波及している。

### Decision
ADR-002 の*決定*（空文字を保持する／`promptResolver` 契約を変えない／UI ラベルは presentation 層で表現する）は維持する。ただし*説明文*の「LLM プロバイダの自前既定指示」という記述を「operator の追加指示なし。アダプタが固定のロール宣言＋出力契約のみでシステムプロンプトを組む」へ是正する。コード（空文字保持）は変えない。

### Consequences
- 良い点: ドキュメント・UI と実体が一致し、operator の誤解（「プロバイダに丸投げしている」）を解消する。
- トレードオフ: 「プロバイダ既定指示」表現が散在しているため、是正漏れがあると再び乖離する。grep で全消しを確認する必要がある。

---

## ADR-003: 是正後の UI 文言の確定値（実装時の具体化）

### Status
Accepted（実装時に plan.md の「〜相当」を具体値へ確定）

### Context
plan.md は是正後の文言を「（追加の指示なし）相当」「システム既定」等と概念で指示しており、実値は実装者が確定する必要があった。`PromptsForm` の `defaultLabel` と placeholder は別定数へ分離する要件（plan [P-002]）もあった。

### Decision
- `app/components/admin/PromptsForm/index.tsx`
  - `NO_OVERRIDE_LABEL = "（追加の指示なし）"`（既定値表示用ラベル）。
  - `INTENT_PLACEHOLDER = "どう分析してほしいかの意図を記入（空欄ならシステム既定の動作）"`（textarea placeholder、意図記入を促す）。両者を別定数に分離。
  - フィールドラベル「プロンプト本文」→「分析の指示（任意）」。
  - confirm description → 「すべての上書きが削除され、各プロンプトはシステム既定の動作に戻ります。…」。
- `app/components/ingestion/UploadDialog.tsx`
  - 定数 `BUILTIN_PROMPT_FALLBACK_COPY` → `SYSTEM_DEFAULT_PROMPT_COPY = "システム既定の動作を使用"`。
  - `sourceLabel` 空既定分岐 `"プロバイダ組み込み"` → `"システム既定"`。
- `defaults.ts` JSDoc 内の UI コピー引用値も `"システム既定の動作を使用"` へ追従。
- 追記セクションの前置きラベルは ADR-001 の `"Additional analysis guidance from the operator:"` を採用。

### Consequences
- 良い点: 「プロバイダ既定／組み込み／provider-fallback」系の事実誤認文言を一掃。`spec/` も同モデルへ統一。
- 注意: `app/components/identity/PromptsForm/index.tsx`（P23 ユーザー向けカスタムプロンプト）は plan.md ステップ5の対象外（admin 限定指定）のため未変更。同画面のバリデーションメッセージ「プロンプト本文を入力してください」は残置（別Issue対象の可能性）。

---

# ADR — Issue #430: プロンプト設定の関心分離（#396 残課題）

## ADR-001: title/directory の operator 意図を「実際に反映」する（方針 a）

### Status
Accepted（ユーザー選択）

### Context
admin プロンプト設定の title/directory カードは、ingestion パイプラインが実際に LLM へ渡す2 purpose（structure/metadata）に含まれず、`buildStructureSystemPrompt` 内のハードコードのみが効くため operator の入力がどこにも届かない（dead input）。対応案は (a) 実際に反映、(b) UI で「未消費」と明示、(c) カード整理の3案。

### Decision
方針 **(a)** を採用。`IngestionPromptPurpose` は既に `structure|title|directory|metadata` の4値で resolver 解決可能なため、port purpose の追加なしに title/directory を生かせる。`LLMStructureInput` に `titlePrompt`/`directoryPrompt` を追加し、`runIngestionJob` の LLM 構造化分岐で resolver 解決して `buildStructureSystemPrompt` に渡し、title/directory ガイダンス行の直後に operator 意図を追記する。ocr_assist は ingestion 未参照（spec で将来プロビジョン明記済み）のため対象外。

### Consequences
- 良い点: operator が title/directory カードに書いた意図が実際に LLM へ届く。dead-input の誤解を「明示」ではなく「機能化」で根本解消。3プロバイダ共通ビルダー1箇所の変更で全反映。
- トレードオフ: (b) より波及が大きい（port 型・runIngestionJob・テスト）。LLM への送出プロンプトが変わるため挙動が変化し、テストで固定が必要。

---

## ADR-002: title/directory 意図フィールドは必須 `string`（optional にしない）

### Status
Accepted

### Context
`LLMStructureInput` に title/directory 意図を追加するにあたり、`titlePrompt?: string`（optional）と `titlePrompt: string`（必須・空文字許容）の2案がある。

### Decision
必須 `string` とし、空文字＝「追加の意図なし」とする。既存 `prompt` フィールドと完全に同一のセマンティクスで統一。`runIngestionJob` が常に resolver 解決値（空文字を含む）を渡すため型安全。既存 `operatorIntentSection`（trim 後空なら空配列を返す）を3フィールドで再利用し、空文字時はシステム既定ガイダンスのみ出力する。

### Consequences
- 良い点: 「未指定」と「意図なし」の2状態が生まれず、#396 で確立した空文字セマンティクスとぶれない。型レベルで全フィールド一貫。
- トレードオフ: fake/テストヘルパで未設定だと型エラーになるが、これは追従漏れを防ぐガードとして機能する。

---

## ADR-003: P23 ユーザー画面の文言は admin の流用ではなく所有ニュアンスを残す

### Status
Accepted

### Context
admin（`admin/PromptsForm`）は #396 ADR-003 で「分析の指示（任意）」「（追加の指示なし）」等の文言を確定済み。P23（`identity/PromptsForm`）は一般ユーザー向けで「あなたの」という所有のニュアンスがあるため、admin 文言の単純流用は UX 上不自然になりうる。

### Decision
概念（意図／システム既定）は admin と一致させつつ、所有表現を残す。ラベルは「あなたの分析の指示（任意）」、placeholder は意図記入を促す固定文言、バリデーションメッセージは空保存を `デフォルトに戻す` 経路へ誘導する文言にする。「全文上書き」前提の表現（「プロンプト本文」「上書きできます」「placeholder=defaultPrompt.text」）を排除する。

### Consequences
- 良い点: admin と user で同一概念の見せ方が整合しつつ、user 向けの所有ニュアンスを保持。
- トレードオフ: 文言が admin と完全一致ではないため、将来の文言変更時に両画面を意識する必要がある。

---

## ADR-004: operator 意図セクションの配置は structure と title/directory で非対称にする

### Status
Accepted

### Context
#396 ADR-001 では operator 意図を「役割宣言の直後・JSON 出力契約の前」に集約していた。今回 title/directory 意図を追加するにあたり、(i) 全意図を従来どおり契約宣言の前に集約する案と、(ii) title/directory 意図はそれぞれ対応するガイダンス行（titleSuggestion / directoryGuidance、これらは JSON 出力契約宣言の後にある）の直後に置く案がある。

### Decision
(ii) を採用。structure 本体の意図（`input.prompt`）は従来どおり役割宣言の直後・契約宣言の前に置く一方、title 意図は titleSuggestion ガイダンス行の直後、directory 意図は directoryGuidance 行の直後に置く。結果として意図セクションは出力契約宣言を挟んで非対称に分散する。`prompts.ts` の JSDoc にこの非対称を一文残し、`prompts.test.ts` で配置を固定する。

### Consequences
- 良い点: title/directory 意図が「どの関心への補足か」を対応ガイダンス行への隣接で LLM に文脈付けできる。JSON 出力契約の末尾固定（システム所有・破壊不可）は維持。
- トレードオフ: #396 の「意図は1箇所に集約」という単純なメンタルモデルからは外れる。JSDoc 注記とテスト固定でこの意図的な非対称を将来の読者に明示する。


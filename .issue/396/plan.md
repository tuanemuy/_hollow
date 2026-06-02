# 実装計画 — Issue #396: プロンプト設定: operator が触るのは「分析の意図」だけにする（role/出力契約をシステム領域へ分離）

**Issue:** #396
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

管理画面のプロンプト設定で、operator に「①ロール宣言を上書きさせる」現状の作りを改め、operator が触る関心を「②どう分析してほしいか（分析の意図）」だけに絞る。①ロール宣言・③出力契約（JSON 形式・キー名・コードフェンス禁止など）はシステム領域としてアダプタ層に常時固定で封じ込め、operator には見せない・壊させない構造にする。あわせて「（プロバイダ既定指示）」という事実と食い違う UI 文言・ドキュメントを「operator の追加指示なし（システム既定の振る舞いのみ）」という正しいモデルへ是正する。

## スコープ

### 含まれるもの

- `prompts.ts` のシステムプロンプト組み立てを「①ロール宣言を常に固定で出力し、operator の意図（`input.prompt`）は *置換* ではなく *追記* する／空なら追記しない」構造へ変更（①③をシステム領域に封じる）
- port / DTO の JSDoc を「空文字 = operator の追加意図なし。アダプタが固定の役割＋出力契約のみでシステムプロンプトを組む」へ是正（型・シグネチャは不変）
- admin プロンプト設定 UI（`PromptsForm`）の文言・ラベル・placeholder・confirm を「分析の指示（任意）」モデルへ是正
- 同じミスリーディング表現が波及している箇所の文言是正（後述「文言是正の対象範囲」を参照）
- ドキュメント（`spec/`）の該当記述の是正と、関連するテストの追加・更新

### 含まれないもの

- port シグネチャ・DTO 構造・DB スキーマ・`PromptTemplate` VO・migration の変更（意味論は不変のため不要）
- `BUILTIN_PROMPT_DEFAULTS.text` を空文字に保つ決定（Issue #218 ADR-002）の変更 — 維持する
- per-upload override の入力導線そのもの（UploadDialog）の機能変更 — 「プロバイダ既定／組み込み」系のミスリーディング文言の是正のみ対象、機能は不変。バッジコピー「この回だけ上書き」「既定を使用中」は置換→追記への意味変化を含むが、ユーザーには「この回だけ意図を足す」程度の差で実害がないため #396 では変更しない（必要なら別Issue）
- title / directory / ocr_assist purpose が ingestion 未消費である現状（dead input — admin UI のこれらカードに operator が書いた意図は LLM へ届かない）は #396 では是正しない。②の意図フィールド化が実効を持つのは ingestion が実際に `resolveFor` で消費する structure / metadata のみ。3カードの扱いは #218 系の既存設計に由来する別問題
- プロバイダ固有のシステム寄り指示の新規追加（将来も③の内側＝アダプタ private に閉じる方針を JSDoc に記すのみ）
- `app/components/admin/schema.ts` の `text: z.string().min(1)`（空文字 update 不可＝リセット扱い、ADR-006）の変更 — 維持

## 実装ステップ

### 1. `prompts.ts` — ①をシステム固定領域へ、②を operator 意図の追記へ再構成

- **対象ファイル:** `app/core/adapters/llm/prompts.ts`
- **変更内容:**
  - `buildStructureSystemPrompt`: 役割宣言 `"You convert raw note material into a sanitised HTML draft."` を**常に**先頭固定文として出力する（`input.prompt` で置換しない）。`input.prompt.trim()` が非空のときのみ、その意図文を役割宣言と②ガイダンスの間に固定の前置きラベル（ADR-001 で確定する文字列、例: `"Additional analysis guidance from the operator:"`）付きセクションとして追記する。空（空白・改行のみ含む）なら何も足さない。②（title/directory ガイダンス）・③（JSON 契約・コードフェンス禁止・前後テキスト禁止）は従来どおり末尾固定。
  - `buildMetadataSystemPrompt`: 同様に `"You extract tag names and aliases from an HTML note body."` を常に固定で出力し、`input.prompt` 非空時のみ意図文を追記。②（タグ粒度ガイダンス）・③は末尾固定。
  - `hasExistingDirectories` / `directoryGuidance` / user message ビルダーは変更不要。
- **理由:** ①③をシステム領域に封じ、operator の意図は「上書き」ではなく「追記」になる。operator は③を含む全文 textarea を持たないため、③が構造的に壊れない。

### 2. port の JSDoc 是正

- **対象ファイル:** `app/core/domain/ingestion/ports/llmProvider.ts`
- **変更内容:** `LLMStructureInput.prompt` / `LLMMetadataInput.prompt` に「operator が任意で与える *追加の分析意図*。アダプタは固定のロール宣言＋出力契約に *追記* するのみで、空文字はシステム既定（追加意図なし）を意味する」旨の JSDoc を追加。型は `string` のまま不変。
- **理由:** port の意味を「上書きする全文」から「追記する意図」へ明文化。

### 3. `BUILTIN_PROMPT_DEFAULTS` の JSDoc 是正

- **対象ファイル:** `app/core/domain/adminSettings/defaults.ts`
- **変更内容:** 「empty resolved template → LLM provider's own default instruction」記述を「empty = operator の追加指示なし。アダプタ層が固定のロール宣言＋出力契約のみでシステムプロンプトを組む（provider 固有の既定ではない）」へ訂正。`text` を空文字に保つ ADR-002 の決定自体は維持し、その旨を明記。
- **理由:** ドキュメント乖離の解消（コードは変えない）。

### 4. `EffectiveIngestionPrompt` の JSDoc 是正

- **対象ファイル:** `app/core/application/ingestion/getEffectiveIngestionPrompts.ts`
- **変更内容:** 「empty → LLM provider's built-in instruction」記述をステップ3と同じ趣旨へ訂正。projection ロジックは不変。
- **理由:** 同上。

### 5. admin プロンプト設定 UI を「分析の指示（任意）」モデルへ是正

- **対象ファイル:** `app/components/admin/PromptsForm/index.tsx`
- **変更内容:**
  - `defaultLabel`（`"（プロバイダ既定指示）"` `:153-154`）を「（追加の指示なし）」相当の日本語ラベルへ。`defaults.text === ""` 分岐の意味づけを「分析の指示なし＝システム既定の振る舞いのみ」に。
  - **`defaultLabel` と textarea placeholder を別文字列に分離する**。現状は `placeholder={defaultLabel}`（`:185`）と「既定値: {defaultLabel}」（`:171`）が同一変数を共有しているため、`defaultLabel` を「（追加の指示なし）」に変えると placeholder もそれになり「意図記入を促す placeholder」要件と衝突する。既定値表示用ラベルと、意図記入を促す placeholder 文言を別定数にする。
  - フィールドラベル「プロンプト本文」を意図フィールドである旨（例:「分析の指示（任意）」）へ。`PROMPT_DESCRIPTORS` の各 `description` を「どう構造化/タイトル付け/タグ付けしてほしいか」の意図記述に寄せる。placeholder は意図記入を促す日本語へ。
  - 「既定値:」表示行・confirm ダイアログ（`:309` の「プロバイダの既定指示に戻ります」）を「追加の指示が削除され、システム既定の動作に戻ります」等へ。
  - `:97` のコメント "no override = LLM provider default" も是正。
  - hint「空にしたい場合はリセット」（ADR-006 由来）は維持。
  - `PROMPT_DESCRIPTORS` の purpose 集合・順序・schema・action は不変（文言のみ変更）。
- **理由:** operator が触るのは②の意図だけ、という Issue の核心を UI に反映。

### 6. 文言是正の対象範囲（波及箇所）

同じ「プロバイダ既定指示」という事実誤認が下記にも存在する。Issue の核心（空文字の意味の是正）と同根なので、半端に直すと再び乖離する。**レビューループでスコープを最終確定**したうえで、確定範囲を一貫して是正する。

- `app/components/ingestion/UploadDialog.tsx:690-695` — コメント「falls back to the LLM provider's built-in instruction」＋ `BUILTIN_PROMPT_FALLBACK_COPY = "LLM プロバイダの既定指示を使用"`（per-upload override の placeholder/コピー）。機能は不変、文言のみ。
- `app/components/ingestion/UploadDialog.tsx:741` — `sourceLabel` の `"プロバイダ組み込み"` 分岐（空既定ケースの出所ラベル — 同根の事実誤認）。「システム既定」相当へ是正。
- `app/components/ingestion/UploadDialog.tsx:706` 周辺 — `BUILTIN_PROMPT_FALLBACK_COPY` 定数名と「provider-fallback」系コメントの語彙統一（同根の「empty → provider fallback」誤認）。
- `app/components/ingestion/__tests__/UploadDialog.test.tsx:1538,1553,1555,1559,1562` — テスト名 "shows the provider-fallback copy …"・コメント・assert（"LLM プロバイダの既定指示を使用" / "プロバイダ組み込み"）すべて文言変更に追従。
- `app/core/adapters/d1/promptResolver.ts:62` — コメント "built-in instructions"。
- `app/core/domain/adminSettings/defaults.ts:11` — JSDoc 内に埋め込まれた UI コピー実値 `"LLM プロバイダの既定指示を使用"`（ステップ3の本文是正と合わせ、ステップ6で定数値を変えたら本引用も追従）。
- `spec/domains/adminSettings.md:39`, `spec/usecases/adminSettings.md:82,134`, `spec/scenario/admin.md:46,49,58`, `spec/pages/index.md:404`, `spec/manual-tests/admin.md:145,156,176` — 「LLM プロバイダの既定指示」系の記述。

### 7. テスト追加・更新

- **新規** `app/core/adapters/llm/__tests__/prompts.test.ts`: (a) `input.prompt` 空でもロール宣言＋②③が出る、(b) 非空時に意図文が *追記* され、前置きラベル（ADR-001 で確定する固定文字列）が必ず付与され、③（"Do not include code fences" / JSON 契約）が常に末尾に残る、(c) operator 入力が③を置換・破壊できない、(d) `input.prompt` が空白・改行のみ（`trim()` で空）のとき追記されない、を assert。structure / metadata 両ビルダーで検証。
- 既存プロバイダテスト（`app/core/adapters/{anthropic,openai,gemini}/__tests__/llmProvider.test.ts`）の②③ substring assert は維持される想定。回帰確認。
- `UploadDialog.test.tsx:1555,1559,1562` のコピー assert を文言変更に追従。

## 設計判断

詳細は `.issue/396/adr.md` を参照。要点:

- **対応範囲は「限定フル」**: port シグネチャ・DTO・resolver・DB・ドメイン VO は触らず、`prompts.ts` の組み立て規則の変更だけで「operator の意図を上書き→追記」へ意味変更する。最小（文言整合のみ）では「operator が①を置換できる」構造が残り Issue の意図を満たせない。最大フル（型・スキーマ変更）は不要。
- **role/出力契約の封じ込め**: ①③は `prompts.ts` 内に常に固定出力。operator 入力は③より前のセクションに限定し、operator は③を含む全文を編集できない。
- **ADR-002 の扱い**: 決定（空文字保持・resolver 契約不変・UI ラベルは presentation 層）は維持。ADR の *説明文* にある「LLM プロバイダの自前既定指示」という事実誤認のみ是正。

## リスクと注意点

- **ingestion の実 system prompt 文字列が変わる**: 従来「operator が非空テキストを入れると①が消えていた」挙動が「①が常に残り、後ろに operator 文が付く」へ変わる。既存 operator が「①を完全置換する前提で全文を書いていた」場合に二重ロール宣言が混ざる懸念。前置きラベルで自然さを保つ。
- **既存テストの substring 依存**: ②③ substring は単一行内に収まるため `join("\n")` 構成変更でも壊れない見込みだが、テスト実行で要確認。
- **文言是正の網羅性**: 1箇所でも「プロバイダ既定／組み込み／provider-fallback」表現が残ると再び乖離。`grep -rn "プロバイダ既定\|プロバイダの既定\|プロバイダ組み込み\|provider.*default\|provider-fallback\|fallback copy\|built-in instruction"` で全消し確認（「組み込み」「fallback」を必ずパターンに含める — 旧 grep では `sourceLabel` の "プロバイダ組み込み" やコメント/テスト名の "provider-fallback" を拾えない）。コメント・テスト記述も対象（機能影響はないが収束基準の網羅性のため）。
- **プロバイダ間 drift**: 変更は `prompts.ts`（3プロバイダ共通の単一実装）に閉じるので drift リスクは増えない。

## テスト方針

- **自動（必須）**: `pnpm test:unit`（3プロバイダ回帰 + 新規 prompts.test.ts）、`pnpm typecheck && pnpm lint:fix && pnpm format`。
- **手動（任意）**: admin プロンプト設定画面（P42）でラベル/placeholder/confirm 文言の是正と override 保存→リセット導線を確認。ingestion の実 system prompt 組み立ては unit で担保（server-function 経由 mutation はブラウザ検証せず）。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 2視点並列）

**修正した点**:
- [P-001]（両視点）`UploadDialog.tsx:741` の `sourceLabel = "プロバイダ組み込み"` と `:690-695` コメント、テスト `:1559` を文言是正の波及箇所（ステップ6）へ追加。リスク節の grep パターンに「組み込み」を含め、旧パターンでは拾えなかった取りこぼしを是正。
- [P-002]（アーキ）`PromptsForm` の `defaultLabel` と textarea placeholder が同一変数を共有している点（`:171` と `:185`）をステップ5で別文字列へ分離する指示に変更。「（追加の指示なし）」ラベルと「意図記入を促す placeholder」の衝突を回避。
- [S-001arch]（アーキ）追記セクションの前置きラベル文字列を ADR-001 に確定（`"Additional analysis guidance from the operator:"`）し、ステップ1・テスト節へ反映。`prompts.test.ts` でラベル付与を assert。
- [S-002arch]（アーキ）`input.prompt` が空白・改行のみ（`trim()` で空）のケースを「追記しない」と明記し、テスト項目(d)を追加。

**取り込んだ改善提案**:
- [S-001req] title / directory / ocr_assist purpose が ingestion 未消費（dead input）である現状を #396 スコープ外と「含まれないもの」に明記。
- [S-002req] per-upload override のバッジコピー「この回だけ上書き／既定を使用中」が置換→追記の意味変化を含む点を「含まれないもの」で切り分け（実害なしのため #396 では変更しない）。

**見送った提案とその理由**:
- [S-003arch] 行番号付き参照の追加は精度向上目的の指摘で、該当 JSDoc は既にステップ4でカバー済み（`getEffectiveIngestionPrompts.ts:16-18`）。実害なしのため軽微対応にとどめる。

### 2周目（要件カバレッジ / アーキ・リスク 2視点並列）

**修正した点**:
- [P-001arch / S-001req]（両視点）grep 収束パターンの盲点を是正。「provider-fallback」「fallback copy」系のコメント・テスト名（`UploadDialog.tsx:706` 周辺、`UploadDialog.test.tsx:1538,1553`）がパターンを素通りしていたため、grep パターンに `provider-fallback\|fallback copy` を追加し、ステップ6の波及箇所へ明記。機能影響はゼロ（コメント/テスト記述のみ）だが収束基準の網羅性として是正。
- [S-002req / S-001arch] `defaults.ts:11` JSDoc に埋め込まれた UI コピー実値 `"LLM プロバイダの既定指示を使用"` を、ステップ6で定数値を変えたら追従する旨ステップ6へ明記（二重管理の取りこぼし防止）。

**収束判定**: 両視点とも要修正の核心は「同根の誤認文言の grep 網羅性」のみで、設計・スコープ・アーキ整合性には問題点ゼロ。上記反映で文言網羅の盲点を解消し、収束とみなす。

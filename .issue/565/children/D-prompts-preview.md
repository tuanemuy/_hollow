親: #565 / 祖: #514 / 元: #543（領域4「設定」モック追従）

## 背景

#565「設定画面のフィールド拡充（backend 拡張要）」の子Issue（ページ単位 4 分割の **D: P23 プロンプトプレビュー**）。#543 では P23 はカスタムプロンプトの section-desc 整合のみ追従し、プロンプトプレビュー（入出力サンプル・「サンプルで実行」）は LLM 実行機構の新規構築が必要なため見送った。本 Issue でプレビュー機構を実装する。**4 子Issue の中で最も大物。**

## スコープ（モック `spec/design/pages/P23-settings-prompts.html` 由来）

### プロンプトプレビュー

- 各用途のカスタムプロンプトについて、入力サンプル → 出力サンプルのプレビュー表示。
- 「サンプルで実行」ボタンで、ユーザーが編集中のプロンプトを実際に LLM で試せる。

## 既存メカニズム（再利用可能）

- **5 用途（PromptPurpose）**: structure / title / directory / metadata / ocr_assist（`app/core/domain/adminSettings/valueObject.ts:38-51`、frontend は `app/components/identity/PromptsForm/index.tsx:43-49`）。
- **LLMProvider port**: `app/core/domain/ingestion/ports/llmProvider.ts:147-162`。`structureToHtml(input)` / `suggestMetadata(input)`。エラー型あり（LLMRateLimitError / LLMUnavailableError / LLMTimeoutError / LLMQuotaExceededError）。
- **PromptResolver port**: `app/core/domain/ingestion/ports/promptResolver.ts:26-28`。`resolveFor(userId, purpose)` で有効プロンプトを解決（ユーザーオーバーライド → インスタンスデフォルト → ビルトインの優先順）。
- **有効値取得 usecase**: `getEffectiveIngestionPrompts`（`app/core/application/identity/getEffectiveIngestionPrompts.ts:60-95`）。
- **実行経路の先行例**: `runIngestionJob`（ingestion パイプライン）が `structureToHtml()` / `suggestMetadata()` を呼ぶ実装。

## 必要な新規構築

1. **プレビュー実行 usecase**（新規）:
   - 入力: `userId` / `purpose` / `sampleText` / 編集中の `overridePrompt`（任意）。
   - 編集中プロンプトを優先（無ければ `promptResolver.resolveFor` で有効値）して `LLMProvider` を実行。
   - LLM エラー（rate limit / unavailable / timeout / quota）を application エラーに翻訳して UI に返す。
   - **レート/コストへの配慮**: プレビューは実 LLM 課金を発生させるため、呼び出し制限・サンプル長上限・濫用防止を設計する（要検討論点）。
2. **frontend**: `app/components/identity/PromptsForm/`（`index.tsx` / `action.ts` / `Page.tsx` / `schema.ts`）にプレビュー UI（サンプル入力欄・実行ボタン・出力表示・ローディング/エラー表示）を追加。

## 原則（#543 で確立）

- **虚偽表示禁止**: プレビューは実 LLM の実出力を表示する（ダミー固定文言を「出力サンプル」と偽装しない）。実行できない用途・状況ではその旨を正直に表示する。
- 対象モックは `spec/design/pages/P23-settings-prompts.html`（SSOT）。デザイントークン経由で寸法・色を当てる。

## 検討論点（実装前に要確認）

- プレビューの LLM 課金をどう抑えるか（回数制限・サンプル長・対象用途の限定）。
- 5 用途すべてをプレビュー対象にするか、構造化（structure）等の代表用途に絞るか。

## 参考

- #543 計画・ADR: `.issue/543/plan.md` / `.issue/543/adr.md`（ADR-002）
- 親 #565 / 棚卸し `.issue/500/followups.md`

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

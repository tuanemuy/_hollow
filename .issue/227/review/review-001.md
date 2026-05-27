# PR Review #001 — fix(llm): harden JSON envelope parsing with structured output + retry

**PR:** #234
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 8 (Adapter: 5, Test/Arch: 3)
- Notes: 11
- Verdict: **BLOCKED**

---

## LLM Adapter Layer

### Blockers

- **[B-001]** リトライ中の `LLMRateLimitError` / `LLMQuotaExceededError` / `LLMTimeoutError` が `LLMUnavailableError` に書き換えられ、queue 再配信パスが死ぬ
  - 場所: `app/core/adapters/openai/llmProvider.ts:177-184`、`app/core/adapters/anthropic/llmProvider.ts:208-223`、`app/core/adapters/gemini/llmProvider.ts:181-189`
  - 理由: `invokeWithRetry` の 2 回目 `await this.invoke(...)` を try/catch で囲み、**すべての throw を `LLMUnavailableError("...after 1 retry", cause)` でラップしている**。`runIngestionJob.ts:150-153` は `LLMRateLimitError` のみを再 throw して queue 再配信に回す設計だが、本変更で「1 回目パース失敗 → リトライで HTTP 429」のシナリオで rate-limit が permanent failure として観測される。`LLMQuotaExceededError` / `LLMTimeoutError` も同様にセマンティクスを失う。ADR-001 で謳う「`LLMUnavailableError` のセマンティクスを変えない」を担保できていない。
  - 提案: try/catch を削除し、2 回目 invoke の throw は素通しする。catch が必要なのは「2 回目で `extractJsonObject` がやはり null を返した」場合の最終 throw だけ:
    ```ts
    const secondText = await this.invoke(retrySystem, user);  // throws stay as-is
    const secondParsed = validate(secondText);
    if (secondParsed !== null) return secondParsed;
    throw new LLMUnavailableError("... after 1 retry");
    ```

### Warnings

- **[W-A-001]** 前置きテキスト中に擬似ブレース対 `{...}` を含むケースでパースが諦め、配列フォールバックも効かない
  - 場所: `app/core/adapters/llm/jsonEnvelope.ts:31-44`
  - 理由: `"Greeting {John}, here: {\"k\":1}"` のような応答だと、`findBalancedSlice` が最初の `{John}` を切り出し → `JSON.parse` で失敗 → 終了する。配列フォールバックは `[` を探すので効かない。後段リトライで救える設計だが、パーサー耐性として 1 歩弱い。
  - 提案: `findBalancedSlice` を「次の `open` 位置から retry 可能」にする（line スキャンの拡張）。テストにも擬似ブレースのケースを追加して挙動を固定。

- **[W-A-002]** Anthropic prefill 時に将来 multi-turn 化で role alternation 違反になりうる
  - 場所: `app/core/adapters/anthropic/messagesClient.ts:174-182`
  - 理由: 現状 `messages` は単発 user + prefill assistant なので問題なし。将来 multi-turn 化したときに「末尾が assistant だった場合に prefill を別 assistant メッセージとして push する」と Anthropic API が 400 を返す。
  - 提案: messagesClient に「prefill は single-turn 専用」のコメントを残す。

- **[W-A-003]** Anthropic の `{` 再 prepend ロジックが無駄な再パースを実行する
  - 場所: `app/core/adapters/anthropic/llmProvider.ts:224-225`
  - 理由: `validate(secondText) ?? validate("{" + secondText)`。secondText が既に `{` で始まる場合、二段目の `{{...}` は `extractJsonObject` 内で誤った内側オブジェクトを抽出するか必須キー欠落で null。無駄な計算。
  - 提案: `secondText.trimStart().startsWith("{") ? null : validate("{" + secondText)` で分岐。

- **[W-A-004]** 構造化出力フラグ非対応モデルでの 400 がドキュメント化されていない
  - 場所: `app/core/adapters/openai/llmProvider.ts`、`gemini/llmProvider.ts`
  - 理由: testing.md ではスコープ外として許容しているが、運用上ハマる可能性。
  - 提案: 各 LLMProvider クラスの JSDoc に「`response_format` / `responseMimeType` 非対応モデルでは 400 → `LLMUnavailableError`。互換性は呼び出し側責任」を追記。

- **[W-A-005]** retry suffix の改行区切り（見栄え）
  - 場所: 3 adapter
  - 理由: 挙動には影響しない。
  - 提案: 不要。

### Notes

- **[N-A-001]** balanced-brace スキャナのエスケープ処理は正しい
- **[N-A-002]** messagesClient の optional 引数追加は OCR/PDF に breaking change ゼロ
- **[N-A-003]** ADR-003 の二段検証は Anthropic API 実挙動への正当な保険
- **[N-A-004]** `RETRY_SYSTEM_SUFFIX` 重複は plan で承認済み
- **[N-A-005]** `invokeWithRetry` の hexagonal 観点は健全（port 不変、driver-level transient adapter 閉じ）

---

## Test & Architecture

### Blockers

なし

### Warnings

- **[W-T-001]** `suggestMetadata` 経路でのリトライ成功シナリオが 3 provider すべてで欠落
  - 場所: `app/core/adapters/{openai,anthropic,gemini}/__tests__/llmProvider.test.ts`
  - 理由: 「1 回目壊れ → 2 回目正常」は `structureToHtml` のみで検証されている。`suggestMetadata` は別の system prompt builder と validator を持つので、同じヘルパー (`invokeWithRetry`) 経由でも対称テストが望ましい。
  - 提案: 各 provider に 1 件「suggestMetadata: 1 回目 tags 非配列 → 2 回目正常 → fetch 2 回」を追加。

- **[W-T-002]** `extractJsonObject` の brace scanner、prose 内擬似ブレース対の挙動が未テスト
  - 場所: `app/core/adapters/llm/__tests__/jsonEnvelope.test.ts`
  - 理由: 擬似ブレース対 `{John}` の前置きで本物の `{"k":1}` が後ろにあるケース、prose 内に閉じていないクォートがあるケースが未網羅。
  - 提案: 「prose に擬似ブレース対 → null（リトライに委ねる）」か「擬似ブレースを跨いで本物の `{...}` を拾えるか」のいずれかを境界として固定。

- **[W-T-003]** Anthropic prefill 2 段検証ロジックの self-evidence が低い
  - 場所: `app/core/adapters/anthropic/llmProvider.ts:224-225`
  - 理由: コメントで WHY は説明されているが、`validate` の中身が変わると prefill prepend が機能しなくなる可能性。
  - 提案: 現状コメントで許容可。または adapter-local 小関数に切り出し。

### Notes

- **[N-T-001]** plan/ADR と実装の整合性は高い
- **[N-T-002]** port contract と `runIngestionJob` セマンティクスは変更なし
- **[N-T-003]** OCR/PDF パスへの breaking change なし
- **[N-T-004]** コメントは WHY 中心で CLAUDE.md ポリシー準拠
- **[N-T-005]** `RETRY_SYSTEM_SUFFIX` 重複は plan で承認済み
- **[N-T-006]** 全自動テスト/型チェック clean (2445 tests passed, typecheck エラー 0)

---

## Design Decisions

このラウンドで見つかった設計判断:
- B-001 の修正方針として「2 回目 invoke の try/catch を削除し driver-level transient を素通しする」を採用。ADR-001 に「リトライ失敗時の cause 伝播ルール」を追記する。
- W-A-001 (prose 擬似ブレース対) は「リトライで救える設計」として明示的に許容。jsonEnvelope の最初の `{` から線形スキャンする現実装を保持しつつ、テストで挙動を固定する方針。

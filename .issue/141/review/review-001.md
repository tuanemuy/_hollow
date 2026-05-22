# PR Review #001 — feat(llm): unified error sanitizer for connection-ping and provider responses

**PR:** #153
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9
- Notes: 18
- Verdict: **BLOCKED** (warnings 解消の修正が必要)

---

### Application & Adapter Layer

#### Blockers

なし

#### Warnings

- **[W-001]** JSDoc の論理が ADR-001 補足と矛盾している
  - 場所: `app/core/application/llm/sanitizeErrorReason.ts:26-27`
  - 理由: JSDoc に「It is **not exempt** from `errorCodeNaming.test.ts` because it is not an `*ErrorCode`.」とあるが、これは論理的に逆。「`*ErrorCode` ではないから検査対象外（exempt）」が正しい意味で、ADR-001 補足の「検査対象外」と整合する。
  - 提案: `"It is exempt from `errorCodeNaming.test.ts` because it is not an `*ErrorCode`."` に修正。

- **[W-002]** Probe の 4xx 経路が sanitizer category prefix を付けず provider-native `error.type` を prefix にする挙動が plan/testing.md に明記されていない
  - 場所: `app/core/adapters/{anthropic,openai,gemini}/connectionPing.ts` の 4xx 経路
  - 理由: `catch` 経路は sanitizer category prefix（`network:` 等）、4xx 経路は provider type（`invalid_request_error:` 等）と語彙が混在する。
  - 提案: testing.md の TC-2 期待文言を「4xx は provider type prefix、network/timeout 経路は sanitizer category」と明文化。実装側は変更不要。
  - 注: testing.md は既に Phase 2 manual-test 結果を受けて更新済み。

- **[W-003]** `messagesClient.ts` の mapper に渡す `cause: cause` の中身が sanitize されないが、test カバレッジがない
  - 場所: 各 `messagesClient.ts` の `catch (cause)` ブロック
  - 理由: ADR-004 の「`cause` チェーンは現状漏洩しない」結論は test 値で固定されておらず、将来 logger 等で再露出された時の検知が遅れうる。
  - 提案: 各 provider の `messagesClient.test.ts` に「`cause` が元の `TypeError` インスタンスのまま渡る（sanitize されない）」を 1 ケース assert。優先度低。

#### Notes

- **[N-001]** `maskSecrets` の冪等性が手動検証で全パターン安定。userinfo 付き URL も `u.origin` 経由で credentials が落ちる副次効果あり。
- **[N-002]** Adapter → Application 層への import 方向は ADR-001 の `d1` adapter の既存パターンと整合。
- **[N-003]** Dispatcher の最終 fallback は `maskSecrets` のみで category 再適用しない設計が正しく実装されている。
- **[N-004]** `sanitizeErrorReason` は副作用なしの pure function。`extractMessage` の throw-safety が網羅されている。
- **[N-005]** Probe の timeout 経路の固定文言は plan のスコープ通り変更されていない。
- **[N-006]** `LLM*Error` は `toSerialized()` を持たず `.message` のみ serialize されるため、`cause` チェーン経由の secret 露出は実質発生しない。
- **[N-007]** 3 provider で空文字 `type` を fallback する分岐が揃っており、`": message"` のような壊れた prefix にならない。

### Test Layer

#### Blockers

なし

#### Warnings

- **[W-001]** `auth_failed` テストの test name と最初の assertion が矛盾
  - 場所: `app/core/application/llm/__tests__/sanitizeErrorReason.test.ts:175-182`
  - 理由: `it("returns auth_failed for an HTTP 401 message")` が `expect(...).toBe("quota")` を含む。test name と意図がずれる。
  - 提案: `it` を 2 本に分割するか、包括的な test name に変更。

- **[W-002]** `sanitizeErrorReason` の冪等性 assertion が 1 ケース・かつ message のみで弱い
  - 場所: `app/core/application/llm/__tests__/sanitizeErrorReason.test.ts:251-260`
  - 理由: plan ステップ 7 では「`sanitizeErrorReason(sanitizeErrorReason(x))` および `maskSecrets(maskSecrets(x))` が初回適用と同じ結果を返すこと」と書かれているが、`sanitizeErrorReason` 側は 1 ケースのみ。
  - 提案: `maskSecrets` 側と同様に input fixtures を array で複数定義し、message に対する冪等性を網羅する。

- **[W-003]** dispatcher fallback テストが Anthropic 経路のみ・1 secret パターンのみ
  - 場所: `app/core/application/di/__tests__/llmConnectionTester.test.ts:230-248`
  - 理由: dispatcher fallback が provider ごとに `error` / `reason` フィールドを切り分けて読むため、フィールド名違いで masking が漏れる回帰を捕まえられない。
  - 提案: OpenAI / Gemini の `reason` 経路でも 1 ケースずつ「raw secret 入り → masking 後」の assertion を追加。

#### Notes

- **[N-001]** plan.md ステップ 7 の主要観点（7 種類 + unknown category 網羅 / 各 masking pattern / 冪等性 / false-positive 非対象 / `undefined`/`null`/数値/object の edge case）はすべて該当テストが存在する。
- **[N-002]** false-positive 非対象 (GUID / モデル名 / 長い URL path) の fixed assertion が `.toBe(input)` 形式で書かれており堅牢。
- **[N-003]** 3 つの `connectionPing.test.ts` すべてに対称的なテストが追加されている。
- **[N-004]** 既存テストの assertion 更新は漏れなく反映されている。
- **[N-005]** `messagesClient.test.ts` の masking テストは細部に過度に依存しない堅牢な書き方。
- **[N-006]** Gemini の masking テストは URL ベースではなく `AIzaSyLEAKEDKEY1234` という標準 prefix トークン経路を検証しており分散して良い。
- **[N-007]** `pnpm test:unit` が全件 PASS（2,296 件）。

### Security

#### Blockers

なし

#### Warnings

- **[W-001]** `extractMessage` の `JSON.stringify` 経路で JSON-shape の secret-bearing key 値がマスクされない
  - 場所: `app/core/application/llm/sanitizeErrorReason.ts:169-176` と `106-109`
  - 理由: `JSON.stringify(input)` の結果は `{"key":"secretval"}` のような JSON 形式で、inline `=` 区切り regex に反応しない。`sk-`/`AIza` prefix が無い独自プロバイダの token、custom proxy の `{ key: "raw-secret" }` 形式の error body 等で false negative が発生する。
  - 提案: `maskSecrets` に JSON 形式 (`"key":"value"`) の masking pattern を追加。

- **[W-002]** dispatcher の最終 fallback が `outcome.ok === false && error !== undefined` の分岐のみで一律ではない
  - 場所: `app/core/application/di/llmConnectionTester.ts:46-50, 88-98`
  - 理由: 早期 return path 等で fallback がスキップされる可能性。現状の文字列は静的だが、`ADR-002 が謳う「漏れ防止」を貫徹するなら統一すべき。
  - 提案: `buildResult(ok, error?)` ヘルパに集約。優先度は低い（実害なし）。

- **[W-003]** URL 終端文字に `;` が含まれず、`;` 区切り文を URL の一部として取り込む
  - 場所: `app/core/application/llm/sanitizeErrorReason.ts:81`
  - 理由: secret 漏洩リスクではない（むしろ安全側に倒れる）が、診断目的のメッセージで `;` 後を巻き込む。
  - 提案: 優先度低。`;` を `[^\s)<>"';,]+` に追加するかは Azure の `;jsessionid=` 等の救済要件次第。現状の「安全側」で許容。

#### Notes

- **[N-001]** `Bearer` masking が大文字小文字 case-insensitive で機能している。
- **[N-002]** URL 内 `user:pass@host` 形式が `u.origin` 経由で credentials が落ちる副次効果あり。
- **[N-003]** malformed URL の fallback で inline `key=` masking が機能する多段防御の良い設計。
- **[N-004]** `\bsk-`/`\bAIza` の冪等性が確認済み。
- **[N-005]** `cause` チェーン経路の安全性が現状コードで成立。
- **[N-006]** `gsk-`/`xai-`/`hf_` 等の他プロバイダ prefix は本 PR のスコープ外。
- **[N-007]** 冪等性 assertion が網羅的。

---

## Design Decisions

このラウンドで見つかった設計判断:

- **D-001**: 4xx 経路は provider 由来の `error.type` を prefix とし、sanitizer category prefix は catch 経路（fetch failure / abort）のみ → ADR-004 の「`messagesClient` は masking のみ・category 化は既存 mapper」と整合。明文化が plan/testing.md に必要 (W-002 App/Adapter)。

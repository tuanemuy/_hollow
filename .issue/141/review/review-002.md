# PR Review #002 — feat(llm): unified error sanitizer for connection-ping and provider responses

**PR:** #153
**Date:** 2026-05-22
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 24
- Verdict: **APPROVED**

---

### Application & Adapter Layer

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** W-001 (JSDoc 論理逆転) は `sanitizeErrorReason.ts:26` で "not exempt" → "exempt" に修正済。ADR-001 補足の「`*ErrorCode` ではないため `errorCodeNaming.test.ts` の検査対象外」と整合する正しい記述になっている。
- **[N-002]** W-002 (4xx 経路の prefix 語彙混在) は実装変更なしで `.issue/141/testing.md` の TC-2 期待文言を「4xx は provider type prefix、network/timeout 経路は sanitizer category」に明文化する方針が選択されており、ADR-004（probe と messagesClient は category 正規化を行わない）と整合する妥当な判断。
- **[N-003]** Security レビューの W-001 で指摘されていた JSON-shape の secret-bearing key 値マスキングについて、`sanitizeErrorReason.ts:104-110` に新規 step として `"(key|api[_-]?key|access[_-]?token|token|password|secret|authorization)":"value"` の regex マスキングが追加された。step 番号も既存 "4." → "5." へ繰り上げ済で抜けなし。
- **[N-004]** 新 JSON 正規表現の idempotency は手動検証で確認済。`"apiKey":"***"` は再適用しても `"apiKey":"***"` のまま、誤った prefix 連鎖は発生しない。case-insensitive (`AuthOrIZation` 等) と入れ子オブジェクトでも期待通り。
- **[N-005]** dispatcher fallback の masking テストが Anthropic に加えて OpenAI (Bearer token) / Gemini (AIza prefix) も追加された。provider ごとの `error` / `reason` フィールド分岐回帰を 3 経路すべてで担保。
- **[N-006]** `sanitizeErrorReason` 冪等性テストが 1 ケース → 7 fixtures に拡張済。契約コメントで「`category` は 2 周目で `unknown` に縮退しうるが `message` は安定」と明示されており、契約と実装の整合が読み取れる。
- **[N-007]** review-001 W-003 (cause sanitize テストカバレッジなし) はレビュー対象外と明記の通り未対応だが、`LLM*Error` が `toSerialized()` を持たず `.message` のみ serialize される設計から実害なし。
- **[N-008]** 軽微な edge case: 新 JSON 正規表現 `[^"]*` は値内のエスケープクォート `\"` を境界とみなすため、`{"token":"with\"escaped"}` のような JSON 文字列を直接マスキング対象にすると後半が露出しうる。ただし `JSON.stringify(input)` の結果は `\"` を必ずエスケープしマスキング対象のキー名と隣接した値は確実に閉じクォートで終わるため、`extractMessage` 経由の利用では実害なし。

### Test Layer

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** W-001（auth_failed test の矛盾）は 2 本の `it` ブロックに正しく分割されている。test name が assertion と完全一致し、quota / auth_failed の分岐が明示的になった。
- **[N-002]** W-002（冪等性 fixture 拡張）は 7 fixtures (TypeError+URL / AbortError / Bearer / inline `key=` / provider prefix / plain unknown / object with apiKey JSON) を for-loop で展開しており、各 input kind を網羅。`maskSecrets` 側も `apiKey` JSON fixture を追加して同期。
- **[N-003]** 冪等性テストのコメントが「`message` のみ idempotent、`category` は 2 周目で `unknown` に collapse しうる」と契約を明文化しており、誤読を防ぐ良い注意書き。
- **[N-004]** W-003（dispatcher fallback の provider 網羅）は 3 ケース (anthropic `error` field / openai `reason` field with Bearer / gemini `reason` field with `AIza` prefix) に拡張済。既存 Anthropic test 名にも `(anthropic)` suffix が付き対称的。
- **[N-005]** 新規 JSON masking テスト 3 本は spec の代表値を網羅。`baseURL` のような非 secret key が masking 対象外であることも `toContain('"baseURL":"x"')` で確認しており false-positive 検知も成立。
- **[N-006]** 冪等性 fixture に JSON 形式入力を追加して JSON masking pattern の冪等性も同時に担保。
- **[N-007]** `pnpm test:unit` が 2,309 件全 PASS（116 test files）。
- **[N-008]** 1周目で指摘していない領域に test 削除や regression は混入していない。

### Security

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** W-001 (1周目 Security) の修正は適切。新規 JSON masking pattern (`"(key|api[_-]?key|access[_-]?token|token|password|secret|authorization)"\s*:\s*"([^"]*)"`) は `JSON.stringify` 経路（top-level / nested object 双方）をカバーし、`api[_-]?key` の `[_-]?` と `gi` フラグの組み合わせで `apiKey` / `api_key` / `api-key` 全てを補足する。
- **[N-002]** False positive リスクは限定的。閉じ引用符 `"` を pattern に含めているため `tokenId` / `secretName` / `tokenURL` のような「接頭一致しただけの非秘密キー」は誤マスクされない。
- **[N-003]** 冪等性は新 pattern を含めて成立。`"key":"***"` を二度目に通しても変化なし。inline `key=` pattern との衝突なし。step 順序（URL → Bearer → inline → JSON → provider prefix）も適切。
- **[N-004]** 軽微な false negative エッジケース: 秘密値そのものが escaped quote `\"` を含む場合、`[^"]*` が最初の `\"` で停止し残余が漏れる。ただし実 API token は `[A-Za-z0-9_-]` のみで構成されるため実害リスクは無視できる。スコープ外として許容。
- **[N-005]** W-001 (1周目 Application) の JSDoc 修正が反映済。CLAUDE.md の `*ErrorCode` 命名規約との整合性が正しく説明されている。
- **[N-006]** Dispatcher fallback の masking テスト追加により、provider 間でフィールド名 (`error` / `reason`) が違っても masking が確実に走ることが回帰テストで担保された。
- **[N-007]** W-002 / W-003 (1周目 Security) は計画通り未対応のまま受け入れ。新たな漏洩経路は本ラウンドで検出されず。
- **[N-008]** `pnpm test:unit` 全件 PASS（2,309 件、1周目から +13 件）。

---

## Design Decisions

このラウンドで新規に見つかった設計判断はなし。

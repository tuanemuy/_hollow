# PR #823 レビュー（Test 観点）— Issue #821

対象: 日付整形の TZ 未指定 hydration mismatch を横断修正し共有ヘルパー `formatJstDateTime` に集約する PR。
Test 観点で AC-2（境界インスタントで JST 出力・TZ=UTC/Asia/Tokyo 同一出力の担保）と AC-7（既存テスト整合）を中心に検証した。

## 検証サマリー（実測）

- `TZ=UTC pnpm vitest run`（dateFormat / ProfileForm / relativeTime / TagList / listSelectors / NoteMetaPanel / SecurityForm）: **169 passed**。
- `TZ=Asia/Tokyo` でも dateFormat + ProfileForm: **17 passed**（＝ランナー TZ 非依存を実測確認）。
- **回帰ガード実証**: `dateFormat.ts` の `{ ...options, timeZone: "Asia/Tokyo" }` を `options` に一時改変 → `TZ=UTC` で (a)(b) が **2 failed**（`1月1日` / `16:00` へずれる）。TZ ピンを落とすと落ちることを実際に確認済み。AC-2 の「TZ 未指定なら失敗する」性質は本物。

## Test

### Blockers

なし

### Warnings

- **[W-001]** `timeZone` 上書き順序の安全網に回帰テストが無い
  - 場所: `app/components/common/__tests__/dateFormat.test.ts`（対象は `dateFormat.ts:20` の `{ ...options, timeZone: "Asia/Tokyo" }`）
  - 理由: plan.md（§96, リスク §157）と ADR-002 が「呼び出し側が誤って `timeZone` を渡しても JST に倒す」を明示的な設計安全網として掲げているが、これを守るテストが 1 件も無い。誰かがスプレッド順を `{ timeZone: "Asia/Tokyo", ...options }` に入れ替えて安全網を破壊しても、現行テストは全て通る（どの既存呼び出し側も `timeZone` を渡していないため気づけない）。故障モードが明確・自明にテスト可能な不変条件が無防備。
  - 提案: `formatJstDateTime(BOUNDARY, { year:"numeric", month:"short", day:"numeric", timeZone:"America/New_York" })` が `2026年1月2日`（JST 側）を返す、というケースを 1 本追加し、TZ 固定がスプレッド後段で必ず優先されることを固定する。
  - → 修正済み（round-1）: 上記の回帰テスト（呼び出し側の `timeZone` を JST に上書きする安全網／ADR-002）を `dateFormat.test.ts` に 1 本追加。TZ=UTC / America/New_York の両方で通過を確認。

### Notes

- **[N-001]** AC-2 は完全充足。境界インスタント `2026-01-01T16:00:00Z`（JST 翌日 01:00）で日付のみ→`2026年1月2日`、日時→`2026年1月2日 01:00`、NaN→入力素通しの 3 ケースを網羅。コメント（test 4-9 行）に「runner-TZ-independent」「TZ=UTC と TZ=Asia/Tokyo で同一出力（Issue 提案を満たす）」「TZ ピンを落とすと UTC 側にずれて失敗＝回帰ガード」の意図が明示され、S-001 の要求どおり Issue 提案との対応が一目で追える。
- **[N-002]** JSDoc の「日付のみオプションなら日付のみ返す（`toLocaleDateString` 相当）」という主張がテスト (a) で実証されている（date-only オプション→時刻を含まない `2026年1月2日`）。名称 `formatJstDateTime` の誤解防止という設計意図が検証で裏づけられており良い。
- **[N-003]** 移行済み各コンポーネントの既存テスト（SecurityForm / PublishSettings / TagList / listSelectors / NoteMetaPanel）に期待値更新漏れは無い。#821 コミットが触ったテストは ProfileForm の 1 行（`timeZone: "Asia/Tokyo"` 追加）のみだが、他は元々 TZ 耐性のある書き方（UTC 正午固定・Y/M/D 部分一致・自前 NaN ガード）で、`TZ=UTC` 実行で全通過を確認。漏れ無し。
- **[N-004]** ProfileForm テスト（`index.test.tsx:289`）の期待値は `toLocaleString("ja-JP", { timeZone:"Asia/Tokyo", … })` を**同一オプションで再インライン**して構築している。コンポーネント `formatTimestamp`（`index.tsx:84-92`）のオプションと完全一致し、JST 固定の出力を非 JST ランナーでも検証できる点は妥当。ただし自己参照的で「コンポーネントが共有ヘルパー経由か」までは証明しない。plan.md §119 が代替として提示した「`formatJstDateTime` を import して期待値を作る」方式にすると、ヘルパー経路への束縛がより強くなる（任意改善）。
- **[N-005]** RSC 側の `NoteHistoryList` / `NoteRevisionDetail` は表示フォーマットが既定ロケール `toLocaleString()` → `ja-JP`+JST 日時へと**目に見えて変化**する（ADR-002 例外／意図的改善）が、両テストに日付値のアサーションは無いため更新不要。この可視変更は manual-test（`.issue/821/manual-test`）で担保する設計で、ユニット側の空白は許容範囲。
- **[N-006]** `TagList.formatLastUsed`（`TagList.tsx:36-44`）と `listSelectors.formatDate` は移行後もヘルパー呼び出しの**手前**で自前 NaN ガード（`未使用` / 独自フォールバック）を保持しており、ヘルパーの「raw 文字列素通し」が UI に漏れない。既存の「invalid date → 未使用」テスト（`TagList.test.tsx:829`）が引き続き通ることを確認済み。移行の意味論保存は正しい。
- **[N-007]** 境界インスタントは「日またぎ」のみを突く（1/1→1/2）。月跨ぎ・年跨ぎのロールオーバーは AC-2 の TZ 差分検出には不要（日跨ぎが本質）で過不足なしだが、防御を厚くするなら `2025-12-31T16:00:00Z`→`2026年1月1日` のような年月跨ぎケースを 1 本足す余地はある（任意）。`listSelectors.test.ts:251` に grouping 側の月跨ぎテストは別途存在。

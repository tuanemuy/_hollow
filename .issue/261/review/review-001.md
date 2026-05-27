# PR Review #001 — feat(issue/261): skip version bump on no-op instance settings updates

**PR:** #263
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 7
- Verdict: **BLOCKED** (Warning が残っているため、本プロジェクトの完了基準「Blocker 0 かつ Warning 0」を満たさない)

---

## General Review

### Blockers

なし

### Warnings

- **[W-001]** Integration test の `versionAfterFirst` が `undefined` の場合に false-positive 化する
  - 場所: `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` の Issue #261 新規ケース2件
  - 理由: `rowsAfterFirst[0]?.version` と `rowsAfterSecond[0]?.version` がどちらも `undefined` の場合、`expect(undefined).toBe(undefined)` が pass してしまう。本来検証したいのは「save が正しく走って version が固定された」ことなので、行が存在しない退化シナリオ（adapter が save をスキップする regression）でテストが silently green になりうる。
  - 提案: `expect(rowsAfterFirst).toHaveLength(1)` と `expect(versionAfterFirst).toBeDefined()`（もしくは `expect(typeof versionAfterFirst).toBe("number")`）を追加して退化を検出可能にする。

### Notes

- **[N-001]** 計画・ADR との整合は完璧。ADR-001（案 A 採用）、ADR-002（ユースケース側 `next === current` ガード）、ADR-003（ファイル内ローカル関数）が3項目ともコードに正しく反映されており、`resetPrompt` / `resetAllPrompts` / `clearPrompt` 群と挙動が完全に対称になっている。CLAUDE.md の「illegal states unrepresentable」原則および「ドメイン純粋関数」原則とも整合。

- **[N-002]** `promptTemplatesEqual` の正しさは `PromptTemplate.create` が `[...new Set(expectedVariables)]` で出現順保持の dedup を行うという内部不変量に依存する。これは正しいが、その依存が JSDoc に明記されており（"deduplicates `expectedVariables` while preserving input order"）読み手が validate しやすい。VO 側で順序が変わった場合に壊れるが、その時はテスト（`updatePrompt bumps version when expectedVariables differ`）まで含めて見直す導線になる。testing.md のエッジケース #1 で「`['a','b']` vs `['b','a']` は version が +1 される」仕様を明示しているのも良い。

- **[N-003]** `designTokensEqual` のロジックは「サイズ一致 + 一方向の包含」で双方向一致を担保する古典的最適化（|a| = |b| ∧ a ⊆ b ⇒ a = b）で、`Object.entries` / `Object.keys` がどちらも own enumerable のみ列挙し、`DesignTokens.create` が `Object.freeze` で凍結したプレーンオブジェクトを返すため prototype 経由の漏れの心配はない。`DESIGN_TOKEN_KEY_REGEX = /^--[a-z0-9-]+$/` で `__proto__` 等の汚染も型レベルで排除されている。

- **[N-004]** ユースケース層の `if (next === current) return;` ガードは ADR-002 で説明されている通り「reset 4ユースケース全てが同形」の防御線として機能する。`save` への round-trip を adapter 実装に依存せず物理的に抑止できる点で価値があり、将来 domain の no-op 化が外されても backstop が残る。

- **[N-005]** 追加されたテスト6本（domain）+ 2本（application）はカバレッジが適切。「no-op（同一参照）」「text 差異で bump」「expectedVariables 差異で bump」「空 → 空 no-op」「値変更で bump」「キー追加で bump」「キー削除で bump」と各分岐が網羅されている。

- **[N-006]** スコープ規律も良い。Issue 本文に「User.* / 他集約への展開は要検討」と明記されているのに従い、`UserPromptOverride.setPrompt` 等の no-op 化は意図的に外している。プロジェクト全体への影響を最小化した最小コミットになっている。

- **[N-007]** typecheck / biome lint をローカルで実行し、全て pass を確認済み。

---

## Design Decisions

特になし

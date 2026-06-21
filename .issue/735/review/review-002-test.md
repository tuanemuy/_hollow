# レビュー (Round 2): Test 観点 — PR #768 (Issue #735)

**レビュー対象:** `app/core/presentation/__tests__/publicStatusBridge.test.ts` / `app/core/presentation/publicStatusBridge.ts`
**レビュー日:** 2026-06-21
**レビュアー:** Claude Code（Test 専門レビュー / 再レビュー）
**前回:** `.issue/735/review/review-001-test.md`

## 概要

Round 1 の指摘 2 件（W-001 / W-002）への対応状況と、新たなテストの穴を確認した。

- **W-001（`check()` 呼び出し assert 追加）: 対応済み・妥当。** 成功ケースが `vi.fn` + `expect(check).toHaveBeenCalledTimes(1)` に置き換わっており、「前段チェックが実際に実行される」契約をユニットで固定できている。`await check()` の誤削除（404 化のサイレントリグレッション）を検出できるようになった。
- **W-002（`NotFoundError` サブクラス分岐の代表検証）: 見送り・妥当。** リポジトリ全体に `extends NotFoundError` は存在せず（`grep -rn "extends NotFoundError" app/` で 0 件）、`isNotFoundError` は `instanceof NotFoundError`（`errors/index.ts:57-59`）のまま。サブクラス不在の前提では過剰要件で、見送りは合理的。

実機確認: `pnpm test:unit publicStatusBridge` → 3 passed（3/3 PASS）。

> 補足: W-001 の修正は作業ツリー上の未コミット変更（`git status` で `M`）。コミット `c25d2374` のテストファイルにはまだ反映されておらず、`git diff main...HEAD` には現れない。PR にこの修正を確実に含めるため、コミット忘れに注意（下記 N-002）。

---

## Test

### Blockers

- **[B-001]** なし。

3 ケース（resolve / NotFoundError→notFound 変換 / 非 NotFound 再 throw）がヘルパーの全分岐（`try` 成功・`catch` 内 `if` 真・`if` 偽）を 1:1 で網羅。W-001 対応で成功パスの「`check` 評価有無」も固定された。ブロッカー級の漏れはない。

### Warnings

- **[W-001]** なし（Round 1 W-001 は対応済み・妥当。Round 1 W-002 は見送り・妥当）。

### Notes

- **[N-001]** Round 1 の検証境界は維持されており妥当
  - モックなしの純関数テスト（実物の `NotFoundError` / `isNotFound` を使用）、ルートハンドラ自動テスト不在 → 手動 curl 委譲、testing.md / manual-test/result.md の整合（404×3・200×3、dev + 本番相当の両ランタイム全 PASS）は Round 1 の N-001〜N-004 評価から変化なく、いずれも合理的。docs/test.md の Unit 層方針（fake 最小限・モックで本質を偽装しない）にも沿う。

- **[N-002]** W-001 修正の確実なコミットを推奨（プロセス上の注意・Test 品質には影響なし）
  - 現状 W-001 の修正は作業ツリーの未コミット変更にとどまる。コミットしないと PR に反映されず、`vi.fn` assert が失われた版がマージされうる。マージ前にコミットを確認のこと。

- **[N-003]** 成功ケースの `check` 戻り値は依然「破棄される」ことを直接検証していない（任意・低優先）
  - ヘルパーの契約は「結果を破棄して `void` を返す」。テストは戻り値が `undefined`（`resolves.toBeUndefined()`）であることと `check` が 1 回呼ばれることを見るが、`{ id: "exists" }` という戻り値が呼び出し側に漏れない（型が `Promise<void>`）点は型システムが保証しており、ランタイム assert は不要。現状で十分。記録のみ。

- **[N-004]** NotFound / 非 NotFound ケースでの `check` 呼び出し回数は未 assert（任意・低優先）
  - Round 1 W-001 提案では「NotFound・非 NotFound ケースでも `check` が 1 回呼ばれること」を任意で挙げていた。成功ケースで `check` 評価有無が固定済みであり、両異常ケースは throw された値の同一性（`isNotFound(thrown)` / `rejects.toBe(boom)`）で `catch` 経路の通過が間接的に保証される。追加は堅牢性を僅かに上げるが必須ではない。

---

## 検証メモ

- `pnpm test:unit publicStatusBridge` → 3 passed を実機確認。
- `grep -rn "extends NotFoundError" app/` → 0 件。W-002 見送りの前提（サブクラス不在）を確認。
- 現テスト（`publicStatusBridge.test.ts:6-13`）は `vi.fn` + `toHaveBeenCalledTimes(1)` で W-001 を解消済み。`git status` 上は未コミット（`M`）。
- testing.md（404/200 の curl 手順、項目5 の呼び出し回数実測、異常系 1 の 500 経路）と manual-test/result.md（6 ケース全 PASS、410→404 への ADR-004 変更を反映）は整合。

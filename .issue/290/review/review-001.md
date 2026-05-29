# PR Review #001 — fix(issue/290): ディレクトリ操作の business エラーを具体メッセージで表示

**PR:** #337
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 7
- Verdict: **BLOCKED**（Warning 修正のため次ラウンドへ）

---

## General Review

複雑度「小規模」のため General Review 1本で実施。

### Blockers
- なし

### Warnings
- **[W-001]** テストの code リスト（`EXPLICIT_DIRECTORY_CODES`）が実装の `switch` と独立に手書きされた生文字列配列で、二重管理になっている。
  - 場所: `app/core/presentation/__tests__/errorDisplay.test.ts:160-170` / `app/core/presentation/errorDisplay.ts`
  - 理由: 将来 code を追加した際、実装 switch とテストリストの両方で取りこぼすと、その code が group (c)（fallback 検証）側に回り「黙って fallback に落ちる」回帰を見逃す。なお「タイポで永遠に fallback」の罠自体は explicit テストが実 switch を叩くため捕捉可能。
  - 提案: `EXPLICIT_DIRECTORY_CODES` を `DirectoryErrorCode` メンバー参照から構成し enum と型レベルで結びつける。実装側にも同期を促すコメントを追加。

### Notes
- **[N-001]** マッピング9件はすべて `DirectoryErrorCode` の値とタイポなく一致、ユーザー操作の throw サイトと対応。漏れなし。
- **[N-002]** fallback に委ねた5件はすべて内部不変条件・永続データ整合性違反で通常入力では到達不能。判断は妥当。
- **[N-003]** `NameConflict` は domain の `BusinessRuleError`（business kind）として throw され、確実に `renderBusinessMessage` 経路に乗る。
- **[N-004]** 既存 `renderIngestionBusinessMessage` の構造・呼び出し順序と完全に一貫。
- **[N-005]** メッセージ品質良好。内部 code/spec 文言の leak なし。manual-test の実表示文言とも一致。
- **[N-006]** CLAUDE.md の `*ErrorCode` naming 規約への影響なし。
- **[N-007]** plan.md のスコープ・実装ステップ通り。スコープ外の変更なし。

---

## 修正対応（Round 1 → Round 2）

- **[W-001] 対応済み**: `EXPLICIT_DIRECTORY_CODES` を `DirectoryErrorCode.NameConflict` 等のメンバー参照 + `as const satisfies readonly string[]` に変更し、enum と型レベルで結合（タイポ・メンバー削除を型エラーで検出）。`errorDisplay.ts` に「case 追加時はテストの `EXPLICIT_DIRECTORY_CODES` も同期」コメントを追加。group (c) の `Set` を `Set<string>` に調整して typecheck を通した。

---

## Design Decisions

特になし（ADR 追記不要）。

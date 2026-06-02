# PR Review #001 — refactor(note/list): extract homeSearchUpdater helper

**PR:** #435
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## General Review

小規模リファクタのためレイヤー分割せず General Review 1本で実施。

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** 挙動の同一性は完全に保たれている。ヘルパ本体 `{ ...(prev as Partial<NoteListSearch>), ...patch }`（`homeSearch.ts:18`）は置換前の各 callsite のインライン式と字句的に等価。後勝ちセマンティクス（`handlePick` の `page: undefined`、`toggleTag` の `tagNames: undefined`）による field クリアも維持。`updateDate` の computed key `[key]: v` も保持。
- **[N-002]** 置換漏れ・過剰なし。残るキャストは `FilterBar.tsx`（clearAll）と `NoteListToolbar.tsx`（onSelectView 空選択）の 2 箇所のみで、いずれも「prev を捨てて一部だけ残す」リセット系。plan どおり意図的に対象外。spread+patch の 7 callsite（FilterBar 6 + DisplayModeSwitch 1）はすべて置換済み。
- **[N-003]** 型安全性 OK。`pnpm typecheck` グリーン。`run` の `nav` 引数型 `(prev: Partial<NoteListSearch>) => ...` に対し `homeSearchUpdater` の `prev: unknown` はパラメータ反変で適合。`DisplayModeSwitch` の未使用 `NoteListSearch` import 削除も正しく、`FilterBar` 側は他で使うため残すのも適切。
- **[N-004]** 配置・命名は妥当（ADR-001 に同意）。`auth/links.ts` への型逆流を避け `note/list` に co-locate。`homeSearch.ts` → `../schema` の単方向 import のみで循環リスクなし。
- **[N-005]** コメント方針に沿う。JSDoc が「patch 後勝ち／undefined クリア」の不変条件と `prev: unknown` キャストの WHY を 1 箇所に集約。CLAUDE.md のコメント方針に合致。styling 変更なし。
- **[N-006]** manual-test summary（12 PASS）が prev スプレッドの後勝ちを実挙動で裏付け。リファクタ回帰確認として十分。

総評: plan / ADR との整合性が高く、挙動同一性・置換範囲・型安全性・配置のいずれも問題なし。マージ可。

---

## Design Decisions

特になし（ADR-001 は Phase 1 で記録済み、レビューでも妥当と確認）。

# PR Review #001 — refactor(issue-86): unify branded → string cast at to{Entity}DTO boundary

**PR:** #136
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## General Review

このPRはIssue #86 の計画 (`.issue/86/plan.md`) を忠実に実装している。3ファイル変更で型のみの修正、ランタイム挙動への影響なし。typecheck/test (2017/2017)/format すべて通過。`dto/index.ts` の canonical brand convention に `OwnedSearchHitDTO` を揃え、`toOwnedSearchHitView` を他の `to{Entity}DTO`（`toNoteDTO`/`toDirectoryDTO`）と同じ形に整える、目的限定の良いリファクタ。

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Plan-implementation 整合性が完全。計画書に書かれた 3 つのステップ（DTO 型変更、view bridge 修正、loader cast 追加）がそれぞれ過不足なく反映されている。slug を branded 化しない判断、loaders.ts の cast を filter 経路 (line 261) の `as unknown as string` イディオムに揃える判断も計画通り。
- **[N-002]** `toOwnedSearchHitView` の前後対比が綺麗。変更前は `directoryId as unknown as string` と `slug as unknown as string` の 2 cast、変更後は `directoryId as unknown as DirectoryId` の 1 cast + 素の `slug`。これで `toNoteDTO` (`dto/note.ts:85-86`) と完全に同じスタイルになり、「branded ID は `as unknown as` 経由、`NoteSlug`/`NoteTitle` のような構造的 `string` サブタイプは cast 不要」というルールが見える形になった。
- **[N-003]** JSDoc 更新が丁寧。`OwnedSearchHitDTO` の JSDoc が「`./index.ts` の convention に従う」ことを明示し、`slug` を plain string のままにする理由（`NoteListItemDTO.slug` / `DirectoryDTO.slug` と揃え、`NoteSlug ⊆ string` だから）も書かれている。将来の読み手が「なぜ `directoryId` だけ branded で `slug` は string？」と疑問を持ったときの説明が JSDoc 内で完結する。
- **[N-004]** 影響範囲の完全性。`OwnedSearchHitDTO` / `OwnedNoteSearchItem` の consumer を grep で全件確認したが、`directoryId` を string として消費している箇所は `loaders.ts:198` のみ。他の presentation 層で型エラーになる箇所はなく、`searchPublicNotes` (`SearchHitDTO` 経路) にも波及しない。
- **[N-005]** 検証完了。`pnpm typecheck` クリーン、`pnpm test:unit` 2017/2017 pass、`pnpm format:check` クリーン。`searchOwnNotes.test.ts` の assertion は brand を持つ string に対しても通るため、test fixture 修正は不要。

---

## Design Decisions

このラウンドで新たに見つかった設計判断は無し。plan.md の「設計判断」セクションに記録済みの判断（slug は branded 化しない、loaders.ts は既存 cast イディオムに揃える）が忠実に実装されている。

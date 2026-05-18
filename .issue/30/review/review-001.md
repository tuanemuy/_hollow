# PR Review #001 — feat(note): countByOwner にフィルタを反映 (Issue #30)

**PR:** #51
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

### General Review

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `app/core/domain/directory/__tests__/service.test.ts:179` — `countByOwner()`: 同ファイル内の他のスタブメソッド（`findById(_id)`、`findByOwner(_o, _opts)` など）はすべて underscore-prefixed のダミー引数を残して「シグネチャを明示する」スタイルで統一されているのに、`countByOwner` だけが引数を完全に省略しているため一貫性が崩れている。plan.md 4 でも「念のため `async countByOwner(_o: UserId, _opts?: NoteOwnerCountOpts) { return 0; }` のように型整合性を残しておく方が安全」と書かれていた方針からも逸脱している。TS bivariant により型は通るし機能上の問題はないが、`countByOwner(_o: UserId, _opts?: NoteOwnerCountOpts): Promise<number>` と揃える方がレビュー時の意図が読みやすい。
- **[N-002]** `app/core/domain/note/ports/noteRepository.ts:122-133` — JSDoc が「When `opts` is `undefined` every note belonging to the owner is counted」と説明しているが、実呼出側 `listNotesByOwner.ts:42-50` は filter が一切未指定でも `{}` (空オブジェクト) を渡しており、`undefined` パスは（本実装では）実質使われない。adapter 内では `opts ?? {}` で吸収しているので `undefined` も `{}` も同じセマンティクスだが、その同値性を JSDoc に一行足しておくと「呼出側が忘れたとき / 明示的に空 opts を渡したとき」のどちらも同じ振る舞いになると読み手に伝わる。
- **[N-003]** `app/core/adapters/d1/repositories/noteRepository.ts:425` — 候補集合の交差 `inArray(notes.id, [...intersected])` は chunk されておらず、tagIds / referencingNoteId フィルタで巨大な候補集合になると D1 host-var cap (~100) を超える可能性がある。これは本 PR で新規に持ち込まれたリスクではなく `findByOwner` で既存だが、`countByOwner` も同じパスで同じクエリを 2 回叩くようになったため「同じリスクが 2 倍 hit する」状況になった。plan.md でも「同じ DB hit が 2 回走るのは既知。MVP 規模で許容」と明記済みなのでスコープ外だが、フォローアップ Issue として記録しておくと良さそう。
- **[N-004]** integration test の網羅性は良好（visibility / tagIds AND / status / referencingNoteId / `count > limit` / `visibility=[]`）。Issue の症状（`count > limit` でも `count = 10`、表示は 1）を直接再現する 5 つ目のケースが回帰防止として的を射ている。一方 `dateRange` フィルタの count テストは省かれているが、`buildOwnerListWhere` で他のフィルタと完全に同じ枝に落ちているので、敢えて足す必要は低い。
- **[N-005]** `runExportJob.ts:216` の inline mock `async countByOwner() { return 0; }` がそのままで typecheck を通せるのは、TS が method shorthand (`{ async foo() {} }`) のパラメータについて bivariant かつ「不足は許容」とする挙動による。`noteRepo: NoteRepository` という構造型に対し、引数 0 個のメソッドは引数 2 個必須のメソッドの subtype として扱われる。ADR-002 がこの点を明示的に意識しているのも妥当。
- **[N-006]** manual-test レポート (`.issue/30/manual-test/report.md`) は Issue の直接再現ケース TC-002 を含む 5 ケースが PASS と記録されており、検証中に発見した `saved_views` の seed 不整合は本 Issue と無関係である旨も切り分けられている。Phase 4 で別 Issue 化要否を判断する旨が明記されており、レビュー観点としては問題なし。

#### Design Decisions
特になし — ADR-001 / ADR-002 / ADR-003 が PR の設計判断を網羅している。`Pick` 派生での drift 防止、`opts?` optional 化による既存 mock の非破壊、`buildOwnerListWhere` の null シグナルでの早期 return、いずれも実装と一致しており追加で記録すべき判断は見当たらない。

---

## Follow-up

Notes は Blocker/Warning でないため verdict 判定上は対応不要だが、低コストで改善できるものは本 PR で取り込む:

- **N-001** → 適用（plan.md 4 の意図と整合させる）
- **N-002** → 適用（一行 JSDoc）
- **N-003** → 別 Issue として起票検討（Phase 4 で判断）
- **N-004 / N-005 / N-006** → 情報のみ、対応不要

# PR Review #002 — feat(ui): Dialog プリミティブの背景クリック / × ボタンによる close オプション

**PR:** #151
**Date:** 2026-05-22
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 9
- Verdict: **APPROVED**

前ラウンド（review-001.md）で指摘された Warning は採用分（7 件）すべてが計画通り反映され、見送り分（3 件）も妥当な判断として残っている。新たな Blocker・Warning・型エラー・テストリグレッションは発生していない。

---

## Round 2 Review

#### Blockers
なし

#### Warnings
なし

#### Notes

- **[N-001]** W-A-001 / W-A-003 JSDoc 追記はトーン・配置とも既存 JSDoc に整合。`pr-10` の consumer 注意点と alertdialog 枝での挙動（× が Tab cycle に残るが panel が初期 focus）が明文化されており、後続コンシューマの判断材料として十分。

- **[N-002]** W-A-002 `mousedownTargetRef` リセットは snapshot → 即 reset → guard チェックの順序が正しい。正常系（backdrop mousedown → backdrop click）のテストが引き続き PASS していることで「reset 後 snapshot 値で判定」が happy path を壊していないことを確認。コメントも WHY ベースで読みやすい。

- **[N-003]** W-T-002 / W-C-001 dead parameter 削除と呼び出し側の整合 OK。引数削除によりコメントもシャープに。

- **[N-004]** W-T-003 Tab cycle テストは二段構え: (1) `panel.querySelectorAll(FOCUSABLE_SELECTOR)` を直接展開して `closeBtn` を含むことを assertion し、`:not([data-dialog-close])` を `FOCUSABLE_SELECTOR` 側にも誤適用するリグレッションを直接検知。(2) 末尾→先頭のラップで × へ focus 移動することを behavioral に確認。happy-dom が native Tab traversal を持たないことへの trade-off を明示しており適切。

- **[N-005]** W-T-004 afterEach leak detector は本ファイルで適切に発火（2231 件 PASS）。NotePickerDialog.test.tsx に同種 assertion がない点は気になるが、leak の主たる発生源は Dialog プリミティブ自身なので primitive 側でガードする方針が妥当。

- **[N-006]** W-T-001 origin guard 強化テストについて軽い注釈: panel mousedown（stopPropagation で backdrop に伝播しない）→ backdrop click という流れだが、ref は最初から null なので新規 ref-reset 挙動を *排他的に* 検証してはいない。ただし「先行 mousedown のない click は reject」という契約（新 reset で強化された不変条件）を直接 assertion しており、ADR-001 の検証としては有効。

- **[N-007]** Tab cycle テスト内の inline コメントに自己訂正型の表現が残っている（実装中の思考過程の名残）。可読性に実害なし、cosmetic。

- **[N-008]** `pnpm typecheck` クリーン、`pnpm test:unit` 全 2231 件 PASS、`pnpm format:check` クリーン。`pnpm lint` はリポジトリ全体で OOM になるが本 PR 起因ではない（既存問題）。

- **[N-009]** ADR-001（origin guard）の意図は保たれている。ADR-004（× の Tab cycle 内・初期 focus 外）は両側面（除外側は既存テスト、cycle 内側は新規 W-T-003 テスト）が検証された。ADR ファイル自体への追記はなく JSDoc 注記で代替されているが、トレース性は十分。

#### Verdict
**APPROVED** — マージ可能。

---

## Design Decisions

特になし（修正のみで新規設計判断なし）。

---

## レビューループ終了

完了条件「Blocker 0 かつ Warning 0」を 1 ラウンドで達成。Phase 3 終了。

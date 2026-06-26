# PR #784 レビュー（3周目） — Frontend（doc-only 指摘の解消確認）

主目的: 2周目 [W-001]（JSDoc「why not reuse `useRovingMenu`」段落が、本 PR が追加した opt-in focus-restore と内部矛盾）の解消確認。あわせて JSDoc 全体の整合と実装本体（復元 effect / 型）の再確認。

検証:
- `app/components/common/useRovingTablist.ts:16-25`（why not reuse 段落）を実装（復元 effect `:211-226` / 型 `:89-117` / onKeyDown `:168-197`）と照合
- `git diff` / `git diff main...HEAD` でコミット状態を確認

## 結論サマリー

[W-001] の本文修正は内容的に**正しく完了している**。working tree の `useRovingTablist.ts:16-25` は、focus-restore を「never needs」リストから外し、disabled-item のみを「不要」として残し、focus-restore を「共有の関心だが menu の `open`-gated 機構が always-mounted に合わないため別スコープ（keyboard-intent flag）で内製した」と言い換えており、2周目 [W-001] の提案趣旨・期待記述と完全一致する。JSDoc 全体に他の内部矛盾は見当たらず、復元 effect・型定義とも一致。実装本体は 691f5201 から無変更（Blocker/Warning ゼロ維持）。

ただし**この doc 修正は未コミットの working-tree 差分**であり、PR head（`691f5201`）の committed ツリーには依然 2周目で指摘した矛盾テキスト（`carries focus-restore / disabled-item concerns a segmented control never needs`）が残っている。コミットしない限り PR としては [W-001] 未解消のまま出荷される。同様に 2周目 [N-006] のテスト追加（`useRovingTablist.test.tsx`）も未コミットのまま。これを Warning として記録する。

### Frontend

#### Blockers

なし。

#### Warnings

- **[W-001]**（2周目 [W-001] の派生）doc 修正は正しいが未コミットで、PR head には矛盾テキストが残存している。
  - 場所: working tree `app/components/common/useRovingTablist.ts:16-25`（committed head `691f5201` は旧テキスト `:16-21`）。`git status` で `M useRovingTablist.ts` / `M useRovingTablist.test.tsx` の2件が未ステージ。
  - 内容: `git diff main...HEAD` が出力する committed 版は `carries focus-restore / disabled-item concerns a segmented control never needs` のまま。修正本文は `git diff`（unstaged）側にのみ存在する。
  - 理由: 修正内容そのものは妥当だが、コミットされなければ PR としては 2周目 [W-001] の矛盾が解消されない。あわせて 2周目 [N-006] の回帰テスト（`(AC-4 effect guard)`）も未コミットのため、PR に取り込まれない。doc とテストの両差分を 1 コミットに含めてから再確認すること。
  - 提案: `useRovingTablist.ts` の doc 修正と `useRovingTablist.test.tsx` のテスト追加をコミット → `git diff main...HEAD` で両者が反映されることを確認。挙動・型に影響しない doc-only + test-only の追補なので、コミット後は本 Warning はクローズ可。

#### Notes

- **[N-001]** [W-001] 本文の言い換えは load-bearing な WHY として正確。/ 場所: `useRovingTablist.ts:16-25`（working tree）
  - 「disabled-item は不要（正）」「focus-restore は共有の関心（`see below`）だが menu の `open`-gated 機構が always-mounted control に合わず、keyboard-intent flag で別スコープ化」という構成になり、同ファイル下部の opt-in 復元（`restoreFocusOnCommit` 型 `:99` / effect `:211-226`）と読み手レベルで矛盾しなくなった。`:21-22` の「focus-restore invariants（既存 call site を壊しうる）」は menu 側の話として保持されており妥当。2周目の懸念（保守者が「このフックに復元は無い／不要」と誤読するリスク）は解消。

- **[N-002]** Focus-restore 段落（`:55-65`）と復元 effect（`:211-226`）の整合を再確認、一致。
  - flag は arrow/Home/End commit で raise（`:194`、automatic 経路のみ）、effect の3分岐 — (a) `activeElement===items[clamped]` で flag 維持 return（`:219`）、(c) `activeElement!==body` で flag のみ解除（`:220-223`）、(b) `activeElement===body` で `focus({preventScroll})` 復元 + 解除（`:224-225`）— は下段 effect コメント `:207-210`（keep / clear-without-restore / restore+clear）と逐語一致。早期 return 順（`!restoreFocusOnCommit` → `!restorePendingRef.current` → querySelectorAll）も AC-4 のノーオペ保証どおり。

- **[N-003]** 型定義と JSDoc の整合、一致。/ 場所: `:89-117`
  - automatic = `restoreFocusOnCommit?: boolean`（`:99`）、manual = `?: never`（`:116`）。「Focus restore (automatic only)」「Manual … is client-only with no RSC re-render, so the symptom never occurs」という JSDoc の主張を型が illegal-state-unrepresentable で裏打ち。`restore focus to the selected radio`（`:56`）の「radio」表現は、復元経路が automatic=radio にしか到達しない事実（2周目 N-004）と整合。

- **[N-004]** 実装本体は committed head `691f5201` から無変更。working-tree 差分は doc（`useRovingTablist.ts`）と test（`useRovingTablist.test.tsx`）のみで、復元ロジック・型に新規の問題は見当たらない。2周目の本体 Blocker/Warning ゼロ評価を維持。

- **[N-005]** `getTabIndex … clamps an out-of-range focusedIndex to index 0`（`:70-72`）は、厳密には `activeIndex` 算出（`:158-163`）でクランプし `getTabIndex`（`:165-166`）がそれを消費する構造で、文言上は軽微に不正確。ただし #776 由来の既存記述で本 PR スコープ外、かつ意味は通る。指摘ではなく確認事項。

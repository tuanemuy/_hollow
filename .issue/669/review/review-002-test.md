# PR #676 Review — Round 2

### Test

レビュー実施内容: `gh pr diff 676` をゼロベースで plan.md「テスト方針」と突き合わせ。対象3テストファイル（45 tests）と全ユニットスイート（230 files / 3677 tests）を実行、すべて green。さらに Round 1 修正の実質性をミューテーションで実証:

- StrictMode テスト（W-002 対応）: `InlineEditor.tsx` cleanup の `lastEmittedHtmlRef.current = null` を削除して実行 → **1 failed**。pin は実質的
- seed-once 本文アサーション（W-001 対応）: `NoteEditor` に `useEffect` での `setContent` props 再同期を注入して実行 → **1 failed**（`container.innerHTML` に "server" が出現して検出）。pin は実質的
- 参考: `rebuild` 内の debounce timer clear を削除して実行 → **all passed**（下記 W-001 参照）

#### Blockers

なし

#### Warnings

- **[W-001]** Round 1 state-review W-001 の修正（`rebuild` が pending debounce timer を clear する）がテストで pin されていない
  - 場所: `app/components/note/editor/InlineEditor.tsx:585-587` / `app/components/note/editor/__tests__/inlineEditor.test.tsx`
  - 理由: この clear はコード内コメントが明言するとおり「parse 失敗パスで host が空のまま stale timer が発火し、親の content の上に `""` を emit する」故障モードを防ぐ修正だが、clear の3行を削除してもスイートは 35/35 green のまま（ミューテーションで実証）。レビュー指摘で入った bug fix が無防備で、effect 分離リファクタの中でも将来動かされやすい箇所
  - 提案: 既存の `flushMutations`/fake timer 基盤で再現可能: (1) テキスト編集して debounce 中の emit を仕込む → (2) `value` を parse 失敗 HTML（または空 body になる値）に変えて rebuild → (3) timer を進めて `onChange` が `""` で呼ばれないことをアサート
  - → 対応済み: `inlineEditor.test.tsx` に「cancels a pending debounced emit when an external value change rebuilds into a failure path」テストを追加（提案手順どおり）。`rebuild` 冒頭の timer clear 3行を削除するミューテーションで 1 failed になることを確認済み（pin 有効）

#### Notes

- **[N-001]** Round 1 Test W-001/W-002 の修正は両方とも正しく、かつ実質的であることをミューテーションで確認した（冒頭参照）。`noteEditorSeedOnce.test.tsx:158-165` の本文側アサーションは「host textContent が "foo" を維持」+「`container.innerHTML` に "server" 非出現」の二段構えで、タイトルのみ/本文のみどちらの再同期混入も検出できる。`inlineEditor.test.tsx:243-272` の StrictMode テストも cleanup-null-reset 契約（ADR-007）を正確に pin している
- **[N-002]** `routerInvalidate.test.ts:54-72` は plan テスト方針に完全準拠（エディター2ルート除外・表示系ルート通過・`alwaysTrue` filter との AND 合成下のすり抜けなし・`appShellInvalidate` の edit ルート `false`）。Round 1 N-001 の評価から変化なし
- **[N-003]** `noteEditorSeedOnce.test.tsx` のモック面（`@tanstack/react-start` / `react-router` / actions）は他の editor テストの確立済みパターン（`serverFnMock`）に沿っており、テスト対象（reducer lazy initializer）に対して過剰結合していない。`root.render` の reconcile が「同一インスタンスへの props 更新」を正しく表現している点もコメントで明示済み（生 invalidate の RSC 再マウント経路を守れないことの注記含む — plan AC-9 の主張範囲と一致）
- **[N-004]** スタイル変更（AC-1〜6）・保存後 invalidate 削除（AC-8）が手動検証（`.issue/669/manual-test/` TC-001〜010）で代替されている線引きは plan どおり。ユニットテストの欠落ではない

#### 実行結果

- `pnpm vitest run`（routerInvalidate / inlineEditor / noteEditorSeedOnce）: 3 files, 45 tests, all passed
- `pnpm test:unit`: 230 files, 3677 tests, all passed
- ミューテーション3件: cleanup-null-reset 削除 → FAIL（pin 有効）、content props 再同期注入 → FAIL（pin 有効）、rebuild timer-clear 削除 → PASS（未 pin、W-001）

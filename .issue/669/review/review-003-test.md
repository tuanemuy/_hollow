# PR #676 Review — Round 3

### Test

レビュー実施内容: `gh pr diff 676` をゼロベースで plan.md「実装ステップ」「AC 一覧」と再照合。対象3テストファイル（46 tests）と全ユニットスイート（230 files / 3678 tests）を実行、すべて green。Round 2 W-001 で追加された debounce cancel テストの実質性をミューテーションで独立に再検証した。

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** Round 2 W-001 対応の「cancels a pending debounced emit when an external value change rebuilds into a failure path」（`inlineEditor.test.tsx`）は実質的であることをミューテーションで確認した。`InlineEditor.tsx` `rebuild` 冒頭の timer-clear 4行を削除して実行 → **1 failed**（当該テストのみ赤、他35は緑 — pin が修正箇所を正確に狙っている）。タイミング面も健全: debounce は 50ms、`flushMutations` は 80ms 待機するため、stale timer が生きていれば必ず発火して `onChange("")` が観測される。fake timer に頼らず実時間で margin を取る設計は flaky になりにくい
- **[N-002]** AC-7（`routerInvalidate` のエディター除外 pin）: `routerInvalidate.test.ts` は plan のテスト方針に完全準拠 — 2エディタールートの `false`、表示系ルート（`/_app/notes`・`/_app/notes/$noteId`）の `true` 維持、`alwaysTrue` 追加 filter との AND 合成下でもすり抜けなし、`appShellInvalidate` での `/edit` ルート `false`。実装側 `EDITOR_ROUTE_IDS` と1対1で対応している
- **[N-003]** AC-9（seed-once pin）: `noteEditorSeedOnce.test.tsx` はタイトル（編集値維持）と本文（host textContent "foo" 維持 + `container.innerHTML` に "server" 非出現）の二段アサーションで、props 再同期の混入をどのフィールド経由でも検出できる。JSDoc が「生 `router.invalidate()` の RSC 再マウント経路は守れない（既知の残課題）」と主張範囲を明示しており、plan のスコープ宣言と一致。過剰な主張をしていない点が良い
- **[N-004]** フォーカス保持の核心（self-emit round-trip で host DOM を再構築しない）は「does not rebuild the host DOM when the emitted value round-trips back」が DOM ノードの同一性（`querySelector("p")` / firstChild の参照比較）で pin しており、happy-dom でフォーカスを直接検証できない制約下での妥当な代替。StrictMode テスト（cleanup-null-reset 契約 / ADR-007）も含め、mount-once effect への分割リファクタの全契約がテストで覆われている
- **[N-005]** スタイル変更（AC-1〜6）と保存後 invalidate 削除（AC-8）の検証は `.issue/669/manual-test/`（TC-001〜010、全 PASS）で代替されており、plan の線引きどおり。ユニットテストの欠落ではない

#### 実行結果

- `pnpm vitest run`（routerInvalidate / inlineEditor / noteEditorSeedOnce）: 3 files, 46 tests, all passed
- `pnpm test:unit`: 230 files, 3678 tests, all passed
- ミューテーション（rebuild の debounce timer-clear 削除）: 1 failed → pin 有効（Round 2 W-001 の対応は実質的）。検証後に復元済み

### 結論

APPROVED（Test 観点）。Round 1/2 の指摘はすべて実質的なテストで pin されており、新規テストは plan のテスト方針と AC を過不足なくカバーしている。

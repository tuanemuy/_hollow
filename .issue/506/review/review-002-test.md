# Review 002 — Test 観点（2周目フル再レビュー）

対象 PR: #812 / 実装計画: `.issue/506/plan.md`
レビュー日: 2026-07-01

## 確認した範囲

- `gh pr diff 812`（差分全体）
- `app/components/common/usePopover.ts`（初期フォーカス effect / `prevOpenRef` ガード / `FOCUSABLE_SELECTOR`）
- `app/components/common/Popover.tsx`（`initialFocus` prop / dialog コードゲート）
- `app/components/common/__tests__/Popover.test.tsx`（1周目 W-001 で追加された close→reopen ケース含む）
- `app/components/note/list/__tests__/FilterBar.test.tsx`（AC-3）
- `app/components/public/__tests__/PublicTopControls.test.tsx`（AC-4）
- 実行結果: 3 ファイル 85 tests all pass。全ユニット非回帰。

## AC × テスト対応（全 AC がテストで担保されているか）

| AC | 担保テスト | 判定 |
|---|---|---|
| AC-1 | Popover「moves focus to the first focusable ... on open」＋同ケースで `panel() not toBeNull`（onFocusOut 誤発火ガード） | OK |
| AC-2 | Popover「does not move focus ... when initialFocus is omitted」= `panel()?.contains(activeElement)).toBe(false)`（happy-dom で不安定な `=== trigger` を避けた containment 判定） | OK・良 |
| AC-3 | FilterBar「moves focus to the first preset button ...（AC-3）」先頭 focusable が `aria-pressed` 保持＝preset ボタンであることも固定 | OK・良 |
| AC-4 | PublicTopControls「moves focus to the first preset button ...（AC-4）」同上 | OK・良 |
| AC-5 | 既存「wires aria-haspopup=dialog / renders role=dialog」で role/ARIA 不変を担保 | OK（既存流用） |
| AC-6 | 既存 Escape / 外側 mousedown / focus-out(null 維持・非 null 閉) / close 復帰 / clamp が全緑 | OK |
| AC-7 | Popover it.each(menu,listbox)「does not move initial focus ... even when initialFocus is passed（AC-7）」containment=false でコードゲート無効化を固定 | OK・良 |
| AC-8 | DirectoryTreeSelect 無変更（差分なし）。既存テスト非回帰 | OK |
| AC-9 | Popover「does not steal focus back ... on a re-render while open（AC-9 smoke）」＋ close→reopen ケース | 部分的（W-001 参照） |

## Test

### Blockers
- **[B-001]** なし

### Warnings
- **[W-001]** 1周目 W-001 対応で追加された close→reopen テストの「`prevOpenRef.current = open` リセット行を消すと落ちる」という主張（およびタスクの確認事項「リセット行削除で落ちることを確認済み」）が**事実に反する**。
  - 場所: `app/components/common/__tests__/Popover.test.tsx` L613-643「re-arms initial focus on close→reopen (rising-edge reset, W-001)」のコメント（"Delete that reset line ... and this test fails: the reopen no longer registers as a rising edge."）
  - 理由: 実測で、`usePopover.ts` L240 の `prevOpenRef.current = open;` を**丸ごと削除しても** Popover.test.tsx は 29/29 全て緑のまま（W-001 単体でもフルスイートでも落ちない）。コメントは「削除すると ref が true に固定される」としているが、削除時に `prevOpenRef.current` は初期値 `false` に**固定**される。よって `rising = open && !false = open` となり、open 遷移のたびに常に true → reopen でも初期フォーカスが当たる → テストは通ってしまう。つまりこのテストは close→reopen の再アーム挙動（＝「一度きり発火」実装なら捕捉できる有意な回帰ガード）は担保するが、**リセット行そのものの回帰ガードにはなっていない**。「唯一の決定的ユニット検証」という位置づけは過大主張。
  - 補足: リセット行は本番（RSC/Suspense で deps 不変のまま effect が再発火するケース）では load-bearing であり、削除してはならない。しかし happy-dom の `rerender()` は deps 不変での effect 再実行を再現しないため、AC-9 smoke も含めどのユニットテストもこの行の削除を検知できない（plan もこの限界を認識済み）。問題は「検知できない」こと自体ではなく、テストコメントが「検知できる（削除すると落ちる）」と**誤って断言**している点。
  - 提案: コメントを実態に合わせて修正する。「このテストが守るのは close→reopen での再アーム（一度きり発火実装の排除）であって、リセット行の削除検知ではない。リセット行は RSC/Suspense の effect 再発火に対して必要だが、happy-dom では再現できないため直接のユニットガードは持たない（`useRovingMenu` 前例に準拠）」と記述を改める。実装（リセット行）は据え置き。テスト自体（アサーション内容）は妥当なので削除・変更は不要、コメントの主張のみ是正すればよい。

### Notes
- **[N-001]** AC-2/AC-7 を `panel()?.contains(document.activeElement)).toBe(false)` の containment で固定し、happy-dom で不安定な `activeElement === trigger` を回避しているのは堅牢で良い。後方互換の回帰ガードとして信頼できる。
- **[N-002]** FilterBar/PublicTopControls の AC-3/AC-4 で「先頭 focusable が `aria-pressed` を持つ（＝preset ボタンであって date input ではない）」を明示アサートしており、モバイルでネイティブ日付ピッカー/ソフトキーボードが暴発しないというリスク（plan リスク欄）を実測で固定している。単なる「フォーカスが当たる」より一段強い有意なアサート。
- **[N-003]** AC-1 ケースに `expect(panel()).not.toBeNull()` を併記し、初期フォーカス移動が onFocusOut を誤発火させてパネルを閉じない不変条件を同一テストで直接ガードしている（arch S-002 / coverage S-002 の反映）点は良い。
- **[N-004]** menu/listbox に `initialFocus` を渡すケースを it.each で回し、コードゲート（`haspopup === "dialog"`）による構造的無効化を固定している。二重フォーカスの illegal state をテストでも押さえており AC-7 の担保として十分。
</content>
</invoke>

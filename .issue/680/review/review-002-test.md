# レビュー記録 — Issue #680 / PR #684（観点: Test、2周目）

- レビュアー観点: Test
- 対象: `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx`（作業ツリー未コミット、全9ケース）
- 実装: `app/components/common/useRestoreFieldFocusOnCommit.ts`
- 参照: 1周目 `.issue/680/review/review-001-test.md`、仕分け `.issue/680/review/review-001.md`、`.issue/680/plan.md`
- 検証手法: テストを読むだけでなく、実装にミューテーションを注入し各ケースが落ちることを実測してトートロジー/偽陽性を排除（下記 N に実測結果）

## Test

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 1周目 B-001（スナップショット未取得フォールバックの偽陽性）は**正しく解消された**。`ProbeNoHandlers`（selection-capturing ハンドラを spread しない variant、`:50-67`）を新設し、programmatic `field.focus()` でも `onFocus` ハンドラが要素に配線されていないため `capture()` が一切走らず `snapshotRef` が null のままになる設計に組み替えた。これで `if (snapshot !== null)`（実装 `:121`）の false 側を確実に通す。`vi.spyOn(field, "setSelectionRange")` で「呼ばれないこと」を assert（`:205,228`）しており、ラベルと挙動のズレも不可視化されていない。
  - 実測（ミューテーション）: 実装 `:121-123` を「null でも `setSelectionRange(0,0)` を呼ぶ」に改変すると、`restores focus only...` と `armed only from the post-commit activeElement` の**2ケースがちょうど落ちる**（"setSelectionRange to not be called ... actually been called 1 times"）。フォールバック分岐が実際に到達していることを確認。

- **[N-002]** 1周目 B-001 の核心だった E-1 回帰防御も**成立している**。`ProbeNoHandlers` は `onFocus` を持たないため `hadFocusRef` を arm できるのは post-commit `activeElement === el` 経路（実装 `:129-131`）**だけ**になる。これは実機ゲート E-1 で「autoFocus が React 合成ハンドラ配線前に focus し `onFocus` が発火しない」バグを修正した load-bearing なコードと同じ経路。
  - 実測（ミューテーション）: 実装 `:129-131` の arming ブロックを削除すると、no-handler 系の**2ケースが落ちる**（focus 復元されず）。テスト名 "armed only from the post-commit activeElement" が主張する経路を実際に検証していることを確認。1周目で「event 経路で arm しており主張を検証していない」と指摘された問題は解消。

- **[N-003]** 1周目 W-001（`isConnected` ガード未到達）は**正しく解消された**。null ガードのケース（`:149-163`、`show=false` で `ref.current=null`）と、`isConnected` ガードのケース（`:165-184`、`container.remove()` でノードを document から切り離し `ref.current` は field のまま）を**別ケースとして分離**。後者は `field.isConnected === false` を明示 assert し、`vi.spyOn(field, "focus")` で focus が呼ばれないことを pin。
  - 実測（ミューテーション）: 実装 `:116` の `el.isConnected` を `true` に改変すると `isConnected guard` ケース**のみ**が落ちる。`el !== null` を削除すると `null guard` ケース**のみ**が `TypeError: Cannot read properties of null (reading 'isConnected')` で落ちる。二つのガードが独立に pin されていることを確認。

- **[N-004]** 1周目 W-002（IME compositionend 後の復元再開が未検証）は**正しく解消された**。`:231-264` のケースは compositionstart → drop → commit（抑制：body のまま）→ compositionend → drop → commit（復元：`activeElement===field` ＋ caret(1,4) 一致）まで通す。抑制と再開の両半分を assert。
  - 実測（ミューテーション）: 実装 `:160` の `composingRef.current = false` を削除（恒久抑制バグ）すると当該ケースが落ちる。逆に restore ガードの `!composingRef.current`（実装 `:113`）を削除（抑制なし）しても当該ケースが落ちる。抑制・再開どちらも mutation-sensitive で、1周目が懸念した「恒久抑制バグの見逃し」は防がれている。

- **[N-005]** 1周目 W-003（コメントと happy-dom 実挙動の食い違い）は**解消された**。ファイル冒頭 JSDoc（`:8-23`）で「happy-dom では programmatic `field.focus()` が React 合成 `onFocus` を発火する」「だから `ProbeNoHandlers` でフォールバックを駆動する」を明記。null vs isConnected の区別（`:157-159,173-177`）、autoFocus 相当の説明（`:209-216`）も実態に沿っており、コメントが assertion で裏付けられている。

- **[N-006]** 残る全ガードも mutation-sensitive であることを実測で確認した（トートロジーでない）:
  - `hadFocusRef.current`（実装 `:114`）削除 → `does not restore when the field never held focus`（`:139-147`）が落ちる。
  - `document.activeElement === document.body`（実装 `:117`）を `true` に改変 → `does not restore when the user moved focus to another element`（`:126-137`）と `window-blur-like`（`:266-282`）の2ケースが落ちる。
  - ハッピーパス（`:108-124`）は focus 復帰＋caret(2,5) 一致を assert。
  - 9ケースで実装の全ガード分岐（hadFocus / null / isConnected / body限定 / IME抑制 / IME再開 / snapshot有無）と両ハッピーパス（snapshotあり復元・snapshotなしフォールバック）を網羅。フックを外す/各ガードを壊すと必ずいずれかが落ちる。

- **[N-007]** テスト設計の骨格（再レンダーを commit に見立て、`activeElement` を手で body へ落として RSC detach を simulate）と「統合挙動は実機ゲート（plan step 7 / `summary.md`）へ委譲」という責務分担は妥当。冒頭 JSDoc（`:13-14`）と実装 JSDoc がこの限界を明記しており、ユニットで賄えない範囲を実機が補完する構造は適切。

- **[N-008]** 全9ケース green（`vitest run`、282ms）。実装ファイルにミューテーション検証後の差分は残っていない（git status clean、`useRestoreFieldFocusOnCommit.ts` 未変更）。

## サマリ

1周目の B-001 / W-001 / W-002 / W-003 はすべて正しく解消された。とりわけ Blocker だった「フォールバック分岐の偽陽性」と「E-1 回帰防御の不成立」は、`ProbeNoHandlers` 導入＋`setSelectionRange` spy により、(a) snapshot が真に null のまま分岐へ到達すること、(b) post-commit `activeElement` 経路だけで arm される E-1 修正経路を検証していること、の双方をミューテーション実測で確認できた。`isConnected` ガードは独立ケースで分離・pin、IME は抑制/再開の両半分を pin。テストの全ガードが mutation-sensitive でトートロジー/偽陽性は認められない。新規の問題なし。**APPROVED**。

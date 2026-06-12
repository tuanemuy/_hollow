# PR #665 レビュー — Test 観点（review-001）

対象: PR #665（Issue #658 / .issue/658/plan.md AC-10 (a)〜(h)）
レビュー範囲: `app/components/note/list/__tests__/FilterBar.test.tsx` / `app/components/common/__tests__/Popover.test.tsx` の追加テスト、関連実装（`usePopover.ts` / `useRovingMenu.ts` / `styles.ts`）、ブラウザ検証3バグの回帰テスト

## 計画 (a)〜(h) とのカバレッジ照合

| 項目 | 判定 | 対応テスト |
|---|---|---|
| (a) チップ存在・並び順・a11y 属性 | ✓ | "renders the ghost chip after the tag chips..."（`compareDocumentPosition` で順序、haspopup/title、aria-label はセレクタで暗黙担保） |
| (b) listbox + `aria-multiselectable` + 全 option + `aria-selected` | ✓ | "opens a multiselectable listbox..." |
| (c) クリックでナビゲーション発火・楽観反転・パネル維持 | △ | "toggles a tag optimistically..."（選択方向のみ。W-001 / W-002 参照） |
| (d) Escape でクローズ + トリガーへフォーカス復帰 | ✓ | "closes on Escape..." |
| (e) 「+ タグ」オープンで期間が閉じる | ✓ | "closes the 期間 popover..." |
| (f) `tags=[]` で非描画 | ✓ | "is not rendered when there are no tags" |
| (g) パネルの構造アサーション | ✓（計画超過で良） | "keeps the panel built on the shared sheet panel styles..." — 定数包含だけでなくシート化ユーティリティ5種を個別ピン留めし、TC-6 で露呈したトートロジーを潰している |
| (h) クリック後 ArrowDown で次 option | ✓ | "syncs roving focus to the clicked option..." |
| Popover.test.tsx の multiselectable 属性 | ✓ | `it.each([[true,"true"],[undefined,null]])` — デフォルト時の属性なし（ViewSwitcher 非破壊）も固定 |

## ブラウザ検証3バグの回帰テスト妥当性

1. **focusout 誤クローズ（ADR-005）**: `Popover.test.tsx` "stays open on focus-out with relatedTarget=null" — 修正前なら `onOpenChange(false)` が走り fail するため回帰テストとして有効。既存の "closes on focus-out when focus moves to an element outside the container"（L141）が残っており、ガードが Tab アウトのクローズを壊していないことも両面から固定されている。良。
2. **フォーカス喪失（ADR-006）**: `FilterBar.test.tsx` "restores focus to the active option when a commit drops focus to <body>" — `blur()` → 同一 root への再 render で「コミット後の dep なし復元 effect」を経路単位で固定。jsdom/happy-dom で RSC 再レンダーを再現できない制約下では妥当な近似。ガード2（closed→open 遷移ガード）はサスペンド再開の同一 deps 再発火を環境的に再現できないため直接テスト不能だが、初回オープン時のリセットは既存 ViewSwitcher テスト（"lands roving focus on the selected option when opened (initialIndex)"）が非破壊を担保。N-003 参照。
3. **シート化漏れ（popoverSheetPanel）**: (g) のピン留めアサーションが該当。「定数を含む」だけのトートロジーで通過していた前回の教訓をコメントで明示し、`max-sm:fixed` 等の load-bearing ユーティリティを個別検証。`popoverSheetPanel` の実装側消費者は `FILTER_POPOVER_PANEL` のみ（grep 確認済み）で、期間/公開状態ポップオーバーも同定数経由のため transitively カバーされる。良。

## 決定性

良好。fake timer 不要（タイマー非使用）、pending ナビゲーションは手動 resolve の Promise で制御、`flush()` はマイクロタスクドレイン、フォーカスアサーションはすべて `act` 内の同期イベントで駆動。フレーク要因は見当たらない。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** TC-4 回帰の FilterBar レベルでの固定が不完全 / `FilterBar.test.tsx` "toggles a tag optimistically on option click and keeps the panel open" / 実バグ（TC-4）は「ナビゲーション**完了後**」にパネルが閉じる事象だったが、このテストは pending 中に `expect(listbox()).not.toBeNull()` を確認した後、`resolveNav()` + `flush()` で終わり、**解決後にパネルが開いたままであることをアサートしていない**。修正は `usePopover` 側にあり `Popover.test.tsx` の focusout-null テストが単体で担保しているとはいえ、テスト名が "keeps the panel open" と主張する以上、settle 後の状態も固定すべき / 末尾の `await flush()` の後に `expect(listbox()).not.toBeNull()`（と必要なら `aria-selected` 維持）を1行追加する
- **[W-002]** 解除（deselect）方向のトグルが未テスト / 同上テスト群 / (c) の「`aria-selected` が反転」は false→true のみ検証。選択済みタグの option クリックで楽観的に解除され（`aria-selected="false"` / インラインチップ `aria-pressed="false"`）、パネルが開いたままであることは未固定。楽観反映の解除パスは追加パスと配列演算が異なる（filter vs concat）うえ、ブラウザ検証 TC-4 step3 でも独立に確認された経路。また plan のリスク項「楽観反映中に連打しても…listbox 内トグルでも同じであることをテストで担保する」（plan.md L128）は #664（既存バグ）起票により事実上未実施 — 見送り自体は妥当だが計画との差分として認識されたい / `renderBar(TAGS, ["beta"])` で開き、`#beta` option をクリックして解除方向を1ケース追加する
- **[W-003]** `tagButton()` ヘルパーがピッカー open 時に曖昧マッチ / `FilterBar.test.tsx` の `tagButton`（テキストに `#name` を含む最初の button を返す）/ ピッカーが開くと inline チップと `role="option"` の両方が `#alpha` を含み、DOM 順（チップがパネルより前）に依存して偶然正しい要素を取っている。レイアウト順の変更で「チップのつもりで option をアサートする」サイレントな誤判定になり得る / `aria-pressed` 属性の存在で絞る、またはチップ列コンテナにスコープして検索する

#### Notes

- **[N-001]** AC-1 の「もっと見るトグル含む直後」の並び順と「畳まれたタグ（13件目以降）もピッカーに全件出る」は、ユニットでは 3 タグ（< VISIBLE_TAG_LIMIT）でしか検証されておらず、手動テスト（TC-3 / TC-E2）依存。TAGS を 13 件超にしたケースを1本足すとユニットで閉じる
- **[N-002]** 相互排他は 期間→タグ の一方向のみ。逆方向（タグ open 中に 期間/公開状態 を開く）は `openPopover` union の構造上リスクは低いが、TC-7 では両方向を確認しており、ユニットの対称性としては片落ち
- **[N-003]** ADR-006 のガード2（同一 deps での effect 再発火時にリセットしない）は happy-dom で再現不能なため直接の回帰テストなし — 制約として妥当。ただし「close → reopen で `initialIndex` にリセットされる」挙動（`prevOpenRef` 導入で壊れ得る側）を明示的に固定するテストは ViewSwitcher の初回オープンのみで、再オープンのケースはない。`useRovingMenu` の挙動変更としては再オープンリセットの1ケースがあると安心
- **[N-004]** (g) のアンチトートロジー設計（共有定数の内容自体をピン留め）と、Popover 側のデフォルト属性なし（既存消費者非破壊）の両側固定は良いプラクティス。また `.issue/658/manual-test/` の TC 記録（FAIL → 修正 → 再検証 PASS の経緯保存）はレビュー可能性が高い

## 総評

計画 (a)〜(h) はすべて対応するテストがあり、3バグの回帰も適切な層（共有プリミティブのバグは共有プリミティブのテスト、統合挙動は FilterBar テスト）で固定されている。決定性も良好。Blocker なし。W-001/W-002 はいずれも1〜数行の追加で閉じる軽微な強化。

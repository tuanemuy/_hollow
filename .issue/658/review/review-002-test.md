# PR #665 レビュー — Test 観点（review-002）

対象: PR #665（Issue #658 / .issue/658/plan.md AC-10 (a)〜(h)）、review-001 対応後の最新差分
実行確認: `pnpm test:unit`（227 files / 3606 tests）全パス。`FilterBar.test.tsx`（19 件）/ `Popover.test.tsx`（16 件）個別実行もパス。

## review-001（Test 観点）指摘の対応確認

| 指摘 | 状態 |
|---|---|
| W-001 ナビ resolve 後のパネル維持アサーション | 対応済み — "toggles a tag optimistically..." 末尾に settle 後 `listbox()` を追加。楽観値がベースラインへ戻る理由（ハーネスに loader がない）もコメントで明示 |
| W-002 解除方向の楽観トグル | 対応済み — "deselects an already-selected tag optimistically..." を新設（`aria-selected`/`aria-pressed` 反転 + settle 後パネル維持） |
| W-003 `tagButton()` の曖昧マッチ | 対応済み — `button[aria-pressed]` にスコープ化、WHY コメントあり |
| N-001〜N-003 | 未対応（仕分けで修正対象外。下記 Notes に carryover として記載、再エスカレートはしない） |

## ミューテーションによるアサーション強度の検証（本ラウンドで実施）

回帰テストが「修正を外すと実際に fail するか」を変異で確認した:

| 変異 | 結果 |
|---|---|
| `FilterBar.tsx` の `restoreFocusOnCommit: true` → `false` | **検出**（"restores focus to the active option..." が fail）— ADR-006 復元パスの回帰テストは load-bearing |
| `usePopover.ts` の `if (next === null) return;` ガード除去 | **検出**（"stays open on focus-out with relatedTarget=null" が fail）— ADR-005 の回帰テストは load-bearing |
| `useRovingMenu.ts` の `prevOpenRef` 遷移ガード除去（`if (!open) return;` に戻す） | **検出**（FilterBar 側 2 件が fail）— ADR-006 ガード2 は review-001 N-003 の懸念に反して**ユニットで間接的に固定されている** |
| `useRovingMenu.ts` 復元 effect のクランプ除去（`Math.min` → 素の `activeIndex`） | **生存**（全 19 件パス）→ W-001 |
| `useRovingMenu.ts` の `restoreFocusOnCommit` デフォルトを `true` に反転 | **生存**（Menu / ViewSwitcher / FilterBar 計 42 件パス）→ W-002 |

## 決定性

良好。タイマー非使用（fake timer 不要）、pending ナビゲーションは手動 resolve Promise、`flush()` は固定 30 tick のマイクロタスクドレイン、フォーカスアサーションはすべて `act` 内同期イベント駆動。新設の every-commit 復元 effect も `document.activeElement` ガード込みで happy-dom 上の実行順に依存しない。フレーク要因なし。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** ADR-008 決定2（復元時の index クランプ + state 同期）が未テスト / `app/components/common/useRovingMenu.ts` の `Math.min(activeIndex, items.length - 1)` と `if (clamped !== activeIndex) setActiveIndex(clamped)` / クランプを除去する変異が全テストを生存通過する。これは review-001 [SH W-002] 対応で入ったコードパスで、「フィルタナビゲーションの同一コミットで option 集合が縮み、stale な範囲外 index で復元が no-op → 矢印キー死亡（TC-5 と同症状）」という具体的な再発シナリオを ADR 自身が挙げているのに、その回帰テストがない / FilterBar テストで `options()[2]` をクリック → blur-to-body → `renderBar(TAGS.slice(0, 2), [...])` で再 render し、`document.activeElement` が末尾 option（clamped）にあり、続く ArrowDown/ArrowUp が連続して効くことを 1 ケース固定する
- **[W-002]** `restoreFocusOnCommit` のデフォルト false（既存コンシューマ非破壊）が未固定 / `app/components/common/useRovingMenu.ts` / デフォルトを `true` に反転する変異が Menu / ViewSwitcher / FilterBar の全テストを生存通過する。ADR-008 の存在意義は「単一選択コンシューマがフォーカス横取りを背負わない」ことの保証であり、`Popover` の `multiselectable` には `it.each([[true,"true"],[undefined,null]])` でデフォルト側の negative テストがあるのに、同じ review-001 対応で入ったこちらの flag には対称な担保がない / 単一選択側（例: ViewSwitcher）で「open 中に blur-to-body → 再 render してもフォーカスが `<body>` のまま（パネルに引き戻されない）」を 1 ケース追加する

#### Notes

- **[N-001]** ミューテーション検証の結果、ブラウザ検証 3 バグ（TC-4 / TC-5 / TC-6）の回帰テストはいずれも修正を外すと fail する load-bearing なテストであることを確認した。特に ADR-006 ガード2（`prevOpenRef`）は review-001 N-003 で「直接テスト不能」とされていたが、実際には FilterBar の "syncs roving focus" / "restores focus" がガード除去を検出する（楽観 settle の再 render で reset effect が再発火する経路を踏むため）。間接カバレッジとして十分
- **[N-002]** （carryover: review-001 N-001 / N-002）13 件超タグでの「畳まれたタグもピッカーに全件出る」と、相互排他の逆方向（タグ open 中に期間/公開状態を開く）は引き続きユニット未カバーで手動テスト（TC-3 / TC-E2 / TC-7）依存。仕分けで対象外とされた経緯を尊重し再エスカレートしないが、将来 FilterBar を触る際の追補候補
- **[N-003]** "restores focus to the active option" の再 render が `renderBar(TAGS, ["beta"])`（selected 変更）なのは、`initialIndex` が 0→1 に動くため「reset が走っても結果が偶然同じ（activeIndex=1 = initialIndex=1）」になる構図。ただし N-001 のとおりガード自体は別テストが検出するため実害なし。clicked index と initialIndex がずれる選択（例: opts[2] クリック）にしておくと単体でも判別可能になる
- **[N-004]** settle 後に楽観値がベースラインへ戻る挙動（ハーネスに loader がない）を「バグではなくハーネスの制約」とテスト内コメントで明示している点、`flush()` の 30 tick の WHY コメント、TC 記録（FAIL → 修正 → 再検証 PASS）の保存は良いプラクティス

## 総評

review-001 の Test 指摘 3 件はすべて適切に対応され、計画 (a)〜(h) のカバレッジ・決定性は引き続き良好。本ラウンドの新規指摘は、review-001 対応で**新たに入った**2 つの分岐（クランプ / opt-in デフォルト）が変異テストを生存通過する点に絞られる。いずれも 1 ケース追加で閉じる。Blocker なし。

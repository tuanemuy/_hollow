# PR #812 レビュー（Test 観点・3周目 収束確認）

対象: PR #812 / Issue #506 / 実装計画 `.issue/506/plan.md`
周回: 3周目（2周目 Test W-001 反映の収束確認）

## 確認した内容

2周目 Test W-001（`re-arms initial focus on close→reopen` テストのコメントが「リセット行削除で落ちる」と過大主張していた点）の訂正が、実装のミューテーション挙動と一致するかを検証した。

対象コメント: `app/components/common/__tests__/Popover.test.tsx` L613-646
対象実装: `app/components/common/usePopover.ts` L239-243
```
const rising = open && !prevOpenRef.current;
prevOpenRef.current = open;
if (!moveInitialFocus || !rising) return;
panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
```

コメントが主張する2つのミューテーション挙動を実装に照らして検算し、いずれも正確であることを確認した。

1. 「`prevOpenRef` を初回 open 後に true 固定（`if (open) prevOpenRef.current = true`）すると再オープンが rising edge と読まれずテストが落ちる」
   → close 時（open=false）に `if (open)` が偽で ref が true のまま残る → 再オープンで `rising = true && !true = false` → focus が戻らず L645 の `firstFocusable` アサーションが失敗。**主張どおり検出される。** 正確。

2. 「リセット行を丸ごと削除しても落ちない（`prevOpenRef` が初期値 false のままで毎回 rising と読まれ focus が着地し緑のまま、分離検証不能）」
   → `prevOpenRef.current = open;` を消すと ref は常に false → `rising = open && !false = open` → 立ち上がりトグルで毎回 focus 着地 → 再オープンテストは緑のまま。**このパスは当該テストでは分離できない。** 訂正後の記述は正確で、2周目の過大主張（「削除で落ちる」）が解消されている。

## 全 AC のテスト担保・非回帰

- AC-1: `Popover.test.tsx` L548「moves focus to the first focusable ... (AC-1)」
- AC-2: L559「does not move focus into the panel when initialFocus is omitted (AC-2)」
- AC-3: `FilterBar.test.tsx` L379「moves focus to the first preset button ... (Issue #506 AC-3)」
- AC-4: `PublicTopControls.test.tsx` L259「moves focus to the first preset button ... (AC-4)」
- AC-5: role/aria-haspopup 維持アサーション（dialog mode L149 ほか）
- AC-6: Escape/focus-out/close 復帰系テスト（L183/L208/L224）で非回帰を担保
- AC-7: menu/listbox コードゲート test.each（L~570-611、`initialFocus` を渡しても panel に focus が入らないことを確認）
- AC-8: DirectoryTreeSelect 無変更（`initialFocus` 未配線）
- AC-9: L648「does not steal focus back ... on a re-render while open (AC-9 smoke)」＋ L613 の close→reopen 再武装テストが補完

Popover テストスイート全 29 件パス（`pnpm vitest run app/components/common/__tests__/Popover.test.tsx`）。実装・アサーションは 2周目から変更なし、コメントのみの訂正で、記述と実態が一致した。

## Test

### Blockers
- **[B-001]** なし

### Warnings
- **[W-001]** なし（2周目 W-001 は本周回で訂正確認済み・収束）

### Notes
- **[N-001]** リセット行 `prevOpenRef.current = open;` の削除は、当該テストでも AC-9 smoke でも happy-dom の安定した effect deps 上では分離検出できない（コメントが明記済み）。実害が出るのは「open 中に `moveInitialFocus` が false→true へ変化する」エッジ（このとき ref 未リセットだと focus を奪い戻す）で、本 PR のスコープ外かつ現状 consumer では発生しない。追加テストは不要だが、将来 `initialFocus` を動的トグルする consumer を足す場合のみ回帰余地がある点をメモとして残す。
</content>
</invoke>

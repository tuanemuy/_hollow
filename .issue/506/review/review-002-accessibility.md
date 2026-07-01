# Review 002 — Issue #506 / PR #812（Accessibility・2周目フル再レビュー）

対象: `gh pr diff 812`（`usePopover.ts` / `Popover.tsx` / `FilterBar.tsx` / `PublicTopControls.tsx` と各 `__tests__`）
参照: `.issue/506/plan.md`（AC-1〜AC-9）/ `.issue/506/adr.md`（ADR-001）/ WAI-ARIA APG（非モーダル dialog）/ WCAG 2.2

## 総評

非モーダル `Popover`（dialog モード）の「`role="dialog"` を名乗るのに open してもフォーカスが移らない」乖離が、第1層 `usePopover` の opt-in 初期フォーカス（`moveInitialFocus`）で意味論を保ったまま解消されている。WAI-ARIA APG の非モーダル dialog 要件（open 時にパネル内へ初期フォーカス／close 時にトリガーへ復帰、トラップは modal のみの要件で非モーダルでは不要）を正しく満たす。1周目の反映（close→reopen 再アームのユニットテスト・`prevOpenRef` の WCAG 3.2.1 コメント）も回帰なく取り込まれており、Accessibility 観点で新規の Blocker/Warning は無い。関連 3 テスト（計 85）緑を確認済み。

### Accessibility

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** 非モーダル dialog の APG 契約が両輪そろった: open で `panelRef` 内の先頭 focusable へ `.focus()`（`usePopover.ts` L238-243）、close で `closeAndRestoreFocus` / Escape ハンドラがトリガーへ復帰（既存）。`role="dialog"` と `aria-haspopup="dialog"` を維持しつつ「開いたのにフォーカスが動かない」乖離だけを埋める最小解で、意味論を壊していない（AC-5）。
- **[N-002]** 初期フォーカスの着地先が両 DatePopover とも先頭プリセットボタン（`role="group" aria-label="プリセット"` 内、DOM 順で date input より先。FilterBar L863-882 / PublicTopControls L514-529）。`type="date"` 入力ではないため、モバイルのボトムシートでネイティブ日付ピッカー／ソフトキーボードが暴発しない。AT には「ダイアログ 期間フィルタ → トグルボタン」と自然に読み上がる並び。
- **[N-003]** WCAG 3.2.1（On Focus）配慮が明文化されている。初期フォーカスは常にユーザー起動（トリガー click/Enter）の閉→開遷移でのみ発火するため 3.2.1 に抵触しない。`prevOpenRef` 初期値 `false` により「open 状態でマウントされた dialog」ではジェスチャなしにフォーカスが動きうる旨を `usePopover.ts` L188-193 のコメントが 3.2.1 注意として残しており、現行 consumer は全て閉状態開始で実害なし。将来の open-at-mount consumer 追加時の落とし穴を先読みできている（AC-9 smoke / mount-open テストでも固定）。
- **[N-004]** menu/listbox への `initialFocus` 誤配線を `Popover` 側で `haspopup === "dialog" ? Boolean(initialFocus) : false` とコードゲート（`Popover.tsx` L85）。roving（第2層）との二重フォーカスという illegal state を構造的に排除しており、AC-7 のユニットテスト（menu/listbox に `initialFocus` を渡してもパネル内へ焦点が入らない）で恒久ガード。
- **[N-005]** 回帰ガードが a11y の要点を直接押さえている: 初期フォーカス直後に `onFocusOut` 誤発火でパネルが閉じない不変条件を `expect(panel()).not.toBeNull()` で（AC-1）、後方互換を `panel()?.contains(document.activeElement) === false` で（AC-2、happy-dom で不安定な `activeElement===trigger` を回避）、close→reopen の再アームを `prevOpenRef.current=open` リセットの決定的検証として（W-001）固定。二層設計（`useRovingMenu` の roving・DirectoryTreeSelect の自前フォーカス）は無変更で回帰なし。
- **[N-006]** 1周目 Accessibility W-001（実 AT スクリーンリーダーでの読み上げ検証）は自動検証スコープ外として見送り済みの扱いが妥当。ブラウザ手動テスト（`.issue/506/manual-test/report.md` TC-001/005）で「先頭プリセット『今日』へ初期フォーカス・`role=dialog` 保持・誤クローズなし・Escape 復帰」を実機観測しており、自動化不能な SR 読み上げを除き観測可能な範囲は担保されている。

## 返答（サマリー）

- Blockers: 0 / Warnings: 0 / Notes: 6
- [N-001] 非モーダル dialog の APG 契約（初期フォーカス＋トリガー復帰）が両輪そろい意味論を維持
- [N-002] 着地先が先頭プリセットボタン（date input でない）でモバイルのピッカー/ソフトキーボード暴発なし
- [N-003] WCAG 3.2.1 配慮を `prevOpenRef` コメントで明文化、現行 consumer は閉状態開始で実害なし
- [N-004] menu/listbox 誤配線を `haspopup==="dialog"` コードゲートで排除、二重フォーカス不能
- [N-005] onFocusOut 誤クローズ/後方互換/再アームを直接アサートする回帰ガードが充実
- [N-006] 1周目 W-001（実 AT 検証）は自動スコープ外として妥当に見送り、手動テストで観測可能範囲を担保

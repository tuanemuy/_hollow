# Review 003 — Frontend（PR #665 / Issue #658）

対象: 「+ タグ」ゴーストチップ + タグピッカー（マルチセレクト listbox）— review-002 対応後のゼロベースフルレビュー
観点: コンポーネント設計・状態管理・a11y・UX・デザイン準拠

検証方法: `gh pr diff 665` 全差分精読、最終状態の `FilterBar.tsx` / `Popover.tsx` / `usePopover.ts` / `useRovingMenu.ts` / `common/styles.ts` 精読、対象ユニットテスト実行（FilterBar 19 + Popover 16 + ViewSwitcher 13 = 48 passed）。

## AC 充足確認

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 並び順 | OK | チップ群 div（もっと見る含む）→ `TagPickerPopover` → `DatePopover` の DOM 順。`compareDocumentPosition` テストで固定 |
| AC-2 見た目 | OK | `filterChipGhost` 共用 + lucide `Plus`（`size-[11px]` / `strokeWidth={2}` / `aria-hidden`）+「タグ」。`▾` でなく `+` |
| AC-3 a11y 契約 | OK | `aria-haspopup="listbox"`（triggerProps）+ `aria-label` + `title` 常時併記（ADR-004 を JSDoc に明記） |
| AC-4 listbox | OK | `role="listbox"` + `aria-multiselectable="true"`（`multiselectable` prop、未指定で属性なし）、option は `role="option"` + `aria-selected` + 件数バッジ |
| AC-5 楽観的トグル | OK | inline チップと同一 `toggleTag` 共有。選択/解除の両方向 + ナビ settle 後のパネル維持をテストで固定 |
| AC-6 キーボード | OK | 矢印ロービング・Escape→トリガー復帰・クリック後 `setActiveIndex` 同期・コミット後フォーカス復元（opt-in + クランプ + `preventScroll`）すべてテスト済み |
| AC-7 ボトムシート | OK | `popoverSheetPanel` に `max-sm:fixed/bottom-0/top-auto/mt-0/rounded-b-none` + safe-area padding。TC-6 実機再検証 PASS。テストはユーティリティのピン留めでトートロジー回避 |
| AC-8 相互排他 | OK | `openPopover` union に `"tag"` 追加。期間→タグの排他テストあり（逆方向は review-002 で carryover 仕分け済み — 再エスカレートしない） |
| AC-9 タグ 0 件 | OK | `tags.length > 0` ガード + テスト |
| AC-10 テスト | OK | FilterBar 11 ケース + Popover（multiselectable / focusout 回帰）+ ViewSwitcher（restoreFocusOnCommit デフォルト off の negative）。48 passed を実行確認 |
| AC-11 手動テスト | OK | `spec/manual-tests/browse.md` TC-E4-05（デスクトップ/モバイル/キーボード/既知の制限/0 件、8 ステップ）追記 |

## review-002 指摘の対応確認

- [FE W-001] safe-area: `popoverSheetPanel` に `max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]` 追加 — 対応済み
- [SH W-001] `focus({ preventScroll: true })` + WHY コメント — 対応済み
- [TS W-001] クランプの回帰テスト（"clamps the restored focus index when the option set shrinks..."、クランプ後の ArrowUp/ArrowDown 連続性まで固定）— 対応済み
- [TS W-002] `restoreFocusOnCommit` デフォルト off の negative テスト（ViewSwitcher "does not pull focus back into the panel..."）— 対応済み

見送り記録済み事項（type-ahead は combobox フォローアップ、モバイルシートの閉じる操作は既存と同形）は蒸し返さない。

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** シート化テストのピン留め 5 ユーティリティに review-002 W-001 で追加した safe-area padding（`max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]`）は含まれていない。レイアウトを成立させる load-bearing 5 種に絞った判断は理解できるが、この padding も「44px タッチターゲットの下端がホームインジケーターに削られない」ための実 UX 要件で入った経緯があるので、ピン留め対象に 1 行足すと退行検出が閉じる（任意）
- **[N-002]** ピッカーが開いている間に `tags` が 0 件になると `tags.length > 0` ガードで `TagPickerPopover` ごとアンマウントされ、`openPopover === "tag"` が残ったままフォーカスが落ちる経路が理論上ある。現状 `loadAllTags` の結果はフィルタ選択と独立で、ピッカー操作中にタグが消えるのは別タブでの全タグ削除など極端なケースのみ。`openPopover` は次のチップ操作で上書きされるため実害は閉じている — 記録のみ
- **[N-003]** ゼロベースで確認した良い点: (1) 初期ロービングは最初の選択済み option へ着地（APG 準拠、VisibilityPopover と同形）。(2) `VISIBILITY_OPTION_ITEM` にも focus ring / overflow-wrap / TOUCH_TARGET が揃い、隣接ポップオーバー間でフォーカス表現が一致。(3) ✓ マークは `aria-hidden` で選択状態は `aria-selected` のみが SR に伝わる二重表現の回避。(4) styling 規約（utility-first / `data-active={active || undefined}` / モジュール定数ホイスト / 新規 CSS なし）と CLAUDE.md コメント規約（WHY のみ）に準拠。(5) 共有プリミティブ 3 変更（focusout ガード / restoreFocusOnCommit opt-in / popoverSheetPanel 修正）はいずれも回帰テスト・negative テスト・実機再検証の三点で裏取りされている

## 結論

Blocker / Warning なし。round 1–2 の指摘はすべて対応済みで、AC-1〜11 充足。マージ可能な品質。

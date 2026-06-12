# Review 002 — Frontend（PR #665 / Issue #658）

対象: 「+ タグ」ゴーストチップ + タグピッカー（マルチセレクト listbox）— review-001 対応後のゼロベースフルレビュー
観点: コンポーネント設計・状態管理・a11y・UX・デザイン準拠

検証方法: `gh pr diff 665` 全差分精読、最終状態の `FilterBar.tsx` / `Popover.tsx` / `usePopover.ts` / `useRovingMenu.ts` / `common/styles.ts` / `note/list/styles.ts` 精読、モック `spec/design/pages/P10-home.html` L1105–1110 との突合、対象ユニットテスト実行（FilterBar + Popover、35 passed）。

## AC 充足確認

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 並び順 | OK | チップ群 div（もっと見る含む）→ `TagPickerPopover` → `DatePopover`（`FilterBar.tsx:302-357`）。`compareDocumentPosition` テストあり |
| AC-2 見た目 | OK | `filterChipGhost` 共用 + lucide `Plus`（`size-[11px]` / `strokeWidth={2}` / `aria-hidden`）+「タグ」。モック L1108-1110 の SVG（11px / stroke-width 2）・ラベル・破線チップと一致。`▾` でなく `+` |
| AC-3 a11y 契約 | OK | `aria-haspopup="listbox"`（triggerProps）+ `aria-label` + `title` 常時併記（ADR-004 を JSDoc に明記） |
| AC-4 listbox | OK | `role="listbox"` + `aria-multiselectable="true"`（`Popover` の `multiselectable` prop、未指定で属性なし）、option は listbox 直下の子で `role="option"` + `aria-selected` |
| AC-5 楽観的トグル | OK | inline チップと同一 `toggleTag` 共有、`useOptimistic` の選択反映と「ナビ確定後もパネル開いたまま」（ADR-005 ガード）をテストで担保 |
| AC-6 キーボード | OK | Arrow/Home/End ロービング、Escape→トリガー復帰、クリック後の `setActiveIndex` 同期、コミット後フォーカス復元（`restoreFocusOnCommit` opt-in）すべてテスト済み |
| AC-7 ボトムシート | OK | `popoverSheetPanel` に `max-sm:fixed max-sm:bottom-0 ...` 追加（TC-6 で実機確認済み）。テストはユーティリティのピン留めでトートロジーを回避。W-001 参照 |
| AC-8 相互排他 | OK | `openPopover` union に `"tag"` 追加、期間→タグの排他テストあり |
| AC-9 タグ 0 件 | OK | `tags.length > 0` ガード + テスト |
| AC-10 テスト | OK | FilterBar に 9 ケース、Popover に multiselectable / focus-out 回帰を追加。35 passed を実行確認 |
| AC-11 手動テスト | OK | `spec/manual-tests/browse.md` TC-E4-05（デスクトップ/モバイル/キーボード/既知の制限/0 件）追記 |

review-001 の W-001（popoverSheetPanel 波及の実機確認）/ W-002（initialIndex = 最初の選択済み option）/ W-003（restoreFocusOnCommit opt-in 化 + クランプ）/ W-004（VISIBILITY_OPTION_ITEM への focus ring / overflow-wrap / TOUCH_TARGET 追加とコメント修正）はいずれも対応済みであることをコードで確認した。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** ボトムシート化したパネルに `env(safe-area-inset-bottom)` の余白がない
  - 場所: `app/components/common/styles.ts:378`（`popoverSheetPanel`）
  - 理由: 本 PR で `max-sm:fixed max-sm:bottom-0` が実際に効くようになった結果、ホームインジケーター付き端末（iPhone 等）では最下段の option / 閉じる行がセーフエリアに重なり、44px タッチターゲット（`TOUCH_TARGET` 追加分）の下端が実質削られる。同一コードベースのダイアログシート（`common/styles.ts:299`）は `max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]` で対処済みであり、シート系スタイルの中で popoverSheetPanel だけ欠けている（public 側 `dropdownPanel` も同様だが既存）。これまでは定数が壊れていてシート化自体が成立していなかったため「既存バグ」とは言えず、シートを成立させた本 PR で露出する
  - 提案: `popoverSheetPanel` に `max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]`（p-4 基準）相当を追加する。public `dropdownPanel` への展開は別途で可

#### Notes

- **[N-001]** listbox のタイプアヘッド（先頭文字ジャンプ）がない。WAI-ARIA APG は listbox に type-ahead を推奨しており、タグが数十件あるスクロールパネルではキーボードユーザーが矢印連打を強いられる。ADR-001 が combobox（検索入力）を件数規模を理由に見送ったのは妥当だが、type-ahead は contract（`aria-haspopup="listbox"`）を変えずに足せる中間解。combobox 化フォローアップ（ADR-001 記載）の際に合わせて検討で十分
- **[N-002]** モバイルシートに明示的な閉じる操作がない。DatePopover は「閉じる」ボタンを持つが、タグピッカーは外側タップ / Escape のみ。シート外領域が視覚的に区別されない（スクリムなし、既存シート共通）ため、タッチユーザーには閉じ方がやや発見しづらい。既存の公開状態ポップオーバーも同形であり一貫はしている。スクリム/ハンドルの導入は ADR-003 の言う共通部品改善の範疇
- **[N-003]** ゼロベースで確認した良い点: (1) `usePopover` の relatedTarget=null ガードは外側 mousedown / Escape / Tab-out の実 dismiss 経路をすべて温存し、エディタ側 commit-on-blur への影響まで JSDoc で追跡している（ADR-005）。(2) `restoreFocusOnCommit` はデフォルト false の opt-in で既存 4 コンシューマ非破壊、範囲外 index のクランプ + state 同期も入っている（ADR-008）。(3) `Popover` listbox ブランチの mousedown preventDefault は `event.target !== event.currentTarget` ガードで Firefox スクロールバードラッグを壊さない。(4) styling 規約（utility-first / `data-active={active || undefined}` / モジュール定数ホイスト / 新規 CSS なし）と CLAUDE.md コメント規約（WHY のみ）に完全準拠。(5) シート化テストは「共有定数含有 + 成立ユーティリティのピン留め」二段構えで TC-6 のトートロジー教訓を反映

## 結論

Blocker なし。W-001（セーフエリア）は実機 UX に影響するため対応推奨だが、シート挙動の基本線は実機検証済みでありマージ可能な品質。

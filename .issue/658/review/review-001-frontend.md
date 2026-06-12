# Review 001 — Frontend（PR #665 / Issue #658）

対象: 「+ タグ」ゴーストチップ + タグピッカー（マルチセレクト listbox）
観点: コンポーネント設計・状態管理・a11y・UX・デザイン準拠

検証方法: `gh pr diff 665` の全差分精読、`FilterBar.tsx` / `Popover.tsx` / `usePopover.ts` / `useRovingMenu.ts` / `common/styles.ts` / `note/list/styles.ts` の最終状態確認、モック `spec/design/pages/P10-home.html`（L1102-1113）/ `mobile/P10-home.html`（L1040）との突合、対象ユニットテスト 2 ファイル実行（34 passed）。

## AC 充足確認（Frontend 関連）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 並び順 | OK | チップ群 div（もっと見る含む）→ `TagPickerPopover` → `DatePopover` の DOM 順（`FilterBar.tsx:302-357`）。テストで `compareDocumentPosition` により検証 |
| AC-2 見た目 | OK | `filterChipGhost` 共用、lucide `Plus` `size-[11px] strokeWidth={2}` はモック SVG（11px / stroke-width 2 / round cap）と一致。`▾` でなく `+` |
| AC-3 a11y 契約 | OK | `aria-haspopup="listbox"`（triggerProps 経由）+ `aria-label` + `title`。モバイルモックの title なしからの逸脱は JSDoc で ADR-004 参照を明記 |
| AC-4 listbox | OK | `role="listbox"` + `aria-multiselectable="true"`（新規 `multiselectable` prop）、option は直下の子で `role="option"` + `aria-selected` |
| AC-5 楽観的トグル | OK | inline チップと同じ `toggleTag` を共有。パネルは開いたまま（テストで担保） |
| AC-6 キーボード | OK | `useRovingMenu` 流用、Escape→トリガー復帰、クリック後の `setActiveIndex` 同期もテスト済み |
| AC-7 ボトムシート | OK（注記あり） | `popoverSheetPanel` に `max-sm:fixed max-sm:bottom-0 ...` を追加して実現。W-001 参照 |
| AC-8 相互排他 | OK | `openPopover` union に `"tag"` を追加、テストで 期間→タグ の排他を検証 |
| AC-9 タグ 0 件 | OK | `tags.length > 0` ガード + テスト |
| AC-10 テスト | OK | 9 ケース追加（FilterBar）+ 3 ケース追加（Popover）。シート化は AC-10 の方針どおりクラス構造アサーション（共有定数含有 + ユーティリティのピン留め）で担保 |

## Blockers

なし

## Warnings

- **[W-001]** `popoverSheetPanel` の変更が 期間 / 公開状態 ポップオーバーの「本 Issue 範囲外の挙動」を同時に変えている
  - 場所: `app/components/common/styles.ts:377-378`、`app/components/note/list/FilterBar.tsx:571`
  - 理由: `max-sm:fixed max-sm:bottom-0 ...` の追加は `FILTER_POPOVER_PANEL` 経由で DatePopover / VisibilityPopover にも波及する。従来これらは < sm でトリガー幅に潰れていた（コメントにある TC-6 の根本原因 = 既存バグ）ので「修正」ではあるが、PR の主題（タグピッカー追加）に対して既存 2 ポップオーバーのモバイル表示が absolute アンカー → viewport 固定ボトムシートへと大きく変わる副作用であり、特に DatePopover はネイティブ `<input type="date">` を含むため、ソフトキーボード/OS デートピッカーとボトムシートの重なりは jsdom では検証できない。manual-test は TC-6 でタグピッカーのシート化のみ確認しているように見える
  - 提案: PR 説明・ADR に「期間 / 公開状態のモバイル表示も同時に修正される」ことを明記し、両ポップオーバーの < sm 実機（または agent-browser）確認を TC に追加する。最低限、DatePopover を < sm で開いて日付入力できることを確認してからマージする
  - **検証結果（review-001 対応 / agent-browser, viewport 375×812, dev-admin cookie）**:
    - 期間ポップオーバー: `position: fixed` / 全幅 375px / viewport 下端アンカー（bottom=812）でボトムシート化を確認。プリセット 6 ボタン + 開始日/終了日の `<input type="date">` + 閉じる が崩れなく表示。開始日に `2026-06-01` を入力 → URL が `?from=2026-06-01` へナビゲートし、パネルは開いたまま・適用チップ「期間: 6/1–…」も正しく描画。date input は操作可能・表示崩れなし
    - 公開状態ポップオーバー: 同じく fixed / 全幅 / 下端アンカーのシートで開き、すべて/非公開/限定公開/公開 の 4 option が崩れなく表示。選択中 option へのロービングフォーカス着地も確認
    - タグピッカー（参考）: fixed / 全幅シートで 14 option 表示、初期フォーカスは先頭 option（アクセントのフォーカスリング表示）を確認
    - 既知の別件: チップ行が < sm で混み合うとトリガーチップ（「+ タグ」「公開状態」等）のラベルが折り返すことがあるが、`filterChip` / `filterChipGhost` のクラスは main と同一（定数抽出のみの差分）で `popoverSheetPanel` 変更とは無関係の既存挙動のため本 PR では対応しない
- **[W-002]** マルチセレクト listbox の初期ロービングフォーカスが常に先頭オプション（`initialIndex: 0`）
  - 場所: `app/components/note/list/FilterBar.tsx:471-477`
  - 理由: WAI-ARIA APG の Listbox パターンは、選択済みオプションがある場合「最初の選択済みオプション」へフォーカスすることを推奨している。同ファイルの VisibilityPopover は選択値に合わせて `initialIndex` を計算しており（L734-739）、同一 FilterBar 内で開いたときの着地挙動が不揃い
  - 提案: `tags.findIndex((t) => selected.has(t.name))` を `initialIndex` に渡す（見つからなければ 0）。VisibilityPopover と同じ IIFE パターンで揃えられる
- **[W-003]** `useRovingMenu` の毎コミット実行フォーカス復元エフェクトが全コンシューマ（ViewSwitcher / VisibilityPopover / 将来のメニュー）に波及するグローバル挙動変更
  - 場所: `app/components/common/useRovingMenu.ts:82-99`
  - 理由: 依存配列なしエフェクトは「open 中に activeElement が `<body>` なら奪取してフォーカスする」を当該コンポーネントの全コミットで実行する。activeElement ガードで主要な誤爆（window blur・ユーザーが別要素へ移動）は防げており TC-5 の修正自体は妥当だが、対象パネル外の理由で `<body>` にフォーカスが落ちた直後にたまたま open 中のパネルが再レンダーされるとフォーカスが横取りされうる。これはタグピッカー固有の要件（パネルが選択後も開き続ける）なのに、単一選択で即閉じる ViewSwitcher / VisibilityPopover にも常時適用される
  - 提案: opt-in にする（例: `useRovingMenu({ restoreFocusOnCommit: true })` をタグピッカーのみ有効化）。あるいは「panelRef 配下に直前までフォーカスがあった」ことを focusout 時に記録し、その場合のみ復元する
- **[W-004]** `TAG_OPTION_ITEM` のコメント「Same option vocabulary as VISIBILITY_OPTION_ITEM」が実態と不一致で、フォーカス表示も同一バー内で不揃い
  - 場所: `app/components/note/list/FilterBar.tsx:450-453`、対比: 同 `:720-721`
  - 理由: TAG 版には `focus-visible:outline-2 outline-accent`（アクセントのフォーカスリング）・`[overflow-wrap:anywhere]`・`TOUCH_TARGET` があり、VISIBILITY 版にはどれもない。「同じ語彙」ではなく「拡張版」。結果として隣接する 2 つのフィルタポップオーバーでキーボードフォーカスの見え方（リングあり/なし）が異なる。長いタグ名対応とタップ領域は TAG 版が正しい方向であり、劣っているのは既存の VISIBILITY 版
  - 提案: コメントを「VISIBILITY_OPTION_ITEM の拡張（outline ring / overflow-wrap / TOUCH_TARGET を追加）」と正確に直す。可能なら同一 PR で VISIBILITY_OPTION_ITEM にも同じ 3 点を足して揃える（ADR-011 の統合フォローアップを待たずに視覚不整合だけ解消できる）

## Notes

- **[N-001]** `usePopover` の `relatedTarget === null` 早期 return（`usePopover.ts:170-183`）は全ポップオーバー共通の dismiss 挙動変更だが、外側 mousedown / Escape / Tab-out（非 null relatedTarget）という実ユーザーの dismiss 経路はすべて残っており、回帰テスト（Popover.test.tsx の focus-out regression）も追加されている。妥当な修正
- **[N-002]** デザイン準拠が丁寧: トリガーはモック L1108 の属性（`aria-haspopup` / `aria-label` / `title`）・SVG 寸法・ラベルまで一致。モバイルモックとの `title` 差異は ADR-004 として明文化済み
- **[N-003]** スタイリング規約への準拠: utility-first 徹底、`data-active={active || undefined}` の規約どおりの落とし方、繰り返しユーティリティのモジュール定数化（`TAG_OPTION_ITEM`）、新規 CSS ファイルなし。コメントもすべて WHY（TC 番号・Issue 参照つき）で CLAUDE.md のコメント規約に適合
- **[N-004]** テスト品質が高い: 楽観的反映を「navigation pending 中」の状態で検証（resolve を遅延させる Promise）、シート化アサーションは「共有定数含有だけでは不十分（定数自体が壊れていた TC-6 の教訓）」としてユーティリティをピン留めしており、退行検出力がある
- **[N-005]** option のアクセシブルネームは `#alpha 3`（件数込み）になる。inline チップと同じ読み上げであり一貫しているが、件数を名前から外したければ `aria-hidden` を badge span に足す選択肢もある（必須ではない）
- **[N-006]** ロービングは位置インデックスベースのため、ナビゲーション往復で `tags` の並びが変わるとフォーカスが別タグに着地する。現状 `listTags` のソートはフィルタ選択と独立（name/noteCount 等の固定キー）なので実害はないが、ソートキーをフィルタ依存にする変更が入る場合は要再考
- **[N-007]** `tags.length > 0` の三項が 2 連続している（チップ群 / TagPickerPopover、`FilterBar.tsx:302-343`）。1 つの条件ブロックにまとめられるが、チップ群ラッパー div の外に置く必要がある構造上、現状の形でも可読性は許容範囲

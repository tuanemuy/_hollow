# PR #756 レビュー（Test 観点）— Issue #754

対象差分: `app/components/note/list/__tests__/FilterBar.test.tsx`（および参照のため `FilterBar.tsx` / `styles.ts` / `Dialog.tsx` を確認）
テスト実行: `pnpm vitest run app/components/note/list/__tests__/FilterBar.test.tsx` → **37 passed**（全グリーン）。

## サマリ

- Blockers: 0
- Warnings: 1
- Notes: 4

受け入れ基準のテストカバレッジは AC-1 / AC-2 / AC-4 / AC-5 / AC-6 が機械的に検証されており、計画のテスト方針（Step 6）に忠実。既存テストのスコープ限定（`data-desktop-filters` 配下への絞り込み）はデスクトップ不変の検証を弱めておらず、むしろ AC-4 回帰ガードを新規追加して強化している。Blocker は無し。

## AC とテストの対応（確認結果）

| AC | 検証テスト | 判定 |
|---|---|---|
| AC-1（横スクロールクラス不在） | `keeps the desktop wrapper free of horizontal-scroll utilities` (861)：`overflow-x-auto`/`flex-nowrap` を含まず・`max-sm:hidden` を含む | OK |
| AC-2（全フィルター到達 / 内部リンク参照 代替案 b / ネスト Dialog なし） | in-sheet タグトグル (985)、参照チップ + 解除 (1003)、`ノートを選択`でシート閉・第二 Dialog 非展開 (1039) | OK |
| AC-4（デスクトップ不変） | `renders the desktop popover triggers, tag chips and clear-× ...` (871) で 3 Popover トリガー・`aria-pressed` チップ ≥2・クリア× を列挙アサート。既存テスト群はスコープ限定のみで意味不変 | OK |
| AC-5（role=dialog / aria-modal / アクセシブル名 / ESC 閉 + フォーカス復帰） | `opens an accessible-named sheet ...` (963)、`closes the sheet and restores focus to the trigger on Escape` (1056) | OK |
| AC-6（件数バッジ + 不変条件 hasAnyFilter⇔件数>0） | `renders the mobile trigger with the applied-filter count badge` (911) で count=4、`badge count agrees with the clear-× gating for a non-dangling directory` (938) で非 dangling ディレクトリ時に件数=1 ∧ クリア×描画 | OK |
| AC-8（テスト通過） | 37 passed | OK |

## Test

### Blockers

なし。

### Warnings

- **[W-001]** in-sheet の「公開状態ラジオ」「期間プリセット」操作経由のナビゲーション（`selectVisibility`/`selectPreset` → `router.navigate`）が直接テストされていない。
  - 場所: `FilterBar.test.tsx` の #754 describe（963-1068）。in-sheet では `<input type="radio">` の存在数（=4, 980）と `button[aria-pressed]` の存在（979）はアサートするが、シート内ラジオの `onChange` や期間プリセットのクリックで `routerNavigate` が呼ばれることは検証していない。
  - 理由: シート内コントロールはデスクトップと同じハンドラ（`selectVisibility`/`selectPreset`）を呼ぶため、別系統で回帰しても既存のデスクトップテスト（VisibilityPopover/DatePopover）では検出できない。シートの JSX は別ノード（`<label><input type="radio" onChange>`、`DateRangeFields` 内 `aria-pressed` ボタン）であり、配線ミス（`onChange` 未接続・別ハンドラ誤用）はシート専用テストでしか捕まらない。AC-2「すべてのフィルター（タグ/期間/公開状態/…）に到達できる」の「期間・公開状態」枝はタグ・参照ほど厳密には固定されていない。
  - 提案: in-sheet ラジオの 1 つを click/change し `routerNavigate` 1 回 + `visibility` が search に乗ることを 1 ケース、in-sheet 期間プリセットの 1 つを click し `from/to` が乗ることを 1 ケース追加すると AC-2 の全フィルター到達が機械的に閉じる。なお `DateRangeFields` は純コンポーネントとして共有されており実害リスクは低いため Warning 止まり。

### Notes

- **[N-001]** スコープ限定は健全。`buttonByText`/`tagButton`/`radioItems` の起点を `desktopScope()`（`[data-desktop-filters]`）に絞った変更は、happy-dom がメディアクエリ未評価で両 UI を DOM 共存させる前提に対し正しい対処。シート系は `data-mobile-filter`/`data-filter-sheet`/`document.body` の `[role="dialog"][aria-modal="true"]` でスコープ分離されており、デスクトップ用アサーションがモバイル要素を誤検証する経路は塞がれている（既存アサーションの意味は不変）。実際、計画 Step 6 の懸念（重複要素の取りこぼし）が実装に反映されている。

- **[N-002]** AC-4 回帰ガード（871）は `compareDocumentPosition` ベースの ghost chip 前後関係（既存 463 テスト）と併せ、ラッパ追加・クラス変更による退行を機械的に検出できる。`max-sm:hidden` 付与のみで DOM 構造は不変であることが「タグで絞り込み / 期間 / 公開状態 / aria-pressed×2 / クリア×」の存在列挙で固定されている。snapshot ではなく構造アサートで担保している点も計画 Step 5 と整合。

- **[N-003]** arch S-003（トリガー/バッジに `aria-pressed`/`aria-checked` を付けない）が 933-934 で明示アサートされており、`tagButton` の `button[aria-pressed]` 全件走査との非衝突が二重に保証されている。脆いセレクタ（DOM 順依存）を生まない設計が実装・テスト双方で守られている。

- **[N-004]** ESC テスト（1056）はトリガーへ `.focus()` を明示してから開く（851 `openSheet`）。これは happy-dom の `.click()` が focus を移さないための妥当な補正で、`Dialog` の `previousActiveRef`（mount 時 `document.activeElement` 保存）契約（Dialog.tsx:214-226）に依存した正しい検証。実 primitive の挙動を固定しており過剰モックではない。`shows the applied reference chip`(1003) / `closes the sheet when choosing to select a new reference`(1039) で代替案(b)（ネスト Dialog 非展開）も確認済みで、`NotePickerDialog` を `() => null` でモックしているのは「別動線で第二 Dialog を開かない」ことの確認に対し適切（参照新規選択フロー自体は別テスト対象）。

## 既存テストへの影響（誤検証チェック）

既存アサーションのスコープ限定が「本来デスクトップで検証すべきものをモバイル要素で誤検証していないか」を確認した結果、問題なし。

- `tagButton`(105) / `buttonByText`(162) / `radioItems`(174) はいずれも `desktopScope()` 起点に変更され、対象（タグチップ・期間/公開状態トリガー・menuitemradio）はデスクトップラッパ配下にのみ存在するため、限定後も同一要素を指す。
- クリア×（409 describe）・期間解除（392）・ディレクトリフォールバック（726 describe）は `container` 全体クエリのままだが、これらの `aria-label` はシート内に重複しない（フォールバックチップはシート外、期間解除チップはデスクトップのみ、すべてクリアはモバイル時のみシート外バーに 1 つ＝デスクトップテストでは `mobileFilterBar` 非表示前提だが happy-dom では両存）。

  確認の要点: 「すべてクリア」`aria-label="フィルタをすべてクリア"` は happy-dom 上ではデスクトップラッパ内（455 近傍）にも存在するため、`container.querySelector`（先頭一致）はデスクトップ側を拾い、既存テスト（415/421/784）の意味は不変。モバイルバーのクリア×（483-497）は `!filterSheetOpen` 時のみ描画で、件数不変条件テスト（938）は `mobileBar()?.querySelector(...)` とスコープ済み。重複による偽陽性/偽陰性は発生していない。

以上より、スコープ限定による検証弱体化はなく、AC-4 はむしろ強化されている。

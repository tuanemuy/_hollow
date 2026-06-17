# PR #756 レビュー（Test 観点・2回目フルレビュー / ゼロベース）— Issue #754

対象差分: `app/components/note/list/__tests__/FilterBar.test.tsx`（参照: `FilterBar.tsx` / `styles.ts` / `Dialog.tsx`）
テスト実行: `pnpm vitest run app/components/note/list/__tests__/FilterBar.test.tsx` → **39 passed**（全グリーン）。

## サマリ

- Blockers: 0
- Warnings: 0
- Notes: 3

受け入れ基準 AC-1 / AC-2 / AC-4 / AC-5 / AC-6 / AC-8 はすべて機械的に検証されている。前回（review-001）の唯一の Warning（W-001: in-sheet 公開状態ラジオ・期間プリセットのナビゲーション未検証）は本差分で解消済み（`navigates via the existing handler when an in-sheet visibility radio is changed`(1003) / `... in-sheet date preset is selected`(1028)）。スコープ限定（`data-desktop-filters` 起点）はデスクトップ不変の検証を弱めておらず、AC-4 回帰ガードを追加して強化している。実装詳細への過結合・脆いセレクタは検出されず。

## AC とテストの対応（確認結果）

| AC | 検証テスト | 判定 |
|---|---|---|
| AC-1（横スクロールクラス不在） | `keeps the desktop wrapper free of horizontal-scroll utilities`(861)：`overflow-x-auto`/`flex-nowrap` 不在・`max-sm:hidden` 在 | OK |
| AC-2（全フィルター到達 / 代替案 b / ネスト Dialog なし） | in-sheet タグトグル(985)、**in-sheet 公開状態ラジオ→navigate+visibility=public(1003)**、**in-sheet 期間プリセット→navigate+from/to(1028)**、参照チップ+解除(1054)、`ノートを選択`でシート閉・第二 Dialog 非展開(1090) | OK |
| AC-4（デスクトップ不変） | `renders the desktop popover triggers, tag chips and clear-×`(871) で 3 Popover トリガー・`aria-pressed`チップ≥2・クリア× を列挙。既存テスト群はスコープ限定のみで意味不変 | OK |
| AC-5（role=dialog / aria-modal / アクセシブル名 / ESC 閉+フォーカス復帰） | `opens an accessible-named sheet`(963)、`closes the sheet and restores focus to the trigger on Escape`(1107) | OK |
| AC-6（件数バッジ + 不変条件 hasAnyFilter⇔件数>0） | `renders the mobile trigger with the applied-filter count badge`(911) で count=4 + `aria-pressed`/`aria-checked` 不在(933-934)、`badge count agrees with the clear-× gating for a non-dangling directory`(938) で非 dangling ディレクトリ時に件数=1∧クリア×描画 | OK |
| AC-8（テスト通過） | 39 passed | OK |

AC-3（省スペース）・AC-7（ディレクトリ退行なし）は CSS レイアウト/ビューポート依存のため計画通り手動テスト（`.issue/754/manual-test/`）で担保。ユニットでの検証対象外という線引きは妥当。

## Test

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** W-001（前回 Warning）解消の確認。in-sheet 公開状態ラジオは `publicRadio.click()` → `routerNavigate` 1回 + `updater({}).visibility === "public"`(1025) で、in-sheet 期間プリセットは `今日` クリック → `next.from`/`next.to` truthy(1050) で、いずれもシート専用ノード（`<input type="radio" onChange>` / `DateRangeFields` の `aria-pressed` ボタン）が既存ハンドラ（`selectVisibility`/`selectPreset`）へ正しく配線されていることを機械的に固定。シート JSX の配線ミス（onChange 未接続・別ハンドラ誤用）が捕捉できるようになり、AC-2 の「期間・公開状態」枝がタグ・参照と同水準で閉じた。

- **[N-002]** 件数式 `activeFilterCount`（FilterBar.tsx:323-328）の 5 項のうち、`referencingNoteId` 項のみバッジ件数アサーションで単独に固定されていない。参照は `shows the applied reference chip + 解除`(1054) で到達性・解除は検証されるが、参照適用時にバッジが +1 されることは別系統で回帰しても捕まらない（タグ/期間/公開状態は 911、ディレクトリは 938 で固定）。実害は「件数式が同一材料・同一 predicate で導出される単一情報源」という構造上低く、不変条件 `hasAnyFilter ⇔ count>0` も `clearReferencingNoteId` 経路で間接担保されるため Note 止まり。参照のみ適用で `mobileTrigger()?.textContent` に `1` を含む 1 ケースを足すと 5 項すべてが機械的に閉じる。

- **[N-003]** セレクタ設計は健全で脆さなし。`tagButton`/`buttonByText`/`radioItems` は `desktopScope()`（`[data-desktop-filters]`）起点、モバイル系は `data-mobile-filter`/`data-filter-sheet` および `document.body` の `[role="dialog"][aria-modal="true"]` でスコープ分離。happy-dom がメディアクエリ未評価で両 UI を DOM 共存させる前提に対し、誤検証経路は塞がれている。in-sheet ラジオを `VISIBILITY_OPTIONS` 順（index 3=public, 1024 のコメントで明示）に依存して拾う・期間プリセットを `今日` のテキスト一致で拾う箇所は DOM 順ではなく安定キー（順序定数 / ラベル）に基づくため脆弱ではない。`openSheet`(851) の `.focus()` 明示は happy-dom の `.click()` が focus を移さない仕様への妥当な補正で、`Dialog` の `previousActiveRef`（mount 時 `document.activeElement` 保存）契約に依存した実 primitive 検証であり過剰モックではない。`NotePickerDialog` を `() => null` モックするのは「別動線で第二 Dialog を開かない」確認に対し適切。

## 既存テストへの影響（誤検証チェック）

スコープ限定後も対象要素は同一を指し、デスクトップ用アサーションがモバイル要素を誤検証する経路はない。「すべてクリア」`aria-label="フィルタをすべてクリア"` は happy-dom 上でデスクトップラッパ内にも存在するため `container.querySelector`（先頭一致）はデスクトップ側を拾い、既存テスト（415/421/784）の意味は不変。モバイルバーのクリア×（490-504）は `!filterSheetOpen` 時のみ描画で、件数不変条件テスト（938）は `mobileBar()?.querySelector(...)` とスコープ済み。重複による偽陽性/偽陰性なし。

以上より、本差分はテスト観点で出荷可能。Blocker / Warning ともにゼロ。

# PR #665 レビュー — Test 観点（review-003）

対象: PR #665（Issue #658 / .issue/658/plan.md AC-10 (a)〜(h)）、review-002 対応後の最新差分
実行確認: `pnpm test:unit`（227 files / 3608 tests）全パス。

## review-002（Test 観点）指摘の対応確認

| 指摘 | 状態 |
|---|---|
| W-001 復元時の index クランプが未テスト | 対応済み — "clamps the restored focus index when the option set shrinks in the same commit (ADR-008)" を新設。クリック index=2 → blur-to-body → `TAGS.slice(0, 2)` で再 render し、末尾 option へのフォーカス復元と、クランプ後の ArrowUp/ArrowDown 連続動作（state 同期）まで固定 |
| W-002 `restoreFocusOnCommit` デフォルト false が未固定 | 対応済み — ViewSwitcher.test.tsx に "does not pull focus back into the panel when a commit happens while <body> holds focus (restoreFocusOnCommit defaults off)" を新設。blur-to-body → 再 render でフォーカスが `<body>` のままであることを negative に固定 |
| N-001〜N-004 | Notes（修正対象外）。N-003 の「偶然同じ index」構図は残るが、別テストがガードを検出するため実害なしの判断を維持 |

## ミューテーションによる再検証（本ラウンドで実施）

review-002 で「生存」していた 2 変異を最新差分に対して再実行した:

| 変異 | review-002 | 本ラウンド |
|---|---|---|
| `useRovingMenu.ts` 復元 effect のクランプ除去（`Math.min` → 素の `activeIndex`） | 生存 | **検出**（FilterBar 20 件中 1 fail — 新設クランプテスト） |
| `restoreFocusOnCommit` デフォルトを `true` に反転 | 生存 | **検出**（Menu / ViewSwitcher / FilterBar 計 44 件中 1 fail — 新設 negative テスト） |

review-002 の変異マトリクスで既に「検出」だった 3 件（`restoreFocusOnCommit: true` の opt-in、ADR-005 の relatedTarget=null ガード、ADR-006 の `prevOpenRef` 遷移ガード）はコード・テストとも変更されておらず、カバレッジは維持されている。

## 決定性

良好（review-002 から後退なし）。新設 2 テストもタイマー非使用・`act` 内同期イベント駆動で、`renderBar` の再 render はテスト自身が制御するコミット。フレーク要因なし。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** review-002 の Warning 2 件は新設テストで閉じられ、変異再実行でいずれも load-bearing であることを確認した。ブラウザ検証 3 バグ（TC-4/TC-5/TC-6）の回帰テスト群と合わせ、review-001 以降に入った全分岐（opt-in flag / クランプ / null ガード / 遷移ガード / multiselectable）が変異検出可能な状態になっている
- **[N-002]** review-002（frontend/shared 側）対応で `popoverSheetPanel` に追加された safe-area 余白 `max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]` は、シート構造アサーションのピン留めリスト（fixed/bottom-0/top-auto/left-0/right-0）に含まれていない。ジオメトリを成立させる load-bearing なユーティリティではなく装飾的余白なので必須ではないが、将来定数を触る際に黙って落ちうる点だけ記録する。同様に `focus({ preventScroll: true })` は happy-dom で意味のある検証ができないため未テストで妥当
- **[N-003]** （carryover: review-001 N-001/N-002 / review-002 N-002）13 件超タグのピッカー全件表示と相互排他の逆方向は引き続き手動テスト（TC-3 / TC-E2 / TC-7、browse.md TC-E4-05）依存。仕分けで許容済みのため再エスカレートしない

## 総評

review-002 の指摘 2 件はいずれも 1 ケースずつ的確に追加され、変異テストで検出可能になったことを実測で確認した。計画 (a)〜(h) のカバレッジ・決定性・後方互換の固定はすべて満たされており、Test 観点で新規の問題はない。Blocker / Warning なし。

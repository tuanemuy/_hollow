# PR Review #001 — fix(#388): ディレクトリ移動UIのスケーラビリティ改善 / パス先頭スラッシュ重複の修正

**PR:** #398
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7（Frontend 3 / ロジック 2 / Test 2 ※Test の N-003/N-001 も取り込み対象に）
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため修正してから再レビュー）

---

## Frontend / アクセシビリティ / UX

### Blockers
なし

### Warnings
- **[W-F1]** `disabled` 時に listbox が描画されたままで option ボタンが操作可能に見える（tab 順・hover に残る）。`DirectoryPicker` の新規名入力中（`usingNew` で disabled）に既存候補リストが全件表示・tabbable になり二択 UI が崩れる。
  - 場所: `DirectorySelectField.tsx`（input の disabled / listbox 描画 / option button）
  - 提案: `hasListbox = !disabled && filtered.length > 0` にし、option `<button>` にも `disabled={disabled}` を付与。
- **[W-F2]** `aria-selected` を「確定値の行」に付けており、キーボード移動中のアクティブ行が `aria-selected` を持たない。`NotePickerDialog`/APG は active 行に `aria-selected` を寄せる。
  - 提案: `aria-selected={isActive}` に変更。確定値の視覚は `data-selected` とサマリ行で維持。
- **[W-F3]** `DirectoryPicker` が `emptyLabel="未選択"` を渡しており、フィルタ0件時の status 文言が「未選択」になって意味が食い違う。
  - 提案: `DirectoryPicker` の `emptyLabel` オーバーライドを外し既定（「該当するディレクトリが見つかりません」）に戻す。

### Notes
- ARIA 基盤（hasListbox ガード・IME-safe Enter・aria-* の参照ガード）、パス正規化＋回帰テスト、責務分離（ADR-002）、スタイリング規約準拠、既存挙動保全はいずれも計画/ADR どおりで良好。

---

## ロジック整合性 / エッジケース / 回帰リスク

### Blockers
なし

### Warnings
- **[W-L1]** `DirectoryPicker` で「既存ディレクトリの選択を解除して未選択(null)へ戻す」操作ができなくなる回帰。旧 `<select>` は `<option value="">未選択</option>` で null に戻せた（＝ノートをルート直下＝ディレクトリ未所属へ移せた）。新ピッカーは `commit(rowId)` 経由でしか onChange を呼ばず常に非 null id を渡すため、編集中ノートをルートへ戻す動線が UI から消失。MoveNote/MoveDirectory（初期 null→片方向）には影響なし。
  - 提案: ピッカーに clear 手段（`clearable` prop ＋ 選択中サマリ行の「解除」ボタンで `onChange(null)`）を追加し、`DirectoryPicker` で `clearable` を渡す。
- **[W-L2]** 選択コミット後に listbox が開いたまま・query が残る。`<select>` の「選んだら畳んで確定値だけ見える」挙動と体感差がある。
  - 提案: 開閉状態（`open`）を導入し、commit/Escape で閉じ、focus/click/typing/Arrow で開く。commit 時に query をクリア。

### Notes
- パス正規化は全ケース（forest 含む）で正しい。cyclic 除外は root を `excludeSubtree` 後に `id !== rootId` で分離し `includeRootOption` へ回す実装で二重表示なし。`rootId === undefined` ガードあり。フィルタ/クランプ/aria ガードのロジックも整合。
- 計画 L102 の `aria-level` 記述は1周目で却下済みの取りこぼし（実装・テストは正しく非付与）。plan のドキュメント文言のみ後で直す。

---

## テスト網羅性 / テスト設計 / テスト品質

### Blockers
なし

### Warnings
- **[W-T1]** フィルタ縮小時の `activeIndex` クランプ（本コンポーネント固有ロジック）のテストが無い。ArrowDown で末尾→フィルタで1件に絞り→Enter で先頭が確定することを検証すべき。
- **[W-T2]** ArrowUp の wrap-around 確定が未検証（ArrowDown のみ）。初期 index 0 → ArrowUp → 末尾確定のケースを追加。

### Notes（取り込み対象）
- **[N-T3]** `includeRootOption` を選択して `onChange(rootId)` が返る確定経路の検証を追加すると望ましい。
- **[N-T1]** `directoryTree.test.ts` の `DirectoryTreeNode` import を実装と同じ `@/core/application/directory/view` に揃える（現状 `dto/directory`）。
- 複数 root / `getDescendantIds` の2本目 root 配下 / name 特殊文字のエッジも余力で追加。
- アサーションの厳密さ・モックファクトリ・空状態検証は良好。

---

## Design Decisions

- 開閉状態（`open`）の導入と `clearable` による null 復帰手段の追加は UX/回帰修正であり ADR-004 の延長。重要な追加判断として adr.md に追記する。

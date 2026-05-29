# 実装メモ — Issue #273

## 実装中に判明した既存バグとスコープ拡大

### 内容
ブラウザ検証で `pillBtnDanger` 適用の danger ボタンが**赤ではなく灰色**で描画されることを検出。`pillBtnDanger`（旧定義 `${pillBtn} bg-error-surface ...`）の素 utility が base `pillBtn` の `bg-surface` / `text-ink` に Tailwind 生成順で負けるのが原因で、**main 時点から存在する既存バグ**だった。

### 理由
当初計画は danger を旧 `pillBtnDanger` 単独に寄せる想定だったが、それでは:
1. 移行する layout danger 8系統が赤→灰色に退行する（`PILL_BTN data-danger` は data variant で正しく赤かった）
2. 既存の灰色バグ（NoteActions / ConfirmDialog / BulkActionBar）も残る

→ `pillBtnDanger` を `pillBtnPrimary` と同じ data 駆動 variant に作り変えて根本解決した（adr.md ADR-003）。

### 影響範囲（本 Issue の元スコープ外だが同一機構のため修正した 3 ファイル）
- `app/components/note/detail/NoteActions.tsx`（削除ボタン）
- `app/components/common/ConfirmDialog.tsx`（確認ボタン）
- `app/components/note/list/BulkActionBar.tsx`（ゴミ箱へボタン）

これらは `pillBtnDanger` の consumer であり、定数の API 変更（標準クラス → data 駆動 add-on）に伴い更新が必須。結果として既存の灰色バグも赤に修正された。

## 残課題
なし。全 danger ボタンが赤で描画されることをブラウザ検証で確認済み。`public/styles.ts` の `PILL_BTN`（別系統・スコープ外）は変更していない。

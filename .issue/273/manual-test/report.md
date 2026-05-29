# ブラウザ検証レポート — Issue #273

**実行日:** 2026-05-29
**サーバー:** http://localhost:5273/
**テストソース:** .issue/273/testing.md
**アカウント:** test-298@example.com

---

## 結果サマリー

| TC | 画面 | 確認内容 | 結果 |
|----|------|---------|------|
| TC-001 | ヘッダー | 新規作成(primary) / アップロード(plain) 表示 | PASS |
| TC-002 | ノート詳細 NoteActions | 編集(primary) / 公開設定等(plain) / 削除(danger) | PASS（修正後） |
| TC-003 | タグ管理 TagActions | リネーム・統合(plain) / 削除(danger) | PASS（修正後） |

**合計: 3件 PASS / 0 FAIL（修正後）**

## 検出 → 修正した回帰（重要）

初回検証で **danger ボタンが赤ではなく灰色で描画される** 問題を検出。原因調査の結果:

- `pillBtnDanger`（旧定義 `${pillBtn} bg-error-surface text-error hover:bg-error-surface`）は、base の `bg-surface` / `text-ink` を Tailwind 生成 CSS の順序で上書きできず、**main 時点から既に灰色**だった（NoteActions 削除 / ConfirmDialog / BulkActionBar が該当）。
- 一方 layout の `PILL_BTN` + `data-danger` は `data-[danger]:` variant が確実に勝つため**赤く描画**されていた。
- 本 Issue の移行で layout danger ボタン（8系統）を `pillBtnDanger` に寄せると、赤→灰色の**退行**が発生する。

### 計測値（algorithm: getComputedStyle）

| 対象 | 状態 | 背景色 | 文字色 | 判定 |
|------|------|--------|--------|------|
| `PILL_BTN`+data-danger（main, TagActions） | 修正前 | `rgb(251,235,235)` error-surface | `rgb(196,62,62)` error | 🔴 赤（正） |
| `pillBtnDanger`（main & 修正前, NoteActions） | 修正前 | `rgb(245,245,247)` surface | `rgb(29,29,31)` ink | ⬜ 灰色（バグ） |
| danger（修正後, NoteActions/TagActions） | 修正後 | `rgb(251,235,235)` error-surface | `rgb(196,62,62)` error | 🔴 赤（正） |
| danger（修正後, hover） | 修正後 | `rgb(251,235,235)` 維持 | — | 🔴 赤維持（正） |

### 修正

`pillBtnDanger` を `pillBtnPrimary` と同じ **data 駆動 variant** に作り変え（`data-[danger]:bg-error-surface data-[danger]:text-error data-[danger]:hover:bg-error-surface`）、全 9 consumer を `${pillBtn} ${pillBtnDanger}` + `data-danger=""` に統一。詳細は `.issue/273/adr.md` ADR-003。

→ これにより移行した layout danger ボタンの退行を防ぎ、かつ既存の灰色バグ（NoteActions/ConfirmDialog/BulkActionBar）も赤に修正された。

## 確認できた他の項目

- primary ボタン: `編集` `新規作成` `保存` = accent 背景 `oklch(0.371 0 0)` / 白文字（正）
- plain ボタン: `公開設定` `アップロード` 等 = surface `rgb(245,245,247)` / ink（正）
- 押下アニメ `active:scale-[0.985]`: 全 pill ボタンの class に付与済み（DOM 確認）
- 表示崩れ・定数名残存: なし

## 成果物

- スクリーンショット: `screenshots/`（header.png, note-detail.png〔修正前=灰色〕, fixed-note-detail.png〔修正後=赤〕, tags.png 等）
- シードデータ: `seed-data.md`
- サーバー情報: `server-info.md`

## 起票した Issue

なし（検出した回帰は本 PR 内で即時修正したため）。

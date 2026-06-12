# ブラウザ検証レポート — Issue #621: 公開ページのコンテナ幅が中身依存で可変になる

**実行日時**: 2026-06-10
**テストソース**: `.issue/621/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**ブランチ**: issue/621/public-container-w-full

## 概要

`PUBLIC_MAIN` / `NOTE_DETAIL_WRAP` への `w-full` 追加により、公開ページ（P30/P31/P32）のコンテンツコンテナ幅が中身（最長ノート行・タイトル・本文）に依存せず、`min(ビューポート幅, max-width)` で一定・中央寄せになることを実機ブラウザで確認した。**全 3 テストケース PASS、FAIL なし。**

## 検証アプローチ

幅バグの検証はスクリーンショットの目視より数値計測が確実なため、各ページで `set viewport <w> 900` を順に適用し、対象コンテナの `getBoundingClientRect()` を `eval` で実測した:

- コンテナ幅（`width`）が `min(viewport, max-width)` に一致するか
- `max-width` 超過時に左右マージン（`left` / `right`）が均等で中央寄せか
- `w-full` クラスが適用されているか（`className.includes('w-full')`）

長尺コンテンツの影響を出すため、タイトル124文字の長尺ノートを含む公開ノート9件をシードして検証した。

## 結果

| TC | ページ | コンテナ | 結果 |
|----|--------|---------|------|
| TC-001 | P30 `/u/dev-admin` | `PUBLIC_MAIN`（`<main>`） | PASS |
| TC-002 | P31 `/u/dev-admin/note-width-long-title-sample` | `NOTE_DETAIL_WRAP`（`<div>`） | PASS |
| TC-003 | P32 `/search?q=テスト` | `PUBLIC_MAIN`（`<main>`） | PASS |

計測値の詳細は `results/summary.md` を参照。要点:

- P30/P32: viewport 500/600/700px でコンテナ幅 == ビューポート幅（中身に依存しない）。1400px で 1280px キャップ＋left/right=60 で中央寄せ。
- P31: viewport 500/600/900px でコンテナ幅 == ビューポート幅。1100px で 920px キャップ＋left/right=90 で中央寄せ。
- **600px 付近のリスト幅のガタつきは解消**（完了条件を満たす）。

## スクリーンショット

- TC-001: `screenshots/tc-001/p30-w600.png`, `screenshots/tc-001/p30-w1100.png`
- TC-002: `screenshots/tc-002/p31-w600.png`, `screenshots/tc-002/p31-w1100.png`
- TC-003: `screenshots/tc-003/p32-w600.png`, `screenshots/tc-003/p32-w1400.png`

## 既存機能への影響

変更は `PUBLIC_MAIN` / `NOTE_DETAIL_WRAP` の2定数のみ。P33（SHARE_PAGE）/ P34（ERR_PAGE）/ legal（LegalDocument）は別定数で `flex-1` を持つため影響を受けない（コード依存で確認）。

## 起票した Issue

なし（全 PASS）。

## クリーンアップ

サーバー停止・agent-browser 全セッション終了済み。シードデータは local D1 のみ（`.issue/621/manual-test/seed.sql`、冪等）。

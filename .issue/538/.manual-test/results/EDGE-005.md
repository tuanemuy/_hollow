# EDGE-005: タブ放置後の visible 復帰でバッジ再取得

**結果**: PASS（visibilitychange イベントのプログラム発火による準実機確認）

**セッション**: verify-edge-5（観測タブ）+ verify-tc-006（裏で件数を変更） / **日時**: 2026-06-13

## 実行ログ

| # | 手順 | 操作 | 結果 |
|---|---|---|---|
| 1 | 観測タブ準備 | verify-edge-5 でログインし `/` を開く。バッジ非表示（未処理 0 件） | OK |
| 2 | 放置中の件数変化 | 別セッション verify-tc-006 から `/upload` 経由で `test-note-2.md` をアップロード（→ 未処理 1 件に） | tc-006 側のバッジは `未処理 1 件` — OK |
| 3 | 放置中は更新されない | verify-edge-5 のバッジを確認 | バッジ非表示のまま（ADR-002 の許容トレードオフどおり即時更新なし） — OK |
| 4 | visible 復帰 | verify-edge-5 で `document.dispatchEvent(new Event('visibilitychange'))` を実行（`document.visibilityState === "visible"`） | 約 1〜3 秒でバッジが `アップロード（未処理 1 件）`（aria-label 含む）に更新 — OK |

## 注記（再現方法の制約）

agent-browser ではタブを実際にバックグラウンド化（visibilityState を hidden に遷移）させる操作ができないため、復帰時に発火する `visibilitychange` イベントをプログラムから dispatch して再取得ハンドラを駆動した。visibilityState は visible のままであり、ハンドラの「visible 時に再取得する」経路が実際に実行されてバッジが古い値（非表示）から最新値（1 件）へ更新されることを確認できたため PASS と判定。notify 経由の即時更新は TC-006 で確認済み。

## 後始末

テストで作成したジョブは verify-tc-006 から破棄し、未処理 0 件（バッジ非表示）に戻した。全セッション close 済み。

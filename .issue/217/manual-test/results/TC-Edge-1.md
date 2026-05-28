# TC-Edge-1: モバイル幅（360px）で管理ヘッダーが縦リズムを保つ

**結果**: PASS
**実行時間**: 約35秒
**セッション**: verify-217-tc-edge-1

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | viewport を 360x800 に設定 | `innerWidth=360, innerHeight=800` | 一致 | PASS |
| 2 | admin@example.com でログイン | 認証通過 | ホームへ遷移 | PASS |
| 3 | `/admin` を開く | 管理ダッシュボード表示 | URL = `/admin` | PASS |
| 4 | ヘッダー bounding rect 計測 | 縦に潰れていない、はみ出していない | `headerHeight = 64`（デスクトップと同一固定値） | PASS |
| 5 | タブナビ bounding rect 計測 | `gap = 0` | `navTop=64, navBottom≈104.14, navHeight≈40.14, gap=0` | PASS |

## 観察

- 旧コードの `max-sm:py-3`（モバイルで縦パディング縮小）が撤去され、`h-[var(--header-height)]` の固定 64px が 360px 幅でも保たれている。
- タブナビは 40.14px と若干小さくなる（テキストオンリーで padding が縮む）が、縦に潰れたり折り返したりしていない。
- ヘッダー直下にタブナビが隙間なく接続している（gap=0）。

## スクリーンショット
- Step 1 (mobile admin): `screenshots/tc-edge-1/step-1-mobile.png`

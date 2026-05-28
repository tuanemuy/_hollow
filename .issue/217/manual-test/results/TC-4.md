# TC-4: 管理画面のヘッダー〜タブヘッダー〜コンテンツの縦リズム

**結果**: PASS
**実行時間**: 約40秒
**セッション**: verify-217-tc-4

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | admin@example.com / Password123! でログイン | ホームへ遷移 | `/?page=1&limit=20` | PASS |
| 2 | `/admin` を開く | 管理ダッシュボード表示 | URL = `/admin` | PASS |
| 3 | ヘッダー bounding rect 計測（top=0） | `bottom = headerHeight`（64px） | `top:0, bottom:64, height:64, width:1280` | PASS |
| 4 | タブナビ（ダッシュボード/LLM設定/…）bounding rect 計測 | `top = ヘッダー bottom`（隙間ゼロ） | `top:64, bottom:108, height:44`、gap = 0 | PASS |
| 5 | 500px 下スクロール | ヘッダー・タブナビ両方 sticky で `gap=0` を維持 | `scrollY=86`, `headerBottom=64, navTop=64, gap=0` | PASS |
| 6 | `/admin/llm` に遷移して再計測 | ヘッダーとタブナビが同じく隙間ゼロ | `headerBottom:64, navTop:64, gap:0` | PASS |

## 観察

- ヘッダー高さは `--header-height` (64px) に固定され、タブナビ（44px）が真下に隙間なく接続。
- スクロール後も両者は `position: sticky` で固定され、境界が pixel 単位でぴったり接する。
- 別タブページ（`/admin/llm`）でも縦リズムが同じく維持される（タブ切替後も挙動同一）。

## スクリーンショット
- Step 1 (admin top): `screenshots/tc-4/step-1-admin-top.png`
- Step 2 (admin scrolled): `screenshots/tc-4/step-2-admin-scrolled.png`
- Step 3 (admin/llm): `screenshots/tc-4/step-3-admin-llm.png`

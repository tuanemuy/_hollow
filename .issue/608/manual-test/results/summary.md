# テスト実行サマリー — Issue #608

**実行日時**: 2026-06-09
**テストソース**: .issue/608/testing.md
**サーバー**: http://localhost:3001/（pnpm dev / Vite Cloudflare）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | Landing ヘッダー: マーク途切れなし（10倍拡大目視） | 正常系 | PASS | - |
| TC-002 | Landing フッター: 修正済み viewBox 適用 | 正常系 | PASS | - |
| TC-003 | Auth(login) ヘッダー: 完全表示・サイズ | 正常系 | PASS | - |
| TC-004 | サイズがモック相当（height=16, glyph≈15.7px）に縮小 | 正常系 | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## 共有コンポーネントによるカバレッジ

`BrandLockup` は全使用箇所で同一の単一コンポーネント。検証で `viewBox="-5 -1 480 86"` / `height="16"` がレンダリング DOM に適用され、マークの stroke が全周 viewBox 内に収まることを確認。Landing(ヘッダー/フッター)・Auth の3コンテキストで実描画を確認済み。Public レイアウト・App/admin ヘッダー（要ログイン）は同一コンポーネント・同一幾何のため、検証済みの描画結果がそのまま適用される。

## 確認した実描画属性（DOM）

- Landing ヘッダー: `viewBox="-5 -1 480 86"`, `height="16"`, 描画 89×16px, `overflow:hidden`
- Landing フッター: `viewBox="-5 -1 480 86"`（hollow ロゴ2個=ヘッダー+フッター両方修正済み）
- Auth(login) ヘッダー: `viewBox="-5 -1 480 86"`, `height="16"`

## スクリーンショット

- `screenshots/_misfire.png` — Landing 全体（ヘッダーロゴ正常表示）
- `screenshots/02-logo-header-10x.png` — ヘッダーロゴ10倍拡大（途切れなし証跡）
- `screenshots/03-footer-logo-10x.png` — フッターロゴ拡大（白地のため淡色）
- `screenshots/05-login-page.png` — ログインページ（ヘッダーロゴ完全表示）

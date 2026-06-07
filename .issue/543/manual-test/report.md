# ブラウザ検証レポート — Issue #543: 領域4「設定」(P21〜P24) モック追従

**実行日:** 2026-06-07
**テストソース:** `.issue/543/testing.md`
**サーバー:** http://localhost:3000/（`pnpm dev`, vite dev / Cloudflare runtime）
**認証:** seed ユーザー `dev-admin`（session cookie `__Host-session` を CDP 注入）

## サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | 設定ナビ戻り導線（A） | PASS |
| TC-002 | bio 文字数カウンタ（B-2） | PASS |
| TC-003 | ユーザー名 prefix/プレビュー/レート制限（B-3） | PASS |
| TC-004 | パスワード強度ヘルプ（C-2） | PASS |
| TC-005 | P24「取り消せません」強調（E-1） | PASS |
| TC-006 | section-desc 整合（B-1/C-1/D-1） | PASS |
| TC-007 | APP_URL 未設定フォールバック | SKIP（ユニットテストで担保） |

**合計:** 7 件（PASS: 6 / FAIL: 0 / SKIP: 1）

## ハイライト（虚偽表示の非混入を実機で確認）

- bio カウンタは `37 / 500`（**160 でなく実値 500**）。追記・削除でリアルタイム追従。`maxlength=500`。
- ユーザー名 prefix/プレビューは `http://localhost:8787/u/...`（**実 appUrl ベース。`hollow.example` ダミーなし**）。`//u/` の二重スラッシュなし。
- レート制限ヘルプは「30日に1回」（**90日でない**）。「次に変更できる日付」算出値は非表示。
- パスワード強度ヘルプは「12文字以上。英字・数字・記号のうち2種以上…」を文言完全一致。`aria-describedby` で input に紐付け。
- P24「取り消せません」は `<strong class="font-medium text-ink">`。多段確認・影響リストは**未追加**（スコープ外を順守）。既存の削除確認ダイアログ（ユーザー名一致）は不変。

## 切り分けメモ

- TC-006 で P22 パスワード変更 desc が実装とモックで文言相違（実装=「現在のパスワードで本人確認…」/ モック=「変更後、他のすべてのセッションは…」）。これは ADR-003/004/005 に基づく**意図的な実挙動準拠**（他端末ログアウトは任意チェックのため、モック文言を写すと虚偽表示になる）。退行ではないため Issue 起票せず。

## 起票した Issue

なし（FAIL 0 件）。

## 成果物

- 結果: `.issue/543/manual-test/results/TC-001.md`〜`TC-007.md` / `summary.md`
- スクリーンショット: `.issue/543/manual-test/screenshots/tc-*/`
- シード記録: `.issue/543/manual-test/seed-data.md`
- サーバー情報: `.issue/543/manual-test/server-info.md`

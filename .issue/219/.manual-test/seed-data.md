# Seed Data — Issue #219 Manual Test

**Created:** 2026-05-28

## Test User

- **Email:** test-219-1779968791@example.com
- **Username:** tester1779968791
- **DisplayName:** Tester 219
- **Password:** Test12345678!
- **Email verified:** YES (via /verify-email link in server log)

## Notes

5 notes created with titles `Test Note 1` 〜 `Test Note 5` (no body). All created consecutively from the same date.

`/` shows `5 件のノート` after creation.

## SavedView

未保存。シナリオ 5（SavedView 復元）実行時に作成を試みる。`ビューとして保存` ボタンは検索条件などが入った時のみ enabled になっていた（初期状態では disabled）。SavedView 保存導線は確認項目 5 実行時にあらためて検証する。

## URL params

- Home loads as `/?page=1&limit=20` (default search params injection).

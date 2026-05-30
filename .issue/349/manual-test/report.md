# ブラウザ検証レポート — Issue #349: パスワード最小長の不整合

**実行日時**: 2026-05-30
**ブランチ**: issue/349/password-min-length
**サーバー**: http://localhost:5175（vite dev / Cloudflare 構成）
**テストソース**: .issue/349/testing.md

## 結果サマリー

3 件すべて PASS（PASS: 3 / FAIL: 0）。Issue #349 の「presentation schema を domain（12..128）に揃え、transport boundary で field 直下エラーとして弾く」要件を満たすことを確認した。

## テストケース詳細

### TC-001: placeholder / hint が「12文字以上」表記 — PASS

- パスワード欄 placeholder = `12文字以上`（旧「8文字以上」ではない）
- 直下ヒント文 = `12文字以上。英数字と記号を組み合わせると安全です。`（`aria-describedby` で紐付け）
- 「8文字以上」の文言はページ内に皆無
- screenshot: `screenshots/tc-001-signup-initial.png`

### TC-002: 11文字パスワードが field 直下エラーで弾かれる（本Issueの核心）— PASS

- 入力: username=`testuser349`, email=`test349@example.com`, password=`Passw0rd!23`（11文字）, displayName=`テスト349`, 利用規約=チェック
- エラー文言 = `パスワードは12文字以上で入力してください。`
- 表示位置 = **パスワード欄の直下**（label/input と同一コンテナ内、ヒント文と差し替え）。`aria-invalid="true"` / `data-error` 付与
- **ページ上部の summary / alert 領域にエラーなし**（`[role=alert]` 0 件、`password_too_short` 系メッセージは出ない）→ transport boundary で先に弾かれており、ユースケースまで到達していない
- screenshot: `screenshots/tc-002-11char-error.png`

### TC-003: 12文字パスワードはパスワード長エラーが出ない — PASS

- password を `Passw0rd!234`（12文字）に変更して送信
- パスワード長エラーは 0 件。`signUpFn` への POST が 200 で発火し長さチェックを通過
- 「確認メールを送信しました」画面に遷移（通常のサインアップ処理に進行）
- screenshot: `screenshots/tc-003-12char-success.png`

## 補足観測（スコープ外・非ブロッカー）

- 送信失敗時、パスワード欄のみ値がクリアされる。パスワードフィールドの一般的なセキュリティ挙動であり、Issue #349（最小長の不整合）とは独立。#201 の入力保持スコープにも該当しないため起票しない。

## 結論

Issue #349 の実装は signup フォーム上で期待どおり動作。placeholder・ヒント・field 直下エラー・12 文字での通過、いずれも確認済み。FAIL なし、起票 Issue なし。

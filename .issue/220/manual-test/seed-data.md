# Issue #220 マニュアルテスト シードデータ

**作成日:** 2026-05-27
**対象 Issue:** #220 (アップロードはページ遷移せずモーダル／ドロワーで完結させる)

## 前提

このIssueはUI動線（モーダル開閉、URL hash 同期、フォールバックページ）の検証のみで、
特別なDB データは必要ない。既存のシードユーザーをそのまま利用する。

## 利用ユーザー

- メール: `test-user-001@example.com`
- パスワード: `TestPassword123!`
- ID: `01938f00-0000-7000-8000-000000000001`

## 追加投入: なし

既存の Issue #1 等のシードがそのまま使える。新規シード投入は不要。

## アップロード対象ファイル

ブラウザでファイルアップロードを試すため、軽量なテキスト/Markdown ファイルを使う。
シェルでテンポラリファイルを用意:

```bash
mkdir -p /tmp/hollow-issue220
echo "# Issue 220 test\n\nThis is a test markdown for manual upload verification." > /tmp/hollow-issue220/test-upload.md
echo "ready"
```

# Issue #221 マニュアルテスト シードデータ

**作成日:** 2026-05-28
**対象 Issue:** #221（即時フィードバック / 日本語エラーマッピング / 全画面リロード抑止）

## 利用ユーザー

- メール: `test-user-001@example.com`
- パスワード: `TestPassword123!`
- 既存 Issue #220 と同じシードユーザーをそのまま利用。新規投入なし。

## アップロード対象ファイル

シェルで事前に用意済み:

```bash
mkdir -p /tmp/hollow-issue221
printf '# Issue 221 test\n\n本文。' > /tmp/hollow-issue221/test-md.md   # 28 byte
: > /tmp/hollow-issue221/empty.md                                       # 0 byte
printf 'MZ\x00\x00\x00\x00\x00\x00' > /tmp/hollow-issue221/dummy.exe    # 10 byte 非対応形式
```

| ファイル | サイズ | 用途 |
|---------|--------|------|
| test-md.md | 28 B | 正常 Markdown（select → uploading → editing） |
| empty.md | 0 B | 不正バイト数の業務エラー期待（TC-04） |
| dummy.exe | 10 B | unsupported_format の業務エラー（TC-03） |

# シードデータ — Issue #417 ブラウザ検証

**整備日:** 2026-06-03

## 既存データ（local D1）

- users: 24件 / notes: 24件（マイグレーション適用済み）
- 検証に使うユーザー: `test-user-001`（active note 10件 → `/u/test-user-001` でプロフィール表示）

## 新規投入

ShareLinkGate（パスワード保護）検証用に share_links を1件投入:

| 項目 | 値 |
|------|----|
| id | `sharelink-tc417-0001` |
| note_id | `01938f00-0000-7000-8000-00000000b07a`（test-user-001 の「今日のタスク」） |
| status | active |
| 生 token | `tc417sharelinktoken000000000000000000000001` |
| token_hash | `R1TMYsv1buqhxa1v1RDGPkGgnV36N7Dg6HonnOQZVc4`（SHA-256→base64url） |
| パスワード | `test1234` |
| password_hash | scrypt `$scrypt$ln=16,r=8,p=1$...`（プロジェクトと同一パラメータで生成） |

- **アクセス URL:** `/share/tc417sharelinktoken000000000000000000000001`
- パスワード入力欄つきの ShareLinkGate が表示される（password_hash が設定されているため）。`test1234` で解錠。

## 検証用 URL まとめ

| 画面 | URL |
|------|-----|
| PublicSearch | `/search?q=task` |
| UserPublicTop | `/u/test-user-001` |
| ErrorPage | 存在しないルート（例 `/u/__nonexistent_user__`）で 404 系 |
| ShareLinkGate | `/share/tc417sharelinktoken000000000000000000000001` |

## 後始末

検証後、投入した share_link を削除する:
```
DELETE FROM share_links WHERE id='sharelink-tc417-0001';
```

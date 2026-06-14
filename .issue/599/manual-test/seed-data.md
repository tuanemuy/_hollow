# シードデータ — Issue #599 ブラウザ検証

既存のローカル D1（miniflare）に検証に必要なデータが揃っていたため、新規投入は不要。

## 使用データ

| 用途 | 値 |
|------|-----|
| 実在ユーザー | `dev-admin` |
| 公開ノート id | `01967100-0000-7000-8000-000000000203` |
| 公開ノート slug | `p671-note-03`（owner: dev-admin） |
| 非公開ノート id | `01938f99-0365-7000-8000-00000000b004` |
| 存在しないノート id | `01956000-0000-7000-8000-00000000ffff` |
| 存在しないユーザー | `nonexistent-user-xyz` |
| 存在しない slug | `this-slug-does-not-exist`（owner: dev-admin） |

DB: `hollow-local-d1`（local）。`pnpm db:migrate` 済み（No migrations to apply）。

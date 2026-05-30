# Seed Data — Issue #315

実行日: 2026-05-30
対象ブランチ: `issue/315/forbid-admin-self-demote-suspend`
DB: ローカル D1 `hollow-local-d1` (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`)

## 結論: 新規シード不要

ローカル D1 に既に **active admin が 2 名** 常駐しているため、自己操作ガードの検証（自分の行＝ボタン無し / 他 admin の行＝ボタン有り）に必要なデータが揃っている。新規 seed 投入は行わない。

## 検証に使うアカウント

| 用途 | username | email | password | role | banned | 備考 |
|---|---|---|---|---|---|---|
| ログイン（自分） | `admin-user` | `admin@example.com` | `Password123!` | admin | 0 | 自分の行に suspend/demote が出ないことを確認する対象 |
| 他 admin | `admin309` | — | — | admin | 0 | この行には suspend/demote が出る（非退行）ことを確認 |
| active member | `existing-user` ほか | — | — | member | 0 | suspend / 昇格 ボタンが出る |
| suspended | `tc-suspended` ほか | — | — | member | 1 | 復帰 ボタンが出る |

## 環境

- `.dev.vars` は既存（変更なし）。`BETTER_AUTH_SECRET` / `SECRET_BOX_MASTER_KEY` 等のデフォルト値あり。
- マイグレーション適用済み（`.wrangler/state/v3/d1/...` に sqlite 存在、baseline + 後続 Issue のデータ常駐）。

## 起動

```bash
pnpm dev   # → http://localhost:3000
```

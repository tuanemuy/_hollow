# Seed Data for Issue #231 Manual Test

## 既存データ（投入不要）

- 12 ユーザー（baseline 3 + throwaway 9）
- existing-user に active notes 4 / ingestion jobs 17（うち previewing 11）/ tags 7 / directories 2

## 追加投入したデータ

- **trashed note 1 件**（TrashRowActions 確認用）
  - id: `019e8000-0000-7231-8000-000000000001`
  - title: `Issue 231 Trash Test Note`
  - status: `trashed`, trashed_at: `2026-05-28T00:00:00.000Z`
  - owner: existing-user

## テスト用アカウント

| 用途 | email | password | role |
|---|---|---|---|
| 一般ユーザー（ノート/取り込み/トラッシュ確認） | `existing@example.com` | `Password123!` | `member` |
| 管理者（`/admin` 確認） | `admin@example.com` | `Password123!` | `admin` |
| 空状態確認用（throwaway） | `tc-rename-a@example.com` | `Password123!` | `member` |

## サーバー

- URL: http://localhost:3001/
- 起動方法: `pnpm dev`（既に起動中、Bash task ID: bx04nis6f）

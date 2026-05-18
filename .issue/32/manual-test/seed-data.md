# Issue #32 — Manual-test seed data

Issue #32 (`.issue/32/testing.md`) のマニュアルテスト用に投入したノートの
一覧と、テスト時に参照する値の一覧。

## 前提

`.manual-test/2026-05-17/seed.sql` （ベースラインアカウント 12 件 + 各自の
root ディレクトリ）が既に投入済み。本ドキュメントの seed はその上に
**ノート 4 件** と **note_internal_links 2 件** を追加する純追加シードで、
既存データを一切破壊しない。

ID 名前空間は `01938f32-...` を専有し、ベースライン (`01938f00`, `01938f01`)
と衝突しない。

## 投入手順

```bash
# 1. ベースラインが未投入なら先に流す（投入済みなら INSERT OR IGNORE で no-op）
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file .manual-test/2026-05-17/seed.sql

# 2. 本 Issue 用シードを投入（冪等）
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file .issue/32/manual-test/seed.sql
```

すべての INSERT は `INSERT OR IGNORE`。再実行しても 4 ノート + 2 リンクの
ままで増殖しない。

## 投入ノート一覧

| label | id | owner | title | slug | 役割 |
|---|---|---|---|---|---|
| Note A | `01938f32-0000-7000-8000-00000000000a` | existing-user | `ターゲット` | `issue-32-target` | バックリンクの参照対象 |
| Note B | `01938f32-0000-7000-8000-00000000000b` | existing-user | `リファラ B` | `issue-32-referrer-b` | A への内部リンクを持つ |
| Note C | `01938f32-0000-7000-8000-00000000000c` | existing-user | `リファラ C` | `issue-32-referrer-c` | A への内部リンクを持つ |
| Note X | `01938f32-0000-7000-8000-0000000000ff` | mailowner | `他人のノート X` | `issue-32-other-owner` | owner mismatch 用（他人のノート） |

すべて `status='active'` / `version=0` / `directory_id` = 各 owner の root
ディレクトリ（baseline で割り当て済み）。

## note_internal_links

| id | from | resolved → | ref_kind | ref_target |
|---|---|---|---|---|
| `01938f32-0000-7000-8000-000000000b01` | Note B | Note A | `id` | `<A.id>` |
| `01938f32-0000-7000-8000-000000000c01` | Note C | Note A | `id` | `<A.id>` |

`refKind='id'` + `resolvedNoteId=A.id` は `D1NoteRepository.save()` が解決
済みリンクを永続化するときの形（`noteRepository.ts:768` 参照）と一致。
これで `findByOwner({ referencingNoteId: A.id })` が `[B, C]` を返す。

## ログインアカウント

| 用途 | email | password | user.id | username |
|---|---|---|---|---|
| メイン（A/B/C の owner） | `existing@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000a1` | `existing-user` |
| 別 owner（Note X 用） | `existing-new@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000b1` | `mailowner` |

詳細は `.manual-test/2026-05-17/seed-data.md` を参照。

## testing.md 用のテスト値一覧

`.issue/32/testing.md` 内の `<A.id>` / `<X.id>` などを下記に置換して実行する。

```
<A.id> = 01938f32-0000-7000-8000-00000000000a
<B.id> = 01938f32-0000-7000-8000-00000000000b
<C.id> = 01938f32-0000-7000-8000-00000000000c
<X.id> = 01938f32-0000-7000-8000-0000000000ff
```

主な確認 URL:

- ノート A 詳細: `/notes/01938f32-0000-7000-8000-00000000000a`
- A への参照ノート一覧（主要受入条件）: `/?referencingNoteId=01938f32-0000-7000-8000-00000000000a`
  - 期待: B (`リファラ B`), C (`リファラ C`) のみが一覧表示、A 自身は含まれない
  - 期待: FilterBar chip = `参照中: ターゲット`
- owner mismatch: `/?referencingNoteId=01938f32-0000-7000-8000-0000000000ff`
  - existing-user としてログイン中に X.id を渡す
  - 期待: 一覧 0 件 / chip = `参照中: 01938f32`（UUID 先頭 8 文字）
- 不正 UUID: `/?referencingNoteId=not-a-uuid-string`
  - 期待: 一覧 0 件 / chip = `参照中: not-a-uu`
- 存在しない有効 UUID: `/?referencingNoteId=01938f99-0000-7000-8000-000000000000`
  - 期待: 一覧 0 件 / chip = `参照中: 01938f99`

## チェックリスト（testing.md と対応）

- [ ] 1. P11 → `/?referencingNoteId=<A.id>` 遷移 — `<A.id>` = `01938f32-0000-7000-8000-00000000000a`
- [ ] 2. P11 経由で chip = `参照中: ターゲット`
- [ ] 3. 直叩き `/?referencingNoteId=<A.id>` で chip = `参照中: ターゲット`
- [ ] 4. SavedView 復元時にも chip = `参照中: ターゲット`
- [ ] 5. `<X.id>` (`01938f32-...0000ff`) では chip = UUID 断片、Note X のタイトルが漏れない
- [ ] 6. 不正 UUID で chip = `参照中: not-a-uu`、500 にならない
- [ ] 7. 存在しない UUID で 500 にならない・一覧 0 件
- [ ] 8. chip の × ボタンで `referencingNoteId` が URL から消える

## 注意事項

- `publication_states` 行は投入していない。本 Issue のフィルタは owner 視点
  で動くため、自分のノートは `private` 既定でも一覧に出る前提
  （`noteRepository.findByOwner` は owner_id 一致でフィルタしている）
- 4 ノートとも root ディレクトリ配下なので、ホーム `/`（ディレクトリ未指定）
  で全件 enumerable
- 破壊的 TC は無いので reseed 不要だが、ベースライン側のカテゴリ実行で
  `reseed.sh` が走るとこの Issue#32 seed は消えない（ID 名前空間が別）

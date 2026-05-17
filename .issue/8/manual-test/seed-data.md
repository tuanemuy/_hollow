# Issue #8 — manual-test 用シードデータ

Issue #8（P10 公開状態フィルタ + 内部リンク参照フィルタ + `NoteListItemDTO.visibility`
実値反映）の動作確認用に、ローカル D1 に投入したテストデータをまとめる。

ベースは Issue #1 の seed をそのまま流用し、`note_internal_links` 行を追加した。

---

## テストアカウント

| 項目         | 値                                       |
|--------------|------------------------------------------|
| email        | `test-user-001@example.com`              |
| password     | `TestPassword123!`                       |
| username     | `test-user-001`                          |
| displayName  | `テストユーザー001`                       |
| user id      | `01938f00-0000-7000-8000-000000000001`   |
| role         | `member`                                 |
| status       | active (`email_verified=1`, `banned=0`, `deleted_at=NULL`) |

`accounts.password` は `D1CredentialStore.hashPassword` と同じ
PBKDF2-HMAC-SHA256 / 600,000 iter / 16B salt / 32B key で計算した
`pbkdf2-sha256-v1$600000$<salt-b64>$<hash-b64>` を直接書き込んでいる。

---

## 投入結果（件数）

| テーブル                | 件数 | 備考                                                         |
|-------------------------|------|--------------------------------------------------------------|
| `users`                 | 1    | テストユーザー本体                                           |
| `accounts`              | 1    | provider_id=`credential` の password 行                      |
| `directories`           | 6    | root(1) + Inbox / Projects / Archive(3) + Project A/B(2)     |
| `tags`                  | 7    | work, personal, project-a, ideas, todo, review, design       |
| `notes`                 | 10   | private 8 / unlisted 1 / public 1                            |
| `note_tags`             | 18   | ノート⇄タグ M:N                                              |
| `publication_states`    | 10   | 全ノートに対応行あり (private 8 / unlisted 1 / public 1)     |
| `search_documents`      | 10   | FTS5 トリガーで `search_documents_fts` も同期される          |
| `saved_views`           | 1    | personal kind の SavedView 「作業中のタスク」                |
| `note_internal_links`   | 4    | **本 Issue 用に追加**。解決済み内部リンク 4 件               |
| `instance_settings`     | 1    | singleton 行（既存なら no-op）                               |

---

## ノート公開状態（Issue #8 主眼）

| #  | id 末尾 | title                       | visibility | publication_states 行 |
|----|---------|-----------------------------|------------|-----------------------|
| N1 | …b071   | Weekly planning ノート      | private    | あり                  |
| N2 | …b072   | ブレインストーミング        | private    | あり                  |
| N3 | …b073   | Project A キックオフ        | private    | あり                  |
| N4 | …b074   | Project A デザインメモ      | **unlisted** | あり                  |
| N5 | …b075   | Project B レビュー記録      | private    | あり                  |
| N6 | …b076   | 5 月定例ミーティング        | private    | あり                  |
| N7 | …b077   | Reading list                | private    | あり                  |
| N8 | …b078   | Q1 ふりかえり               | private    | あり                  |
| N9 | …b079   | 公開デザインガイド          | **public**   | あり                  |
| N10| …b07a   | 今日のタスク                | private    | あり                  |

> 備考: Issue #8 testing.md の項目 2「`?visibility=private` で `publication_states`
> 行が無いノートも含まれる」を厳密に試したい場合は、上記投入後に手で
> `DELETE FROM publication_states WHERE note_id='…b078';` 等を実行して
> 行なし private 状態を作る。デフォルトでは全 private ノートに行ありとして
> 投入している（行あり private と行なし private の和集合の挙動を別途
> 検証するため）。

---

## 内部リンク seed（Issue #8 主眼）

`note_internal_links` テーブルに 4 件、複数方向の解決済みリンクを投入：

| from (ノート) | from id 末尾 | ref_kind | ref_target | resolved (ノート) | resolved id 末尾 |
|---------------|--------------|----------|------------|-------------------|------------------|
| N1 Weekly planning ノート | …b071 | title | `公開デザインガイド`   | N9 公開デザインガイド   | …b079 |
| N1 Weekly planning ノート | …b071 | title | `Project A キックオフ` | N3 Project A キックオフ | …b073 |
| N3 Project A キックオフ   | …b073 | title | `Project B レビュー記録` | N5 Project B レビュー記録 | …b075 |
| N9 公開デザインガイド     | …b079 | title | `Project A デザインメモ` | N4 Project A デザインメモ | …b074 |

該当ノート (N1 / N3 / N9) の `notes.content_html` にも対応する `[[<title>]]`
記法を本文に挿入済み（手で参照表示を確認できるように）。

---

## testing.md で使う URL サンプル

ベース: `http://localhost:5173`（`pnpm dev` の URL）

### 公開状態フィルタ

| URL                                 | 期待結果                                              |
|-------------------------------------|-------------------------------------------------------|
| `/`                                 | 全 10 件（filter 未指定で retrograde しないこと）     |
| `/?visibility=public`               | N9 のみ 1 件                                          |
| `/?visibility=unlisted`             | N4 のみ 1 件                                          |
| `/?visibility=private`              | N1, N2, N3, N5, N6, N7, N8, N10 の 8 件               |
| `/?visibility=`                     | 空値 → fallback で全 10 件                            |

### 内部リンク参照フィルタ (`?referencingNoteId=<id>`)

各 URL の `referencingNoteId` には参照「先」のノート id を渡し、
「そのノートを参照しているノート（from 側）」が一覧に出ることを確認する。

| URL（参照先ノート id 末尾を記載）     | 期待される from 側ノート              |
|----------------------------------------|---------------------------------------|
| `/?referencingNoteId=01938f00-0000-7000-8000-00000000b079` (=N9) | N1 のみ                                |
| `/?referencingNoteId=01938f00-0000-7000-8000-00000000b073` (=N3) | N1 のみ                                |
| `/?referencingNoteId=01938f00-0000-7000-8000-00000000b075` (=N5) | N3 のみ                                |
| `/?referencingNoteId=01938f00-0000-7000-8000-00000000b074` (=N4) | N9 のみ                                |
| `/?referencingNoteId=00000000-0000-0000-0000-000000000000`       | 0 件（存在しない id）                  |

### 複合フィルタ

| URL                                                                                         | 期待結果                                       |
|---------------------------------------------------------------------------------------------|------------------------------------------------|
| `/?visibility=public&referencingNoteId=01938f00-0000-7000-8000-00000000b074`                | N9 のみ（N9 は public かつ N4 を参照）         |
| `/?visibility=private&referencingNoteId=01938f00-0000-7000-8000-00000000b079`               | N1 のみ（N1 は private かつ N9 を参照）        |
| `/?visibility=private&tagNames=work&referencingNoteId=01938f00-0000-7000-8000-00000000b079` | N1 のみ（private + work タグ + N9 参照）       |

---

## 投入手順 / 再実行

`notes` の `ON DELETE CASCADE` により、テストユーザーを消すと
`note_internal_links` も自動で消えるため冪等。

```bash
# 1) マイグレーション適用（初回のみ）
pnpm db:apply:local

# 2) シード投入（何度でも再実行可）
pnpm wrangler d1 execute tanstack-start-template-d1 --local --file=.issue/8/manual-test/seed.sql

# 3) 件数確認
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT (SELECT COUNT(*) FROM users) AS users, \
          (SELECT COUNT(*) FROM notes) AS notes, \
          (SELECT COUNT(*) FROM publication_states) AS publication_states, \
          (SELECT COUNT(*) FROM note_internal_links) AS note_internal_links;"
```

シード SQL: [`./seed.sql`](./seed.sql)

---

## 既知の問題・補足

- **行なし private** (`publication_states` 行が存在しないノート) を試したい場合は、
  上記投入後に任意のノートの publication_states 行を手で削除する必要がある。
  デフォルトでは全ノートに対応行を入れている（Issue #1 seed の仕様を踏襲）。
  → testing.md 項目 2 を厳密に試すなら以下を実行:
  ```bash
  pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
    "DELETE FROM publication_states WHERE note_id='01938f00-0000-7000-8000-00000000b078';"
  ```
  これで N8 が「private で行なし」のケースになる。
- **未解決リンク** (resolved_note_id = NULL) は seed していない。
  Issue #8 の `?referencingNoteId=` は解決済みリンク (`resolvedNoteId` が一致)
  のみが対象なので、本 Issue 検証範囲では不要。未解決のケースを試したい場合は
  `INSERT INTO note_internal_links (..., resolved_note_id) VALUES (..., NULL);` を追加する。
- `tags`/`directories`/`saved_views` 等は Issue #1 と同一構成。
- パスワードハッシュは `D1CredentialStore.hashPassword` の現行パラメータ
  (PBKDF2-SHA256, 600k iter) に合わせている。パラメータ変更時は再ハッシュ要。

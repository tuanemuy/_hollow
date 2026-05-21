# Seed Data — Issue #55 (P18 タグ管理画面 進捗表示)

**作成日:** 2026-05-20
**対象:** `.issue/55/testing.md` のマニュアルテスト用シードデータ

---

## テストユーザー

既存のシードユーザー（過去 Issue #1 / #9 / #29 / #50 で利用済み）をそのまま再利用する。

| key | value |
|---|---|
| user id | `01938f00-0000-7000-8000-000000000001` |
| email | `test-user-001@example.com` |
| password | `TestPassword123!` |
| username | `test-user-001` |
| displayName | `テストユーザー001` |
| role | `member` |
| email_verified | `1`（true） |

ログイン手順:
1. http://localhost:3001/login にアクセス
2. 上記 email / password を入力してログイン

---

## 投入したタグ・ノート

`/tags` 画面で利用するため、Issue #55 専用のタグ群を D1 ローカル DB に直接 INSERT した。
`notes` / `note_tags` も対応する件数だけ作成済み（merge / delete usecase が実際にノートを書き換える挙動を実機検証するため）。

### タグ一覧

| タグ名 | tag id (末尾) | note_count | 用途 |
|---|---|---|---|
| `#alpha` | `...55a1` | **4** | マージ source（3-5 件パターン） |
| `#beta` | `...55a2` | **1** | マージ target（任意） |
| `#empty` | `...55a3` | **0** | 0 件パターン（merge / delete の件数省略確認） |
| `#delete-me` | `...55a4` | **4** | 削除 source（3-5 件パターン） |
| `#target` | `...55a5` | **1** | マージ target 候補 |

すべて `owner_id = 01938f00-0000-7000-8000-000000000001` 配下。
`note_count` カラムと `note_tags` テーブルの実件数は一致。

### ノート一覧（Issue #55 用）

ディレクトリは全て `Inbox` (`01938f00-0000-7000-8000-0000000000d1`) 配下。

| note id (末尾) | title | 紐付けタグ |
|---|---|---|
| `...55b1` | Issue55 alpha note 1 | `#alpha` |
| `...55b2` | Issue55 alpha note 2 | `#alpha` |
| `...55b3` | Issue55 alpha note 3 | `#alpha` |
| `...55b4` | Issue55 alpha note 4 | `#alpha` |
| `...55b5` | Issue55 beta note | `#beta` |
| `...55b6` | Issue55 delete-me 1 | `#delete-me` |
| `...55b7` | Issue55 delete-me 2 | `#delete-me` |
| `...55b8` | Issue55 delete-me 3 | `#delete-me` |
| `...55b9` | Issue55 delete-me 4 | `#delete-me` |
| `...55ba` | Issue55 target note | `#target` |

---

## テストケースとシードの対応表

| testing.md 項目 | 操作 | 使用タグ | 期待 noteCount |
|---|---|---|---|
| 1. マージ件数事前提示（>0） | `#alpha` を `#beta` に統合 | source=alpha / target=beta | 4 |
| 2. マージ件数省略（=0） | `#empty` を `#target` に統合 | source=empty / target=target | 0 |
| 3. マージ中 progressbar（>0） | `#alpha` を `#beta` に統合 | source=alpha / target=beta | 4 |
| 4. マージ中 progressbar 非描画（=0） | `#empty` を `#target` に統合 | source=empty / target=target | 0 |
| 5. 削除確認件数事前提示（>0） | `#delete-me` を削除 | source=delete-me | 4 |
| 6. 削除確認件数省略（=0） | `#empty` を削除 | source=empty | 0 |
| 7. 削除中 progressbar（>0） | `#delete-me` を削除 | source=delete-me | 4 |
| 8. 削除中 progressbar 非描画（=0） | `#empty` を削除 | source=empty | 0 |
| 9. リネーム進捗 UI なし | `#alpha` などをリネーム | 任意 | — |

> 備考: テスト項目 3/7 は本来 5 件想定だが、4 件でも `noteCount > 0` の挙動・件数表示・ARIA 属性検証には十分。アサーション文言「**4 件のノートを更新中**」で読み替えれば全項目チェック可能。
> どうしても 5 件で確認したい場合は、`alpha` または `delete-me` のいずれかにノートを 1 件追加してから再実行する（後述「件数を 5 に増やしたい場合」参照）。

---

## 既存データへの影響

| 項目 | 内容 |
|---|---|
| 既存ユーザー数 | 1（変更なし） |
| 既存タグ数 | 7（work / personal / project-a / ideas / todo / review / design）はそのまま |
| 既存ノート数 | 10（変更なし） |
| 追加タグ数 | 5（alpha / beta / empty / delete-me / target） |
| 追加ノート数 | 10（all Inbox 配下、status=active） |
| 既存 directory・session・admin 設定 | 無改変 |

---

## 再実行・クリーンアップ

### 件数を 5 に増やしたい場合

```bash
D1=/Users/hikaru/github.com/tuanemuy/hollow2/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite
NOW='2026-05-20T11:55:00.000Z'
OWNER='01938f00-0000-7000-8000-000000000001'
DIR='01938f00-0000-7000-8000-0000000000d1'
sqlite3 "$D1" <<SQL
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version) VALUES
  ('01938f00-0000-7000-8000-0000000055bb', '$OWNER', '$DIR', 'issue55-alpha-5', 'Issue55 alpha note 5', '<p>alpha extra #alpha</p>', '{}', 'active', '$NOW', '$NOW', 0);
INSERT INTO note_tags VALUES ('01938f00-0000-7000-8000-0000000055bb', '01938f00-0000-7000-8000-0000000055a1');
UPDATE tags SET note_count = 5 WHERE id = '01938f00-0000-7000-8000-0000000055a1';
SQL
```

### テスト後のクリーンアップ（任意）

マージ / 削除を実行すると `alpha` / `empty` / `delete-me` などは usecase により自動的に削除される。
完全に Issue #55 投入分を巻き戻したい場合:

```bash
sqlite3 "$D1" <<SQL
DELETE FROM note_tags WHERE note_id LIKE '01938f00-0000-7000-8000-0000000055b%';
DELETE FROM notes WHERE id LIKE '01938f00-0000-7000-8000-0000000055b%';
DELETE FROM tags WHERE id LIKE '01938f00-0000-7000-8000-0000000055a%';
SQL
```

なお、`#delete-me` 削除テスト後は `tag_blacklist` テーブルに `delete-me` の行が追加される可能性がある。
再実行で同名タグが「ブラックリスト登録済み」扱いされる場合は以下も実行:

```bash
sqlite3 "$D1" "DELETE FROM tag_blacklist WHERE owner_id = '01938f00-0000-7000-8000-000000000001' AND name_normalized IN ('delete-me','empty');"
```

---

## 投入方法

agent-browser での UI 経由作成も検討したが、React の controlled input に対する `fill` コマンドが
`onChange` を発火させない挙動が確認されたため、D1 への直接 SQL INSERT に切り替えた。
データモデルは `tagRepository` / `noteRepository` の制約と一致しており、
`mergeTags` / `deleteTag` usecase からも問題なく扱える（`note.contentHtml` の `#tagname` 書き換えロジックは
本 Issue のスコープ外で、ノート本文は usecase 内で書き換えられない）。

サインインの動作確認は agent-browser で実施済み（`test-user-001@example.com` / `TestPassword123!`
で `/` トップへリダイレクトされること、`/tags` で投入したタグが正しく表示されることを確認）。

検証用スクリーンショット: `.issue/55/.manual-test/seed-tags-page.png`

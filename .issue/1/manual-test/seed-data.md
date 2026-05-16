# Issue #1 — manual-test 用シードデータ

このドキュメントは Issue #1（P10/P11/P12 ノート画面の動作確認）用に
ローカル D1 に投入したテストデータと、テストアカウント情報をまとめる。

---

## テストアカウント

| 項目         | 値                                  |
|--------------|-------------------------------------|
| email        | `test-user-001@example.com`         |
| password     | `TestPassword123!`                  |
| username     | `test-user-001`                     |
| displayName  | `テストユーザー001`                 |
| user id      | `01938f00-0000-7000-8000-000000000001` |
| role         | `member`                            |
| status       | active (email_verified=1, banned=0, deleted_at=NULL) |
| bio          | `manual test シードユーザー`        |

`password` は `D1CredentialStore` 実装と同じ PBKDF2-HMAC-SHA256 / 600,000
イテレーション / 16B salt / 32B key で計算した PHC 風文字列
`pbkdf2-sha256-v1$600000$<salt-b64>$<hash-b64>` を `accounts.password`
に直接書き込んでいる（実装: `app/core/adapters/d1/repositories/credentialStore.ts`）。

---

## 投入シード一覧（件数）

| テーブル              | 件数 | 備考                                                   |
|-----------------------|------|--------------------------------------------------------|
| `users`               | 1    | テストユーザー本体                                     |
| `accounts`            | 1    | provider_id=`credential` の password 行                |
| `directories`         | 6    | root(1) + Inbox / Projects / Archive(3) + Project A/B(2) |
| `tags`                | 7    | work, personal, project-a, ideas, todo, review, design |
| `notes`               | 10   | 詳細は下表                                             |
| `note_tags`           | 18   | ノート⇄タグ M:N                                        |
| `publication_states`  | 10   | private 8 / unlisted 1 / public 1                      |
| `search_documents`    | 10   | FTS5 トリガーで `search_documents_fts` も同期される    |
| `saved_views`         | 1    | personal kind の SavedView 「作業中のタスク」          |
| `instance_settings`   | 1    | singleton 行（既に存在する場合は no-op）               |

### Directory ツリー構造

```
(root, parent=NULL, name="", slug="", depth=0)
├── Inbox        (depth=1)
├── Projects     (depth=1)
│   ├── Project A (depth=2)
│   └── Project B (depth=2)
└── Archive      (depth=1)
```

仕様上「root はオーナーごとに 1 つだけ」（`uniq_directories_owner_root`）。
表示用のディレクトリは `Inbox` / `Projects` / `Archive` の 3 つ + ネスト
2 つ。Sidebar ツリーの描画・展開・絞り込みリンクを確認できる構成。

### Note 一覧

| #  | id 末尾 | title                       | directory          | visibility | tags                       | updatedAt (JST) |
|----|---------|-----------------------------|--------------------|------------|----------------------------|-----------------|
| N1 | …n1     | Weekly planning ノート      | Inbox              | private    | work, todo                 | 2026-05-15 18:00 |
| N2 | …n2     | ブレインストーミング        | Inbox              | private    | ideas                      | 2026-05-14 20:30 |
| N3 | …n3     | Project A キックオフ        | Projects/Project A | private    | project-a, work            | 2026-05-12 22:00 |
| N4 | …n4     | Project A デザインメモ      | Projects/Project A | unlisted   | project-a, design          | 2026-05-14 00:45 |
| N5 | …n5     | Project B レビュー記録      | Projects/Project B | private    | work, review               | 2026-05-11 01:00 |
| N6 | …n6     | 5 月定例ミーティング        | Projects           | private    | todo                       | 2026-05-08 19:00 |
| N7 | …n7     | Reading list                | Inbox              | private    | personal, ideas            | 2026-05-06 04:20 |
| N8 | …n8     | Q1 ふりかえり               | Archive            | private    | work, review               | 2026-04-01 18:00 |
| N9 | …n9     | 公開デザインガイド          | Projects           | public     | design, ideas              | 2026-05-09 21:00 |
| N10| …na     | 今日のタスク                | Inbox              | private    | todo, personal             | 2026-05-16 17:00 |

- visibility 内訳: **private 8 / unlisted 1 (N4) / public 1 (N9)**
- 全ノートに `front_matter_json` あり（title/date/tags/description/slug の組合せ）
- カレンダー表示テスト用に updatedAt を日付分散
- 検索テスト用に本文に「レビュー」「デザイン」「プロジェクト」など共通語を散らしている

### SavedView 1 件

| name           | kind     | filters                        | displayMode | sort                     |
|----------------|----------|--------------------------------|-------------|--------------------------|
| 作業中のタスク | personal | tagNames=[work, todo]          | list        | updatedAt desc           |

`saved_views.query_json` の形は
`{"filters":{"tagNames":["work","todo"],"directoryId":null,"visibility":null,"from":null,"to":null,"q":null}}`
として投入。`/views?kind=personal` 一覧 → クリックで `/?viewId=...` 復元が確認できる。

---

## 投入手順 / 再実行

シードは冪等：先頭で
`DELETE FROM users WHERE id = '01938f00-…-0001';`
を実行しており、`users → accounts / directories / notes / publication_states /
search_documents / note_tags / saved_views` は ON DELETE CASCADE で
全てクリーンされる。`tags` は `owner_id` の cascade で消える。

```bash
# 1) マイグレーション適用（初回のみ）
pnpm db:apply:local

# 2) シード投入（何度でも再実行可）
pnpm db:execute:local .issue/1/manual-test/seed.sql

# 3) 件数確認
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT (SELECT COUNT(*) FROM users) AS users, \
          (SELECT COUNT(*) FROM accounts) AS accounts, \
          (SELECT COUNT(*) FROM directories) AS directories, \
          (SELECT COUNT(*) FROM tags) AS tags, \
          (SELECT COUNT(*) FROM notes) AS notes, \
          (SELECT COUNT(*) FROM note_tags) AS note_tags, \
          (SELECT COUNT(*) FROM publication_states) AS publication_states, \
          (SELECT COUNT(*) FROM search_documents) AS search_documents, \
          (SELECT COUNT(*) FROM saved_views) AS saved_views;"
```

シード SQL: [`.issue/1/manual-test/seed.sql`](./seed.sql)

---

## 動作確認との対応

testing.md の項目 → このシードでカバーする内容のマップ。

| 項目                                | カバー要素                                         |
|-------------------------------------|----------------------------------------------------|
| 1. 表示形式切替 (list/tile/cal)     | 10 ノート × 異なる updatedAt 日付                  |
| 2. フィルタ (タグ/期間)             | tags 7 種、ノートに散らした更新日                  |
| 3. 検索 (`?q=`) + visibility フィルタ | FTS で本文ヒットする日本語/英語キーワード混在       |
| 4. ディレクトリツリー絞り込み       | Inbox(3) / Projects(2) / Archive(1) / Project A(2) / Project B(1) |
| 5. 複数選択 + 一括操作              | 10 件あれば移動/ゴミ箱/visibility/export を試せる  |
| 6. SavedView 保存 + 復元            | 既存 SavedView 1 件 + 自分で保存して /views で確認 |
| 7. P11 メタ情報 + FrontMatter       | 全ノートに front_matter_json あり                  |
| 8. 操作メニュー                     | publication / move / copy URL / export / duplicate 全て試せる |
| 9. P12 ディレクトリ選択             | 既存 6 ディレクトリから選択 + 新規作成             |
| 10. FrontMatter 編集                | 既知キー入りなので両モードで編集確認可能           |
| 11. メディアアップロード            | シードでは未投入（実機 upload で確認）             |
| 12. 自動保存                        | 既存ノート編集 → 1.5s で autosave                  |
| 13. 編集ロック                      | 2 ブラウザで同じ noteId を開いて確認               |
| 14. WYSIWYG タブ disabled           | UI のみ確認、データ不要                            |
| エッジ 4: bulk 100 件超過           | 10 件しかないので 100 件超は別途データ追加が必要   |
| エッジ 5: SavedView 壊れた条件      | SavedView 保存 → タグ削除で確認                    |

---

## 補足・注意

- **メディア (`media_assets` / `note_media_refs`)** は未投入。
  項目 11 のアップロード動作は、画面から実際にアップロードして検証する。
- **ingestion_jobs / export_jobs** も未投入。項目 5 の bulk export と
  項目 8 の単発 export は画面から実行する。
- **bulk 100 件超過** (エッジケース 4) を厳密に試すには 101 件以上の
  ノートが必要。10 件の現シードでは API 呼び出し前のバリデーションを
  実機で確認するには「選択 + 件数」UI で手動チェックする想定。
- パスワードハッシュは現在シードに固定値で書き込んでいるため、
  `D1CredentialStore.hashPassword` のパラメータ変更（iterations 等）が
  発生したら再ハッシュが必要。再生成手順は `seed.sql` 末尾のコメントを参照。

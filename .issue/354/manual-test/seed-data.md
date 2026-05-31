# Seed Data — Issue #354 manual test

## 使用アカウント

- email: `tester354@example.com`
- password: `Test1234!pwAB`  （※当初指示の `Test1234!pw` は11文字でサインアップ時の「12文字以上」検証に弾かれたため、13文字の `Test1234!pwAB` に変更した）
- username / 表示名: `tester354`
- 新ユーザー id: `019e780b-5b80-7369-be2c-f60f4e20d00e`
- `email_verified=1` を D1 で設定済み

## 付け替えた所有データ

旧検証ユーザー `existing@example.com`（id=`01938f00-0000-7000-8000-0000000000a1`）から新ユーザーへ owner_id を UPDATE:

| テーブル | 件数 |
|---|---|
| notes | 5 |
| directories | 2 |
| tags | 7（既存） |
| ingestion_jobs | 17 |

注意: directories は `owner_id` にユニーク制約（root dir = parent_id NULL が1件のみ）があり、新ユーザーはサインアップ時に空の root dir を自動生成済みだった。そのため新ユーザーの空 root dir（`019e780b-5c5b-773d-b96a-bc9a27c4a6ea`、参照ノート0件）を DELETE してから旧ユーザーの dir を付け替えた。これによりノート→ディレクトリの FK 参照を保ったまま移譲できた。

publication_states / saved_views / export_jobs / share_links / search_documents / user_prompt_overrides は旧ユーザー所有行が0件のため付け替え不要。note_id 起点のテーブル（note_tags 等）は付け替え不要。

## 追加タグ

タグ折りたたみ（「もっと見る」）検証のため 12件超が必要。既存7件に加え `tag-extra-1`〜`tag-extra-7` を7件 INSERT し、合計 **14件** とした。

注意: tag.id は `idGenerator.validate`（UUID v7 パターン `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`）を通る必要がある。当初 `lower(hex(randomblob(16)))` で生成した32桁hexは弾かれ「Stored tag has malformed id」SystemError で一覧がエラー表示になった。SQL で version nibble=7 / variant=[89ab] を強制した v7形状の UUID を生成し直して解決。

## 表示確認

ログイン後 `/` で「すべてのノート / 4 件のノート」とノート一覧、タグファセット（12件 +「もっと見る (+2)」）が表示されることを確認。
（ノートは5件中4件表示。1件はゴミ箱の「Issue 231 Trash Test Note」のため一覧には出ない。）

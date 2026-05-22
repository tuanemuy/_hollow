# ドメイン一覧

シナリオ・ページ設計から抽出した境界。各ドメインは固有の集約と不変条件を持つ。

## ドメイン

| ID | ドメイン | 責務（一文） |
|---|---|---|
| identity | Identity | ユーザーの認証情報・セッション・登録/復旧フローを司る |
| directory | Directory | ユーザーごとのノート格納ディレクトリツリーを管理する |
| note | Note | ノートの内容・メタデータ・状態（編集・削除）を保持し、ビジネスルールを束ねる集約 |
| tag | Tag | ユーザー横断ではなくユーザー単位のタグカタログを管理し、リネーム/統合/削除を行う |
| publication | Publication | ノートの公開ステータスと限定公開リンクを管理する |
| ingestion | Ingestion | ファイルアップロードから LLM 構造化までのジョブを管理する |
| media | Media | R2 に保存されるメディアアセットと孤児クリーンアップを扱う |
| export | Export | エクスポートジョブの状態管理と成果物配布を扱う |
| search | Search | ノートの全文検索インデックスと検索クエリ実行を担う |
| view | View | 保存済みビュー（フィルタ + 表示形式）を管理する |
| adminSettings | AdminSettings | インスタンス全体の設定（LLM・プロンプト・トークン・登録制御）を管理する |

## 依存方向

依存は左→右（左が右を参照）。

```
ingestion → note → directory
ingestion → media
ingestion → tag
note      → directory
note      → tag
note      → media     (本文中のメディア参照)
publication → note
export    → note      (エクスポート対象)
export    → media     (埋め込みメディア取得)
search    → note      (インデックス更新トリガー)
view      → tag, directory  (参照する条件の有効性)
identity, adminSettings は他から参照されるが、自身は他のドメインに依存しない
```

循環依存は許容しない。集約間参照は ID のみ。

## ドメインイベント

ドメイン横断の連携は Outbox 経由のドメインイベントで行う。MVP で発火するイベント:

- `note.saved` — Search がインデックス更新
- `note.deleted` (= trashed) — Search がインデックス削除、Publication が公開停止
- `note.purged` — Media が参照カウントを減算
- `note.publish_changed` — Search の公開フィルタ更新
- `ingestion.completed` — Note を生成 → `note.saved` へ
- `media.uploaded` — Media が初期参照カウント 0 で登録（一定時間後に孤児ジョブ）
- `user.deleted` — Note / Publication / Media / Export が連鎖クリーンアップ

イベントは at-least-once 配信、ハンドラは冪等とする。

### イベント購読対応表

`note.saved` / `note.deleted` は**論理 event 名**で、実装の物理 event 群（`note.created` / `note.content_updated` / `note.renamed` / `note.moved` / `note.restored` / `note.tags_replaced` を `note.saved`、`note.trashed` / `note.purged` を `note.deleted` として集約）に対応する。dispatcher は物理 event の `type` を見て論理ハンドラに routing する（spec/usecases/search.md のマッピング表参照）。

| イベント | 物理 event 名 | 発火元 usecase | 購読する usecase / ドメイン |
|---|---|---|---|
| `note.saved` | `note.created` / `note.content_updated` / `note.renamed` / `note.moved` / `note.restored` / `note.tags_replaced` | Note.CreateNote/SaveNote/SaveNoteDraft/RenameNote/MoveNote/RestoreNote/DuplicateNote、Ingestion.CommitIngestionPreview、Tag.RenameTag/MergeTags/DeleteTag | Search.HandleNoteSavedEvent |
| `note.deleted` | `note.trashed` / `note.purged` | Note.DeleteNote/BulkTrashNotes、Directory.DeleteDirectory（配下分） | Search.HandleNoteTrashedEvent、Publication.HandleNoteTrashedEvent（trash のみ）、View.HandleNotePurgedEvent（部分） |
| `note.purged` | `note.purged` | Note.PurgeNote/PurgeTrashOlderThan | Media.HandleNotePurgedEvent、Publication.HandleNotePurgedEvent、View.HandleNotePurgedEvent |
| `note.publish_changed` | `note.publish_changed` | Publication.ChangePublicationVisibility/BulkChangePublicationVisibility、Publication.HandleNoteTrashedEvent | Search.HandlePublicationChangedEvent |
| `media.uploaded` | `media.uploaded` | Media.UploadMedia/FinalizeUpload | Media 自身の TTL ベース孤児監視 |
| `user.deleted` | `user.deleted` | Identity.DeleteAccount/SuspendUser（永続停止のとき） | Publication.HandleUserDeletedEvent、Export.HandleUserDeletedEvent、他ドメインのクリーンアップ |
| `tag.deleted` | `tag.deleted` | Tag.DeleteTag | View.HandleTagDeletedEvent |
| `directory.deleted` | `directory.deleted` | Directory.DeleteDirectory | View.HandleDirectoryDeletedEvent |

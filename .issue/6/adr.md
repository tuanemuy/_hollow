# ADR — Issue #6: todo ドメイン削除

## 決定: occGuard/unitOfWork テストのフィクスチャを `tags` テーブルに変更

`todos` テーブルが削除されるため、occGuard / unitOfWork 統合テストのフィクスチャを `tags` テーブルに切り替えた。

理由:
- `tags` は `version` カラムを持ち OCC のテストに直接使える
- `processedEvents` に `version` カラムがないため OCC テストには使えない
- `notes` は関連テーブルが多く setup が複雑になる

代償:
- `tags.owner_id` → `users.id` FK があるため、各テスト内で raw SQL でユーザーを seed する必要がある (`INSERT OR IGNORE INTO users ...`)
- `tags.created_at` / `tags.updated_at` は `text` (ISO 8601) 形式のため、`new Date()` ではなく `.toISOString()` を渡す必要がある (todos の `integer timestamp_ms` とは異なる)

## 決定: eventRelayWorker / outboxRepository / handlers テストのフィクスチャを `NoteEvents.trashed` に統一

todo イベントを note ドメインへ置き換える際に、シグネチャがシンプルな `NoteEvents.trashed` (noteId, ownerId, mediaRefs, occurredAt) を選択した。

理由:
- `NoteEvents.created` は `directoryId`, `slug`, `title`, `tagIds`, `mediaRefs` など多数のフィールドが必要でテストコードが煩雑になる
- `trashed` はペイロードが最小で FK 依存がなく、outbox / relay テストの目的（永続化・デコード・ディスパッチ）を変えずに達成できる
- `note.trashed` デコーダーは `noteEventDecoders` に存在するため `defaultEventDecoderRegistry` でそのまま動作する

代償:
- `ownerId` フィールドが必要で `UserId.create(...)` が必要（DB への書き込みはしないが型制約がある）

## 決定: `routeTree.gen.ts` を手動更新

自動生成ファイルだが `pnpm dev` を実行せずに手動で todo 関連ブロックをすべて削除した。

理由:
- routes/todo/ の削除後 `pnpm dev` を実行すれば自動的に再生成されるが、CI 環境では dev server を起動しない
- TypeScript ビルドエラーを防ぐために手動で即時同期が必要
- 変更量は多いが機械的であり型チェックで検証済み

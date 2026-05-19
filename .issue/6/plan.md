# 実装計画 — Issue #6: [spec-sync] todo ドメイン削除

**Issue:** #6
**作成日:** 2026-05-18
**複雑度:** 中〜大規模

---

## 目的

spec に定義されていない todo ドメイン（テンプレート由来のサンプル機能）を実装から完全に除去し、spec と実装を一致させる。

## スコープ

### 含まれるもの
- `app/core/domain/todo/` 以下のすべてのファイル削除
- `app/core/application/todo/` 以下のすべてのファイル削除
- `app/core/adapters/d1/repositories/todoRepository.ts` および関連テスト削除
- `app/components/todo/` および `app/routes/todo/` の削除
- UnitOfWorkContext / D1UnitOfWorkProvider から todoRepository スロット除去
- schema.ts から `todos` テーブル定義除去
- eventRelayWorker.ts から todo イベントデコーダ除去
- `__root.tsx` から todo アクションインポート除去
- `routeTree.gen.ts` から todo ルート定義除去
- `todos` テーブルを DROP する新規マイグレーション追加
- todo をテストフィクスチャとして使っているインフラ系テストの更新（occGuard / unitOfWork / helpers / eventRelayWorker / outboxRepository / handlers）
- `mediaAssetRepository.ts` の JSDoc コメント中の todo 言及修正

### 含まれないもの
- spec への新機能追加（Issueの対応方針 (B) のみ実施）
- todo を別ドメインで代替する機能開発

---

## 実装ステップ

### 1. todo ドメイン固有ファイルの削除

- **対象ファイル:**
  - `app/core/domain/todo/` (全ファイル)
  - `app/core/application/todo/` (全ファイル)
  - `app/core/adapters/d1/repositories/todoRepository.ts`
  - `app/core/adapters/d1/__tests__/todoRepository.integration.test.ts`
  - `app/components/todo/` (全ファイル)
  - `app/routes/todo/` (全ファイル)
- **変更内容:** `rm -rf` で各ディレクトリ・ファイルを削除
- **理由:** spec に定義されないドメインのコードは丸ごと除去する

### 2. UnitOfWorkContext から todoRepository スロット除去

- **対象ファイル:** `app/core/application/execution/unitOfWork.ts`
- **変更内容:**
  - `import type { TodoRepository }` 行を削除
  - `UnitOfWorkContext.todoRepository: TodoRepository` プロパティを削除
  - JSDoc の言及（`D1TodoRepository` への参照）を修正
- **理由:** アプリケーション層のポートから todo を完全除去するため

### 3. D1UnitOfWorkProvider から todoRepository 除去

- **対象ファイル:** `app/core/adapters/d1/unitOfWork.ts`
- **変更内容:**
  - `import { D1TodoRepository }` 行を削除
  - `const todoRepository = new D1TodoRepository(...)` ブロック削除
  - `ctx: UnitOfWorkContext` オブジェクトの `todoRepository,` スロット削除
  - 行56 の JSDoc `see D1TodoRepository for the rationale.` → `D1NoteRepository` に書き換え（read-your-write の説明は note リポジトリを指す形に変更）
- **理由:** アダプタ層から todo 実装を除去するため

### 3b. mediaAssetRepository.ts の todo 言及コメント修正

- **対象ファイル:** `app/core/adapters/d1/repositories/mediaAssetRepository.ts`
- **変更内容:**
  - 行22 `Unlike \`D1TodoRepository\`, this aggregate does not extend` → `Unlike \`D1NoteRepository\`...` に書き換え
  - 行35 `from \`todos\`' \`integer timestamp_ms\`` → todos への言及を削除または書き換え
- **理由:** todo が消えた後も残るコメントは代替例に更新する必要がある

### 4. schema.ts から todos テーブル定義除去

- **対象ファイル:** `app/core/adapters/d1/schema.ts`
- **変更内容:**
  - `export const todos = sqliteTable(...)` ブロック（16〜32行）を削除
  - 行113 の `// the legacy \`todos\` / \`outbox_events\` integer-ms columns above.` コメントを修正（todos 言及を除去）
  - 行486 の `ingestion_jobs` テーブルコメント中の `todos.version` 言及を削除/書き換え
- **理由:** Drizzle スキーマから todos テーブルを除去する

### 5. eventRelayWorker.ts から todo イベントデコーダ除去

- **対象ファイル:** `app/core/application/workers/eventRelayWorker.ts`
- **変更内容:**
  - `import type { TodoEvent }` 削除
  - `import { todoEventDecoders }` 削除
  - `| TodoEvent` をイベントユニオン型から削除
  - `...todoEventDecoders,` をスプレッドから削除
- **理由:** リレーワーカーから todo ドメインイベントの登録を除去する

### 6. __root.tsx から todo アクションインポート除去

- **対象ファイル:** `app/routes/__root.tsx`
- **変更内容:**
  - `import "@/components/todo/CreateTodoForm/action"` 削除
  - `import "@/components/todo/TodoItem/action"` 削除
- **理由:** フロントエンドのルートから todo アクション副作用インポートを除去する

### 7. routeTree.gen.ts から todo ルート除去

- **対象ファイル:** `app/routeTree.gen.ts`
- **変更内容:** todo ルートの import・Route 定数・型定義・children 登録・型マップへの追加など todo 関連の全ブロックを削除
- **理由:** 自動生成ファイルだが routes/todo/ 削除後に手動同期が必要（または `pnpm dev` で再生成）

### 8. todos テーブル DROP マイグレーション追加

- **対象ファイル:** `app/core/adapters/d1/migrations/0005_drop_todos.sql`（新規作成）
- **変更内容:**
  ```sql
  -- 0005_drop_todos.sql
  -- Remove the template-derived todos table (spec-sync Issue #6).
  DROP TABLE IF EXISTS `todos`;
  DROP INDEX IF EXISTS `idx_todos_created_id`;
  ```
- **理由:** 既存の D1 DBs に対して `todos` テーブルを削除するマイグレーションが必要

### 9. setup.ts から todos クリーンアップ文除去

- **対象ファイル:** `app/core/adapters/d1/__tests__/setup.ts`
- **変更内容:** `["todos", "DELETE FROM todos"],` 行を `CLEAN_STATEMENTS` から削除
- **理由:** todos テーブルが存在しなくなるため

### 10. helpers.integration.test.ts の todo フィクスチャ置き換え

- **対象ファイル:** `app/core/adapters/d1/__tests__/helpers.integration.test.ts`
- **変更内容:**
  - `import { todos }` → `import { processedEvents }`
  - PK 衝突テストの INSERT を `processedEvents` テーブルに変更（`id` と `processedAt` のみ必要、FK なし）
- **理由:** `processedEvents` はスタンドアロンテーブル（FK なし）でありシンプルな PK 衝突テストに適する

### 11. occGuard.integration.test.ts の todo フィクスチャ置き換え

- **対象ファイル:** `app/core/adapters/d1/__tests__/occGuard.integration.test.ts`
- **変更内容:**
  - `import { todos }` → `import { tags }`（`version` カラムあり）
  - 各テストの先頭でユーザーを生成（`db.insert(schema.users).values(...)` をテスト内で直接実行）
  - `todos` テーブルへの INSERT/UPDATE/SELECT を `tags` テーブルに置き換え（`id`, `ownerId`, `name`, `nameNormalized`, `version`, `createdAt`, `updatedAt` カラム）
  - `todos` の列名 (`title`, `status`) → `tags` の列名 (`name`, `nameNormalized`) に変更
- **理由:** `tags` は `version` カラムを持つため OCC guard の動作確認テーブルとして適切

### 12. unitOfWork.integration.test.ts の todo フィクスチャ置き換え

- **対象ファイル:** `app/core/adapters/d1/__tests__/unitOfWork.integration.test.ts`
- **変更内容:**
  - `import { Todo, TodoEvents, TodoId }` → `import { Tag, TagEvents, TagId, TagName }`
  - テストの先頭でユーザーを seed（`schema.users` に直接 INSERT）
  - `todoRepository` → `tagRepository`（UoW コンテキストのスロット名に合わせる）
  - `Todo.create` → `Tag.create`（ownerId / name / nameNormalized に対応する値を生成）
  - `Todo.complete` / `Todo.isActive` の OCC 確認テストは、`Tag` の version を直接操作（`Tag.create` 後に `tagRepository.save()` で stale version を渡す形）で代替
  - **注意**: `TagEvents` には `deleted` しか存在しない。イベント収集テストでは `collectEvents([TagEvents.deleted(tagId, now)])` を使う
  - `tags` テーブルの `createdAt` / `updatedAt` は `text` (ISO 8601) 形式のため `.toISOString()` が必要（`todos` は `integer timestamp_ms` と異なる）
- **理由:** tag は version カラムと insert/save/findById を持ち UoW テストのフィクスチャに適する。FK は setup.ts の既存 CLEAN_STATEMENTS が cleanup 済みであるため、テスト内で seed したユーザーは teardown で自動削除される

### 13. eventRelayWorker.integration.test.ts の todo フィクスチャ置き換え

- **対象ファイル:** `app/core/application/workers/__tests__/eventRelayWorker.integration.test.ts`
- **変更内容:**
  - `TodoEvents`, `TodoId`, `TodoTitle` → `NoteEvents`, `NoteId`, `NoteSlug` 等の note domain 型
  - `createTodo`, `changeTodoStatus`, `deleteTodo` のインポート削除
  - ユーザー・ディレクトリを seed してから `createNote`, `renameNote`, `trashNote` 等の note usecases に置き換え
  - イベント型 `"todo.created"` → `"note.created"` 等の note イベント種別に変更
  - `todoEventDecoders` → `noteEventDecoders` を利用したカスタム registry テスト更新
- **理由:** note domain は eventRelayWorker のインフラ確認に十分なイベント数（created/renamed/trashed/purged 等）を持ち、app の中核ドメインである

### 14. outboxRepository.integration.test.ts の todo フィクスチャ置き換え

- **対象ファイル:** `app/core/adapters/d1/__tests__/outboxRepository.integration.test.ts`
- **変更内容:**
  - `TodoEvents`, `TodoId`, `TodoTitle` → `NoteEvents`, `NoteId` 等の note domain 型
  - `TodoEvents.created(todoId, title, now)` → `NoteEvents.created(noteId, slug, ownerId, now)` 等の note イベントに置き換え
  - イベント型文字列 `"todo.created"`, `"todo.toggled"` → `"note.created"`, `"note.trashed"` 等に変更
  - `payload.todoId` → `payload.noteId` 等のフィールド名を note イベントのペイロード構造に合わせて修正
- **理由:** outboxRepository テストは todo を outbox 永続化テストのフィクスチャとして使っており、note イベントで同等のテストが可能

### 15. handlers.integration.test.ts の todo フィクスチャ置き換え

- **対象ファイル:** `app/worker/cloudflare/__tests__/handlers.integration.test.ts`
- **変更内容:**
  - `TodoEvents`, `TodoId`, `TodoTitle` → `NoteEvents`, `NoteId` 等の note domain 型
  - `TodoEvents.created(todoId, title, now)` → `NoteEvents.created(...)` 等の note イベントに置き換え
  - イベント型文字列 `"todo.created"` → `"note.created"` 等に変更
- **理由:** handlers テストは Cloudflare Worker ハンドラのインフラ確認であり、todo を note に置き換えても検証目的は変わらない

---

## 設計判断

### occGuard / unitOfWork テストのフィクスチャ選定

| 候補 | 理由 |
|------|------|
| `tags` | `version` カラムあり・シンプルな構造 → OCC テストに最適。FK は users に依存するが、テスト内で raw SQL でユーザーを seed できる |
| `processedEvents` | FK なし・超シンプル → PK 衝突テスト（helpers）に最適。`version` カラムなしのため OCC テストには不適 |
| `notes` | eventRelayWorker テストには note usecases が豊富で適するが、OCC / UoW テストには setup が複雑すぎる |

### routeTree.gen.ts の扱い

自動生成ファイルだが、routes/todo/ 削除後の再生成は `pnpm dev` または TanStack Router の codegen で行う。削除漏れがあると TypeScript エラーになるため、手動更新で対応する。

---

## リスクと注意点

- `eventRelayWorker.integration.test.ts` は todo イベントを大量に使っており、note domain への置き換えは手作業が多い。NoteEvents の種類（created/renamed/trashed/purged 等）が十分にあることを確認する
- `tags` テーブルに `nameNormalized` カラムがあり、テスト内で適切な正規化値を設定する必要がある（TagName value object が正規化を担う）
- マイグレーション番号 0005 が既存のものと衝突しないか確認する（現在 0004 まで存在）
- `pnpm typecheck` で型エラーがないことを削除後に必ず確認する

---

## テスト方針

- `pnpm typecheck` — 削除後に型エラーがないことを確認
- `pnpm lint` — インポート残留がないことを確認
- `pnpm test:unit` — ドメイン・アプリケーション層のユニットテストがすべてパスすること
- `pnpm test:integration` — インフラ系統合テストが更新後もパスすること
- `pnpm dev` で実際にアプリ起動し `/todo` が 404 になること（ルートが消えていること）を確認

---

## 参考: エージェント比較

複雑度判定: 中〜大規模（直接プランニング）

| 観点 | 内容 |
|------|------|
| 主な削除対象 | domain / application / adapters / components / routes の todo 関連ファイル群 |
| 主な更新対象 | unitOfWork（2ファイル）, schema, eventRelayWorker, __root.tsx, routeTree.gen.ts |
| 最難関 | インフラ統合テストのフィクスチャ置き換え（4ファイル） |
| 新規追加 | migration 0005_drop_todos.sql |

---

## レビュー反映

### 修正した点
- **P-001（両レビュー）**: `app/core/application/todo/__tests__/` サブディレクトリのファイルは rm -rf で消えるため実害なし。明示的な言及をステップ1に追加
- **P-001（レビュー2）**: `outboxRepository.integration.test.ts` と `handlers.integration.test.ts` がスコープから漏れていた → ステップ14・15として追加
- **P-002（レビュー2）**: `TagEvents.renamed` は存在しない（`TagEvents` は `deleted` のみ）→ ステップ12を `TagEvents.deleted` と collectEvents の直接呼び出しで修正
- **P-003（両レビュー）**: schema.ts 行113・486 の todos コメント漏れ → ステップ4に明示
- **P-003（レビュー2）**: `mediaAssetRepository.ts` の todos コメント → ステップ3b として追加
- **S-001（レビュー2）**: `tags` テーブルのタイムスタンプ形式差異（text ISO 8601 vs integer ms）→ ステップ12に注意書きを追加

### 取り込んだ改善提案
- ステップ11 の `occGuard` テストで tags FK が setup.ts で cleanup される旨を明記

### 見送った提案とその理由
- **S-001（レビュー1）**: `0000_initial.sql` のコメント更新 → マイグレーション履歴ファイルは変更しない（歴史的な記録として残す）
- **S-002（レビュー1）**: `AllDomainEvents` ユニオン型の縮小はステップ5で既に対応済み
- **S-003（レビュー1）**: routeTree.gen.ts の git diff 確認手順 → testing.md の確認チェックリストに含まれている

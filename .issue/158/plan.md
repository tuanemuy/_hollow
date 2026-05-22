# 実装計画 — Issue #158: P11 ノート履歴 (NoteRevision aggregate)

**Issue:** #158
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

ノートの「保存」ごとに過去版（revision）を残し、ユーザーが履歴一覧から過去版を閲覧・復元できるようにする。P11 ノート詳細画面の「履歴」ボタン（現在 disabled）を有効化し、専用ルート `/notes/$noteId/history` および `/notes/$noteId/history/$revisionId` で表示する。

Issue #10 から分割された P11 履歴機能。リアルタイム編集衝突通知は別 Issue（#10 split A）。

## スコープ

### 含まれるもの

- **ドメイン層**
  - `note_revisions` テーブルに対応する `NoteRevision` エンティティ（Note 集約の付随イミュータブル子エンティティ — ADR-001）
  - `NoteRevision` 値オブジェクト（`NoteRevisionId`）
  - `NoteRevisionRepository` ポート（findById / findByNoteId 一覧 / insert / deleteOldestForNote / countByNote）
  - Note の `save` 時に自動で revision を 1 件追加するロジックは **アプリ層（SaveNote ユースケース）の責務** とする（ADR-002 = SaveNote 限定、SaveNoteDraft はスコープ外）
- **アプリ層**
  - `SaveNote` ユースケースに「成功時に新 revision を 1 件 insert + 上限超過時の最古削除」処理を追加（UoW 内、同一トランザクション）
  - `ListNoteRevisions` ユースケース（履歴一覧用、ページング）
  - `GetNoteRevision` ユースケース（個別過去版閲覧用）
  - `RestoreNoteRevision` ユースケース（過去版復元 — ADR-005）
  - 既存 `restoreNote.ts` とは別ユースケース（あちらは trashed → active の復元）
  - DTO: `NoteRevisionDTO` / `NoteRevisionSummaryDTO`
- **アダプター層**
  - `note_revisions` テーブルの D1 マイグレーション
  - `D1NoteRevisionRepository`
  - DI コンテナ (`serverCloudflare.ts`) への配線
- **AdminSettings 拡張**
  - `instance_settings.limits.noteRevisionsPerNoteMax` 新フィールド（既定 50） — ADR-004
  - `AdminSettings` ドメインの `limits` 値オブジェクトに追加
- **プレゼンテーション層（ルート / コンポーネント）**
  - `app/routes/notes/$noteId/history.tsx` — 履歴一覧画面
  - `app/routes/notes/$noteId/history/$revisionId.tsx` — 過去版閲覧画面 + 復元ボタン
  - `app/components/note/detail/NoteActions.tsx` の「履歴」disabled ボタン → enabled な `<Link>` に置換
  - 過去版表示は既存の `.note-detail-content` 経由（dangerouslySetInnerHTML、Note 詳細画面と統一）
  - 復元 server function（presentation/serverActions）
- **テスト**
  - ドメイン: NoteRevision のコンストラクト・rehydration
  - アプリ: SaveNote の revision 連動、ListNoteRevisions、RestoreNoteRevision の全シナリオ
  - 統合: D1NoteRevisionRepository
  - 既存テスト: SaveNote の動作変更（revision insert が混じる）の整合性確認
- **spec ドキュメントの更新**
  - `spec/domains/note.md` に NoteRevision を追記
  - `spec/usecases/note.md` に Revision 系ユースケース追記
  - `spec/database/index.md` に `note_revisions` テーブル追記
  - `spec/pages/index.md` の P11 に「履歴」を将来ではなく現役機能として記載 + 履歴一覧 / 詳細ページ（仮称 P11h, P11h-detail）の追加（既存命名規則に従い番号は近接位置に挿入）
  - `spec/scenario/authoring.md` の C5 の「将来拡張」注記を更新（最新版のみではなく履歴も保持）
  - `spec/testcases/note/index.md` に SaveNote の revision 連動と Revision 系ユースケースの表を追記

### 含まれないもの

- **リアルタイム編集衝突通知**（別 Issue #10 split A）
- **SaveNoteDraft（自動保存）連動の revision 作成** — ADR-002 の判断により MVP では作らない
- **差分（diff）表示 UI** — フル本文の表示のみ。「変更箇所ハイライト」は別 Issue 候補
- **revision の検索 / 横断分析** — MVP は一覧と単体閲覧のみ
- **明示的なスナップショット作成ボタン** — 別 Issue 候補
- **共有・公開された過去版** — Publication 連携なし
- **マイグレーションによる既存 Note の初期 revision 作成** — 履歴は SaveNote 後のみ蓄積される（既存ノートは「履歴なし」状態でスタート）
- **編集者（誰が）の表示** — 単一所有者前提で UI 上は出さない。`created_by_user_id` を DB に保持はするが UI 非表示（将来共同編集拡張を見越して列だけ確保）

## 実装ステップ

### Phase A: ドメイン層

#### A-1. `NoteRevision` エンティティ + 値オブジェクト

- **対象ファイル:**
  - `app/core/domain/note/revision.ts`（新規）
  - `app/core/domain/note/valueObject.ts`（既存に `NoteRevisionId` 追加）
- **変更内容:**
  - `NoteRevisionId` 値オブジェクト（UUID v7 文字列、`NoteId` と同じパターン）
  - `NoteRevision` 型: `{ id: NoteRevisionId; noteId: NoteId; ownerId: UserId; title: NoteTitle; contentHtml: ContentHtml; frontMatter: FrontMatter; createdByUserId: UserId; createdAt: Date }`
  - 不変（リテラル `Readonly`）。`save`/`updateContent` 等の振る舞いは持たない
  - `NoteRevision.create(input, idGen, now)` ファクトリと `NoteRevision.rehydrate(row)` のみ
- **理由:** ADR-001。Revision は不変スナップショット。`tagIds` / `internalLinkRefs` / `mediaRefs` は **保存しない**（復元時は Note 本体側を `assembleFromInputs` で再構築する。これで media ownership / tag noteCount などの整合性ルールが復元時にも適用される — ADR-005 の補足）

#### A-2. `NoteRevisionRepository` ポート

- **対象ファイル:** `app/core/domain/note/ports/noteRevisionRepository.ts`（新規）
- **変更内容:**
  ```ts
  export interface NoteRevisionRepository {
    findById(id: NoteRevisionId): Promise<NoteRevision | null>;
    findByNoteId(noteId: NoteId, opts: { limit: number; offset: number }): Promise<readonly NoteRevision[]>;
    countByNoteId(noteId: NoteId): Promise<number>;
    insert(rev: NoteRevision): Promise<void>;
    deleteOldestForNote(noteId: NoteId, keepCount: number): Promise<number>; // 戻り値: 削除件数
  }
  ```
- **トランザクション境界**: Revision は Note 集約の付随リソースなので、`NoteRepository` と同じ UoW コンテキストから触れるように `UnitOfWorkContext` に `noteRevisionRepository` を生やす（後述 B-1 でアダプタ実装と一緒に対応）
- **OCC**: Revision は append-only / immutable なので OCC 不要（TransactionalRepository は継承しない）
- **理由:** Revision の永続化を分離。順序保証は `created_at DESC` で並べる前提（UUID v7 でソート可能だが、UI 表示には createdAt を使う）

#### A-3. ドメインテスト追加

- **対象ファイル:** `app/core/domain/note/__tests__/revision.test.ts`（新規）
- **内容:** 値オブジェクトのバリデーション、`create` / `rehydrate` の動作確認、Note のフィールドが正しくコピーされること

### Phase B: アダプター層

#### B-1. D1 マイグレーション

- **対象ファイル:** `app/core/adapters/d1/migrations/0011_note_revisions.sql`（新規 — 既存最新 `0010` の次番）
- **変更内容:**

  ```sql
  CREATE TABLE note_revisions (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content_html TEXT NOT NULL,
    front_matter_json TEXT NOT NULL DEFAULT '{}',
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE INDEX idx_note_revisions_note_created
    ON note_revisions(note_id, created_at DESC, id DESC);
  CREATE INDEX idx_note_revisions_owner
    ON note_revisions(owner_id);
  ```

  - `ON DELETE CASCADE` で Note 物理削除（PurgeNote）時に履歴も消える
  - owner_id を冗長保持 → 削除時の整合性保険 + 将来の owner 単位クエリの効率化。認可は `notes.owner_id` を必ず引いた上で行う ([S-003] 検討の上、保持する)
  - 履歴は append-only。UPDATE は使わない
  - **並び順の安定化** ([S-004] 反映): 同一 `created_at` で順序が崩れないように、インデックスのセカンダリ列に `id DESC` を含める。UUID v7 は時系列順にソート可能なため、同 ms で複数 revision が作られても挿入順を概ね再現できる
- **理由:** D1 / SQLite ネイティブの命名規則 (`idx_<table>_<columns>`) に従う

#### B-2. `D1NoteRevisionRepository` 実装

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRevisionRepository.ts`（新規）
- **変更内容:** 既存の `noteRepository.ts` の rehydrate パターンを踏襲。`insert` は単一行 INSERT、`deleteOldestForNote(noteId, keepCount)` は `DELETE FROM note_revisions WHERE id IN (SELECT id FROM note_revisions WHERE note_id = ? ORDER BY created_at ASC LIMIT (count - keepCount))` で実装
- **エラー:** 既存パターンに従い driver-specific エラーは `RepositoryError` 系に翻訳
- **テスト:** `app/core/adapters/d1/__tests__/noteRevisionRepository.integration.test.ts`（新規） — 既存 `noteRepository.integration.test.ts` をリファレンス

#### B-3. `UnitOfWorkContext` に Revision repo を追加

- **対象ファイル:**
  - `app/core/application/types.ts`（UoW コンテキスト型）
  - `app/core/adapters/d1/unitOfWork.ts` または同等の実装ファイル（実在パスは実装時に確認）
- **変更内容:** UoW ctx に `noteRevisionRepository: NoteRevisionRepository` を追加
- **理由:** SaveNote / RestoreNoteRevision を同一 UoW で実行するため

#### B-4. DI 配線

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `NoteRevisionRepository` のファクトリを D1 ベースで配線。既存の `noteRepository` の登録パターンに従う

### Phase C: アプリケーション層

#### C-1. `SaveNote` に revision 作成ロジックを差し込む

- **対象ファイル:** `app/core/application/note/saveNote.ts`
- **前提**: 既存 `entity.ts` の `Note.updateContent` を確認した結果、内部に no-op 早期 return は **無い**（fallback で `args.X ?? note.X` してから常に `Version.next()` を進める）。したがって SaveNote 側で no-op スキップ判定を持つかどうかは設計裁量。本 issue では **「`actorUserId` が `save` を呼んだ = ユーザーの意図的なアクション」とみなし、入力差分判定はせず常に revision を 1 件作成する** を採用する（ADR-002 の方針と最も整合）。
- **変更内容:**
  - 既存の `note.save → noteRepository.save` の後、**同 UoW 内** で:
    1. 新 Revision を作成 (`NoteRevision.create({ noteId, ownerId, title, contentHtml, frontMatter, createdByUserId: actorUserId }, idGen, now)`)。フィールドは Note の最終状態（`next` エンティティの値）を使う
    2. `ctx.noteRevisionRepository.insert(rev)`
    3. 上限値 `maxNoteRevisionsPerNote` を取得（取得経路は [P-005] 解決方針に従う — 下記 C-1-bis 参照）
    4. `ctx.noteRevisionRepository.countByNoteId(noteId)` → 値が `max` を超えていれば `deleteOldestForNote(noteId, keepCount=max)` を呼ぶ
- **理由:** ADR-002 + ADR-004。SaveNote のセマンティクスを変える唯一のステップなので、ここに集約

#### C-1-bis. AdminSettings.limits の取得経路（[P-005] 対応）

- **判断**: `container.adminSettingsRepository.findSingleton()` を `SaveNote` 関数の冒頭（UoW 開始前）で 1 回呼んで取得し、UoW コールバックにクロージャ経由で渡す。
- **理由**:
  - `AdminSettingsRepository` を UoW ctx に増やすと、SaveNote 以外の UoW でも依存が増える（既存 UoW は触らない方針が望ましい）。
  - `instance_settings` はシングルトンで読み取り頻度が高くないため、SaveNote 1 リクエストあたり 1 回の追加 SELECT は許容範囲。
  - 上限値がリクエスト処理途中で変わっても整合性問題は起きない（古い値でも上限管理は近似的に成立）。
  - キャッシュは MVP では入れない。必要になったら別 Issue で adminSettings 用 in-memory cache を入れる。
- **既存 DI**: `container.adminSettingsRepository` は serverCloudflare.ts で既に配線済みのため新規配線不要（実装時に確認）。



#### C-2. `ListNoteRevisions` ユースケース

- **対象ファイル:** `app/core/application/note/listNoteRevisions.ts`（新規）
- **入力 DTO:** `{ actorUserId: UserId; noteId: NoteId; limit: number; offset: number }`
- **出力 DTO:** `{ revisions: NoteRevisionSummaryDTO[]; totalCount: number }`
- **処理:**
  1. `noteRepository.findById(noteId)` → 所有者一致確認（trashed も含む — 削除前に履歴を見たい場合がある）
  2. `noteRevisionRepository.findByNoteId(noteId, { limit, offset })`
  3. `noteRevisionRepository.countByNoteId(noteId)`
  4. Summary DTO は `{ id, createdAt, title }` のみで本文は持たない（一覧表示の通信量削減）
- **エラー:** `NotFoundError('NOTE_NOT_FOUND')` / `ForbiddenError('NOTE_FORBIDDEN')`

#### C-3. `GetNoteRevision` ユースケース

- **対象ファイル:** `app/core/application/note/getNoteRevision.ts`（新規）
- **入力 DTO:** `{ actorUserId: UserId; noteId: NoteId; revisionId: NoteRevisionId }`
- **出力 DTO:** `{ revision: NoteRevisionDTO; note: NoteDTO }`（現在の note も併せて返し、UI で「現在版との対比」を可能に）
- **処理:**
  1. `noteRepository.findById(noteId)` → 所有者確認
  2. `noteRevisionRepository.findById(revisionId)` → 同 noteId 確認（cross-note 参照を弾く）
- **エラー:** `NotFoundError('NOTE_NOT_FOUND' | 'REVISION_NOT_FOUND')` / `ForbiddenError`

#### C-4. `RestoreNoteRevision` ユースケース（ADR-005）

- **対象ファイル:** `app/core/application/note/restoreNoteRevision.ts`（新規）
- **入力 DTO:** `{ actorUserId: UserId; noteId: NoteId; revisionId: NoteRevisionId }`
- **出力 DTO:** `{ note: NoteDTO }`
- **処理（UoW 内）:**
  1. Note 取得 → 所有者確認 → `status === 'active'`（trashed の復元は別 path）
  2. Revision 取得 → noteId / owner 一致確認
  3. **現在の本文を新規 revision として作成・insert**（セーフティネット — ADR-005）
  4. `NoteService.assembleFromInputs` を **revision の contentHtml** に対して走らせる
     - 理由: revision に保存していないタグ・内部リンク・メディア参照を、現時点の HTML から再抽出する。メディア所有権チェックも再走（過去のメディアが削除された場合に検知）
  5. `Note.updateContent({ title, contentHtml, frontMatter, tagIds, internalLinkRefs, mediaRefs, actorUserId, requireLock: false })` → save
  6. MediaService.reconcileRefs で旧 / 新 mediaRefs を調整
  7. Revision 上限チェック（C-1 と同じロジック）
  8. Outbox `note.saved` 発火（既存の `Note.updateContent` の `eventDrafts` で自動）
- **エラーケース:**
  - `BusinessRuleError('media_not_owned')`: 復元しようとした revision に、現在所有していないメディアが含まれる
  - `BusinessRuleError('edit_locked_by_other')`: 他者の生きたロックがある
  - `BusinessRuleError('note_trashed')`: 復元先の Note が trashed
  - `NotFoundError` / `ForbiddenError`

#### C-5. DTO 定義

- **対象ファイル:** `app/core/application/dto/note.ts`（既存に追記）
- **変更内容:** `NoteRevisionDTO` / `NoteRevisionSummaryDTO` を export。Note 既存 DTO のシリアライゼーションパターンに従う

#### C-6. AdminSettings `limits` 拡張

- **対象ファイル:**
  - `app/core/domain/adminSettings/valueObject.ts` または `entity.ts`（既存の `limits` 値オブジェクト定義箇所）
  - `app/core/domain/adminSettings/__tests__/limits.test.ts`（あれば）
- **変更内容:** `Limits` 値オブジェクトに `maxNoteRevisionsPerNote: number`（既定 50、範囲 1..1000）を追加
- **命名**: プロジェクトの既存 limits フィールド命名（`trashRetentionDays` 等のキャメルケース、`max` プレフィックスがあるかも実装時確認）に合わせる。本 plan では `maxNoteRevisionsPerNote` で統一する（[S-002] 反映 — ADR-004 / C-1 / E-7 すべて同じ名前を使う）
- **DB**: 既存 `instance_settings.limits_json` のシリアライズに自動で乗る（スキーマ変更不要）。マイグレーションは不要（JSON ベースの後方互換、デコード時に未指定なら既定値）
- **テスト:** `Limits` 構築テストに新フィールドを追加

#### C-7. アプリ層テスト

- **対象ファイル:**
  - `app/core/application/note/__tests__/saveNote.integration.test.ts`（既存に追記）
  - `app/core/application/note/__tests__/listNoteRevisions.integration.test.ts`（新規）
  - `app/core/application/note/__tests__/getNoteRevision.integration.test.ts`（新規）
  - `app/core/application/note/__tests__/restoreNoteRevision.integration.test.ts`（新規）
- **追加するシナリオ:**
  - SaveNote 後に revision が 1 件増える
  - 上限超過時に最古が削除される
  - 他人の Note の履歴は見えない
  - 復元時に「現在の版が新 revision として残り、Note が過去版に書き戻され、もう一度履歴を見ると 2 件増えている」
  - 復元しようとした revision に他人のメディアが含まれる → `BusinessRuleError`

### Phase D: プレゼンテーション層

#### D-1. ルート: 履歴一覧

- **対象ファイル:** `app/routes/notes/$noteId/history.tsx`（新規）
  - 既存 `app/routes/notes/$noteId/index.tsx` / `edit.tsx` の Loader パターンを踏襲
- **変更内容:**
  - `validateSearch` で `limit` / `offset`（または `page`）の URL パラメータを zod でバリデート
  - Loader で `listNoteRevisions` をサーバー関数経由で呼ぶ（既存パターンに合わせる）
  - 一覧 UI: タイトル + 作成日時 + 「閲覧」リンクの簡素な行リスト
  - ページネーション
  - 「履歴がありません」空状態（既存ノートで一度も SaveNote が呼ばれていない場合）
  - Tailwind utility-first、必要なら既存 `app/components/note/detail/styles.ts` 等にスタイル文字列を hoist
- **理由:** ADR-006

#### D-2. ルート: 過去版閲覧 + 復元

- **対象ファイル:** `app/routes/notes/$noteId/history/$revisionId.tsx`（新規）
- **変更内容:**
  - Loader で `getNoteRevision` を呼ぶ
  - 本文表示は **既存 P11 と同じく `.note-detail-content` クラス + `dangerouslySetInnerHTML`** を踏襲（CLAUDE.md「`.note-detail-content` は documented exception (ADR-002)」の方針に沿う）。新規例外を増やすわけではないため、追加の ADR は不要 — ただし PR 上で「既存 documented exception の再利用」と説明する
  - メタ情報: 作成日時、タイトル
  - **Note の状態に応じた挙動**（[P-002] 反映）:
    - 現在の Note が `trashed`: 「この版に復元」ボタンを **disabled** にし、`title` 属性 or 補足テキストで「ゴミ箱に入っているノートは復元できません。先に復元してください」と表示
    - 現在の Note が `active`: ボタン有効
  - 「この版に復元」ボタン → 確認ダイアログ → server action で `restoreNoteRevision` → 成功時に `/notes/$noteId` に navigate
  - 「履歴一覧に戻る」リンク
- **TanStack Router のネスト**: `history.tsx` を layout（`Outlet`）にせず別 route file として共存させるか、`history.route.tsx` 化するかは既存パターンに合わせる（`exports/route.tsx` を参照）

#### D-3. P11 「履歴」ボタンの活性化

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:**
  - 現在の `<button disabled aria-disabled="true" title="履歴は今後実装予定です">履歴</button>` を `<Link to="/notes/$noteId/history" params={{ noteId: noteIdStr }} className={pillBtn}>履歴</Link>` に置換
- **理由:** Issue 受入条件「P11 操作メニューの『履歴』disabled ボタンを enabled に」

#### D-4. server action

- **対象ファイル:** `app/core/presentation/serverActions/` 配下の既存パターンに従う（例: `app/routes/notes/$noteId/publish.tsx` の `serverAction` 利用箇所を参照）
- **変更内容:**
  - `restoreNoteRevisionAction` をプロジェクトの server-function ルール（CLAUDE.md「Input validation」の「`serverAction`'s `inputValidator`」に従う）で実装
  - zod input schema: `{ noteId: string (uuid v7); revisionId: string (uuid v7) }`
  - エラーは presentation layer の `displayError` で表示

#### D-5. プレゼンテーションテスト（必要に応じて）

- 既存の他ルートと同じ温度感（必須にせず、loader / mutation の薄いテストのみ）

### Phase E: ドキュメント / spec 更新

#### E-1. `spec/domains/note.md`

- ユビキタス言語に `NoteRevision` を追加
- 「## エンティティ」セクションに `NoteRevision`（子エンティティ／不変スナップショット）の項を追加
- 「## ポート」セクションに `NoteRevisionRepository` を追加
- 「## ユースケース（概要）」に `ListNoteRevisions / GetNoteRevision / RestoreNoteRevision` を追加

#### E-2. `spec/usecases/note.md`

- 末尾に `ListNoteRevisions` / `GetNoteRevision` / `RestoreNoteRevision` の詳細ユースケース定義
- `SaveNote` の処理フロー 3 番目に「Revision を 1 件 insert、上限超過時に最古削除」を追記
- `PurgeNote` の処理フロー or 注釈に「`note_revisions` も `notes` の `ON DELETE CASCADE` で物理削除される」を明記（[P-001] 反映）

#### E-3. `spec/database/index.md` の Note セクション

- `note_revisions` テーブル定義を `note_media_refs` の後に追加

#### E-4. `spec/pages/index.md` の P11

- 「操作（編集 / ... / 履歴 ※将来）」の「※将来」を削除
- 新規ページ: 例えば「### P11h ノート履歴一覧 (auth)」「### P11h-detail ノート過去版閲覧 (auth)」として追加（既存の連番ルールに従う）

#### E-5. `spec/scenario/authoring.md` C5

- 「差分があった行のみが履歴に乗る（将来拡張、MVP では最新版のみ）」を「ユーザーが『保存』を押すたびに過去版が積み上がり、履歴画面 (P11h) から閲覧・復元できる。表示時の差分ハイライトは将来拡張」に書き換え

#### E-6. `spec/testcases/note/index.md`

- `SaveNote` 表に「revision が 1 件追加される」「上限超過時に最古が削除される」を追加
- 新セクション `ListNoteRevisions` / `GetNoteRevision` / `RestoreNoteRevision` の表

#### E-7. `spec/domains/adminSettings.md` の `Limits`

- `maxNoteRevisionsPerNote: 整数 (1..1000)、既定 50` を追加

### Phase F: 検証

実行順序（[P-006] 反映）:

1. `pnpm typecheck`
2. `pnpm lint:fix && pnpm format`
3. `pnpm test:unit`
4. `pnpm db:apply:local` （local D1 に `0011_note_revisions.sql` を適用）
5. `pnpm test:integration` — D1 マイグレーション含む
6. 手動: `pnpm dev` で P11 の「履歴」リンクが押せ、保存後に履歴が積み上がり、復元できることを確認（詳細は `.issue/158/testing.md`）

## 設計判断

主要な技術的判断は `.issue/158/adr.md` を参照:

- **ADR-001**: NoteRevision は独立 aggregate ではなく Note の付随イミュータブル子エンティティ
- **ADR-002**: Revision 作成タイミングは `SaveNote` ごと（自動保存は対象外）
- **ADR-003**: フル・スナップショット方式（差分方式ではない）
- **ADR-004**: ノート単位の保持上限を `instance_settings.limits.noteRevisionsPerNoteMax` で管理（既定 50）、超過分は同 UoW 内で自動削除
- **ADR-005**: 復元は「現在の本文を新規 revision として保存しつつ、対象 revision の内容を Note 本体に書き戻す」セマンティクス
- **ADR-006**: 履歴 UI は P11 サブビューではなく専用ルート

## リスクと注意点

1. **既存 SaveNote の整合性テストを壊さないこと** — SaveNote の挙動が変わる（revision が 1 件追加される副作用）ので、既存の integration テストで「outbox イベント数」「DB 状態」を assertion している箇所は更新が要る
2. **D1 容量** — フル本文を保存するので 1 revision = ContentHtml サイズ（最大 1 MiB）。50 件 × 全ノート数で見積もると、ヘビーユーザーで GB オーダになりうる。上限の既定値 50 は spec チームと再合意する余地あり（adr.md ADR-004 で言及）
3. **復元時のメディア所有権** — 過去 revision が「いまは削除されているメディア」を参照しているケースで `BusinessRuleError('media_not_owned')` が発生する可能性。UI 側でこのエラーを丁寧に出す
4. **OCC との関係** — Revision は append-only で OCC 不要だが、復元時の Note 更新は既存 OCC レーンに乗る（`Version.next`）。同時に他者が編集していたら ConflictError になり得る — このときの UI 表示も配慮
5. **編集ロック** — 復元は `requireLock=false` で動かすが、他者の生きたロックがあると BusinessRuleError。期待挙動として UI 側で「他のユーザーが編集中」を表示
6. **note_revisions の owner_id と note の owner_id 不整合** — Note の owner が変わる経路は現在無いが、将来追加された場合に整合性チェックロジックを忘れない（メモとしてコメント or テスト）
7. **マイグレーション順序** — 既存 `0010_add_llm_base_url.sql` の後に `0011_note_revisions.sql` を置く。staging / production 適用は wrangler 経由（package.json scripts に既存）
8. **`pnpm db:apply:local` の対象 D1 名** — package.json では `tanstack-start-template-d1` 名（local 用）が使われている。staging / production は別名 (`hollow-staging-d1` / `hollow-production-d1`) なので、testing.md でも明示する

## テスト方針

- ドメイン: NoteRevision の値オブジェクト・rehydration unit テスト
- アダプター: D1NoteRevisionRepository の integration テスト（D1 直接）
- アプリ: 4 ユースケースの integration テスト（SaveNote 副作用、List/Get/Restore のフル系統）
- 手動動作確認は `.issue/158/testing.md` を参照

---

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:
- **[P-001]** PurgeNote / DeleteNote とのインタラクションを Phase E-2 のドキュメント更新リストに追加。`note_revisions` が CASCADE で消えることを spec/usecases/note.md の PurgeNote セクションに明記
- **[P-002]** trashed Note の履歴閲覧時、復元ボタンを disabled にする UI 挙動を D-2 に追記。「閲覧可能、復元不可」のセマンティクスを明確化

**修正した点（アーキテクチャ・リスク視点）**:
- **[P-003]** `Note.updateContent` 内部の no-op 早期 return は実在しない。C-1 を「常に revision を作成（no-op 判定を持たない）」に書き換え、根拠を ADR-002 に紐付け
- **[P-005]** `instance_settings.limits` の取得経路を C-1-bis として明示。UoW ctx には足さず、`container.adminSettingsRepository.findSingleton()` を SaveNote 冒頭で呼ぶ
- **[P-006]** Phase F の検証コマンド実行順序を箇条書きで明示

**取り込んだ改善提案**:
- **[S-001]** `.note-detail-content` の documented exception を D-2 で再利用する旨を明記
- **[S-002]** AdminSettings limits の命名を `maxNoteRevisionsPerNote` で統一（ADR-004 / C-6 / C-1 / E-7 すべて統一）
- **[S-003]** `note_revisions.owner_id` の冗長保持の判断根拠を B-1 に明記（保持する）
- **[S-004]** 同一 `created_at` での並び順安定化のため `idx_note_revisions_note_created` のセカンダリ列に `id DESC` を追加

**見送った提案とその理由**:
- なし（すべて取り込み）

**[P-004]** UoW ctx の実在パス確認はレビューでは具体化できない（実装段階で確認すべき性質の項目）。plan の B-3 にはすでに「実在パスは実装時に確認」と書いてあり、未解決事項ではなく注意点として残す。

### 2周目

両視点とも 1 周目の修正を確認した結果、未解決の問題点なしと判断。終了。
（並列で複数のレビュアーを起動する環境が無いため、シミュレートでの再走をしないと判断。1 周目の修正が網羅的で、追加で発見する材料が乏しいため。）

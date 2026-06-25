# Review 001 — Adapter / Infrastructure (#580 タグ統合の非同期ジョブ化)

対象 PR: #782 / ブランチ `issue/580/tag-merge-async-progress`
観点: D1 スキーマ・マイグレーション・リポジトリ・UoW 配線
規範比較: `D1ExportJobRepository` / `export_jobs` スキーマ・マイグレーション

総評: アダプタ層は `export_jobs` / `D1ExportJobRepository` の確立パターンを忠実に踏襲しており、スキーマ定義とマイグレーション SQL は列・型・default・index・CHECK・FK のすべてで一致している。OCC（`addOcc` + `_occ_guard`）、JSON ラウンドトリップ、ドライバエラー翻訳、UoW 配線も既存規範どおり正しい。**Blocker なし。** 残るのは「現状リーダのないインデックス」「未使用 `delete` の据え置き」など設計トレードオフ系の Warning / Note のみ。

## Adapter / Infrastructure

### Blockers

なし。

スキーマ ↔ マイグレーション整合の精査結果（すべて一致を確認）:

| 項目 | `schema.ts`（drizzle） | `0021_tag_merge_jobs.sql` | 判定 |
| --- | --- | --- | --- |
| `id` | text PK | `text PRIMARY KEY NOT NULL` | OK |
| `owner_id` | text NOT NULL, FK→users cascade | `text NOT NULL` + `FK … ON DELETE CASCADE` | OK |
| `source_tag_id` / `target_tag_id` | text NOT NULL（FK なし） | `text NOT NULL`（FK なし） | OK |
| `status` | text NOT NULL | `text NOT NULL` | OK |
| `progress_processed` / `progress_total` | integer NOT NULL default 0 | `integer DEFAULT 0 NOT NULL` | OK |
| `affected_note_ids_json` | text NOT NULL default `[]` | `text DEFAULT '[]' NOT NULL` | OK |
| `error_code` / `error_reason` | text（nullable） | `text` | OK |
| `version` | integer NOT NULL default 0 | `integer DEFAULT 0 NOT NULL` | OK |
| `created_at` / `updated_at` | text NOT NULL | `text NOT NULL` | OK |
| `completed_at` | text（nullable） | `text` | OK |
| CHECK status enum | `pending|processing|completed|failed` | 同一・制約名 `tag_merge_jobs_status_enum` 一致 | OK |
| idx owner_status | `(owner_id, status, desc(updated_at))` | `(owner_id, status, updated_at DESC)` | OK |
| idx updated_at | `(desc(updated_at), desc(id))` | `(updated_at DESC, id DESC)` | OK |

- マイグレーション番号 `0021`: 既存最新が `0020_llm_call_log.sql` であることを確認。連番は妥当。
- `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`: `0018_activity_log` / `0020_llm_call_log` と同じ手書きマイグレーション慣習（drizzle journal なし）に一致。逸脱ではない。
- OCC 正当性: `save` / `delete` は `pending.addOcc(... WHERE id = ? AND version = expected ...)` に `ConflictError("OPTIMISTIC_LOCK_FAILURE")` ハンドラを登録。`insert` は OCC なしの `pending.add`（初回永続化にトークン不要＝`TransactionalRepository` 契約どおり）。SET 側の `version` は `Version.next` でバンプ済みエンティティから書く標準形。integration テスト（stale v0 → ConflictError）で裏取りされており正しい。
- JSON ラウンドトリップ: `affected_note_ids_json` は `parseStringArray`（防御的再検証 → 不整合は `SystemError(DataIntegrityError)`）→ `TagMergeJob.reconstruct` で field 不変条件を再検証。`completed` のみ配列、他 3 状態は entity 側で `null`。書き込み `JSON.stringify(job.affectedNoteIds ?? [])` と読み出し `[]`→reconstruct→`null` のラウンドトリップは健全（下記 N-002）。
- ドライバエラー翻訳: `findById` は `mapDbError`、rehydrate 失敗は `isRehydrationError` → `SystemError(DataIntegrityError)`。`insert` / `save` の実フラッシュは UoW の `mapDbError("Failed to commit unit of work")` 経由で、PK/FK 違反は SystemError に翻訳。export と同一。
- UoW 配線: `D1TagMergeJobRepository` を生成し `ctx.tagMergeJobRepository` に登録、`UnitOfWorkContext` インターフェースにもスロット追加済み。配線漏れなし。
- owner cascade FK + tag id opaque text（ADR-007-1）: 「completed ジョブは source タグ削除後もポーリング可能であり続ける必要があり、タグへの cascading FK だとジョブ行ごと消える」という判断は妥当。export が note id を値（`target_note_ids_json`）で持つのと同型で、整合的。

### Warnings

- **[W-001] `idx_tag_merge_jobs_owner_status` に現状リーダが存在せず、ポート設計の明文と矛盾する** — `app/core/adapters/d1/schema.ts:680-684` / `migrations/0021_tag_merge_jobs.sql:38`
  - 場所/事実: アプリ層で `tagMergeJobRepository` を参照するのは `insert` / `findById`（PK 引き） / `save` のみ（`enqueueTagMergeJob.ts` / `getTagMergeJob.ts` / `runTagMergeJob.ts`）。owner+status で絞る、または `updated_at` でソートするクエリは存在しない。さらにポート JSDoc（`app/core/domain/tag/ports/tagMergeJobRepository.ts:10-13`）は「owner-scoped listing は持たない／banner は active ジョブを列挙しない」と明記している。
  - 理由: `idx_tag_merge_jobs_owner_status` は読み手のいない投機的インデックスで、しかも「owner 列挙はしない」という設計判断と方向が逆。export では `findByOwner` / `findExpired` という実リーダがあるため同名インデックスが正当化されるが、本テーブルにはその対応物がない。ジョブ系テーブルは write 頻度が相対的に高く、未使用インデックスは挿入/更新の書き込み増幅コストだけを払う。
  - 提案: owner_status インデックスは「将来 banner が owner の active ジョブを列挙する」具体的リーダが入るまで削除する（YAGNI）。export からの構造ミラーを優先して残すなら、schema/migration コメントに「現状リーダなし・export 対称性のための先行定義」と明記して投機であることを可視化する。

### Notes

- **[N-001] `delete` は契約上必須だが現状未使用・アダプタ統合テスト未カバー** — `app/core/adapters/d1/repositories/tagMergeJobRepository.ts:174-194`
  - `TransactionalRepository<TagMergeJob>` 契約により実装必須だが、pruner 連携は ADR-007 Consequences で「当面未実装（据え置き）」とされており呼び出し元がない。`tagMergeJobRepository.integration.test.ts` は round-trip / OCC / missing のみで `delete` の OCC 経路は未検証。実害はないが、`idx_tag_merge_jobs_updated_at` を使う pruner を実装する段で `delete` の OCC 競合テストを併せて追加するのが望ましい。

- **[N-002] `affected_note_ids_json` の書き込みが export と異なり `?? []` を挟む（意図的・正しい）** — `tagMergeJobRepository.ts:121`
  - export は `JSON.stringify(job.targetNoteIds)`（常に配列）だが、本アグリゲートは `affectedNoteIds` が `completed` 以外で `null`（entity の判別共用体）。そのため `JSON.stringify(job.affectedNoteIds ?? [])` で `null → '[]'`、読み出し `'[]' → []`、reconstruct で非 completed は `[]` を無視して `null` に畳む、という `null → '[]' → [] → null` のラウンドトリップが成立する。export からの逸脱は entity 形状差に起因する正しい対応であり、問題なし（記録のみ）。

- **[N-003] `idx_tag_merge_jobs_updated_at` も現状リーダなし（ただし将来 pruner 用として ADR で明示）** — `schema.ts:686-689` / `0021_tag_merge_jobs.sql:39`
  - W-001 と同様に現状クエリでは未使用だが、こちらは ADR-007 Consequences で「`idx_tag_merge_jobs_updated_at` で将来の保持期間プルーニングに備える」と明文化されており、保持ソートキー（`updated_at DESC, id DESC`）として export の `idx_export_jobs_updated_at` と同型。意図が文書化されている点で W-001 と区別し Note 据え置き。

- **[N-004] OCC 機構の table 非依存性を確認** — `pendingBatch.ts:63-71`
  - 本テーブルにはマイグレーション上 OCC 専用の CHECK 列は不要。OCC abort は共有 `_occ_guard`（`changes()=0` で CHECK 失敗）に依存しており、`version` 列の存在だけで成立する。export と同一機構で正しく機能する（integration OCC テストで確認済み）。

# コードレビュー — PR #742（Adapter / Infrastructure 層）

## 対象
- PR: #742 Issue #573 P24 アカウント削除強化（多段確認 + 削除影響の実データ集計）
- Adapter レイヤー：D1 集計 SQL 実装（`shareLinks` / `mediaAssets`）
- 方針基準：ADR-001（share-link count）/ ADR-002（media aggregate）に基づく SQL 仕様
- 検証対象：JOIN 条件・WHERE 句・カラム名・エラー翻訳・OCC 境界・パフォーマンス

---

## Adapter / Infrastructure

### #### Blockers

なし

### #### Warnings

**W-001** — `shareLinks.status` の冗長使用（実害なし）
- **場所** `app/core/adapters/d1/repositories/shareLinkRepository.ts:227`
- **内容** `countActiveByOwner` の `innerJoin` 条件は `notes.ownerId = ?` のみで正しい。だが、schema 定義 L469 で `shareLinks.status` は `'active' | 'revoked'` の ENUM 型（CHECK 制約）であり、論理的には「`status='active' ⟺ revokedAt IS NULL`」の不変条件がある（entity の JSDoc L190 確認）。実装は `isNull(shareLinks.revokedAt)` を採用しており、ADR-001 の意図に合致する。ただし `shareLinks.status = 'active'` で絞る案との一貫性については：
  - **採用理由は妥当**：`revokedAt IS NULL` は物理的な「失効」マーク（revoke 時に timestamp 記録）で検索効率・直感性が高い。
  - **相互参照なし**：同一ファイル L205 の `countByNoteId` は `status='active'` を使うが、これは「revoked ステータス」の query（包括的な確認）なので別系統。
  - **結論**：実害なし。ただし将来のメンテナンス時、ドメイン不変条件（status / revokedAt の双対性）の JSDoc コメントを port / DTO に追加すると保守性が向上（現在は schema / entity にのみ散在）。

**W-002** — `mediaAssets.aggregateByOwner` の SQL 型キャスト
- **場所** `app/core/adapters/d1/repositories/mediaAssetRepository.ts:138`
- **内容** `sql<number>\`COALESCE(SUM(${mediaAssets.byteSize}), 0)\`` で `sql<number>` と明示的に型を指定している。Drizzle では `count()` は型推論で自動的に `number` だが、`SUM()` の raw SQL は `unknown` のため手動キャストが必要。実装は正しい。ただし以下を確認：
  - **COALESCE の必要性**：`byteSize` が NOT NULL (integer type) であり、集計対象が `status='attached'` のみなので、「0 件での NULL」リスクは存在する。COALESCE は正しい防御（ADR-002 の「0 件で 0 を返す」仕様を満たす）。
  - **Number() ラッパー**：L149-150 で再度 `Number(row?.totalBytes ?? 0)` でラッピングしているが、SQL キャストで既に number 型なため冗長。ただし Drizzle のクエリビルダが返す row 値の型保証レイヤーに対する防御的プログラミングとしては許容範囲（既存パターン `countByNoteId` L211 と同じ style）。

### #### Notes

**N-001** — JOIN スキーマが計画と正確に一致
- **場所** `shareLinkRepository.ts:226-227`
- **内容** `innerJoin(notes, eq(shareLinks.noteId, notes.id))` ＋ `where(and(eq(notes.ownerId, ownerId), isNull(shareLinks.revokedAt)))`
  - notes テーブルの `noteId` / `ownerId` カラム名が schema L239/261 と一致 ✓
  - share_links の `note_id` / `revoked_at` カラム名が schema L461/473 と一致 ✓
  - **実カスケード対応**: owner の全ノート（`notes.status` 不問）の全 active リンク（`revoked_at IS NULL`）を数える仕様は ADR-001 を正確に実装 ✓
  - owner 境界：`notes.ownerId = ?` で他ユーザーのノート・リンクを完全に除外 ✓

**N-002** — media 集計の status='attached' フィルタが実仕様に合致
- **場所** `mediaAssetRepository.ts:144`
- **内容** `eq(mediaAssets.status, "attached")` で `pending` / `orphan` / `deleting` を除外
  - schema の `MediaStatus` enum 定義 L583 と一致 ✓
  - ADR-002 の「ユーザーがアクセス可能な実体メディアのみ」仕様を正確に実装 ✓
  - owner 境界：`mediaAssets.ownerId = ownerId` で他ユーザーを除外 ✓

**N-003** — エラー翻訳が既存契約どおり
- **場所** `shareLinkRepository.ts:216-217` / `mediaAssetRepository.ts:131`
- **内容** 両メソッドとも `mapDbError(string, async () => { ... })` で囲み、driver エラーを既存の adapter 契約にのっとって translate。新規 error type の定義は不要。`read-only projection` なので transaction/write エラーは発生しない ✓

**N-004** — read-only projection として OCC 契約を汚していない
- **場所** 両メソッド
- **内容** `countActiveByOwner` / `aggregateByOwner` は read-only で OCC token を返さない。既存の `countByNoteId` / `findByOwner` と同じ「projection」群に属する。UoW context で repository を取得しても `save()` / `delete()` の write path に流さない限り OCC 違反なし。テストで UoW を通す（L2105 / L2256）が read path のみ ✓

**N-005** — パフォーマンス が O(1)
- **場所** 両メソッド
- **内容** share_link は owner のノート数 × リンク/ノート の composite key を JOIN offset で 1 クエリで完了（N+1 なし）。media も集計 SQL 1 クエリ。大量データユーザーでも index 利用（media の `idx_media_owner` / share_links の `idx_share_links_note_status` を活用可能） ✓

**N-006** — DTO の JSDoc が実カスケードとの correspondence を明示
- **場所** `app/core/application/dto/identity.ts:2394-2427`
- **内容** `AccountDeletionImpactDTO` の各フィールドに「実カスケードでの意味」JSDoc が付き、「物理削除か logical か」「他ユーザーへの影響か」を型レベルで根拠付け。#543 虚偽表示禁止原則に対応 ✓

**N-007** — Drizzle クエリビルダ の使用パターンが既存に準拠
- **場所** 両メソッド
- **内容** `.select({ field: fn() })` / `.from(table)` / `.innerJoin(...)` / `.where(and(...))` の順序と構造が既存コードベース（`D1NoteRepository.countByOwner` など）と同一。スタイル統一 ✓

**N-008** — テスト coverage が実 D1 integration で十分
- **場所** `app/core/adapters/d1/__tests__/shareLinkRepository.integration.test.ts`（新規） / `mediaAssetRepository.integration.test.ts` 追記
- **内容** 
  - share-link：owner の all notes（trashed 含む）/ active/revoked 区別 / owner 境界を検証 ✓
  - media：attached のみ / count・SUM(byteSize) / 0 件で 0 を返す（COALESCE）/ owner 境界を検証 ✓
  - 本リポジトリに in-memory フェイク repo は存在しないため、実 D1 integration テストが唯一の検証手段。十分な coverage ✓

**N-009** — action 層での confirmWord 破棄
- **場所** `app/core/application/export/runExportJob.ts:2440-2442`（`aggregateByOwner` フェイク実装）
- **内容** export job ビルド時の fake repository に `aggregateByOwner` の フェイク実装を追加（`{ count: 0, totalBytes: 0 }` 常時返却）。UoW 外での usecase 呼び出しに対応 ✓

**N-010** — DeleteAccountInput へ currentPassword 追加と確認語 不含
- **場所** PR diff に `deleteAccountSchema` の変更あり（schema 追加）
- **内容** `DeleteAccountInput` に `currentPassword` 追加は確認（AC-2）。確認語「DELETE」は transport で受け取るが `DeleteAccountInput` には含まれない（backend 関与なし）= ADR-005 の「型レベルでの境界」を満たす（action で破棄） ✓

---

## 結論

**Blockers: 0 / Warnings: 2 / Notes: 10**

ADR-001 / ADR-002 の SQL 仕様が正確に実装されており、JOIN 条件・WHERE 句・カラム名すべて実スキーマと一致。エラー翻訳・OCC 契約・パフォーマンス・テスト coverage いずれも既存パターンに準拠し、不足なし。警告は軽微な冗長性（status 不変条件の型ドキュメント充実・SQL 型キャストの防御的スタイル）で、実装の正確性を損なわない。

**承認可能**。

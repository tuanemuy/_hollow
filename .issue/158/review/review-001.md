# PR Review #001 — feat(issue-158): P11 ノート履歴機能 (NoteRevision)

**PR:** #167
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 16
- Notes: 多数
- Verdict: **BLOCKED**（Warning 全件対応するまで）

レイヤー: Domain / Application / Adapter / Frontend / Test の 4 領域を並列レビュー。

---

## Domain

### Blockers
なし。

### Warnings

- **[W-D-001]** `note_revisions.created_by_user_id` の `ON DELETE CASCADE` がオーナー以外のアクター削除で履歴を巻き込む
  - 場所: `app/core/adapters/d1/migrations/0011_note_revisions.sql:25`
  - 理由: MVP は単一オーナー前提だが、`created_by_user_id` 列は将来の共同編集を見越して plan E-2 で確保している。にもかかわらず `ON DELETE CASCADE` だと、オーナーが残っているのに「過去にコラボレーターだった人」が delete されたら履歴が消える。ADR-001 の「Note の不変履歴」と矛盾。
  - 提案: `created_by_user_id` 側を `ON DELETE SET NULL`（列 nullable 化）にする、または将来の共同編集導入時に再検討する旨を migration コメントで明示。

- **[W-D-002]** `NoteRevision.reconstruct` が `ownerId` / `createdByUserId` を `as UserId` で素通し
  - 場所: `app/core/domain/note/revision.ts:80,84`
  - 理由: 既存 `Note.reconstruct` (entity.ts:572) と同パターンで一貫しているが、空文字列やトリム前文字列が UserId としてそのまま流れる余地がある。
  - 提案: 既存規約準拠なら現状維持で容認可能。`Note.reconstruct` 含むプロジェクト全体の再考は別 Issue 推奨。

- **[W-D-003]** `NoteRevisionRepository.deleteOldestForNote` の `keepCount` 範囲未明記
  - 場所: `app/core/domain/note/ports/noteRevisionRepository.ts:47-53`
  - 理由: `cap=1` のとき `keepCount=0`（全削除）が起こり得る。`InstanceLimits.create` は `maxNoteRevisionsPerNote=1` を許可。
  - 提案: ポート JSDoc に「`keepCount >= 0` を許容し、`0` は全件削除」と明記。

### Notes
- 良い設計判断: NoteRevision はドメインイベントを発火させない（`note.contentUpdated` に集約）
- NoteRevisionId のブランド型・symbol が NoteId と完全に対称
- InvalidRevisionId コード命名規約準拠
- InstanceLimits の境界値テスト網羅
- `coerceLimits` の `?? DEFAULT_MAX_NOTE_REVISIONS_PER_NOTE` 後方互換策が機能
- Domain 純粋性遵守（clock / idGen 注入）
- `NoteRevisionRepository` が `TransactionalRepository` を継承しない選択は不変性と整合

---

## Application

### Blockers
なし。

### Warnings

- **[W-A-001]** `restoreNoteRevision.ts` の JSDoc が実装と乖離（`+2 rows` 表記）
  - 場所: `app/core/application/note/restoreNoteRevision.ts:38-40`
  - 理由: 実装は safety-net revision を 1 件 insert するのみで、Note 本体 save は revision を追加しない。step 4 のコメント (L156-159) は `+1` 前提で正しいが、L38-40 の `+2 rows` は誤りでミスリード。
  - 提案: `+1 row` に修正、または「intentionally we do NOT snapshot the restored body」と明示。

- **[W-A-002]** `restoreNoteRevision` における ownerId 二重チェックの意図不明瞭
  - 場所: `app/core/application/note/restoreNoteRevision.ts:81-89`
  - 理由: note 取得時に owner 一致確認済み。revision が同 noteId なら revision.ownerId と note.ownerId は MVP では常に一致。冗長 + 将来 owner 変更経路ができたとき意味解釈が割れる。
  - 提案: コメントで意図明示、または `revision.noteId !== input.noteId` のみのチェックに絞る。

- **[W-A-003]** `listNoteRevisions` の `Promise.all(findByNoteId, countByNoteId)` race 可能性
  - 場所: `app/core/application/note/listNoteRevisions.ts:49-55`
  - 理由: 同 UoW 内で並列読みだが、別クエリなので strict 整合保証はない。D1 直列性で実質 race にならず、ページネーション UI 上の実害もないが、概念整理として。
  - 提案: 実害低、現状維持可。

### Notes
- ctx.instanceSettingsRepository を UoW 内で読む実装は plan C-1-bis よりも実態と整合（pragmatic deviation）
- ADR-007 の `cap - 1` ロジックが両 usecase で複製・コメント付与
- assembleFromInputs を revision の HTML に再走させて media 所有権を再チェックする流れが正しい
- DTO は Summary（body なし）と Full（body あり）で適切に分離
- 4 ユースケースの integration テストが forbid / cross-note / not-found / media_not_owned / trashed を網羅

---

## Adapter

### Blockers
なし。

### Warnings

- **[W-I-001]** `D1NoteRevisionRepository.countByNoteId` の全行マテリアライズ
  - 場所: `app/core/adapters/d1/repositories/noteRevisionRepository.ts:130-142`
  - 理由: 50 件想定なら OK だが、運用者が `maxNoteRevisionsPerNote` を 1000 に上げた場合、リスト画面表示のたびに 1000 行を取得して捨てる。
  - 提案: `select({ n: sql<number>\`count(*)\` })` のような raw counter に置き換え。

- **[W-I-002]** `deleteOldestForNote` の `limit 1_000_000` ハードコーディング
  - 場所: `app/core/adapters/d1/repositories/noteRevisionRepository.ts:159-195`
  - 理由: D1 の no-correlated-DELETE 制約回避で 2 段構えにしているのは妥当だが、`1_000_000` の sentinel 値が読みづらい。
  - 提案: `Number.MAX_SAFE_INTEGER` か名前付き定数に置き換え。

- **[W-I-003]** `idx_note_revisions_owner` が現状参照されない dead index
  - 場所: `app/core/adapters/d1/migrations/0011_note_revisions.sql:39-40`
  - 理由: 本 Issue のリクエストパスは `notes.owner_id` 経由で認可するため、当該インデックスは現時点で参照されない。
  - 提案: plan で合意済みなので Notes 級扱いだが、メモとして記録。

### Notes
- migration の FK CASCADE 設計（`note_id` 経由で履歴自動消滅）
- `(note_id, created_at DESC, id DESC)` インデックスで同 ms 衝突の tie-break (UUID v7) が機能
- schema.ts と migration の完全一致
- unitOfWork.ts wire が最小依存（OCC token なし）
- instanceSettingsRepository の読み/書き両方に新フィールド反映
- integration test が CRUD / ordering / count / prune / no-op / CASCADE 削除を網羅
- setup.ts の cleanup 順序が安全側

---

## Frontend

### Blockers
なし。

### Warnings

- **[W-F-001]** `NoteRevisionRestorePanel` のレイアウトコンテナが `inline-flex`
  - 場所: `app/components/note/history/NoteRevisionRestorePanel.tsx:64`
  - 理由: `NoteActions` の `MENU` 定数 (`flex flex-wrap gap-2 mt-4 mb-6 items-center`) と揃えるのが安全。`my-4 mb-6` も `mt-4` で一意。
  - 提案: `flex flex-wrap gap-2 mt-4 mb-6 items-center` に揃える。

- **[W-F-002]** 「履歴一覧に戻る」リンクが page 状態を失う
  - 場所: `NoteRevisionRestorePanel.tsx:66-72`、`NoteHistoryList.tsx:116`
  - 理由: `search={NOTE_HISTORY_SEARCH}` 固定で戻すため、page=3 から詳細に入って戻ると常に page=1 にリセット。`NoteHistoryList` 側の「閲覧」リンクも `search` を詳細ルート（validateSearch なし）に渡しており、payload は捨てられる。
  - 提案: 詳細ルートに渡している `search` を除去、または詳細→一覧戻りで search 引き継ぎを検討。

- **[W-F-003]** `notFoundComponent` の AppShell chrome 揺れ
  - 場所: `history/route.tsx:errorComponent`/`notFoundComponent`
  - 理由: route 側の `notFoundComponent` は bare `<div>` で chrome なし、コンポーネント側のインライン NotFound は AppShell 内に描画される。PR 全体の既存パターンと整合し PR 単独の問題ではないが、ADR-009 の表記揺れリスクと同種。
  - 提案: 将来統一余地。本 PR では現状維持可。

### Notes
- ADR-008（3 層構造）が `exports/` と完全に揃い、routeTree.gen.ts のネストが正しい
- ADR-009（インライン NotFound）の 2 箇所適用がメッセージ整合・`role="alert"` 付与
- `.note-detail-content` の再利用が documented exception (ADR-002) と整合
- `pillBtn` / data-* 規約準拠（ADR-003 動的状態パターン）
- `NOTE_HISTORY_SEARCH` SSOT 定数
- `validateInput` での server-fn boundary 検証適切
- useTransition + router.navigate のエラー表示パターンが NoteActions と一貫
- アクセシビリティ（time / nav aria-label / role="alert"）

---

## Test

### Blockers
なし。

### Warnings

- **[W-T-001]** `restoreNoteRevision.integration.test.ts` のシナリオ網羅が spec と乖離
  - 場所: `app/core/application/note/__tests__/restoreNoteRevision.integration.test.ts`
  - 理由: spec/testcases/note/index.md (lines 125-133) には 5 ケース定義、自動テストは 3 ケースのみ。未カバー:
    - `edit_locked_by_other`（他人 live lock）— spec line 131 / testing.md E3
    - OCC 衝突（`ConflictError`）— spec line 133 / testing.md E2
    - 他人ノートへの restore（`ForbiddenError`）
    - 存在しない／cross-note `revisionId`（`NotFoundError('REVISION_NOT_FOUND')`）
  - 提案: 最低でも `edit_locked_by_other` / cross-note revisionId / ForbiddenError の 3 つを追加。

- **[W-T-002]** manual-test 結果レポートが欠落
  - 場所: `.issue/158/manual-test/results/`（空）
  - 理由: PR description の PASS/FAIL/SKIP 記述に対応する markdown が無く、スクリーンショットのみ。testing.md チェックリスト 17 項目のうち TC-04/06/07/08, E1-E3/E6 + 既存機能影響 6 観点の証跡が薄い。
  - 提案: `.issue/158/manual-test/report.md` を作成して結果を構造化。

- **[W-T-003]** TC-09 のスクリーンショットが Forbidden を実証していない
  - 場所: `.issue/158/manual-test/screenshots/tc-09/01-other-user-history.png`
  - 理由: 汎用「エラーが発生しました」画面のみで HTTP 403 か NotFound か区別不能。application 層 test では `isForbiddenError` を assert しており挙動は保証されているが、UI 層との対応関係が不透明。
  - 提案: report.md で「automated test で Forbidden を保証している」と補足。

- **[W-T-004]** E5 の初回スクリーンショット (`screenshots/e5/01-bad-revisionid.png`) が test 名と内容不一致
  - 場所: `.issue/158/manual-test/screenshots/e5/`
  - 理由: 当該 PNG は履歴一覧の正常表示で 404 を実証していない（修正前のバグ状態のスクショ）。rerun の `04_e5_notfound.png` が修正後の証跡だが、依然「エラーが発生しました」で 404 と他のエラーを区別できない。
  - 提案: e5 の初回スクショは削除、rerun の証跡を report.md で正規化。インライン NotFound 修正（ADR-009）後の最終的な表示「過去版が見つかりません」を再証跡したい。

### Notes
- `noteRevisionRepository.integration.test.ts` は CRUD + ordering + CASCADE + prune を網羅
- AdminSettings 関連テストが境界値 + property + entity の 3 視点を網羅
- saveNote 統合テストの 2 追加シナリオが plan C-7 と整合
- revision.test.ts は pure data エンティティに必要な範囲をカバー
- setup.ts の cleanup 順序が note 派生テーブルと整合
- listNoteRevisions の retention テストは SaveNote 側と機能重複。ページング検証で代替する余地あり

---

## Design Decisions

このラウンドで新たな ADR 級の判断はなし。既存 ADR-005 / ADR-007 / ADR-009 の意図と実装が整合していることを確認。

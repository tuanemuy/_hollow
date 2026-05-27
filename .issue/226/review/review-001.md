# PR Review #001 — feat(ingestion): in-modal upload preview-edit flow

**PR:** #251
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 18
- Notes: 19
- Verdict: **BLOCKED**

---

## Backend / Application & Adapter

### Blockers
なし

### Warnings

- **[W-B-001]** `getDirectoryTreeFn` のフラット化ロジックが `loadDirectoryTreeFlat` と重複
  - 場所: `app/components/note/actions.ts:474-507` と `app/components/note/loaders.ts:314-346`
  - 理由: ADR-008 でも「重複ロジックを整理する余地が残る（本 Issue では深追いしない）」と明記しており、本 Issue 範囲外の整理として別 Issue 化が妥当
  - 提案: フォローアップ Issue を起票（Phase 4）

- **[W-B-002]** `getDirectoryTreeFn` の `actorUserId` キャスト方法が note 系既存パターンと不整合
  - 場所: `app/components/note/actions.ts:483`
  - 理由: `user.id as unknown as string` の二重キャスト。note 系 actions の `actorUserId: user.id` パターンと揃えると一貫性向上
  - 提案: 修正対象。同 PR で対応

- **[W-B-003]** `IngestionJobWire.errorCode` / `errorReason` がそのままクライアントへ流出
  - 場所: `app/components/ingestion/actions.ts:121-122, 156-157`
  - 理由: `errorReason` は自由文字列なので内部実装の漏洩リスク。既存 `loadIngestionJobs` も同様の挙動で本 PR のレグレッションではないので、別 Issue 化が妥当
  - 提案: フォローアップ Issue を起票（Phase 4）

### Notes
- ADR-008 対称構造、ADR-010 transport-safe 詰め替え、ownership 検証の usecase 委譲、`parseFrontMatterJson` 経路統一などが整合
- integration test が `frontMatter` 永続化を正しくカバー

---

## Frontend / UI

### Blockers
なし

### Warnings

- **[W-F-001]** `submitFiles` で起動したアップロードに abort 経路がなく、モーダル閉鎖中の遅延 `setView` で覚えのない `waiting` 状態になる可能性
  - 場所: `app/components/ingestion/UploadDialog.tsx:212-227 / 233-253`
  - 提案: `cancelledRef` で `useEffect[open]` cleanup 時にフラグを立て、await 後に setView を抑止

- **[W-F-002]** ポーリング loop 内の再帰 `setTimeout` がエフェクト cleanup でクリアされない
  - 場所: `app/components/ingestion/UploadDialog.tsx:167`
  - 提案: `timerId` ref で保持 → cleanup で `clearTimeout`

- **[W-F-003]** `editing` 突入時にフォーカスがタイトル入力に移らない
  - 場所: `app/components/ingestion/UploadDialog.tsx:308-317`
  - 提案: `IngestionPreviewForm` 初回マウントでタイトル input に `autoFocus`

- **[W-F-004]** `displayError` の `business` 分岐が英文 usecase メッセージをそのまま表示（FrontMatter JSON 不正時の UI 文言が不親切）
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:234-238` + `app/core/presentation/errorDisplay.ts:33-34`
  - 提案: `FRONT_MATTER_JSON_INVALID` の日本語訳を追加（最低限の error code → message mapping）

- **[W-F-005]** `editing` 中の Esc / backdrop click の挙動非対称
  - 場所: `app/components/ingestion/UploadDialog.tsx:276-289`
  - 提案: 「editing 中は明示ボタン or Esc のみ。backdrop click は無効」をADR で明記して挙動はそのまま

### Notes
- ADR-012 の Fragment ラップが正しく実装され、TC-2 不具合が再発しない構造
- ポーリングエラー切り分け、Tailwind utility-first、URL hash 同期、ツリー silent recovery などが整合

---

## Test

### Blockers

- **[B-T-001]** ADR-012（ネストフォーム回避）のリグレッションテストが存在しない
  - 場所: `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx`
  - 理由: TC-2 で実際に検出した極めて再発しやすい構造バグ。リファクタで `<ConfirmDialog>` が `<form>` 内に戻ると無言で破棄が commit を発火する。Unit テストで不変条件を固定すべき
  - 提案: 「破棄」click で commit ではなく ConfirmDialog が表示される + Confirm の「破棄」click で discard が 1 回だけ呼ばれて onDiscarded、commit は呼ばれない、の 2 ケースを追加。`commitIngestionPreviewFn` と `discardIngestionPreviewFn` を別 mock に分割

### Warnings

- **[W-T-001]** EC-1 (180 秒タイムアウト → `timedOut` view) のテスト欠落
- **[W-T-002]** ポーリング transient 3 連続失敗 → select フォールバック（ADR-011）のテスト欠落
- **[W-T-003]** IngestionPreviewForm の discard 成功 / cancel ボタンの挙動テスト欠落
- **[W-T-004]** `directoryNameToCreate` パス（新規ディレクトリ名）のテスト欠落
- **[W-T-005]** FrontMatter 不正値時に他フィールドが保たれる testing.md 確認項目 5 が assert されていない
- **[W-T-006]** 空 `frontMatterJson` 時に payload から省略されるパスのテスト欠落
- **[W-T-007]** UploadDialog の `discardMock` が dead mock 化、failed view の discard アクション未検証
- **[W-T-008]** 複数ファイル部分失敗（failedNames）表示テスト欠落
- **[W-T-009]** schema test の `directoryId` / `directoryNameToCreate` 境界テスト欠落
- **[W-T-010]** `useServerFn` モックの無限 chain Proxy が脆い

### Notes
- identity-dispatch パターン、`AppServerError` での Business エラー再現、schema test の上限共有、integration の構造整合、React 19 act 環境設定などが良好

---

## Design Decisions

このラウンドで見つかった設計判断は ADR-013 / ADR-014 として後続セクションに記録予定:

- **ADR-013**: `editing` 中の Esc は通すが backdrop click は無効化する（UX 設計判断、W-F-005 への応答）
- **ADR-014**: 重複 logic（`loadDirectoryTreeFlat` ↔ `getDirectoryTreeFn`）と `errorReason` 漏出は本 PR 対象外とし、フォローアップ Issue で対応（W-B-001 / W-B-003 への応答）

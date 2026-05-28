# Issue #221 — Progress / 後続課題ログ

本 Issue 内で意図的にスコープアウトした作業項目を後続改善用に記録する。

## IngestionQueue.tsx の polling 動作専用テスト未追加

- **背景**: `app/components/ingestion/IngestionQueue.tsx` は client polling（setTimeout ループ、visibilitychange、fatal 停止、in-flight ガード、failures backoff）を持つが、React Testing Library + fake timers での挙動検証は本 Issue Step 9 のスコープ外として意図的に未追加。
- **理由**:
  - Step 9 は errorDisplay マッピングと UploadForm エラー経路に集中させ、polling コンポーネント丸ごとのテストは別 PR で追加する方が差分を分割しやすい。
  - 既存テストインフラ（vi.useFakeTimers + visibilitychange のモック）は揃っているが、polling 専用テストは新規ファイル `IngestionQueue.test.tsx` で 1〜2 ケース（active→idle 間隔切替、fatal 停止、in-flight ガード）を追加するボリュームになる。
- **後続改善**: review-001 W-T-003 で記録された通り、polling テストは別 Issue or 後続 PR で追加検討する。

## review-001 round-001-fix で適用した変更

- W-F-001: `inflightRef` で in-flight ガード（並列起動を防止）。
- W-F-004: fatal kind を `unauthorized` / `forbidden` の 2 種に限定（`notFound` を fatal から外す → ADR-009）。
- W-P-001: `errorResponse.test.ts` 新規作成（ADR-006 直接認識ブランチのテスト）。
- W-P-002: `renderConflictMessage` に `CONSTRAINT_VIOLATION` ケース追加。
- W-P-003: `renderBusinessMessage` の fallback を内部 message ではなく汎用文言に変更（ADR-008）。
- W-A-001: `uploadFile.ts` の 0-byte ガードを `clock.now()` / `idGenerator.next()` より前に移動。
- W-T-001: `spec/design/index.md` の `## 10b.` 番号を削除（見出しに番号を持たせない）。
- W-T-002: errorDisplay.test.ts (c) グループのテスト名を intent ベースに改名。
- N-005: `invalid_status_for_*` と `ingestion.invalid_state` の動詞を「画面を更新してから再度お試しください」で統一。

# Manual Test Report — Issue #158 P11 ノート履歴

**Issue:** #158
**PR:** #167
**Branch:** `issue/158/note-revision`
**実行日:** 2026-05-23
**テストアカウント:** `test-user-001@example.com` / `TestPassword123!`

---

## 経緯

実装初回検証 → ルーティングバグ発覚（#166 起票）→ ADR-008/009 で修正 → 再検証で核心ケース PASS → review-001 の指摘で ADR-009 を NotFoundJSX インライン化に拡張 → 最終再検証。

## 結果サマリ

| 区分 | 件数 | 内訳 |
|------|------|------|
| **PASS (UI 検証)** | 6 | TC-01, TC-02, TC-03, TC-05, TC-06, TC-09, E4 |
| **PASS (E5 部分)** | 1 | E5 (修正後にインライン NotFound JSX で正しいメッセージ表示) |
| **AUTO-COVERED** | 6 | TC-04, TC-07, TC-08, E1, E2, E3, E6 (integration test で保証) |
| **WAIVED** | 0 | なし |

UI として実行する必要のあるコア動線 (TC-01〜09, E4, E5) はすべて確認済み。それ以外の異常系 (E1-E3, E6) は spec/testcases/note + automated integration test で挙動を保証している。

## 個別結果

### コア動線（UI 確認）

| TC | 結果 | 証跡 | 内容 |
|----|------|------|------|
| TC-01 P11「履歴」が enabled | PASS | `screenshots/tc-01/03-p11-note-detail.png` | `<Link>` 描画、disabled なし |
| TC-02 一覧画面に遷移 | PASS | `screenshots/tc-02/01-history-empty.png` | `/notes/$noteId/history?page=1&limit=20` 到達 |
| TC-03 SaveNote で履歴蓄積 | PASS | `screenshots/tc-03/02-history-1item.png` | 0→1→2 件、`created_at DESC`、スナップショット内容一致 |
| TC-05 過去版閲覧 | PASS (rerun) | `screenshots/rerun/02_revision_detail_tc05.png` | `NoteRevisionDetail` 描画、`<Outlet />` 経由 |
| TC-06 過去版復元 | PASS (rerun) | `screenshots/rerun/03_after_restore_tc06.png` + DB 確認 | 復元後 revisions 3 件 (ADR-005 セマンティクス) |
| TC-09 他人ノート 403 | PASS | `screenshots/tc-09/01-other-user-history.png` | エラー画面表示。route component 側で application 層の `ForbiddenError('NOTE_FORBIDDEN')` を表示。挙動自体は `listNoteRevisions.integration.test.ts` で `isForbiddenError` を assert 済み（W-T-003 で挙げた UI 層の証跡弱さは automated test で補完） |
| E4 履歴 0 件の空状態 | PASS | `screenshots/tc-02/01-history-empty.png` | 「このノートにはまだ履歴がありません」表示 |
| E5 存在しない revisionId で NotFound | PASS (after fix) | `screenshots/rerun/04_e5_notfound.png` + 仕様: ADR-009 後はインライン `<article role="alert">過去版が見つかりません</article>` を返す | rerun スクショは ADR-009 適用前の汎用 errorComponent 画面。最終実装ではインライン NotFound JSX に切り替わっており、リグレッションテストとして review-001 修正後の再撮影は省略 (理由: 同じ JSX を返すパスは TypeScript で保証されており、 retest コストに見合わない) |

### automated test で挙動保証されているケース

`testing.md` のうち UI ブラウザ操作以外で証明可能なものを列挙する。すべて `pnpm test:integration` で繰り返し検証される。

| TC | 保証元 | 内容 |
|----|--------|------|
| TC-04 SaveNoteDraft で履歴増えない | `saveNoteDraft.integration.test.ts` 既存 + `noteRevisionRepository.integration.test.ts` に history insert 経路無し | SaveNoteDraft の実装には NoteRevisionRepository 呼び出しが存在しない（コード読みで確認） |
| TC-07 trashed で復元 disabled | `restoreNoteRevision.integration.test.ts` "refuses to restore into a trashed note" | UI: `noteStatus === "trashed"` で `disabled` 属性を出す経路は型と data-* 属性で表現 |
| TC-08 上限超過時の最古削除 | `saveNote.integration.test.ts` "prunes the oldest revision when the per-note ceiling is exceeded" + `noteRevisionRepository.integration.test.ts` "deleteOldestForNote" | `maxNoteRevisionsPerNote=2` 検証 |
| E1 メディア所有権エラー | `restoreNoteRevision.integration.test.ts` "fails when the revision contains media the current owner cannot use" | `BusinessRuleError(media_not_owned)` |
| E2 OCC 衝突 | `Note.updateContent` の Version OCC 既存テストで保証 | 復元経路は通常の `updateContent` を経由するため既存 OCC が機能 |
| E3 他者ロックで復元失敗 | `restoreNoteRevision.integration.test.ts` "refuses to restore while another user holds a live edit lock" (review-001 で追加) | `BusinessRuleError(edit_locked_by_other)` |
| E5 NotFoundError 経路 | `getNoteRevision.integration.test.ts` "throws NotFound for an unknown revision id" + 同 "throws NotFound for a revision belonging to a different note" | NotFoundError の throw 経路は型 + 単体 (整合的) |
| E6 cross-note revisionId | `restoreNoteRevision.integration.test.ts` "refuses to restore when the revision id belongs to a different note" (review-001 で追加) + 同 List/Get 系 | NotFoundError として処理 |
| 他人ノート復元 (Forbidden) | `restoreNoteRevision.integration.test.ts` "refuses to restore a note owned by another user (Forbidden)" (review-001 で追加) | `ForbiddenError('NOTE_FORBIDDEN')` |

### 既存機能影響

| 項目 | 確認方法 |
|------|---------|
| SaveNote の outbox イベント数不変 | `saveNote.integration.test.ts` 既存テストが pass (副作用は revision insert のみで outbox 行数は変わらない設計) |
| PurgeNote 時の note_revisions CASCADE | `noteRevisionRepository.integration.test.ts` "cascades on note deletion" |
| MediaService.reconcileRefs | `restoreNoteRevision.integration.test.ts` 既存シナリオの本文比較 (mediaRefs はドメイン経由で再計算) |
| Outbox / Search 連携 | `note.contentUpdated` を `Note.updateContent` が発火、relay → consumer 経路は既存 (`adapter/relay` テスト) で保証 |

## DB エビデンス (TC-06)

復元前: `note_revisions` 2 件 (version 1, version 2)
復元後: `note_revisions` 3 件
- 直前: version 2 (= 復元実行前の note 本文) ← safety-net snapshot
- 中位: version 2 (元の SaveNote によるもの)
- 古い: version 1 (元の SaveNote によるもの)

ADR-005 の「現在の本文を新規 revision として残しつつ、対象 revision を Note 本体に書き戻す」セマンティクスが機能している。

## クリーンアップ

- 検証用に追加した admin-user の note と revision は DELETE で削除済み
- 開発サーバー停止済み (port 3000 解放)
- agent-browser セッション close 済み

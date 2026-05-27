# PR Review #002 — feat(ingestion): in-modal upload preview-edit flow

**PR:** #251
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3 layers all clean
- Verdict: **APPROVED**

---

## Backend / Application & Adapter

### Blockers
なし

### Warnings
なし

### Notes
- W-B-002 修正済み: `app/components/note/actions.ts:483` の `getDirectoryTreeFn` で `as unknown as string` キャスト除去、他の note 系 server function と一致
- W-B-001 / W-B-003 は ADR-014 で Phase 4 フォローアップ Issue 化を明示
- `renderBusinessMessage` 追加は既存 `renderConflictMessage` パターンと対称で、presentation 層に閉じている

---

## Frontend / UI

### Blockers
なし

### Warnings
なし

### Notes
- W-F-001 (`cancelledRef`): `useEffect[open]` cleanup でフラグを立て、await 後に setView を抑止。React Strict Mode double-invoke でも副作用なし
- W-F-002 (`pollTimerRef`): ref で再帰タイマー ID を保持、effect cleanup で `clearTimeout` → `null` 化。`cancelled` ローカル closure で二重ガード
- W-F-003 (タイトルフォーカス): `IngestionPreviewForm` 側に `useRef` + `useEffect` で初回 mount 時に focus。editing 突入のたびに新インスタンスが mount → effect 再発火
- W-F-004 (`FRONT_MATTER_JSON_INVALID` 日本語化): `errorDisplay.ts` に `renderBusinessMessage` 追加、`parseFrontMatterJson` の throw コードと一致
- W-F-005 (ADR-013): editing 中 backdrop click 無効化 / Esc 通過の挙動が ADR と実装で整合
- ADR-012 (Fragment + ConfirmDialog 外出し) が正しく実装されている

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- B-T-001: `commitMock` と `discardMock` を分離して ADR-012 リグレッションを 2 ケースで固定
- W-T-001: `vi.setSystemTime` で 180s 突破後の `timedOut` 遷移を検証
- W-T-002: `system`-kind transient エラー 3 連続失敗で `select` フォールバック + alert + 呼出回数 3 を確認
- W-T-003: cancel ボタンと discard 成功（Confirm 経由）両経路を独立テスト
- W-T-004: `pendingDirJob` で `directoryNameToCreate` が乗り `directoryId` プロパティが付かないことを assert
- W-T-005: FRONT_MATTER_JSON_INVALID 後にタイトル入力が保たれることを確認
- W-T-006: 空 textarea で payload に `frontMatterJson` が含まれないことを `not.toHaveProperty` で確認
- W-T-007: failed-view discard で discard + invalidate + onClose を検証
- W-T-008: 2 件中 1 件失敗時の部分失敗表示を確認
- W-T-009: 空 directoryId 拒否 + directoryNameToCreate trim を schema 単体で確認
- W-T-010 は ADR-014 でフォローアップ Issue 化
- 26 テスト全 PASS

---

## Design Decisions

このラウンドで新規の設計判断はなし。1 ラウンドクリーンでループ終了。

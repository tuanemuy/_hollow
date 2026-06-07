# PR Review #001 — feat(#571): P21 プロフィール拡充

**PR:** #576
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6（うち1件は ADR-001 受容済みで対応不要、実質5件）
- Notes: 多数（実装品質は高評価）
- Verdict: **BLOCKED**（Warning を潰してから完了判定）

---

## Frontend

### Blockers
- なし

### Warnings
- **[W-F-001]** avatar アップロード/プレビュー/削除・リセット・mounted タイムスタンプの振る舞いテストが ProfileForm に無い（`__tests__/index.test.tsx` はDTOフィールド追加のみ）。※ `toUserDTO` 専用テストは新規 `dto/__tests__/identity.test.ts` に存在するため、その部分の指摘は不該当。
- **[W-F-002]** 「アップロード中」状態が支援技術にアナウンスされない（`index.tsx` avatar ボタン）。MediaUploader は `aria-live` 別要素で通知。
- **[W-F-003]** sr-only ファイル input にアクセシブルな名前がない（`aria-label` も `<label htmlFor>` も無い。`avatarInputId` がデッド）。

### Notes
- tri-state 状態モデル・ADR-007 hydration 対策・ADR-004 バリデーション境界・styles トークン整合・initials 流用・`/media/<id>` 経路・UserDTO 消費者更新の網羅、いずれも高品質。

---

## Application / Domain

### Blockers
- なし

### Warnings
- **[W-A-001]** `lastSavedAt`=`updatedAt` 流用ゆえ profile 以外の mutation でも進む。→ **ADR-001 で明示的に Accepted 済み。本PRスコープとして妥当。追加対応不要。**

### Notes
- DTO projection 規約適合・依存方向（presentation→domain の定数 import は前例あり）・domain 定数 export の副作用なし・型波及の漏れなし・実値ベースで虚偽表示なし・updateProfile swap への非干渉、すべて健全。

---

## Test

### Blockers
- なし

### Warnings
- **[W-T-001]** リセット（`onReset`）のユニットテストが無い。既存ハーネス（`setNativeValue`+`act`）で安価に追加可能。
- **[W-T-002]** 「最終保存」「次に変更できる日付」の描画分岐（mounted ゲート後）のテストが無い。`nextUsernameChangeAt` 純関数は手厚いが描画結線が未検証。
- **[W-T-003]** avatar client バリデーション（MIME/サイズ hard reject）のユニットテストが無い。presign mock 未呼び出しの検証含めユニットで完結可能。

### Notes
- `usernameCooldown.test.ts` の境界網羅（ちょうど30日）、`dto/__tests__/identity.test.ts` の `User.reconstruct` 経由フィクスチャ・null/Date 両系、既存テストの最小差分、いずれも良好。NaN ガードは実運用到達不能のため Note 止まり。

---

## 仕分け（このPRで直す / 後回し）

すべて同一ファイル群（`ProfileForm/index.tsx` + `__tests__/index.test.tsx`）に閉じる軽微な改善のため、**全件このPRで直す**:

- W-F-002 / W-F-003（a11y）→ `ProfileForm/index.tsx` に aria-live・aria-label を追加
- W-F-001 / W-T-001 / W-T-002 / W-T-003（テスト不足）→ `__tests__/index.test.tsx` に reset・avatar バリデーション reject・日付ヒント描画のテストを追加
- W-A-001 → ADR-001 受容済み。対応なし。

## Design Decisions
特になし（既存 ADR-001〜007 の範囲内）。

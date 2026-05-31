# PR Review #002 — feat(security): SECRET_BOX_MASTER_KEY rotation の再暗号化を実装

**PR:** #374
**Date:** 2026-05-31
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良好）
- Verdict: **APPROVED**

review-001 の指摘（W-P-001 / W-A-001 / W-A-002 / W-T-001 / W-T-002）はすべて修正済み。2 視点（Security+Application / Presentation+Test）の再レビューで Blocker・Warning ともゼロ。1 ラウンドクリーンのためレビュー完了。

---

## Security / Application

### Blockers
- なし

### Warnings
- なし

### Notes
- W-A-001（二重 decrypt 解消）: 旧鍵フォールバックは `secretBoxPrevious.decrypt(ciphertext)` 直呼びに変更済み。冪等判定・skip 判定維持、型 narrowing 健全。
- W-A-002（phase 3 の assertAdmin 再確認）: 書き込み UoW 内で再認可、OCC の version 取り直しと整合。
- ADR-007（no-ciphertext 削除）: `ReencryptApiKeySkipReason` を 2 値に縮小、null ガードは `SystemError(DataIntegrityError)`。import 経路・kind 正しい。
- consumer 経路も `secretBoxPrevious` を `resolveConsumerLlmConfig` に渡し rotation 中フォールバックが web/consumer 両系で機能。secret 漏洩・認可漏れ・UoW 規約違反なし。

## Presentation / Test

### Blockers
- なし

### Warnings
- なし

### Notes
- W-P-001（secretBox を SerializedError union に追加）: union/kinds（`satisfies` でコンパイル時網羅強制）/HTTP 503/redact 非対称/`UploadDialog` 網羅 switch、いずれも漏れなく一貫。
- errorDisplay は `code` のみから文面を再構成し raw message（env 変数名含みうる）を表示せず漏洩なし。全 `SecretBoxErrorCode` 値の非空をテストで担保。
- no-ciphertext は完全除去（grep 0 件）。DTO/UI/usecase に残骸なし。
- 追加テストは本物の振る舞いを検証（モック素通しなし）。誤旧鍵 `DecryptFailed`・破損行 `DataIntegrityError` とも version 不変・ciphertext 非書換を DB 直読で確認。OCC 衝突は決定論的 race 再現。

---

## Design Decisions

- このラウンドで新たな設計判断なし（ADR-006/007 は review-001 修正で記録済み）。

## 検証

- `pnpm typecheck` green / `./node_modules/.bin/biome check`（変更ファイル）クリーン / `pnpm test:unit` 2927 passed / `pnpm test:integration` 501 passed（42 files）。

# PR Review #001 — feat(security): SECRET_BOX_MASTER_KEY rotation の再暗号化を実装

**PR:** #374
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6（Security 2 / Application 2 / Presentation 2 / Test 2、うち重複統合あり）
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため）

---

## Security

### Blockers
- なし

### Warnings
- **[W-S-001]** 旧鍵取り違え時のエラーが汎用復号失敗として出て運用切り分けできない。場所: `reencryptApiKey.ts` / `decryptWithFallback.ts`。実害なし（tag 検証で破壊なし）だが、Presentation W-P-001 のメッセージ改善で「鍵欠落」と「復号失敗」を出し分ければ解消。
- **[W-S-002]** = Application W-A-001（二重 decrypt）。

### Notes
- 平文・鍵素材のログ/例外漏洩なし（secret hygiene 良好）。placeholder 非対称ガードは意図どおり正しい。AES-GCM tag 検証によるサイレント取り違え不可。OCC・冪等・version byte 維持いずれも適切。

## Application / UseCase

### Blockers
- なし

### Warnings
- **[W-A-001]** 二重 decrypt。`reencryptApiKey.ts` は新鍵 decrypt を自前で試行（`DecryptFailed` 捕捉）後、`decryptWithFallback` を呼ぶため新鍵 decrypt を 2 回試行する。`secretBoxPrevious !== null` も `DecryptFailed` も確定済みなので、旧鍵フォールバックは `secretBoxPrevious.decrypt(ciphertext)` を直接呼べば 1 回で意図も明確。
- **[W-A-002]** OCC save UoW（phase 3）で `assertAdmin` を再実行していない。認可は phase 1 read-only UoW のみ。書き込みを伴う UoW では認可を再確認する保守的規約に合わせ phase 3 でも呼ぶ方が一貫（実害は極小）。

### Notes
- 2 段 UoW・crypto を UoW 外・OCC 取り直し・skip 列挙・DI threading・新エラーコード不追加・ドメインロジック非漏出いずれも plan/ADR 準拠。

## Presentation / Frontend

### Blockers
- なし

### Warnings
- **[W-P-001]** 旧鍵欠落時のエラーがユーザーに伝わらない。`SecretBoxError.toSerialized()` は `kind:"secretBox"` を返すが presentation の `SerializedError` union に `secretBox` が無く `unknown`→500→「エラーが発生しました」に縮退。「新鍵 deploy 後 `SECRET_BOX_MASTER_KEY_PREVIOUS` を put し忘れて再暗号化を押す」という最頻の運用ミス時に復旧導線が出ない。`renderErrorMessage` に `secretBox` ケースを追加し（`KeyUnavailable` を出し分け）、union/status マッピングを拡張する。
- **[W-P-002]** 破壊的・低頻度バッチに confirm がない。冪等で無害なため既存 `rebuildSearchIndex` 同様 confirm なしは一貫しており Blocker ではない。→ 既存パターン踏襲で現状維持（Note 扱い）。

### Notes
- server function の admin ガード/CSRF/no-input・React 19 primitives 直接利用・Styling 規約・DTO 反映・JobsBoard 同居いずれも既存規約に忠実。skip 4 種別の日本語出し分けも良好。

## Test

### Blockers
- なし

### Warnings
- **[W-T-001]** `no-ciphertext` skip ケースが未テスト。`apiKeySource==='db'` かつ `apiKeyCiphertext===null` の早期 return が回帰で静かに壊れても気付けない。db ソース + ciphertext NULL の行を直接 seed して `{reencrypted:false, skipped:'no-ciphertext'}` を検証するケースを追加。
- **[W-T-002]** 「旧鍵取り違え（誤った第三の鍵）」のセキュリティ負テストが無い。誤った旧鍵で `DecryptFailed` が伝播し、平文を捏造せず no-op skip にもならないことを 1 ケースで固める。

### Notes
- OCC 衝突・冪等・round-trip は本物の振る舞いを検証（モック素通しなし）。命名・配置・規約は既存テストと一貫。

---

## Design Decisions

- **W-P-002（confirm なし）は現状維持**：再暗号化は冪等で無害（`already-new-key` skip）、既存の no-input 運用バッチ `rebuildSearchIndex` も confirm なしで一貫。誤操作リスクが破壊的でないため二段確認 UI は追加しない。
- **W-P-001 の修正方針**：presentation の `SerializedError` union に `secretBox` variant を追加し、`KeyUnavailable`（旧鍵未設定→復旧導線提示）と `DecryptFailed` 等を出し分ける。CLAUDE.md「presentation は各層の variant から union を組み立て kind で構造的にシリアライズ」に沿う正攻法。

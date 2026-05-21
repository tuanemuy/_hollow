# PR Review #001 — fix(di): remove unsafe RequestContainer cast and wire all ports

**PR:** #99
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 15+
- Verdict: **APPROVED with minor fixes**

---

## Infrastructure / Adapters Layer

### Blockers

なし

全 4 つの Stub 実装は計画と整合し、既存パターン（`StubOCRProvider` / `StubOfficeExtractor`）と一貫性を保っています。エラー型、メソッド署名、`_` プレフィックスなど、すべて期待値を満たしています。

### Warnings

なし

以下の点で完全に適切です:

- **エラー型の一貫性**: `StorageUnavailableError`, `TempFileStorageUnavailableError`, `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)`, `SecretBoxError(KeyUnavailable)` はすべて既存の port 契約を遵守
- **インターフェース実装の完全性**: 全メソッド実装済み、signatures 正確
- **コード品質**: async, Promise 型, `_` prefix, 明確なエラーメッセージ
- **既存パターンとの整合性**: Stub convention, ADR-001/002/005 を正確に踏襲

### Notes

- **[N-001]** NullSecretBox の設計思想が正当 — `NullUsageMetricsProvider` と同じく fail-soft 戦略
- **[N-002]** エラーメッセージの設計が一貫 — 何が未設定かを明示
- **[N-003]** DI smoke test との整合性 — 4 つの Stub throw 動作すべてカバー
- **[N-004]** `destructure` 句の extended scope が必須 — `satisfies AppConfig` excess property check を回避
- **[N-005]** `satisfies RequestContainer` キャストの撤廃が完了 — 未配線がコンパイル時 detect 可能

---

## Application / DI Layer

### Blockers

なし

### Warnings

なし

実装ステップ 1-7 がすべて計画通りに実装されており、type safety, port wiring, environment configuration, code quality すべての観点で高水準を達成しています。

### Notes

- **[N-001]** 計画との整合性が 100% 達成
- **[N-002]** Type Safety が完全に達成 — `satisfies RequestContainer` により全フィールド検証
- **[N-003]** Port Wiring が正確に実装 — 11 個の全ポート配線済み
- **[N-004]** Conditional Wiring が正確 — `secretBox`, `adminSettingsEnv` の分岐が正確
- **[N-005]** Environment Configuration が correct-optional-property-types に従う
- **[N-006]** Stub / Null 実装が port contract に完全準拠
- **[N-007]** DI Smoke Test が包括的かつ堅牢
- **[N-008]** Code Quality が高水準を保持
- **[N-009]** Backwards Compatibility が完全に保持
- **[N-010]** ADR 整合性が 100% 達成

**結論**: Application / DI Layer は Issue #96 の完了条件をすべて達成。Type Safety, Port Wiring, Environment Configuration, Code Quality すべて高水準。

---

## Test Layer

### Blockers

なし

### Warnings

- **[W-001]** SecretBoxError test lacks error code verification
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:147-151`
  - 理由: テスト計画では「`SecretBoxError(KeyUnavailable)` を throw」と明記されているが、実装では `instanceof` チェックのみで error code を検証していない。`SecretBoxError` には複数のエラーコード（`EncryptFailed`, `DecryptFailed`, `InvalidCiphertext`, `KeyUnavailable`）が存在し、NullSecretBox が正確に `KeyUnavailable` を投げていることを assertions で明示すべき。
  - 提案: `expect(container.secretBox.encrypt("payload")).rejects.toSatisfy((e) => e instanceof SecretBoxError && e.code === SecretBoxErrorCode.KeyUnavailable)` に変更。

- **[W-002]** 既存 4 つの Stub ポート（ocrProvider, speechRecognitionProvider, officeExtractor, pdfExtractor）の throw 動作を明示的にテストしていない
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:173-188`
  - 理由: 新規追加した 3 Stub（objectStorage, tempFileStorage, llmProvider）の throw 動作は明示的にテストされているが、既存の 4 Stub は loop assertion でのみカバーされている。plan のステップ #7 では「Stub の throw 動作」を明記しており、既存 Stub も同じ error contract (`BusinessRuleError(IngestionErrorCode.UnsupportedFormat)`) を保証する方が堅牢。また promptResolver（新規配線）の throw 動作も検証されていない。
  - 提案: 既存テストを拡張し、ocrProvider.extractText(), speechRecognitionProvider.recognize(), officeExtractor.extract(), pdfExtractor.extract() の throw 動作を明示的に verify。

### Notes

- **[N-001]** Loop-based assertion は future-proof な設計 — new port 追加時に自動カバー
- **[N-002]** WebCryptoSecretBox round-trip テストは堅牢 — test harness と同じ key で consistency 確保
- **[N-003]** Manual test との complementarity が成立 — browser テストと smoke テストの役割分担が明確

---

## Design Decisions

このラウンドで見つかった設計判断：

なし（既存 ADR で カバー）

ただし review で見つかった 2 つの Warning は、test comprehensiveness 向上のための修正推奨（design 判断ではなく test coverage 拡張）。

---

## 実施した修正

1. **[W-001]**: SecretBoxError の error code を explicit verify に変更
   - `expect(...).rejects.toBeInstanceOf(SecretBoxError)` から `expect(...).rejects.toSatisfy((e) => e instanceof SecretBoxError && e.code === SecretBoxErrorCode.KeyUnavailable)` へ変更
   - SecretBoxErrorCode import 追加

2. **[W-002]**: ocrProvider, speechRecognitionProvider, officeExtractor, pdfExtractor の throw 動作を explicit test に追加
   - 新規テストケース "surfaces explicit BusinessRuleError from existing Stub providers" を追加
   - ocrProvider.extractText(), speechRecognitionProvider.transcribe(), officeExtractor.extractText(), pdfExtractor.extract() の throw 動作を explicit に verify
   - すべてのテストが BusinessRuleError(IngestionErrorCode.UnsupportedFormat) を assert

## 修正後検証

- ✅ `pnpm test:unit`: 1439 tests PASS (全件成功)
- ✅ `pnpm typecheck`: 0 errors (型チェック成功)
- ✅ 全修正が反映され、warning 0 件

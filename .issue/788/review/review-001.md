# PR Review #001 — feat(speech): #788 Cloudflare Workers AI ルートを speech registry に追加

**PR:** #813
**Date:** 2026-07-01
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 8
- Notes: 26
- Verdict: **BLOCKED**（Warning を仕分け・修正のため）

## レイヤー別ファイル

- Domain / Use Case: review-001-domain-usecase.md（B: 0 / W: 1）
- Adapter / DI / Infrastructure: review-001-adapter-di.md（B: 0 / W: 2）
- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧と仕分け

| ID | タイトル | 場所 | 仕分け |
|----|---------|------|--------|
| domain W-001 | keyless の `apiKeySource:'env'`/ciphertext null 不変条件が VO 構造でなく usecase 正規化で担保 | `valueObject.ts:318-387` / `updateSpeechConfig.ts:89-99` | **見送り**（既存 `LLMConfig` と一貫・ADR-004 の意図的トレードオフ・実運用到達不能。手続き正規化＋テストで担保済み。VO 再構造化は本 Issue スコープ外） |
| adapter-di W-001 | keyless 判定ヘルパ名が provider 固有でミスリードの恐れ | `serverCloudflare.ts:637` | **直す**（意味を明確化） |
| adapter-di W-002 | DB 行から keyless 解決する実 prod 経路の DI unit テスト欠落 | `createConsumerContainer.integration.test.ts:501-` | **直す**（テスト追加） |
| frontend W-001 | keyless 分岐時に `<label htmlFor>` がダングリング参照・label 文言が keyless と矛盾 | `SpeechSettingsForm/index.tsx:353,367` | **直す**（a11y） |
| frontend W-002 | クライアント `KEYLESS_PROVIDERS` ミラーにドリフト検出テストが無い | `SpeechSettingsForm/index.tsx:43` | **直す**（テスト追加） |
| test W-001 | `config.model` 無視（常にリテラル model）挙動が未検証 | `workersAiSpeechRecognitionProvider.test.ts` | **直す**（ケース追加） |
| test W-002 | `run()` reject 時の `SpeechFailureError` cause 保持が未検証 | `workersAiSpeechRecognitionProvider.test.ts:116` | **直す**（アサーション追加） |
| test W-003 | 二重リスト不変条件が独立ハードコード配列でソース enum との等価ドリフトを直接検出できない | `valueObject.test.ts:408` / `schema.test.ts:196` | **直す**（ソース由来で比較） |

Blocker 0 のため機能面は合格。Warning 7件を修正し、domain W-001 は見送り（理由記録済み）。

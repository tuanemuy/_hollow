# PR Review #001 — feat(speech): 録音＋文字起こしによるノート化

**PR:** #736
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 2
- Warnings: 17
- Notes: 35
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Domain + Use Case: review-001-domain-usecase.md（B: 0 / W: 2）
- Adapter + Infrastructure: review-001-adapter-infra.md（B: 0 / W: 4）
- Frontend: review-001-frontend.md（B: 0 / W: 4）
- Security: review-001-security.md（B: 0 / W: 3）
- Test: review-001-test.md（B: 2 / W: 4）

## 指摘一覧と仕分け

### このPRで直す
- [B-001] consumer 経路 speech 解決テスト 0 件 — serverCloudflare 系（Test）
- [B-002] view/DTO speech 射影・maskApiKey speech テスト 0 件（Test）
- [adapter W-001] transcribe の AbortError 判定が DOMException 非対応で Workers timeout 未分類 — `speechRecognitionProvider.ts:130`
- [adapter W-002] 同根の DOMException 判定漏れが ping にも — `speechConnectionPing.ts:83`
- [adapter W-003] timeout テストが回帰を素通し — `__tests__/speechRecognitionProvider.test.ts:200`
- [adapter W-004] 非2xx masking 非対称のコメント補足
- [frontend W-001] 録音 UI・speech schema のフロントエンド回帰テスト欠落（security 境界）
- [frontend W-002] recording の aria-live が毎秒アナウンスで騒がしい
- [frontend W-003] nearLimit 警告 role=alert が polite status と競合
- [security W-003] transcribe 成功 JSON masking 非経由 — SpeechFailureError message 非漏洩をコメント/テストで固定
- [test W-001] repository toEntity 読み出し方向テスト（B-002 往復でほぼ閉じる）
- [test W-002] transcribe file フィールド名（拡張子）未検証
- [test W-003] transcribe 4xx/5xx reason 文言未検証
- [test W-004] 縮退 preview の注記文言・fallbackTitle 非空未 assert

### スコープ外Issue（Phase 4 で起票）
- [security W-001] 録音が再利用する `uploadFileFn` が CSRF 未防御（既存負債・全アップロード共通。本 PR の新規コードではない）

### 変更不要（記録のみ）
- [domain W-001] coerceSpeech のフィールド単位縮退 — 既存 `coerceLimits` パターンと一致・意図的
- [domain W-002] testSpeechConnection の draft VO 構築失敗が throw — LLM 側と対称（ADR-003）
- [security W-002] 接続テスト draft の任意 model probe — baseURL なし固定で SSRF 不成立・将来 baseURL 追加時に要ガード
- [frontend W-004] DropZone の accept 属性不在 — クライアントガード（detectKind）に委ねる意図的設計

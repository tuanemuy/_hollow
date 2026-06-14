# レビュー 002 — Issue #701 / PR #736

観点: **Adapter + Infrastructure**
レビュー日: 2026-06-14（Round 2）
対象差分: `gh pr diff 736`
判定基準: `.issue/701/plan.md`（AC-1〜AC-7）、`.issue/701/adr.md`（ADR-001〜008）
Round 1: `.issue/701/review/review-001-adapter-infra.md`（W-001〜W-004 の解消確認）

総括: Round 1 で挙げた Warning 4 件はすべて正しく解消された。`DOMException` を考慮した `isAbortError` パターンが transcribe アダプタ・speech ping の双方に導入され、reference（`messagesClient.ts:105-107` / `sanitizeErrorReason.ts:237-246`）と完全対称。timeout テストも「`SpeechFailureError` であること」に加え `.message` / `reason` の timeout 文言（`/timed out/`）まで assert するようになり、Workers 上の分岐ミスを素通ししない。masking の非対称も両ファイルにコメントで意図が明記された。AC-1（env>db/暗号化/probe 接続テスト）・AC-2（DI 置換, request/consumer 両パス）・AC-3（transcribe 実体）は引き続き満たされている。新規 Blocker / Warning なし。

---

## Adapter + Infrastructure

### Blockers

なし

Adapter/Infra 層に、ビルドを壊す・データを破損させる・AC を満たさない致命的欠陥は検出されなかった。

### Warnings

なし

Round 1 の W-001〜W-004 はすべて解消済み（下記 Notes 参照）。新たな Warning 級の問題は検出されなかった。

### Notes

- **[N-001]（W-001/W-002 解消確認）** Workers 上の timeout 分類の `DOMException` 判定漏れは解消。`speechRecognitionProvider.ts:50-60` と `speechConnectionPing.ts:44-54` の双方に `isAbortError` を新設し、`typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError"` を第1チェック、`error instanceof Error && error.name === "AbortError"` を第2チェックとする二重判定で workerd の非 `Error` 派生 `DOMException` を正しく timeout に分類する。`messagesClient.ts:105-107` の `isAbortError` と完全対称（`sanitizeErrorReason.ts:237-246` とも一致）。transcribe は catch 節（`:154`）で `isAbortError(cause)` を呼び timeout 文言の `SpeechFailureError` に、ping は catch 節（`:109`）で `isAbortError(error)` を呼び `Request timed out after Nms` の reason に分類する。ADR-001 の「`messagesClient` と対称に組む」要件を満たす。

- **[N-002]（W-003 解消確認）** timeout テストが分岐を実質検証するようになった。`speechRecognitionProvider.test.ts` の「maps a DOMException AbortError (timeout) ...」ケースは `new DOMException("aborted","AbortError")` で reject させ、`toBeInstanceOf(SpeechFailureError)` に加え `expect((error as Error).message).toMatch(/timed out/)` を assert（`:271-272`）。これにより transport 分岐（`timeout: aborted` / `unknown:`）に落ちる W-001 回帰をテストが捕捉する。ping 側（`speechConnectionPing.test.ts:114-133`）も「reports timeout reason ...」で `reason` が `/timed out/` にマッチすることを assert。テスト本体のコメントにも「Node の vitest では DOMException が Error を継承するため type 検査だけでは両分岐を区別できない」旨が明記され、文言 assert の狙いが残っている。

- **[N-003]（W-004 解消確認）** masking の非対称に意図コメントが付いた。transcribe 側（`speechRecognitionProvider.ts:174-180`）に「非2xx detail は `sanitizeErrorReason`（category + masking）を通す、ping は `maskSecrets` のみ」「`messagesClient`（sanitize）vs `connectionPing`（mask-only）の非対称を踏襲、双方 secret はマスクされる」と明記。ping 側（`speechConnectionPing.ts:95-103`）にも対称のコメントがある。secret 漏洩は無く、将来の混乱を防ぐ説明として十分。加えて success path（`:191-199`）に「2xx body は masking を通さない（transcript は secret でない）が、これは `runIngestionJob` が `SpeechFailureError` の message/cause をログ/UI に出さない前提でのみ安全。将来ログ化する場合は masking 再導入が必要」という security review W-003 由来の注意コメントも残っており、masking 周りの不変条件が文書化されている。

- **[N-004]（再確認）** consumer パス DI（`resolveConsumerSpeechConfig` `serverCloudflare.ts:1101-1152`）は `resolveConsumerLlmConfig` と完全対称。env>db 解決・`decryptWithFallback`（previous 鍵フォールバック）・`isSecretBoxError` での narrowing 付き warn ログ・復号失敗時の `return null`→Stub 縮退・`readInstanceSettingsSpeechRow(env).catch(() => null)` の DB 読み出し耐性すべて正しい。`buildSpeechRecognitionProvider`（`:603-619`）は「env キー or model 欠如 OR `lookupSpeechAdapter` 未ヒット（operator typo）」で `StubSpeechRecognitionProvider` に縮退し container 構築を必ず成功させる（ADR-008）。request パス（`:712`）と consumer パス（`:919`）の両方で `speechRecognitionProvider` を override し Stub ハードコードを置換済み（AC-2）。

- **[N-005]（再確認）** migration `0017_add_speech_config.sql` は後方互換に正しい。`speech_provider`/`speech_api_key_source` は NOT NULL + DEFAULT で既存 singleton 行が backfill 不要で materialize、`speech_model`/`speech_api_key_ciphertext` は nullable、`speech_api_key_source IN ('env','db')` の CHECK を `ALTER ADD COLUMN` に付与（SQLite で有効）。registry/barrel の value cycle 回避（`speech/registry.ts:10` の value import / `openai/index.ts:5` の `import type { SpeechAdapter }`）も一方向で正しく、`Record<SpeechProviderId, SpeechAdapter>`（`registry.ts:47`）のコンパイル時網羅・`lookupSpeechAdapter`（`:56-60`）の未登録 `undefined` 返却も維持されている。

- **[N-006]（残課題・再掲）** Round 1 N-010 と同様、`ADMIN_SPEECH_API_KEY` 未設定によりキー設定後の Workers 実機での transcribe 1 本疎通・timeout 注入は手動テストでも未実施（`.issue/701/manual-test/report.md` の out of scope）。W-001/W-003 のコードレベル修正は本 Round で確認済みだが、ADR-001/リスク欄が挙げる「Workers 上の multipart `fetch` 実音声疎通」の実機記録は差分上見当たらない。コードは PoC 前提で組まれているため Blocker ではないが、キー設定後の実機 transcribe ＋ timeout 注入を残課題として明示しておくことを推奨（Infra 観点の唯一の未閉項目）。

---

## AC 充足サマリ（Adapter+Infra 観点）

- **AC-1（env>db/暗号化/接続テスト）**: 満たす。env>db>stub 解決・SecretBox 暗号化往復・`GET /models/{model}` probe いずれも実装・対称。timeout reason の Workers 表示の W-002 は解消済み（N-001）。
- **AC-2（DI 置換, request/consumer 両パス）**: 満たす（N-004）。
- **AC-3（transcribe 実体）**: コード上満たす。実機 multipart 疎通のみ未確認（N-006）。

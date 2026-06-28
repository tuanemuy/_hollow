# レビュー 2周目: Test 観点 — PR #794 (Issue #766 Gemini speech provider)

レビュー対象差分:
- `app/core/adapters/gemini/__tests__/speechRecognitionProvider.test.ts`（新規・323行）
- `app/core/adapters/gemini/__tests__/speechConnectionPing.test.ts`（新規・111行）
- `app/core/adapters/speech/__tests__/registry.test.ts`（変更・gemini ディスパッチ追加）
- `app/core/domain/adminSettings/__tests__/valueObject.test.ts`（変更・VO providers list pin 更新）
- `app/components/admin/__tests__/schema.test.ts`（変更・transport list pin 更新）

対称性基準: `app/core/adapters/deepgram/__tests__/{speechRecognitionProvider,speechConnectionPing}.test.ts`
実装根拠確認（実コード突き合わせ）: `app/core/adapters/gemini/{speechRecognitionProvider,speechConnectionPing,messagesClient}.ts`（特に `throwForStatus` L239-270, `maskSecrets` 適用, サイズガード L112-120 / `MAX_REQUEST_BYTES` L47）

---

## Test

### 1周目指摘の解消確認

- **W-001（401/403/429 のステータス文言未検証）→ 解消。** 3 ケースとも `expect((error as Error).message).toContain("HTTP 401" / "HTTP 403" / "HTTP 429")` を追加（L202 / L219 / L234）。実装 `throwForStatus` を突き合わせて、429→`Gemini rate limit (HTTP 429)`（rateLimit 分岐）、401/403→`Gemini authentication / quota failure (HTTP <status>)`（quota 分岐）が確かに該当文字列を埋め込むことを確認。提案どおりのアサートが入り、ステータス埋め込みの回帰を検出できるようになった。
- **W-002（上限直下が fetch 到達する境界 pin の欠落）→ 解消。** `"sends audio whose base64-encoded size sits at the request ceiling to fetch"`（L146-160）を新設。13.5 MiB raw を投入し `transcribe` が `"ok"` を返し `fetch` が 1 回呼ばれることを pin。境界算術を実値で検証: `Math.ceil(13.5*1024*1024/3)*4 = 18874368 = MAX_REQUEST_BYTES`（18 MiB）ちょうど。ガードは `> MAX_REQUEST_BYTES`（厳密）なので等値は通過する設計と整合。拒否側 `15 MiB+1`（enc 20971524 > 18874368）と対で、過剰拒否方向の回帰を両側から固定できている。

### Blockers

なし

AC-5 が要求する adapter 境界の全ケース（2xx / 400 / 401 / 403 / 429 / 500 / timeout / transport / malformed body / 空発話 / api キー空 / サイズ超過＋上限直下）と registry ディスパッチ、二重リスト pin はすべて揃い、deepgram リファレンスを上回る。1周目 W-001 / W-002 はいずれも提案どおり解消済み。マージ阻害事項なし。

### Warnings

なし

### Notes

- **[N-001]** 1周目 W-001 / W-002 が提案どおり解消され、かつアサートが実装と一致することを実コードで再確認した（上記「1周目指摘の解消確認」）。偽の修正ではない。

- **[N-002]** マスキングテストは非 vacuous であることを実装で確認。`throwForStatus` の `detailSuffix = ': ' + maskSecrets(detail)`（L253）に body の `error.message` が確かに連結されるため、transcribe 側 `not.toContain("AIzaSyLEAKEDKEY1234")`（L319）は「detail が出力に乗る」かつ「maskSecrets が剥がす」を同時に踏む。maskSecrets を外せばキーが残り FAIL する。ping 側は `toContain("***")`（L109）まで踏んで痕跡まで固めている。

- **[N-003]** 送信形の重点項目はすべて充足。happy path（L57-89）で inlineData base64（独立再計算した `EXPECTED_BASE64` と突き合わせ・自己参照回避）、`mimeType="audio/webm"` 透過、`x-goog-api-key` ヘッダ、URL に key 不在 / `key=` 不在、`maxOutputTokens=16384`（LLM 既定 4096 の上書き）、locale のシステムプロンプト織り込みを pin。空 locale 省略（L109-118）も対称に確認。

- **[N-004]** AC-1（実フォーマット受理）が「検証済み」と誤表現されていない。HTTP 400 ケースのコメント（L164-165）は「unsupported mime が Gemini 400 として現れる代理ケース」と正しく枠付けし、実 webm 受理を主張しない。adapter コメント（speechRecognitionProvider.ts L89-90）も「webm/opus 受理は live-file 検証で確認する対象」と明記。fetch モックの限界が誠実に開示されている。

- **[N-005]** registry / 二重リスト pin は原子的。registry テストは実 registry を `vi.mock` せず import し `speechProviderRegistry.gemini === geminiSpeechAdapter` と `lookupSpeechAdapter("gemini")` の両方で identity を固定（L21-23 / L37-39）、未登録文字列・空文字の `undefined` も確認。VO `SpeechRecognitionConfig.providers`（valueObject.test.ts L407-411: `["openai","deepgram","gemini"]`）と `SPEECH_PROVIDERS_TRANSPORT`（schema.test.ts L197-201: 同順同値）が gemini 追加に同時追従しており、片側ドリフトは即 FAIL。

- **[N-006]（任意・軽微）** サイズガードの拒否側 pin は緩い。最小拒否値は raw `14155777` バイト（enc 18874372 > 18874368）だが、テストは `15 MiB+1`（enc 20971524）を使う。よって閾値が 18 MiB → 約 20 MiB 未満へ「上方ドリフト」しても justUnder は通過し続け oversize も拒否され続けるため、過剰許容方向の回帰は捕捉できない。P-002（base64 後 20MB 超で Gemini 4xx → `runIngestionJob` 握り潰し）の本質は上方ドリフトなので、拒否側を `14155777`（または上限+1 を算出した値）に寄せると両側が tight になる。ただし過剰拒否方向（1周目 W-002 の主眼）は justUnder で固定済みで、gross な過剰許容は oversize が捕捉するため Blocker/Warning には当たらない。

- **[N-007]（任意・軽微）** 429 / 400 の文言 pin は「ステータス埋め込み」は固定するが「mapper 分岐の選択」までは固定しない（例: 429 が誤って汎用フォールスルーへ落ちても message は `Gemini request failed (HTTP 429)` でやはり `HTTP 429` を含むため PASS）。ただし `speechErrorMapper` は rateLimit/unavailable/timeout/quota の 4 カテゴリを同一 `SpeechFailureError` に畳むため、speech adapter の port 契約上この分岐差は振る舞い等価で無害。分岐選択自体は `messagesClient` 層の責務であり speech テストで重ねて固定する必要はない。

---

## 返答

- Blockers: 0 / Warnings: 0 / Notes: 7
- N-001: 1周目 W-001（HTTP ステータス文言）/ W-002（上限直下境界 pin）が提案どおり解消・実装と一致を再確認
- N-002: マスキングテストは非 vacuous（detail 連結＋maskSecrets 剥がしを同時に踏む）
- N-003: 送信形（inlineData base64 独立再計算 / x-goog-api-key / URL に key 不在 / maxTokens=16384 / locale）すべて充足
- N-004: AC-1 実フォーマット受理が「検証済み」と誤表現されていない（代理ケースとして正しく枠付け）
- N-005: registry ディスパッチ pin・二重リスト pin が原子的で同順同値
- N-006: サイズガード拒否側 pin が緩い（上方ドリフト未捕捉）— 任意・軽微
- N-007: 429/400 の文言 pin は分岐選択まで固定しないが mapper 畳み込みで無害 — 任意・軽微

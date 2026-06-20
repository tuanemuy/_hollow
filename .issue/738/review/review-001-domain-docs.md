# PR #765 レビュー — Domain + Documentation 観点

**PR:** #765（Issue #738 / Deepgram Nova-3 を文字起こし registry に追加）
**レビュー日:** 2026-06-21
**観点:** ドメイン値オブジェクトと spec 整合
**対象 AC:** AC-1（union 拡張）・AC-9（spec 更新）

---

## Domain + Docs

### サマリ

AC-1（`SPEECH_PROVIDERS` union 拡張・registry 網羅性の基点）・AC-9（spec 更新）はいずれも満たされている。ドメイン変更は最小差分で `defaultSpeech()` は openai 据え置き、INVARIANT コメントに `deepgram → nova-3` が追記され、新エラーコードの追加もなく `InvalidSpeechProvider` を再利用している。spec（ADR-013 / adminSettings.md）も実装（raw-body・Token 認証・probe・default-model・空 model `ok:false`）と一致する。Blocker なし。

### 検証した事実（実コードとの突合）

- `app/core/domain/adminSettings/valueObject.ts:269` — `SPEECH_PROVIDERS = ["openai", "deepgram"] as const`。`SpeechProvider` union（272 行）が自動で広がり、registry の `Record<SpeechProvider, SpeechAdapter>`（`app/core/adapters/speech/registry.ts`）の網羅性チェックの基点になっている（AC-1 充足）。
- `valueObject.ts:258-268` — INVARIANT コメントの default-model マッピングに `- deepgram → nova-3`（265 行）が追記済み。「provider 追加時は registry 登録 + default-model 拡張を atomic に」の文言も保持。
- `valueObject.ts:287-312` — `SpeechRecognitionConfig.create` のバリデーションは provider メンバーシップ（`SPEECH_PROVIDERS.includes`）・model 長さ・apiKeySource のみで provider 非依存。Deepgram 追加でロジック変更不要、`baseURL` 不在も Deepgram 固定エンドポイントと整合（YAGNI 維持）。
- `app/core/domain/adminSettings/entity.ts:56-60` — `defaultSpeech()` は `provider:"openai" / model:"gpt-4o-transcribe"` のまま。既定プロバイダ据え置きで既存インスタンスの挙動は不変。`coerceSpeech`（141-147 行 fallback 経路）も無変更。
- `app/core/domain/adminSettings/errorCode.ts:26-28` — `InvalidSpeechProvider: "admin_settings_invalid_speech_provider"` 等、新エラーコードの追加なし。命名規約（key=PascalCase / value=lower_snake_case で `BusinessRuleError` spec 文言と一致）に違反なし。`errorCodeNaming.test.ts` への影響ゼロ。
- ドメインロジックのアダプター/UI への漏れなし。Deepgram adapter（`speechRecognitionProvider.ts` / `speechConnectionPing.ts`）は port 契約の実装に閉じ、provider 判定・default-model は VO/registry 側に集約。依存方向（presentation → application → domain、adapter は内側 port を実装）は維持。
- `spec/adr/013-speech-provider.md` — #738 追記節が raw-body 直送・`Authorization: Token`・transcript 抽出・空発話 `""`・`SpeechFailureError` のみ throw・probe（`/v1/projects` で 2xx=OK・model 存在は確認しない）・空 model `ok:false`・Gemini/Workers AI 見送りを記録。実装と一致。
- `spec/domains/adminSettings.md:69` — `SpeechProvider（列挙）` を `'openai' | 'deepgram'`（`["openai", "deepgram"] as const`）に更新、default-model `deepgram → 'nova-3'` 明記、既定プロバイダ openai 据え置きを記載。`SpeechConnectionTester` ポート節（120 行付近）も probe を provider 別（OpenAI=`/models/{model}` で認証+model、Deepgram=`/v1/projects` で認証のみ）に更新済み。

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** spec/adr/013-speech-provider.md の本体 ADR Status との関係 — 説明: ADR-013 本体は「OpenAI を第一段で固定実装」とする決定で、#738 追記節は「2 本目として Deepgram を registry 追加」という後続事実を **追記** している。`.issue/738/adr.md` の ADR-001〜003 が `Proposed`（実装済みなのに）のままだが、これは実装計画段階の作業 ADR であり spec/ 配下ではないため AC-9 のスコープ外。場所: `spec/adr/013-speech-provider.md:52-59` / `.issue/738/adr.md:11,40,57`。理由: spec 側（AC-9 対象）は実装と整合しており問題ない。`.issue/738/adr.md` の Status ドリフトは正式 spec ではなく作業メモなので Blocker でも Warning でもない。提案: 任意。`.issue/738/adr.md` の ADR-001〜003 Status を `Accepted` に更新すると作業記録としての一貫性が増す（ADR-004 のみ Accepted で他は Proposed のまま）。spec 整合には影響しない。

- **[N-002]** spec の probe 記述粒度 — 説明: `spec/domains/adminSettings.md:120` の `SpeechConnectionTester` ポート記述で probe エンドポイントを provider 別に列挙しているが、`.issue/738/adr.md` 判断 3 にある「Deepgram は空 model を `ok:false` でガード（OpenAI との UX 対称性）」が adminSettings.md 側には書かれていない（ADR-013 追記節には記載あり）。場所: `spec/domains/adminSettings.md:120` 付近。理由: ADR-013 にはあるので spec 全体としては記録漏れではない。ドメイン spec のポート記述に同情報が無くても矛盾はしない。提案: 任意。ポート挙動の網羅性を上げるなら `SpeechConnectionTester` 節に「空 model は provider 横断で `ok:false`」を 1 行足してもよい。実装・他 spec と矛盾しないため対応不要。

---

## 結論

Domain + Docs 観点で Blocker・Warning ともになし。AC-1（union 拡張・registry 網羅基点）・AC-9（spec 更新）は完全に満たされ、`create` バリデーションの provider 非依存性・`defaultSpeech()` 据え置き・INVARIANT コメント追記・命名規約遵守・依存方向のいずれも適切。spec（ADR-013 / adminSettings.md）は実装の Deepgram 特性（raw-body・Token 認証・probe・default-model）と一致しており、古い記述の残存や実装との矛盾は確認されなかった。Notes 2 件はいずれも任意の整理提案で、マージを妨げない。

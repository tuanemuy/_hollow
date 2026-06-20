# Plan Review — Issue #738 (Round 2)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/738/plan.md` / `.issue/738/adr.md`
**レビュー日:** 2026-06-21

---

## サマリ

2 周目。1 周目の指摘（P-001 / S-001 / S-002）は計画本文・AC・ADR にいずれも適切に反映されており、precedent 事実誤認の修正、構成解決の自動テスト追加、probe 成功条件の確定がすべて済んでいる。実コードで再確認した結果、反映内容は実態と一致している。Issue 本文「やること」5 項目・「受け入れ条件」5 項目はすべて AC-1〜AC-9 に検証可能な形で落ち、実装ステップとの紐づけも締まっている。スコープ外作業の混入もない。**要件カバレッジ・スコープ整合性の観点で問題点ゼロ。**

---

## 1 周目指摘の反映確認

- **[P-001]（precedent 事実誤認 + AC 未紐づけ）** → 反映済み。`LLMSettingsForm/index.tsx` の `onChange` が `setProvider(next)` のみで model リセットを持たないことを実コードで再確認（241-246 行相当）。計画はステップ 5・設計 UI 節・リスク節・レビュー履歴で「placeholder 分岐は LLM フォームに先例あり / model 自動リセットは本 Issue 新規導入の Speech フォーム固有挙動・LLM フォームには無い・非対称許容」と書き直され、誤った precedent 参照が削除されている。リセット挙動も AC-4 に明記され検証可能になった。
- **[S-001]（AC-6/AC-7 が実 API キー前提で CI 担保なし）** → 反映済み。AC-7 の対応ステップが「6 + 7（構成解決の自動テスト）」に広がり、ステップ 7・テスト方針に fake env / fake SecretBox で `resolveConsumerSpeechConfig` / `buildSpeechRecognitionProvider` を検証し `deepgram` の registry 流入を CI 担保する項目が追加。手動検証は実 transcribe 疎通に限定された。
- **[S-002]（AC-5 probe エンドポイント未確定で合否ぶれ）** → 反映済み。AC-5 が「疎通成功＝probe が 2xx を返すこと」と確定し、「具体エンドポイントは ADR-001 で確定」「model 存在確認は probe では行わない」と限界を明記。ADR-001 にも probe 成功定義と PoC 確認項目が追記された。
- 1 周目の「事実誤認」修正（[arch S-001] locale `ja` 固定）も `runIngestionJob.ts` / `previewPrompt.ts` 由来の実態として調査結果に反映済み。

---

## 検証した事実（実コードとの突合）

- `LLMSettingsForm/index.tsx`: provider `onChange` は `setProvider(next)` のみ。model リセットなし — 計画の「LLM フォームには無い新規挙動」記述が正しい。
- `SpeechSettingsForm/index.tsx` `onTest`: `apiKeySource: "env"` / `apiKeyCiphertext: null` をハードコードし、コメントで「draft cannot carry the form's typed-in plain api key（ciphertext never leaves the adapter boundary）」と明記 — 計画の AC-6・[arch P-003] 前提が実態と一致。

---

## 問題点（要修正）

問題点ゼロ。

（Issue「やること」5 項目・「受け入れ条件」5 項目はすべて AC-1〜AC-9 に検証可能な形でマッピングされ、実装ステップ 1〜8 と正しく紐づいている。1 周目で指摘した P-001 の AC 未紐づけ・S-001 の CI 担保欠如・S-002 の合否ぶれはいずれも解消済み。スコープ外作業の混入もない。）

---

## 改善提案（検討推奨）

改善提案ゼロ。

（残課題なし。Gemini / Workers AI / Google Cloud STT v2 の見送りは ADR-002 / ADR-003 / ADR-013 で根拠付きで「含まれないもの」に整理され、Issue の「最低 1 本・優先 Deepgram」と整合している。)

---

## 良い点

- 1 周目の全指摘を「見送った提案なし」で取り込み、precedent 事実誤認という最も危険な指摘（実装者が誤った既存パターンを踏襲するリスク）を実コード根拠付きで正確に修正している。本レビューでも実コードと再突合し、修正が実態と一致することを確認した。
- AC 表の「由来」列で Issue「やること」「受け入れ条件」の各項目を明示トレースしており、5+5 項目のカバレッジが機械的に検証できる。漏れなし。
- AC-7 を「構成解決は自動テスト・実 transcribe のみ手動」と分解し、API キー前提で CI 担保できない部分と generic dispatch で CI 担保できる部分を切り分けたことで、受け入れ基準の検証可能性が大きく向上した。
- スコープが「VO 1 値 / transport 1 値 / registry 1 行 / adapter ディレクトリ / フォーム分岐 / spec」に厳密に閉じ、usecase・DI・DTO・DB 無変更を調査で確認済み。スコープ外作業ゼロ。

---

## 判定

要件カバレッジ・スコープ整合性ともに問題なし。1 周目指摘は全て適切に反映済みで、新たな要件漏れ・スコープ逸脱も検出されなかった。本観点からは計画を承認できる。

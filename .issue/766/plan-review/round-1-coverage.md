# Plan Review — Issue #766（視点: 要件カバレッジ・スコープ整合性）round-1

対象: `.issue/766/plan.md` / `.issue/766/adr.md`
レビュー軸: Issue 本文の合意要件（AC-1〜AC-6）が受け入れ基準に落ち、検証可能で、実装ステップと正しく紐づき、スコープ外（#788 Workers AI 等）が混入していないか。

## 総評

Issue 本文の 6 つの受け入れ基準はすべて plan.md の AC-1〜AC-6 に 1:1 で写像されており、カバレッジに**漏れはない**。implement-then-verify（独立 1 コミット → 実ファイル検証 → NG なら原子 revert）という Issue の非交渉ゲートも忠実に設計へ反映されている。スコープ外（#788 Workers AI / Gemini Files API / 録音 UI フォーマット変換 / port 契約変更）は明示的に「含まれないもの」へ隔離されており、スコープ・クリープは無い。既存コード（registry generic dispatch・DI の `provider ?? "openai"` → `lookupSpeechAdapter`・dual-list ドリフト・`callGeminiGenerate` 流用）と plan の記述は実コードと一致しており、調査精度は高い。

指摘は受け入れ基準⇔実装ステップの**トレーサビリティ表の不整合 1 件**と、精度向上の提案 3 件にとどまる。要件カバレッジ上の重大な欠落は無い。

---

#### 問題点（要修正）

- **[P-001]** 受け入れ基準表の「AC-2 → 対応ステップ」が登録ステップ（ステップ4・5）を欠いている
  - 理由: AC-2 は「Gemini の `SpeechAdapter` が `speechProviderRegistry` に**登録され**、/admin/speech から選択・保存・接続テストできる」。この「登録」を実際に成立させるのはステップ4（`geminiSpeechAdapter satisfies SpeechAdapter` の barrel export）とステップ5（registry へ 1 行マップ）である。ところが AC-2 行の「対応ステップ」は `1,2,3,6,7` で、**ステップ4・5 が欠落**している。逆にステップ5本文（plan.md L100）は「理由: AC-2」と明記しており、表と本文が相互に矛盾している。検証軸「(3) 基準と実装ステップの紐づけが正しいか」に対する実害のあるトレーサビリティ欠陥。
  - 提案: AC-2 行の対応ステップを `1,2,3,4,5,6,7`（probe 2xx の実機確認まで含めるなら `,8` も）に修正する。

#### 改善提案（検討推奨）

- **[S-001]** Gemini 既定モデル `gemini-2.5-flash` の選定根拠「LLM 側の Gemini 既定と揃える」が事実と食い違う
  - 理由: plan.md L57/L71 とドメイン INVARIANT コメント追記は `gemini → "gemini-2.5-flash"` を「LLM 側の Gemini 既定と揃える」と説明するが、実コードの LLM フォーム（`app/components/admin/LLMSettingsForm/index.tsx` L470）が例示する Gemini モデルは `gemini-1.5-pro` であり、LLM 側に `gemini-2.5-flash` を既定とする箇所は無い（`messagesClient.ts` の JSDoc が例として挙げているだけ）。文字起こしモデルとして `gemini-2.5-flash` を選ぶこと自体は妥当だが、「揃える」という根拠は不正確。AC-6 の spec 反映時に誤った整合根拠が spec へ転記される懸念がある。
  - 提案: 根拠を「文字起こし（音声 inlineData）向けに低レイテンシ・現行世代の `gemini-2.5-flash` を選定」等の独立した理由に書き換える（LLM 既定との一致を主張しない）。

- **[S-002]** AC-5 の adapter 境界テストに「汎用 4xx（特に HTTP 400）」を明示する
  - 理由: 本 Issue 最大のリスク（webm/opus 受理不能）が実際に露見する経路は、`callGeminiGenerate` の `throwForStatus` で 401/403→quota・429→rateLimit に該当しない**汎用フォールスルー（`Gemini request failed (HTTP ${status})` → `mapper.unavailable`）**、すなわち HTTP 400 である。AC-5 行は「4xx」と総称で書かれており plan.md L109 も「4xx」止まりだが、401/403・429 だけを 4xx 代表とすると 400→`unavailable` 写像（= 受理 NG 時に SpeechFailureError が出る挙動）が回帰テストから漏れうる。
  - 提案: ステップ7のテスト列挙に「HTTP 400（未対応 mime 想定）→ `SpeechFailureError`（unavailable 経路）」を 401/403・429 と別ケースとして明記する。

- **[S-003]** NG 分岐での `.issue/738` ADR-002 の状態遷移記述が現状 Status と不整合
  - 理由: 現在 `.issue/738/adr.md` ADR-002 の Status は **Proposed**（Accepted ではない）。plan.md ステップ9（NG 分岐）は「`.issue/738` ADR-002 を **Accepted 据え置き**」と書くが、「据え置き」だと Proposed のまま残り Accepted にならない。一方 `.issue/766/adr.md` ADR-004 は NG 時「Accepted（先送り判断は妥当だったと確定）に**更新**」と正しく書いており、plan と 766-ADR で表現が食い違う。AC-6 の「ADR 更新」スコープに関わる軽微な不整合。
  - 提案: plan.md ステップ9 を「`.issue/738` ADR-002 を Proposed → **Accepted へ更新**（先送り妥当性を確定）」に統一する（766-ADR-004 と一致させる）。

#### 良い点

- Issue 本文の 6 受け入れ基準が AC-1〜AC-6 へ**過不足なく**写像され、各基準が検証可能な形（AC-1: 2xx＋非空 transcript／AC-2: probe 2xx／AC-4: request・consumer 両 DI 経路＋SecretBox／AC-5: 2xx/4xx/5xx/timeout/空音声＋dispatch）に具体化されている。
- 「実 webm/opus 受理検証が前提条件」という Issue の非交渉ゲートを、AC-1＋ステップ8/9＋ADR-003 で一貫して中核に据え、コード差分を**独立 1 コミット化 → NG 時 `git revert`**という原子的撤退まで設計している。
- スコープ外を明確に隔離: #788 Workers AI（契約変更）・Gemini Files API（YAGNI）・録音 UI 変換・`SpeechAdapterConfig` 変更を「含まれないもの」へ列挙し、スコープ・クリープ無し。
- dual-list ドリフト（`SPEECH_PROVIDERS` ⇔ `SPEECH_PROVIDERS_TRANSPORT`）と default-model 二重定義（VO コメント／UI Record）を「原子的更新」リスクとして特定済み。実コードと一致。
- agent-browser がマイク録音不可という制約を直視し、「録音 UI 生成の webm/opus バイト列を audio 取り込み経路へ直接流す軽量検証」という現実的な AC-1 充足手段を併記している。
- `.issue/738` ADR-002 の OK/NG 別状態遷移（Superseded / Accepted）まで AC-6 の射程に含め、ADR 連鎖の後始末を取りこぼしていない。

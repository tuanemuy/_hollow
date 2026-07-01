# PR #813 レビュー — Frontend レイヤー (review-001)

対象: Issue #788「Cloudflare Workers AI ルート文字起こしプロバイダ追加」
観点: Frontend（transport boundary / UI 分岐 / Styling / a11y / 二重リスト不変条件）

## サマリ
- Blockers: 0 / Warnings: 2 / Notes: 5
- 受け入れ基準 AC-3 のフロント側（`/admin/speech` から `deepgram-workers-ai` を選択・保存・接続テスト）に必要な UI diff は揃っており、transport zod スキーマの enum 拡張・keyless 分岐・二重リスト不変条件テストはいずれも正しく実装されている。致命的な欠陥は無い。指摘 2 件はいずれも UX / a11y の細部で、機能は成立する。

### Frontend

#### Blockers
- なし

#### Warnings
- **[W-001]** keyless 分岐時に `<label htmlFor={apiKeyId}>` が実在しないコントロールを指す（ダングリング参照） / 場所: `app/components/admin/SpeechSettingsForm/index.tsx:353`（label）+ `:367-373`（keyless 時は `<span>` に置換され `id={apiKeyId}` を持つ `<input>` が unmount される） / 理由: keyless 選択時、API キー欄は `<span data-keyless="">` に差し替わり `id={apiKeyId}` を持つ要素が DOM から消える一方、`<label className={FIELD_LABEL_CLASS} htmlFor={apiKeyId}>新しい API キー</label>` はそのまま残る。label の `for` 属性が存在しない id を指す状態になり、支援技術・axe 系監査で「関連コントロールの無い label」として検出される。加えて label 文言「新しい API キー」自体が鍵不要の keyless では意味的に矛盾する（body は「不要（Cloudflare が管理）」と正しく表示されるので実害は視覚的な軽微さに留まる）。 / 提案: keyless のとき (a) label 側の `htmlFor` を落とす（`htmlFor={keyless ? undefined : apiKeyId}`）か `<span>` に `id={apiKeyId}` を付与して関連付けを維持する、かつ (b) label 文言を keyless では「API キー」等の中立表現へ分岐する、のいずれか。最小修正は (a) の `htmlFor` 分岐。

- **[W-002]** クライアント側 `KEYLESS_PROVIDERS` ミラーにドリフト検出テストが無い / 場所: `app/components/admin/SpeechSettingsForm/index.tsx:43-45` / 理由: `KEYLESS_PROVIDERS` は domain SSOT `KEYLESS_SPEECH_PROVIDERS` を手動ミラーしている（コメントで明記済み）。同ファイル冒頭の `SPEECH_PROVIDERS_TRANSPORT` は VO 境界で `InvalidSpeechProvider` を throw する再検証と `schema.test.ts` の不変条件テストという二重のドリフト安全網を持つのに対し、`KEYLESS_PROVIDERS` にはコンパイル時網羅も回帰テストも無い。将来 domain が keyless provider を追加した際、この Set が黙って古くなり「鍵不要の provider にキー欄が出続ける」UX 退行が起きても検出できない。コメント通り実害は UX のみ（サーバが真のゲートを enforce）で severity は低いが、他の二重リストと非対称。 / 提案: `schema.test.ts` 相当に「`KEYLESS_PROVIDERS` の各値が `SPEECH_PROVIDERS_TRANSPORT` に含まれる」＋「（可能なら）domain の keyless 集合と一致する」不変条件テストを 1 本追加し、他の二重リストと安全網を揃える。難しければ最低限、追加漏れに気付ける固定値テストを置く。

#### Notes
- **[N-001]** transport boundary の enum 拡張が正しい。`SPEECH_PROVIDERS_TRANSPORT` に `"deepgram-workers-ai"` を 1 値追加するだけで `updateSpeechConfigSchema` / `testSpeechConnectionSchema` が `z.enum(SPEECH_PROVIDERS_TRANSPORT)` 参照経由で自動的に広がっており（`schema.ts:72-100`）、CLAUDE.md「Input validation は transport boundary で」に沿う。`action.ts` の 2 mutation は `inputValidator(validateInput(...))` を通し、`loadInstanceSettings` は `serverData`（internal-only・schemaless）で外部入力を通していない点も規約準拠。

- **[N-002]** keyless 抑制の分岐が過不足なく整理されている。`apiKeyRequired = providerChanged && !envOverrides.apiKey && !keyless`（`:146`）で provider 変更時のキー必須を抑制、provider 変更アラート（`:297` `providerChanged && !keyless`）も抑制、REST provider では従来どおり `required` バッジ・アラート・required 属性が維持され、keyless 免除が REST 経路へ波及していない。キー欄本体も `keyless ? <span> : <input>`（`:367-392`）で input を unmount するため `name="apiKey"` が FormData に載らず、旧 REST 用に入力途中だった鍵も送信されない（サーバ側 silently-drop の前段としても安全側）。

- **[N-003]** Styling 規約準拠。ハンドラ・状態は React 19 primitives 直接利用（`useActionState` / `useTransition` / `useState` / `useId`、カスタムラッパー無し）。状態表現は `data-keyless=""`（statically-on）・`data-env-locked={envOverrides.x || undefined}`（動的）と ADR-003 の `data-*` 規約どおり使い分け、条件付き class 文字列ではなく属性＋モジュールスコープ定数（`INPUT_CLASS` 等）で構成。新規ハンドコード CSS は無い。keyless span は `INPUT_CLASS` を流用しつつ `inline-flex items-center text-ink-tertiary` で入力欄と同じ高さ・淡色に整えている。

- **[N-004]** model 取り違え（S-003）への配慮が入っている。provider 説明文に Workers AI 版のモデル `@cf/deepgram/nova-3` を `<code>` で明示（`:240-243`）、`PROVIDER_DEFAULT_MODEL["deepgram-workers-ai"]` を追加し provider 切替時に `setModel(PROVIDER_DEFAULT_MODEL[next])` で既定へリセット（`:269-271`）、model 欄ヒント `例: {PROVIDER_DEFAULT_MODEL[provider]}` も追随。deepgram(REST) `nova-3` と workers-ai `@cf/deepgram/nova-3` の 2 択並びで typo 沈黙 Stub 化するリスクを既定値提示で緩和できている。

- **[N-005]** 二重リスト不変条件テストに新値が反映済み。`schema.test.ts:195-204` の `SPEECH_PROVIDERS_TRANSPORT` 期待配列に `"deepgram-workers-ai"` を追加しドリフト検出を維持。`updateSpeechConfigSchema` / `testSpeechConnectionSchema` の既存 provider enum テスト（未知 provider reject 等）も新 enum 上でそのまま有効。

## 各指摘の一行リスト
- [W-001] keyless 時に label htmlFor がダングリング参照 / label 文言が矛盾 — app/components/admin/SpeechSettingsForm/index.tsx:353,367
- [W-002] KEYLESS_PROVIDERS クライアントミラーにドリフト検出テストが無い — app/components/admin/SpeechSettingsForm/index.tsx:43
- [N-001] transport enum 拡張が正しく Input validation 規約準拠 — app/components/admin/schema.ts:72
- [N-002] keyless 抑制が過不足なく REST に波及しない — app/components/admin/SpeechSettingsForm/index.tsx:146
- [N-003] Styling / React 19 primitives / data-* 規約準拠 — app/components/admin/SpeechSettingsForm/index.tsx:367
- [N-004] model 取り違え（S-003）への既定値提示配慮 — app/components/admin/SpeechSettingsForm/index.tsx:240
- [N-005] 二重リスト不変条件テストに新値反映済み — app/components/admin/__tests__/schema.test.ts:201

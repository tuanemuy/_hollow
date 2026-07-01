# Plan Review — Issue #788 (round 1)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/788/plan.md` / `.issue/788/adr.md`
**レビュー日:** 2026-07-01

---

## 総評

7 つの Issue AC がすべて plan.md の受け入れ基準表に「由来 → 対応ステップ」付きで落ちており、トレーサビリティは高い。スコープ外項目も明記され、線引きは概ね妥当。ただし **(1) `/admin/speech` 接続テスト（AC-3）を成立させる実装ステップに、既存の empty-key ガードを回避する分岐が欠けている**、**(2) AC-2/AC-3/AC-4 が本 dev 環境では検証不能で staging 依存になるのに、Issue の「完了」条件（クローズ条件）が計画上あいまい**、という 2 つのカバレッジ上の穴がある。ADR-003（OpenAI スコープ縮小）と ADR-006（PoC 代替）の判断自体は、実態調査に裏付けられた妥当な適応と評価する（下記で詳述）。

---

## 問題点（要修正）

- **[P-001] AC-3「/admin/speech から接続テストできる」を満たす実装ステップに、`HttpSpeechConnectionTester` の empty-key 早期リターンを回避する分岐が抜けている**
  - 理由: `app/core/application/di/speechConnectionTester.ts` L36-39 で `ping` は `apiKey.trim().length === 0` のとき `adapter.ping` に到達する前に `{ ok:false, error:"API key is empty" }` を返す。workers-ai は鍵を持たない（ADR-004）ため、接続テスト時に渡る apiKey は空文字になり、**binding 存在確認（ADR-005 の `deepgramWorkersAiSpeechAdapter.ping`）に到達せず必ず「接続失敗 · API key is empty」で落ちる**。UI 側の draft テスト（`SpeechSettingsForm` `onTest` は `apiKeySource:"env"` を送り、env に workers-ai 用の鍵は無い）でも同じ結果になる。plan の設計節 L71 と ADR-004 L119 は `isWorkersAiSpeechProvider` を「request/consumer/tester の 3 箇所で共有」と述べているが、**ステップ 7 の具体的変更内容は「コンストラクタに `ai?` を足し `deps` を渡す」だけで、この empty-key ガードを workers-ai で分岐/緩和する記述が無い**。このままだと AC-3 の「接続テストできる」が実装上満たされない。
  - 提案: ステップ 7 に「`isWorkersAiSpeechProvider(cfg.provider)` の場合は empty-key 早期リターンをスキップして `adapter.ping(cfg, "", timeoutMs, { ai })` に進む」ことを明記する。併せてテスト方針の ping 単体（plan L180）に「workers-ai は apiKey 空でも binding 有りなら `ok:true`」ケースを追加し、empty-key ガードの回帰を固定する。

- **[P-002] AC-2 は完全に、AC-3/AC-4 は実機検証部分が本 Issue のマージ時点で検証不能（staging 依存）だが、Issue の「クローズ条件」が計画に明示されていない**
  - 理由: ADR-006 の通り本 dev 環境から実 `env.AI` binding に到達できないため、(a) AC-2「実際に録音した webm/opus で受理を PoC 検証」は静的型検証までしか本 Issue 内で完了せず、(b) AC-4「audio→…→ノート保存 のフルパスが E2E で動く」の実動確認と AC-3 の接続テスト実動も staging でしか行えない。plan は AC-2 表セルで「webm/opus 受理は staging」と正直に開示しているが、**「Issue #788 をいつ close してよいか（マージ時点で close か、staging 受理確認まで open か、follow-up issue に検証を委ねるか）」の DoD が計画に無い**。staging 受理が NG なら実装ごと revert（ADR-006）＝ workers-ai ルート自体が使えなくなり AC-3/AC-4 が未達に転じる、という条件付き成立である点も、受け入れ基準表からは読み取りにくい。
  - 提案: 受け入れ基準表に「検証環境」列または注記を追加し、AC-2/AC-3/AC-4 の実機部分が staging ゲート依存であること、および Issue のクローズ条件（例: 「マージ後 staging で webm/opus 受理 + 非空 transcript を確認できた時点で close。NG なら revert し ADR-006 に根拠追記のうえ本 Issue は再オープン/別 Issue 化」）を明文化する。これにより「表の全 AC にチェックが付く＝完了」という誤読を防ぐ。

---

## 改善提案（検討推奨）

- **[S-001] OpenAI gpt-4o-transcribe の引き継ぎ先 Issue を具体化する**
  - 理由: ADR-003 と plan スコープ節・リスク節は「別 Issue へ引き継ぐ」と繰り返すが、**その follow-up Issue の起票をアクションとして計画に含めていない**。Issue タイトル・本文が明示的に挙げた OpenAI ルートが「別 Issue」という言葉だけで宙に浮くと、Issue #788 を閉じた時点で意図が失われるリスクがある。ステップ 11（spec 更新）or 追加ステップとして「AI Gateway 経由 or Whisper 代替の OpenAI Workers AI ルートを起票し、spec/adr/013 に issue 番号を残す」を明記すると、スコープ縮小の説明責任が閉じる。

- **[S-002] AC-6 の「空の音声（empty audio）」入力ケースを、`空 transcript` とは別に明示する**
  - 理由: Issue AC-6 の adapter 境界カバレッジは「2xx / 4xx / 5xx / timeout / **空の音声**」と入力側の空音声を挙げているが、plan のテスト方針（L179）は主に「**空 transcript（`""`）**」＝出力側の空を挙げている。両者は別ケース（空の音声バイト列を投入 vs. 非空音声で無発話 transcript）。既存 REST adapter テストとの対称性（AC-6）を厳密に満たすため、「空 audio bytes 入力」ケースも列挙しておくと取りこぼしが無い。

- **[S-003] ADR-003 の事実前提（gpt-4o-transcribe は Workers AI モデルとして非存在）に日付・出典を残す**
  - 理由: このスコープ縮小の全根拠は「`@cloudflare/workers-types` の型付きカタログに `@cf/openai/whisper*` はあるが gpt-4o-transcribe は無い」という一点。Cloudflare の Workers AI カタログは随時拡張されるため、**判断時点（型定義のバージョン/日付）を ADR に残さないと、後日カタログが変わったときにこの ADR の妥当性を再評価しづらい**。ADR-003 に `@cloudflare/workers-types` の版とスナップショット日を追記すると、将来の再検討が容易になる。

---

## 個別論点の検証（依頼で特に注意すべきとされた 3 点）

### 1. AC-3「registry 登録 + /admin/speech 選択・保存・接続テスト」
- **選択・保存**: ドメイン union（ステップ 1）→ transport list / ラベル（ステップ 8）→ registry（ステップ 2）の diff-only 網羅で成立する。`SPEECH_PROVIDERS_TRANSPORT` と `PROVIDER_LABEL`/`PROVIDER_DEFAULT_MODEL`/`PROVIDER_API_KEY_PLACEHOLDER` の 3 マップ更新（既存 `SpeechSettingsForm` の構造どおり）でカバーされており妥当。`isProviderId` narrowing・`persistedProvider` フォールバックも既存実装で自動対応。**保存経路は満たされる**。
- **接続テスト**: **P-001 のとおり empty-key ガードで未達リスク。**ここが AC-3 の唯一の穴。

### 2. AC-4「フルパス E2E」
- consumer 経路で文字起こしが走る点（ステップ 6・リスク節）を正しく捉えており、`resolveConsumerSpeechConfig` の apiKey-optional 分岐 + `[env.consumer]` の `[ai]` binding を E2E の要と位置づけているのは的確。ただし **実動の「動く」確認は staging 依存（P-002）**。#766 の `runIngestionJob` が `SpeechFailureError` を握り潰す偽陽性リスクを明示的に継承し、「ノート保存成功では判定しない／adapter・ネットワーク層で 2xx + 非空 transcript を直接確認」と定めている点は、E2E カバレッジの質を担保する優れた記述。

### 3. ADR-003（OpenAI → Deepgram 縮小）の妥当性
- Issue タイトル・本文は OpenAI gpt-4o-transcribe を明示するが、**Issue の受け入れ基準本文（AC-3「Workers AI 経由のプロバイダーが」/ AC-4「選んだプロバイダーで」）は provider 非依存**であり、Deepgram 単独で文言上は充足可能。ADR-003 の根拠（gpt-4o-transcribe は WAI パートナーモデルとして非存在、Whisper のみ）は `@cloudflare/workers-types` の実態調査に基づく検証可能な事実で、**Issue の前提の方が実態と食い違っている**ケース。したがって縮小自体は「Issue の意図の取りこぼし」ではなく「実態に合わせた妥当な適応」と評価する。ただし OpenAI ルートの意図を失わないための follow-up 起票（S-001）と、UI に「Deepgram」が REST/WAI の 2 択で並ぶ UX トレードオフ（ADR-001 Consequences で自認済み）の周知は必要。

### 4. ADR-006（PoC を静的検証 + staging に代替）の順序整合
- Issue AC-2 は「**ADR 決定の前に** PoC 検証」と順序を明示。plan は ADR-001/002（案 B・config 据え置き）を先に決め、webm/opus 受理検証を staging（マージ後）に回すため、**文字通りには順序が逆転している**。ただし: (a) 実 binding がこの環境に無く live PoC が物理的に不可能、(b) PoC の主眼だった「レスポンス shape の REST 互換」は `Ai_Cf_Deepgram_Nova_3_Output` の型で **決定前に静的確定済み**、(c) ADR-001 が「実装方式の判断は webm/opus 受理可否（ADR-006）と独立」と明言し、構造判断が PoC 結果に依存しないよう設計されている——の 3 点により、**順序逆転が ADR の健全性を損なわない**ことは論理的に担保されている。残る webm/opus 受理リスクは opt-in（既定 openai）+ 原子的 revert で封じ込めており、環境制約下の適応として妥当。**ただし AC-2 は本 Issue 内で形式上チェックできない**点を DoD として明示すべき（P-002）。

---

## スコープ整合性チェック
- plan「含まれないもの」（OpenAI WAI ルート / 案 A transport 軸 / 録音 UI の webm→ogg 変換 / Deepgram 鍵マスキング）はいずれも Issue 本文・#738 ADR-003・#766 の運用と整合し、**スコープ外の作業の紛れ込みは見当たらない**。
- `wrangler.production.toml` への `[ai]` binding 追加はルート供給に必要なインフラ配線でありスコープ creep ではない。
- ドメイン union に追加するのは `deepgram-workers-ai` 1 値のみで、ADR-003 の Deepgram 単独スコープと内部整合。

---

## 良い点
- 受け入れ基準表が Issue の 7 AC を「由来 / 対応ステップ」付きで 1:1 マッピングしており、要件トレーサビリティが明確。
- スコープ外項目を根拠（ADR 番号・関連 Issue）付きで列挙し、線引きが検証可能。
- ADR-003 の縮小判断を「Issue 前提の事実誤り」まで踏み込んで実態調査で裏取りし、provider 非依存な AC 文言に照らして妥当性を示している。
- #766 の `runIngestionJob` 偽陽性（`SpeechFailureError` 握り潰し）を明示的に継承し、E2E/受理判定を「ノート保存成功」ではなく adapter/ネットワーク層の直接確認に据えた点は、カバレッジの質を守る優れた設計。
- consumer 経路の binding 配線漏れ = 沈黙の Stub というリスクを特定し、DI unit テストで固める方針を明記。
- 契約シグネチャ変更（`deps?` optional）による REST 側無改修・blast radius 局所化の判断が一貫。

---

## サマリー
- 問題点: 2 / 改善提案: 3
- `[P-001]` 接続テストの empty-key ガード未処理で AC-3 未達リスク
- `[P-002]` AC-2/3/4 の実機検証が staging 依存だが Issue クローズ条件が未定義
- `[S-001]` OpenAI 引き継ぎ Issue の起票を計画アクション化
- `[S-002]` AC-6 の「空の音声（入力）」ケースを空 transcript と別に明示
- `[S-003]` ADR-003 の事実前提に型定義の版/日付を付す

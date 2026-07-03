# Plan Review — Issue #788 (round 3・最終)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/788/plan.md` / `.issue/788/adr.md`
**レビュー日:** 2026-07-01

---

## 総評

過去2周の coverage 指摘（round-1: 問題2 + 提案3、round-2: 提案2）はすべて plan.md / adr.md に反映済み。7 つの Issue AC は受け入れ基準表に「由来 / 対応ステップ / 検証環境」付きで 1:1 マッピングされ、DoD 節で「マージ DoD」と「staging 確定項目」「revert/クローズ条件」が分離されている。ゲート数は全箇所で **6 箇所（domain service 1 + application 5: usecase 2 + DI 2 + tester 1）** に統一され、内部整合が取れている。実質的な要件漏れ・スコープ逸脱は無い。**問題点ゼロ。承認可。**

---

## 問題点（要修正）

**問題点ゼロ。**

Issue の 7 AC はすべて検証可能な形で受け入れ基準表に落ち、staging 依存の実機部分（AC-2/AC-4 と AC-3 の実疎通）は DoD 節で明示的に分離されている。スコープ外項目も根拠付きで列挙され、creep は無い。

---

## 過去2周指摘の反映確認

### round-1（問題2・提案3）
- **[P-001] 接続テストの empty-key ガード** → ステップ 9 に `HttpSpeechConnectionTester` L36-39 の empty-key 短絡を keyless でスキップし `adapter.ping(cfg, "", timeoutMs, { ai })` へ進む分岐が明記。テスト方針にも回帰ケース追加。**反映済み。**
- **[P-002] クローズ条件未定義** → 「Definition of Done とクローズ条件」節が新設され、マージ DoD／staging 確定項目／revert・クローズ条件を分離。AC 表に「検証環境」列 + 「全 AC チェック = 完了ではない」注記。**反映済み。**
- **[S-001] OpenAI 引き継ぎ Issue 起票** → ステップ 13（Phase 4）でアクション化。スコープ節・ADR-003 にも明記。**反映済み。**
- **[S-002] 空音声入力と空 transcript の分離** → AC-6・テスト方針で別ケースに分離。**反映済み。**
- **[S-003] ADR-003 の型定義版/日付** → `@cloudflare/workers-types@4.20260511.1`・確認日 2026-07-01 を追記。**反映済み。**

### round-2（提案2）
- **[S-001] AC-3 対応ステップ列に 3** → AC-3 の対応ステップが `1・2・3・4・5・7・9・10` になり、adapter/ping のステップ 3 が含まれた。**反映済み。**
- **[S-002] ゲート数の統一** → round-2 で domain service `assertSpeechEnvOverride` を 6 番目として追加発見し、DoD・ADR-004・リスク節・設計節・テスト方針の全箇所で **6 箇所** に統一。**反映済み。**

---

## ゲート数の内部整合（最終確認）

全箇所で **6 箇所 = domain service 1 + application 5（usecase 2 + DI 2 + tester 1）** で一致:

- plan L34（DoD）／L91（設計）／L186（テスト理由）／L213（リスク）
- ADR-004 L104（Context）／L119（Decision）／L134（Consequences）

内訳の実体も破綻なし:
- domain service 1 = `assertSpeechEnvOverride`
- usecase 2 = `updateSpeechConfig` + `testSpeechConnection`
- DI 2 = `buildSpeechRecognitionProvider` + `resolveConsumerSpeechConfig`
- tester 1 = `HttpSpeechConnectionTester.ping`

round-2 で指摘された「4 ゲート」表現・request DI ゲートの数え漏れは解消済み。数え上げドリフトは残っていない。

---

## AC 最終カバレッジ確認

- **AC-1**（ADR 記録）: 完了済み（`.issue/788/adr.md` ADR-001〜006）。検証可能。
- **AC-2**（webm/opus PoC）: 静的契約検証は本 Issue 内で完了、実機受理は staging 確定。DoD で偽陽性注意（2xx + 非空 transcript 直接確認）まで明記。検証基準が明確。
- **AC-3**（registry 登録 + admin/speech 選択・保存・接続テスト）: ステップ 1・2・3・4・5・7・9・10 で網羅。接続テストの empty-key バイパスと 6 ゲート carve-out で保存/テスト経路が通る。
- **AC-4**（フルパス E2E）: consumer 経路の binding 配線を要と位置づけ。実動は staging 確定。
- **AC-5**（env>db>stub フォールバック + SecretBox）: workers-ai は SecretBox 非適用（「該当する場合」に非該当）を明記。keyless の binding 駆動フォールバックを DI unit で固定。
- **AC-6**（回帰テスト境界 + 対称性）: 2xx/4xx/5xx/timeout/空音声入力/空 transcript 出力/binding 未注入 + registry ディスパッチを binding フェイクで固定、REST と対称。
- **AC-7**（spec 更新）: `spec/adr/013` + `spec/domains/adminSettings.md` 更新をステップ 13 で。

7 AC すべて検証可能な形で満たされる。

---

## スコープ整合性

- 「含まれないもの」4 項目（OpenAI WAI ルート / 案 A transport 軸 / 録音 UI の webm→ogg 変換 / Deepgram 鍵マスキング）は Issue 本文・#738 ADR-003・#766 運用と整合。
- ドメイン union 追加は `deepgram-workers-ai` 1 値のみで ADR-003 の Deepgram 単独スコープと内部整合。
- `wrangler.{,staging,production}.toml` の `[ai]` binding 追加はルート供給に必要なインフラ配線であり creep ではない。

スコープ逸脱なし。

---

## 良い点

- 3 周のレビューで application/domain 層の apiKey ゲートを 5→6 箇所まで洗い出し、keyless 述語を domain SSOT に集約する設計で 6 箇所の一貫分岐を構造的に保証。単なる分岐追加でなく配置原則まで踏み込んでいる。
- DoD 節が「マージしてよい条件」と「staging で確定させる条件」を分離し、opt-in + 原子的 revert のクローズ条件まで明文化。実 env.AI 不達という環境制約下での完了定義として堅実。
- 偽陽性（`runIngestionJob` の `SpeechFailureError` 握り潰し）を継承し、受理判定を「ノート保存成功」でなく 2xx + 非空 transcript で下すと明記。
- ゲート数の内部整合が全箇所で取れており、マージ判定基準と ADR のドリフトが無い。

---

## サマリー

- 問題点: 0 / 改善提案: 0
- 過去2周（round-1: P-001/P-002/S-001/S-002/S-003、round-2: S-001/S-002）の全指摘が反映済み。
- ゲート数は全箇所で 6（domain service 1 + application 5: usecase 2 + DI 2 + tester 1）に統一・内部整合。
- 7 AC すべて検証可能な形で満たされる。スコープ逸脱なし。
- **承認可（問題点ゼロ）。**

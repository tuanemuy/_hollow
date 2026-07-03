# Plan Review — Issue #788 (round 2)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/788/plan.md` / `.issue/788/adr.md`
**レビュー日:** 2026-07-01

---

## 総評

1周目で挙げた 2 問題点・3 改善提案はいずれも適切に反映されている（下記「1周目指摘の反映状況」参照）。7 つの Issue AC は受け入れ基準表に「由来 / 対応ステップ / 検証環境」付きで 1:1 マッピングされ、新設された「Definition of Done とクローズ条件」節で「マージ DoD」と「staging 確定項目」「revert/クローズ条件」が明確に分離された。要件の実質的な取りこぼし・スコープ逸脱は見当たらない。**問題点ゼロ。** 残るのは内部整合性の軽微な 2 点（ともに検証可能性を損なわないレベル）のみ。

---

## 問題点（要修正）

問題点ゼロ。

Issue の 7 AC はすべて検証可能な形で受け入れ基準表に落ち、staging 依存の実機部分は DoD 節で明示されている。スコープ外項目（OpenAI WAI ルート / 案 A transport 軸 / 録音 UI 変換 / 鍵マスキング）も根拠付きで列挙され、スコープ creep は無い。

---

## 改善提案（検討推奨）

- **[S-001]** AC-3 の「対応ステップ」列（`1・2・4・5・7・9・10`）に、adapter/ping を実装するステップ 3 が含まれていない
  - 理由: AC-3 は「registry 登録 **かつ** /admin/speech から選択・保存・接続テスト」。このうち「接続テスト」は `deepgramWorkersAiSpeechAdapter.ping`（ステップ 3 で新規実装）に到達して初めて成立する（ステップ 9 の tester は adapter.ping へ委譲するだけ）。ステップ 2 の registry 登録もステップ 3 の barrel export に依存する（plan L135 が明記）。したがってステップ 3 は AC-3 の前提依存だが対応ステップ列から漏れており、トレーサビリティ上わずかに不整合。AC-4 側にのみ列挙されている。実害は無いが、AC-3 の「接続テスト」根拠を辿るとき列挙に 3 を足すと閉じる。

- **[S-002]** DoD 節の「4 つの apiKey ゲート（usecase 2 + tester 1 + consumer resolve 1）」という数え方が、ADR-004・リスク節の「5 箇所」（DI 2 + usecase 2 + tester 1）と食い違う
  - 理由: DoD 節 L34 は keyless 分岐を unit で固定すべきゲートを「4 つ（usecase 2 + tester 1 + consumer resolve 1）」と数えているが、request 経路 DI ゲート `buildSpeechRecognitionProvider`（ステップ 7・ADR-004 が数える 5 箇所の 1 つ）が抜けている。テスト方針 L221（DI 配線 unit）では `buildSpeechRecognitionProvider` の keyless 分岐を実際にテスト対象にしているので、カバレッジ自体の欠落ではなく DoD の数え上げ表現の不整合。ADR-004 の「5 箇所」と揃えて DoD も「5 ゲート」に統一すると、マージ判定基準が ADR とドリフトしない。

---

## 個別確認（前回の重点 3 点の再検証）

- **AC-3 接続テスト（前回 P-001 の穴）**: ステップ 9 に「`HttpSpeechConnectionTester` L36-39 の empty-key 短絡を keyless provider でスキップし `adapter.ping(cfg, "", timeoutMs, { ai })` に進む」が明記され、テスト方針にも「keyless + apiKey 空 + binding 有りで `ok:true`」の回帰固定ケースが追加された。**穴は塞がれている。**
- **AC-2/3/4 の staging 依存（前回 P-002）**: 「Definition of Done とクローズ条件」節が新設され、マージ DoD／staging 確定項目／クローズ・revert 条件が分離。AC 表に「検証環境」列と「全 AC チェック = 完了ではない」注記が入り、誤読リスクが解消された。
- **ADR-003 スコープ縮小の妥当性**: `@cloudflare/workers-types@4.20260511.1`・確認日 2026-07-01 が追記され（前回 S-003）、Phase 4 で OpenAI ルート引き継ぎ Issue 起票がアクション化された（前回 S-001）。実態調査に基づく妥当な適応で、意図の宙吊りも解消。

---

## スコープ整合性チェック

- plan「含まれないもの」4 項目は Issue 本文・#738 ADR-003・#766 運用と整合。スコープ外作業の紛れ込み無し。
- ドメイン union 追加は `deepgram-workers-ai` 1 値のみで ADR-003 の Deepgram 単独スコープと内部整合。
- `wrangler.{staging,production}.toml` の `[ai]` binding 追加はルート供給に必要なインフラ配線であり creep ではない。

---

## 良い点

- 1周目の最重要指摘（application 層 apiKey ゲートの見落とし = 5 箇所の keyless 分岐）を、keyless 述語を **domain SSOT** に置く設計へ昇華し、domain 不変条件・usecase・DI・tester の一貫参照でドリフトを構造的に防いでいる。単なる分岐追加でなく配置原則まで踏み込んだ反映。
- DoD 節が「マージしてよい条件」と「staging で確定させる条件」を分離し、opt-in + 原子的 revert のクローズ条件まで明文化。環境制約（実 env.AI 不達）下での完了定義として堅実。
- 偽陽性（`runIngestionJob` の `SpeechFailureError` 握り潰し）を継承し、受理判定を「ノート保存成功」でなく adapter/ネットワーク層の 2xx + 非空 transcript で下すと明記。カバレッジの質を守る。
- AC-6 の「空の音声入力」と「空 transcript 出力」を別ケースに分離（前回 S-002 反映）し、既存 REST adapter テストとの対称性を厳密化。

---

## サマリー

- 問題点: 0 / 改善提案: 2
- `[S-001]` AC-3 対応ステップ列に adapter/ping のステップ 3 が抜けている（トレーサビリティ軽微）
- `[S-002]` DoD の「4 ゲート」表現が ADR-004・リスク節の「5 箇所」と不整合（request DI ゲートが数え漏れ／テスト自体は存在）

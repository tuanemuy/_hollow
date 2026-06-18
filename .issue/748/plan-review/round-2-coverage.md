# Plan Review Round 2 — Issue #748（視点: Issue要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/748/plan.md` / `.issue/748/adr.md`
レビュアー視点: Issue本文4要件（LLM永続記録源新設・hourly時系列・scalar llmCallsToday・P40追加）が検証可能なACに漏れなく落ち、AC↔実装ステップが整合し、スコープ外作業が無いか。Round 1指摘の反映の妥当性も見る。

---

## Round 1 指摘の反映状況

| Round 1 指摘 | 内容 | Round 2 での反映 | 妥当性 |
|---|---|---|---|
| **[S-001]** 記録粒度の明文化 | 「1 プレビュー 1 行」か「LLM API 呼び出し回数」か曖昧。scalar「回」の定義に直結 | AC-1 に「**1 LLM API 呼び出し = 1 行**」を明記。structure=2行 / html・markdown=1行 / 空audio=0行 の具体例まで定義。AC-3 で scalar「回/24h」= LLM API 呼び出し回数と確定。テスト方針に分岐別の期待行数（2/1/0回）を明記 | ◎ 適切。粒度が API call 単位で一意に確定し、テストの期待値も定まった。虚偽表示禁止のラベル「回」の意味もブレない |
| **[S-002]** Stub 記録方針の AC 昇格 | 「リスクと注意点」止まりで AC 未昇格。AC-4「実データ一致」と緊張 | AC-1 に但し書き「**provider が Stub のときは記録しない**」を追加し AC-4（虚偽表示禁止）と明示的に結びつけ。ADR-002 Decision にも codify。request 路=catch変換で自然非記録 / consumer 路=Stub判定でスキップ、と経路別に確定 | ◎ 適切。基準レベルで AC-4 整合が担保された。経路差（preview/ingestion）の扱いも実コード構造に即している |
| **[S-003]** 保持期間の確定 | ADR-005 で「暫定24h、数日も可」と未確定。境界テストの期待値が定まらない | AC-6 で `LLM_CALL_LOG_RETENTION_HOURS = 48` に確定。「表示窓24h < 保持窓48h」の根拠と「daily tick タイミングに依らず直近24h が刈られない」を明記。ADR-005 Decision も 48h に確定 | ◎ 適切。境界テストの期待値が定まり、表示欠落リスクも排除。スコープは定数1個の値決めのみで膨張なし |

Round 1 の改善提案 3 件はいずれも妥当な形で反映されており、形式合わせでなく実質（テスト期待値・AC整合・虚偽表示禁止整合）まで落ちている。過剰反映やスコープ膨張も無い。

---

## Issue 4要件 → AC マッピング（再確認）

| Issue「やること」 | 対応 AC | 落ちているか |
|---|---|---|
| 1. LLM 永続記録源新設（owner / provider / occurredAt 保持） | AC-1 | ◎ owner / provider / occurredAt 明示。preview / ingestion 両経路 + 分岐別行数まで検証可能化。provider 真実源（実構築 provider 名, ADR-006）も明記 |
| 2. hourly 時系列（UTC bucket・24本0埋め・partial-failure null degrade） | AC-2 | ◎ アップロード系列と同型4条件すべて基準文に明記 |
| 3. scalar `llmCallsToday` の実装可否を検討 | AC-3（+ADR-004） | ◎ 「実装する」と確定し、回/24h の定義（直近24h COUNT(*)）まで明記 |
| 4. P40 Dashboard「直近24時間」に LLM 系列追加（虚偽表示禁止） | AC-4 | ◎ 系列 null→『取得失敗』、0件→平坦線、scalar 実数表示まで検証条件化 |

派生 AC（AC-5 best-effort / AC-6 pruner / AC-7 他scalar不変）も ADR から正しく導出。AC↔ステップの対応表は Round 2 でも双方向で整合（AC-1→1,2,3,6,7,11 / AC-2→4,5 / AC-3→5 / AC-4→8 / AC-5→6,7 / AC-6→10,11 / AC-7→5）。

## Round 2 新規構造主張のコード照合

- `runPruneTick` は `pruneActivityLog` を独立 try/catch で包む（handlers.ts L104-110）→ AC-6/ADR-005 の「独立ブロックで failure isolation」根拠は実コードと一致。
- `runPipeline(deps: PipelineDeps)` は free function（L273）で呼び出し元 L124 → ADR-002/ステップ7 の「PipelineDeps に recorder/clock/providerName を追加」方式は実構造に即している。
- `buildLlmProvider`（L578）は `LLMProvider` インスタンスのみ返し、key/model 欠落で `StubLLMProvider` を返す（L584）→ ADR-006「env 値 ≠ 実構築 provider」「Stub 非記録」の前提は正しい。

計画の事実前提に誤りは無い。

---

## 問題点（要修正）

問題点ゼロ。

Issue 本文4要件はすべて検証可能な AC に落ち、AC↔実装ステップが双方向で整合し、スコープ外作業の混入も無い。Round 1 の3提案（記録粒度・Stub記録方針・保持期間）はいずれも AC/ADR/テスト方針へ実質的に反映され、カバレッジ・スコープ整合性の観点で残課題は無い。

---

## 改善提案（検討推奨）

改善提案ゼロ。

Round 1 で挙げた3点が解消され、新たなカバレッジ・スコープ上の懸念は生じていない。スコープ「含まれないもの」5項目（provider別系列描画 / 他scalar D1実装 / token・コスト記録 / 期間変更導線 / `llm.called`イベント新設）も Round 1 から不変で、Issue 本文・#595 ADR と整合した正しい線引きを維持している。

---

## 良い点

- Round 1 の3提案がすべて「AC への昇格 + テスト期待値の確定」という検証可能な形で反映され、特に AC-1 の記録粒度「1 LLM API 呼び出し = 1 行」が分岐別行数（structure 2 / html・markdown 1 / 空audio 0）まで具体化された点は、scalar「回/24h」の意味と虚偽表示禁止のラベル定義を一意に固定しており優秀。
- Stub 非記録を AC-1 但し書きへ昇格し AC-4（虚偽表示禁止）と明示結合、かつ request/consumer 経路差を実コード構造（catch 変換 vs Stub 判定スキップ）に即して確定した。基準レベルで「実データ一致」が担保されている。
- 保持期間 48h 確定により「表示窓 < 保持窓」が成立し、境界テストの期待値と表示欠落リスクが両方解消。スコープは定数1個で膨張なし。
- Round 2 で追加された構造的主張（buildLlmProvider 戻り値変更・runPipeline free function 注入・runPruneTick 独立 try/catch）がいずれも実コードで裏取りでき、AC↔ステップの整合を崩していない。

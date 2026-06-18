# 動作確認計画 — Issue #748: LLM 呼び出しの永続記録源を新設し P40 ダッシュボードに LLM 時系列を追従

**Issue:** #748
**作成日:** 2026-06-18

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm db:generate                 # Drizzle schema から新規マイグレーション SQL を生成（新テーブル llm_call_log を追加するため必須）
pnpm db:migrate                  # ローカル D1 (hollow-local-d1) にマイグレーションを適用（= pnpm db:apply:local）
pnpm seed:dev-admin              # 決定的な admin ユーザー + セッション（token: dev-admin-session-token）を投入
pnpm dev                         # vite dev (workerd) を http://localhost:3000 で起動
```

- `/admin` は admin 権限が必要。`seed:dev-admin` が投入する admin セッション（cookie に `dev-admin-session-token`）でアクセスする。
- 本 Issue は新テーブル `llm_call_log`（`0020_llm_call_log.sql`）を追加するため、確認前に必ず `pnpm db:generate` → `pnpm db:migrate` を実行してローカル D1 にテーブルを作る。

### LLM 系列データの作り方（重要）

LLM hourly 系列・scalar `llmCallsToday` は新テーブル `llm_call_log` への記録が唯一の源で、**実際の LLM 呼び出しが成功したときのみ**行が積まれる（記録粒度 = 1 LLM API 呼び出し = 1 行）。データを作る方法は次の 2 つ。

1. **実 LLM 呼び出しを発生させる**（推奨・最も実態に近い）: admin で LLM provider（API キー / モデル）を設定したうえで、プロンプトプレビュー（`previewPrompt`）や ingestion 経由の structure・metadata 生成を実行する。structure プレビューは `structureToHtml` + `suggestMetadata` で 2 行、html/markdown 分岐は `suggestMetadata` のみで 1 行、空 audio は LLM を呼ばないので 0 行が記録される。
2. **シード SQL を投入する**: 実 LLM キーが用意できない場合、`pnpm db:execute:local --file <sql>` で `llm_call_log` に直近 24h 内へ散らした行を投入する。`occurred_at` は ISO8601 text（UTC）で、複数の時間バケットに分散させ、一部の時間帯を 0 件にして平坦線も確認できるようにする。

> **虚偽表示禁止の前提**: 記録されるのは実 LLM 呼び出しのみ。**provider が Stub（LLM 未設定）のときは記録されない**ため、Stub 環境で系列・scalar に数値が乗ることはない。シード SQL は「実呼び出しがあったらこう積まれる」状態を再現する手段であり、Stub 環境の挙動確認とは別物として扱う。

### シードデータ

- admin: `pnpm seed:dev-admin`（冪等）。
- LLM 系列確認用の `llm_call_log` 行は、上記「実 LLM 呼び出し」または `pnpm db:execute:local --file <sql>`（直近 24h 内に散らした行 + 一部 0 件時間帯 + 保持窓境界の 24h〜48h の行）で投入する。

### デプロイ方法

検証環境（ローカル D1 + `pnpm dev`）のみで確認できるため、ステージング/本番へのデプロイは本確認には不要。
（参考: ステージング反映は `pnpm db:apply:staging` でマイグレーション適用 → `pnpm deploy:staging:all`。本確認では使わない。）

## 確認項目

### 1. LLM hourly 時系列が実データで描画される

- **対応する受け入れ基準:** AC-1, AC-2, AC-4
- **目的:** `llm_call_log` の hourly 集計が直近 24 バケットで正しく描かれる（アップロード系列と同型）
- **手順:**
  1. 実 LLM 呼び出し（プレビュー / ingestion 経由）または `pnpm db:execute:local --file <sql>` で、直近 24h 内の複数時間帯に `occurred_at` を持つ `llm_call_log` 行を投入する（一部時間帯は 0 件にする）
  2. admin セッションで `/admin` を開く
  3. 「直近 24 時間」セクションの LLM 呼び出し sparkline を確認する
- **期待結果:** 投入した時間帯にピーク、0 件の時間帯は平坦（0）として連続した 24 バケットで描かれる。アップロード系列と LLM 系列で bucket 境界（UTC hour）が一致する
- **確認ポイント:** 0 件の時間帯が「取得失敗」ではなく平坦線（0）で正直に描かれること（null と 0 の区別）。structure プレビュー 1 回で 2 行、html/markdown 1 回で 1 行記録されること（記録粒度 = API 呼び出し回数）

### 2. scalar「LLM 呼び出し (24h)」が実数で表示される（null 固定解除）

- **対応する受け入れ基準:** AC-3, AC-4
- **目的:** `llmCallsToday`（直近 24h の `COUNT(*)`）が実データで表示され、#545 / #595 の『取得失敗』固定が解消される
- **手順:**
  1. `llm_call_log` に直近 24h 内の行を投入する（投入数を記録しておく）
  2. `/admin` を開き「LLM 呼び出し (24h)」metric-card を確認する
- **期待結果:** 投入した直近 24h 内の行数（= API 呼び出し回数）がカードに実数で表示される。ラベルは「回 / 24h」のまま
- **確認ポイント:** 『取得失敗』表示でなく実数が出ること。24h 窓の境界（24h ちょうど直後の行は集計外）が正しいこと

### 3. Stub / LLM 未設定時は系列が描かれず scalar が虚偽表示にならない

- **対応する受け入れ基準:** AC-1（但し書き）, AC-4
- **目的:** Stub provider（LLM 未設定）では記録が発生せず、系列・scalar が実態と乖離しない
- **手順:**
  1. LLM provider を未設定（API キー / モデル欠落 = Stub フォールバック）にした状態でプレビュー / ingestion を実行する
  2. `llm_call_log` に行が増えていないことを `pnpm db:execute:local --file <sql>`（SELECT COUNT）等で確認する
  3. `/admin` の LLM 系列・scalar を確認する
- **期待結果:** Stub 呼び出しでは `llm_call_log` に行が積まれない。系列は 0 件（平坦線）、scalar は 0。データ源があるのに『取得失敗』を出すような虚偽表示にならない
- **確認ポイント:** Stub 呼び出しが系列・scalar の数値に一切乗らないこと（実 LLM 呼び出しのみが数値に乗る）

### 4. partial-failure 時の degrade

- **対応する受け入れ基準:** AC-2, AC-3, AC-5
- **目的:** 系列取得が失敗したときに当該系列のみ degrade し、ページ全体・本処理が落ちない
- **手順:**
  1. LLM 系列の集計クエリが失敗する状況を再現する（provider が当該系列を `null` で返す状態を擬似）
  2. `/admin` を開く
- **期待結果:** LLM 系列カードが「取得失敗」プレースホルダになり、アップロード系列・他カード・ページ全体は落ちない（partial-failure 契約）
- **確認ポイント:** 記録失敗が LLM 本処理（プレビュー結果返却・ジョブ実行）を壊さないこと（best-effort）。記録に失敗してもプレビュー / ingestion は従来どおり成功すること

### 5. 既存アップロード系列・他 metric-card への回帰

- **対応する受け入れ基準:** AC-7
- **目的:** LLM 系列・scalar の追加で既存表示が壊れない
- **手順:**
  1. ingestion ジョブをシード / 実行してアップロード系列を描画させる
  2. `/admin` を開き、アップロード sparkline と他 4 scalar（userCount / storage* / uploadsToday）を確認する
- **期待結果:** アップロード系列は従来どおり描画される。他 scalar は引き続き `null` 固定（『取得失敗』）で挙動不変。「直近 24 時間」セクションが 2 カラム（アップロード + LLM）に戻り、モバイル（max-sm）表示が崩れない（#749 のモバイル整合と干渉しない）
- **確認ポイント:** 2 カラムへの復帰でモバイルレイアウトが回帰していないこと。sparkline の aria-label がアップロード / LLM で正しく出し分けられること

### 6. 刈り込み（保持窓 48h）

- **対応する受け入れ基準:** AC-6
- **目的:** `llm_call_log` が pruner daily tick で保持期間（48h）超過行を刈られ、表示窓 24h は刈られない
- **手順:**
  1. `pnpm db:execute:local --file <sql>` で、48h 超過の行（古い `occurred_at`）と直近 24h 内の行を混在投入する
  2. pruner daily tick を発火させる（`pnpm dev` のスケジュール / ローカル tick 手順に従う）
  3. `pnpm db:execute:local --file <sql>`（SELECT）と `/admin` で残存行・系列を確認する
- **期待結果:** 48h 超過行が削除され、直近 24h（表示対象）の行は残る。daily tick のタイミングに依らず直近 24h の表示対象が刈られない（表示窓 24h < 保持窓 48h）
- **確認ポイント:** LLM prune が `runPruneTick` 内の独立 try/catch で動き、activity-log prune の失敗と相互にブロックしないこと（failure isolation）。既存の outbox / activity_log / ingestion_burst_log の刈り込みが従来どおり動くこと

## エッジケース・異常系

### 1. LLM データが空（リリース直後 / 記録源新設直後）

- **目的:** `llm_call_log` が空のときの正直な表示
- **手順:** `llm_call_log` を空のまま `/admin` を開く
- **期待結果:** LLM 系列は 24 バケットすべて 0 の平坦線、scalar は 0。『取得失敗』ではない（データ源はあるが行が無いだけ）

### 2. bucket 境界の一致

- **目的:** アップロード系列と LLM 系列で UTC hour bucket が一致する
- **手順:** 同一時間帯（同じ UTC hour）にアップロードと LLM 呼び出しの両方を発生 / シードし、両 sparkline の同じバケットにピークが立つことを確認する
- **期待結果:** 両系列の bucket 境界（`substr(occurred_at,1,13)`）が一致し、同じ時間帯のピークが揃う

## 既存機能への影響確認

- **ingestion ジョブ実行**: best-effort 記録の追加後も `runIngestionJob` / `runPipeline` の既存ジョブ実行が壊れないこと（アップロード → ジョブ完了が従来どおり動く）。記録失敗がジョブ遷移に波及しないこと。
- **プロンプトプレビュー**: `previewPrompt` の記録追加後もプレビュー結果が従来どおり返ること。記録失敗がプレビュー成否に影響しないこと。
- **既存 4 metric-card のうち LLM 以外（userCount / storage / uploadsToday）**: 引き続き `null` 固定で #545 / #595 時点の表示（『取得失敗』）から変化しないこと（回帰確認, AC-7）。
- **pruner**: 既存の `outbox_events` / `activity_log` / `ingestion_burst_log` 刈り込みが従来どおり動き、新規 `llm_call_log` prune が独立 try/catch で追加で動くこと。

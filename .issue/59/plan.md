# 実装計画 — Issue #59: /admin Dashboard と /admin/metrics が "Cannot read properties of undefined (reading 'collect')" で 500

**Issue:** #59
**作成日:** 2026-05-20
**複雑度:** 小規模

---

## 目的

admin ユーザーで `/admin`（AdminDashboard）と `/admin/metrics`（MetricsPage）を開いた際に 500 で落ちる既存不具合を解消し、両ページを描画可能にする。

エラーは `TypeError: Cannot read properties of undefined (reading 'collect')`。原因は Cloudflare 用の DI コンテナ (`createRequestContainer`) が `RequestContainer.usageMetricsProvider` を埋めずに `as unknown as RequestContainer` でキャストしているため、`getUsageMetrics` usecase が `container.usageMetricsProvider.collect()` を呼んだ瞬間に未定義参照で落ちている。

## スコープ

### 含まれるもの

- `app/core/application/di/serverCloudflare.ts` の `createRequestContainer` に `usageMetricsProvider` を配線する。
- 配線する実装は `NullUsageMetricsProvider`（`app/core/application/ports/usageMetricsProvider.ts`）を採用する。
  - 値は全フィールド `null` を返す no-op で、UI 側は既に「取得失敗」プレースホルダで描画する設計になっている（`Dashboard/index.tsx`, `Metrics/index.tsx` で確認済み）。
  - 実テスト harness (`app/core/application/__tests__/helpers.ts`) も同じ実装を採用しているため、プロダクション挙動とテスト挙動が一致する。

### 含まれないもの

- 実メトリクス収集ロジック（D1 行数集計・R2 / DO バイト集計・LLM 呼び出し集計）の実装。
  - これは別途、メトリクスを実際に収集できる adapter を作る作業になる。本Issueは「500 で落ちない」ことを目的とする。
- `/admin/llm` の `SystemError: Stored instance_settings violates invariants`（Issue #3 manual-test analysis.md セクション B でも別事象として切り分けられている）。
- `createRequestContainer` 内で他に未配線な可能性のあるポート（`objectStorage`, `llmProvider`, `secretBox`, `llmConnectionTester`, `ocrProvider`, `speechRecognitionProvider`, `officeExtractor`, `pdfExtractor`, `tempFileStorage`, `promptResolver`, `adminSettingsEnv` 等）。これらは現状 `as unknown as RequestContainer` キャストで型システムを欺いているが、本Issueの再現経路（/admin・/admin/metrics）には関係しないため別途対応する。

## 実装ステップ

### 1. `NullUsageMetricsProvider` を import して `createRequestContainer` に配線する

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - import に `NullUsageMetricsProvider` を追加（既存の `ports/...` 系 import と並べる）:
    ```ts
    import { NullUsageMetricsProvider } from "../ports/usageMetricsProvider";
    ```
  - `createRequestContainer` の return 値に `usageMetricsProvider: NullUsageMetricsProvider` を追加する。
- **理由:** `RequestContainer.usageMetricsProvider` は型上必須だが、現実装では `as unknown as RequestContainer` で握り潰しており、`/admin`・`/admin/metrics` から `getUsageMetrics` usecase に到達した時点で `undefined.collect()` を呼んで TypeError になる。`NullUsageMetricsProvider` は port が公式に提供する no-op 実装で、UI の「取得失敗」プレースホルダ表示と整合する。

## 設計判断

実メトリクス収集 adapter を新規実装するか、`NullUsageMetricsProvider` を配線するかの選択。本Issueは「500 を解消する」ことが目的で、現実装の UI（`Dashboard/index.tsx`, `Metrics/index.tsx`）は値が `null` の場合に「取得失敗」「—」を表示する設計になっている。port の JSDoc も「runtime-specific implementation がまだ無い場合のデフォルト」として `NullUsageMetricsProvider` を提供している。したがって `NullUsageMetricsProvider` 配線が最小修正かつ設計意図と整合。

詳細な ADR は不要（port が公式に提供する fallback を採用しただけ）。

## リスクと注意点

- `as unknown as RequestContainer` キャストは本修正後も残る。他の未配線ポート（`objectStorage`, `llmProvider` 等）が runtime で呼ばれれば同じ TypeError が発生し得る。本Issue範囲外だが、`/admin/llm`・`/admin/registration`・取り込みフロー等を触る際は要注意。
- `NullUsageMetricsProvider` は alerts が常に空配列なので、Dashboard 上部の「All systems operational」バナーが常時表示される。これは port 仕様通りであり、実メトリクス adapter が入るまでの中間状態として許容する。

## テスト方針

- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` が通る。
- ブラウザ検証で以下を確認:
  - `/admin` が 200 で描画される（取得失敗プレースホルダ・「All systems operational」バナーが想定通り）。
  - `/admin/metrics` が 200 で描画される（数値カードが `—` 表示、`LimitsCard` がインスタンス設定の値で埋まる）。
  - 非 admin での 403／未ログインでのリダイレクト挙動が変わっていない（既存挙動の非破壊確認）。

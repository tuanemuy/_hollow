# ADR — Issue #255: Issue #226 フォローアップ: ingestion / note actions の小規模リファクタリング

## ADR-001: `IngestionJobWire` から `errorReason` を削除し、UI 表示を `errorCode` のみに切り替える

### Status
Proposed

### Context

Issue #226 の review-001 (W-B-003) と本 Issue #255 で、`IngestionJobWire.errorReason` がそのまま UI / クライアントへ流出していることが指摘された。`errorReason` は domain 側で `meta.message ?? cause.message ?? String(cause)`（`runIngestionJob.ts:331-377` の `markFailedSafely`）で組み立てられる自由文字列で、内部実装（`fetch` failure メッセージ、LLM provider が返すスタックトレース風文字列など）が UI に素通りするリスクがある。

選択肢:

1. **Wire から `errorReason` を削除し、UI には `errorCode` のみ表示**
2. Wire で `errorReason` を redact / サニタイズ（既知パターンの除去）
3. そのまま維持 + UI 側でホワイトリスト変換

(2) は「何が internal で何が public か」のルール定義が継続的に必要で、ルールが追いつかないと結局漏れる。(3) は Issue #226 ADR-014 で見送られた現状そのもの。

UI 側の影響:
- 現状: `{errorCode}: {errorReason}` を `IngestionJobRow.tsx:136-140` と `UploadDialog.tsx:496-500` で表示
- 変更後: `{errorCode}` のみ表示
- `errorCode` は `IngestionErrorCode` の enumerable な値（例: `INGESTION_TIMEOUT`, `unsupported_format`, `llm_failure`）が入り、ユーザーへは失敗種別が十分伝わる
- `spec/domains/ingestion.md` でも `errorReason` の UI 表示は必須要件として書かれていない

### Decision

**`IngestionJobWire` から `errorReason` を削除する。** `IngestionJobDTO` / domain / DB の `errorReason` は spec の必須項目としてサーバ側に温存し、サポート参照・ログ用途に使う。presentation 境界 (`toIngestionJobWire`) で 1 度だけ落とすことで、`getIngestionJobFn` / `loadIngestionJobs` の両経路を同一のルールでガードする。

UI 表示は `{errorCode}` のみとし、将来 `errorCode → 日本語訳マップ` を整備する場合は別 Issue とする。

### Consequences

- 良い点:
  - 内部実装が UI に漏れるリスクを境界で構造的に遮断（redact ルール維持が不要）
  - `getIngestionJobFn` と `loadIngestionJobs` の漏出経路を Wire 統一で同時にガード
  - hexagonal 原則「Validate at the boundaries」と整合
  - サポート参照用の `errorReason` はサーバ側で温存され、observability は維持される
- トレードオフ:
  - 失敗ジョブの UI 表示が `code: reason` から `code` のみに変わる（軽微な UX 変更）。ユーザーが support に問い合わせる際は `errorCode` で job を特定し、サーバログから `errorReason` を引く運用に切り替わる
  - 将来「ユーザー文言マップ」が必要になったら別途実装が必要（plan で別 Issue 候補と明示）

### Scope limitation: admin/Jobs 経路は本 PR スコープ外



review-001 W-F-001 で `app/components/admin/Jobs/index.tsx:207-208` も `IngestionJobDTO.errorReason` を直接表示していることが確認された。Issue #255 は Issue #226 / PR #251 のレビュー指摘点のフォローアップという成り立ちのため、admin 経路は元 Issue が触れていない領域として **本 PR では意図的にスコープ外**とする。同等の境界遮断を admin 経路にも適用するフォローアップ Issue を別途起票する（Phase 4）。

---

## ADR-002: テストヘルパーの配置先を `app/components/_test-utils/` とする

### Status
Proposed

### Context

W-T-010 で導入した `serverFnMock` ヘルパーを components ディレクトリの近くに置きたい。既存規約として各ドメインフォルダ内に `__tests__/` がある（`app/components/ingestion/__tests__/`, `app/components/note/__tests__/` 等）が、複数ドメインから共有する横断ヘルパーは特定のドメイン下に置けない。

選択肢:

1. **`app/components/_test-utils/serverFnMock.ts`** — 横断ヘルパー専用ディレクトリを新設、underscore prefix で明示
2. `app/components/__tests__/_utils/serverFnMock.ts` — 既存 `__tests__/` 名前空間の下に共通フォルダ
3. `app/test-utils/serverFnMock.ts` — components 外のトップレベル

### Decision

**(1) `app/components/_test-utils/` を選択。**

理由:
- vitest のデフォルト test 検出パターン `**/*.{test,spec}.?(c|m)[jt]s?(x)` に該当しないため、`.test.` を含まないファイル名なら test 実行されない（実行時に確認済み: `pnpm test:unit` 全 green）
- underscore prefix は test/internal フォルダの慣用表記で、production import からも視覚的に分離される
- (2) は `__tests__/` がドメインフォルダ下の暗黙規約（各 owner が自分のテストを置く）なので、横断ヘルパーを混ぜると規約が二重化する
- (3) は components の近接配置のメリットを失う

### Consequences

- 良い点: 横断テストヘルパーの置き場所が明示的、vitest の test 検出から確実に除外
- トレードオフ: production tree (`app/components/`) 直下に test 専用ディレクトリが 1 つ追加される（命名で区別可能、production import からは決して参照されない前提）

---

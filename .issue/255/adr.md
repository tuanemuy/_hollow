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

---

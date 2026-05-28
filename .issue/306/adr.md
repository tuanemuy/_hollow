# ADR — Issue #306: ingestion commit パスで directoryNameToCreate ありの場合に Sidebar が stale になる

## ADR-001: `IngestionJobRow` の commit パスを本 Issue の修正対象から外す

### Status
Accepted

### Context
Issue #306 の本文には次の記述がある:

> `IngestionPreviewForm.tsx` の `onSubmit`（commit）パスと `IngestionJobRow.tsx:82` の `commit` パスでは、`directoryNameToCreate` が指定されている場合に新規ディレクトリが作られる。しかしこれらのパスは `router.invalidate()` を呼ばずに `navigate` するため: Sidebar 上の directory tree が更新されない …

これを前提に初版 plan では両ファイルに対して rule 2 invalidate を追加する方針を採用した。

Phase 2 のブラウザ検証で実装と仕様を再確認したところ、**`IngestionJobRow` の commit パスは `directoryNameToCreate` を server function に送っていない**ことが判明した:

```ts
// app/components/ingestion/IngestionJobRow.tsx::onCommit (修正前後とも)
const result = await commit({ data: { jobId } });
```

サーバー側 (`commitIngestionPreview` use case) の `resolveDirectoryId` は

```
explicit directoryId → directoryNameToCreate → preview.suggestedDirectoryId → root
```

の優先順位で解決し、**`preview.suggestedDirectoryName` は使われない**。結果として `IngestionJobRow` の commit パスは「LLM が提案した新規ディレクトリ名」を反映せず、suggestedDirectoryId が `null` の場合はノートを root 直下に保存する仕様。

DB / UI 双方の検証で、`IngestionJobRow` 経由の commit では新規ディレクトリ自体が作られないことを確認した（`.issue/306/manual-test/results/TC-2.md` 参照）。

### Decision
- `IngestionJobRow.onCommit` への `router.invalidate()` 追加を **取り下げ**、修正は `IngestionPreviewForm` のみに絞る。
- Issue 本文の前提（「`IngestionJobRow` の commit パスでも新規ディレクトリが作られる」）は事実誤認だったため、Issue を closes するにあたっては「実際に Sidebar が stale になりうるのは `IngestionPreviewForm` の commit パスのみ」と PR 説明で明示する。

### Consequences
- **良い点:**
  - 「新規ディレクトリ作成が実際に発生するパスでのみ生 invalidate を呼ぶ」という意味的に正しい修正に絞れる
  - 機能しない判定式（`willCreateDirectory` フラグと invalidate 呼び出し）をコードベースに残さない（dead 判定はメンテナンスコストになる）
- **トレードオフ:**
  - Issue 本文には `IngestionJobRow` も含まれていたため、PR 説明と本 ADR で「なぜスコープから外したか」を明確に伝える必要がある
  - 将来 `IngestionJobRow.onCommit` 側で `directoryNameToCreate` を送るように仕様変更された場合、改めて rule 2 invalidate の追加が必要になる（その時点で再対応）

### Notes
`IngestionJobRow` の commit パスが LLM 提案の新規ディレクトリ名を反映しない件は **本 Issue のスコープ外** だが、UX 上は意図された挙動である可能性が高い（quick commit ボタンで勝手にディレクトリを作らない設計）。明示的な仕様変更が必要なら別 Issue で扱う。

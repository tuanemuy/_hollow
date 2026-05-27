# ADR — Issue #229: 破棄したアップロードジョブを取り込みキューに残さない（既定で非表示）

## ADR-001: フィルタの実装位置 — ポート拡張 vs usecase 内 JS フィルタ

### Status
Accepted

### Context
「破棄済みジョブをデフォルトで結果に含めない」をどの層で実現するかに選択肢がある:

1. **アダプタ層に閉じた特化メソッド**（例: `findActiveByOwner`）を追加して `findByOwner` と並列に置く
2. **ポート（`IngestionJobListOpts`）を拡張** して `excludeStatuses` を持たせ、`findByOwner` の振る舞いをオプションで制御
3. **usecase 内で全件取得 → JS で `filter`** する

### Decision
**2 を採用**。`IngestionJobListOpts.excludeStatuses?: readonly IngestionStatus[]` を追加し、D1 アダプタで `notInArray` 条件として実装する。

### Consequences

- 良い点:
  - ポートが宣言的にフィルタ語彙を持つので、application 層からは「discarded を除外したい」という意図がそのままコードに残る。
  - ページネーション（`limit` / `offset`）が正しく機能する。
  - 将来「`discarded` と `saved` を両方隠したい」等の拡張も配列追加で対応可能。
  - `findActiveByOwner` のような特化メソッドを増やさずに済むため、ポートの肥大化を防げる。
- トレードオフ:
  - `status`（include）と `excludeStatuses` の併用時の挙動を JSDoc で明示する必要がある（`status` 指定が常に優先）。
- 却下した案 3 の問題点:
  - `limit` / `offset` を D1 側で適用してから JS で filter すると、ページサイズが見かけ上縮む（ページの中身が穴あきになる）。これを避けるには全件 fetch が必要で、メモリと転送量の両方で破綻する。

---

## ADR-002: オプトイン手段 — `includeDiscarded` フラグ vs `status` 明示指定

### Status
Accepted

### Context
「破棄済みを含めたい」呼び出し側のために、どんなオプトイン手段を提供するか:

1. `includeDiscarded?: boolean` フラグ
2. `status: "discarded"` 明示指定
3. 両方サポート

### Decision
**3 を採用**。両方サポートし、両者を補完関係に置く。

- `includeDiscarded === true`: 既定除外を解除し、`discarded` を含む全ステータスを返す（将来のUI「破棄済みを表示」トグルが渡すことを想定）。
- `status: "discarded"`: `discarded` **のみ** を返す（履歴ビュー・管理用途の明示クエリ）。
- 両者が同時に渡された場合は `status` の指定が優先される（既定除外より具体指定が勝つ）。

### Consequences

- 良い点:
  - 「キューの表示モードを緩める」（トグル）と「履歴ビューを見る」（明示クエリ）の異なる意図を素直に表現できる。
  - 既存の `status` フィルタの挙動を壊さない。
  - 後続Issueで UI トグルを実装する際も追加実装不要（フラグだけ渡せばよい）。
- トレードオフ:
  - 入力フィールドが2つになることでテストケースの組み合わせが増える（→ Step 7 で3ケース明示）。

---

## ADR-003: 「破棄済みを表示」UI トグルを本Issueスコープに含めない

### Status
Accepted

### Context
Issue完了条件には「『破棄済みを表示』トグル等で履歴は確認可能（任意）」とある。任意要件をどう扱うか。

### Decision
**本Issueでは API（`includeDiscarded` フラグ）のみ用意し、UI 露出は後続Issueに委ねる**。

### Consequences

- 良い点:
  - Issueの意図（破棄したジョブが既定でキューに残らない）に焦点を絞り、レビュー負荷を下げる。
  - API 側に拡張ポイントを残すため、後続Issueで UI を足す際は表示制御だけで済む。
- トレードオフ:
  - 破棄したジョブをUIから再確認する手段が一時的に存在しない（DB直接照会 or `status: "discarded"` を渡すルートでしか辿れない）。
  - ただし「破棄」は明示操作であり、誤って隠したい情報には当たらないため、運用上の致命傷にはならない。
- 後続Issueへの引き継ぎメモ:
  - `app/components/ingestion/loaders.ts` の `loadIngestionJobs` シグネチャは現在 `actorUserId` のみを受ける。UI から `includeDiscarded` や `status: "discarded"` を渡すには、本Issue以降でローダーの拡張（または新規ローダー作成）が必要。本Issueでは usecase 側の API のみ整える。

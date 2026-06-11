# ADR — Issue #618 + #627: 公開検索（P32）UX改善 + 更新日時表示

## ADR-001: updatedAt は domain `SearchHit` に `Date` で追加する

### Status
Proposed

### Context
#627 の `updatedAt` を `SearchHitDTO` にだけ生やす案と、domain VO `SearchHit` から縦に配線する案があった。DTO 直載せはアダプター→DTO の横断参照になりレイヤー違反。

### Decision
`SearchHit`（ポート `SearchIndex.query` の戻り値 VO）に `updatedAt: Date` を追加し、adapter `toHit` で構築、usecase projection（`toSearchHitDTO`）で ISO 8601 文字列化する。値はインデックス（`search_documents.updated_at`）由来で結果整合。

### Consequences
- 良い点: 依存方向が inward のまま保たれ、`OwnedSearchHitDTO` の JSDoc とも整合
- トレードオフ: `SearchHit` を作る全テストフィクスチャに波及（コンパイルエラーで検出可能）

---

## ADR-002: `OwnedSearchHitDTO.updatedAt` は引き続き Note 集約（DB 最新行）で上書きする

### Status
Proposed

### Context
base DTO に `updatedAt`（インデックス由来・結果整合）が入ることで、owned 側の `updatedAt`（DB 最新行由来・authoritative）とソースが二重になる。

### Decision
`toOwnedSearchHitView` は引き続き `note.updatedAt` で上書きし、挙動を変えない。スプレッド順で base 値を上書きすることを保証し、JSDoc にソースの違いを明記する。

### Consequences
- 良い点: owned 検索の表示精度は維持
- トレードオフ: 同名フィールドのソースが文脈で異なる（JSDoc で緩和）

---

## ADR-003: フォーカス二重はグローバル `:focus-visible` を変えず `TOKEN_FIELD` 側で打ち消す

### Status
Proposed

### Context
二重リングの原因は `app/styles/index.css` のグローバル `:focus-visible { box-shadow: var(--shadow-focus) }` が token input の内側 `<input>`（`outline-none` のみ）に効き、ラッパー `TOKEN_INPUT` の `focus-within:shadow-focus` と重なること。グローバル規則の変更は全アプリに波及する。

### Decision
`TOKEN_FIELD` に `focus-visible:shadow-none` を追加し、フォーカスリングをラッパーの `focus-within:shadow-focus` に一本化する。

### Consequences
- 良い点: 影響範囲が token input に閉じる。a11y 上のフォーカス可視性はラッパーのリングで担保
- トレードオフ: 同型の合成コントロールを今後作る際に同じ打ち消しが必要（パターンとして styles.ts に集約されるので許容）

---

## ADR-004: 楽観的更新は `useOptimistic`（baseline + patch reducer）の既存パターンを踏襲する

### Status
Proposed

### Context
期間ラジオ等の即時反映には、ローカル state 二重管理 / `isPending` ベースの表示分岐 / `useOptimistic` の選択肢がある。`app/components/note/list/FilterBar.tsx`（#354 ADR-003）に `useOptimistic` の確立した先例がある。

### Decision
URL 由来の baseline `{ username, tags, period }` に `useOptimistic(baseline, reducer)` を適用し、`startTransition` 内で optimistic patch と `router.navigate` を同一 transition にまとめる。描画はドロワー内外の全箇所で楽観値を参照する。

### Consequences
- 良い点: React 19 標準プリミティブ・既存先例と一貫。loader 確定後は自動で URL 値にスナップバック
- トレードオフ: 楽観値の参照漏れがあると表示が割れる（レビューで全描画箇所を確認）

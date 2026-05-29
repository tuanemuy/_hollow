# ADR — Issue #238: UI に「破棄済みを表示」トグルを追加

## ADR-001: トグル状態の URL 表現とクリーンURL方針

### Status
Accepted

### Context
完了条件に「URL クエリパラメータでトグル状態が保持される」「`validateSearch` で型安全に扱う」とある。Issue 本文は `?includeDiscarded=1` 等と例示するが書式は固定されていない。一方プロジェクトには Issue #215 由来の「既定値を URL に載せない」方針（`paginationSearchSchema` の `.optional().catch(undefined)`）がある。

### Decision
- 検索スキーマ `uploadSearchSchema` は `includeDiscarded` を `union([boolean, string]).transform(...).optional().catch(undefined)` で定義し、`true` / `"1"` / `"true"` を真、未指定・不正値を `undefined` に正規化する。
- トグル ON 時は `router.navigate` で `includeDiscarded: true` を載せ（URL は `?includeDiscarded=true`）、OFF 時は `undefined` にしてパラメータを URL から落とす（クリーンURL）。
- `validateSearch` の出力は optional のまま保ち、loader 境界で `?? false` に再既定する（trash ルートの `?? PAGINATION_DEFAULT_*` と同型）。

### Consequences
- 良い点: URL が型安全かつクリーン（既定 OFF では余計なパラメータが付かない）。hand-typed な `?includeDiscarded=abc` でもルートが壊れない。
- トレードオフ: トグル経由では `=1` ではなく `=true` で永続化される（Issue の「等」の範囲内）。

### 補足（ブラウザ検証 TC-007 で判明・修正済み）
TanStack Router の既定 search パーサは **JSON ベース**のため、hand-typed `?includeDiscarded=1` は文字列 `"1"` ではなく**数値 `1`** として、`=true` は**真偽値 `true`** としてパースされる。当初 transform は `v === "1"`（文字列）のみを真としていたため `=1` が OFF に潰れていた。union に `z.number()` を加え、transform を `v === true || v === 1 || v === "1" || v === "true"` に拡張して解消した。非 JSON 値（`?x=abc`）のみ文字列で到達するため、boolean / number / string の3種を受ける。

---

## ADR-002: ポーリング経路へのフラグ貫通

### Status
Accepted

### Context
`IngestionQueue` は4秒間隔で `getIngestionJobsFn` を呼び `jobs` を上書きする。トグル ON の初期描画で破棄済みを含めても、ポーリングがフィルタ無しで再取得すると破棄済みが画面から消えてしまう。

### Decision
`getIngestionJobsFn` の入力スキーマに `includeDiscarded?: boolean` を追加し、`IngestionQueue` の `Props.includeDiscarded` をポーリングペイロードへ渡す。初期描画（RSC ローダー）とポーリング（RPC）で同一フィルタを使う。

### Consequences
- 良い点: トグル ON の状態がポーリングを跨いで維持される。RSC ローダーと RPC の双方が同じ usecase フラグを共有し、表示が一貫する。
- トレードオフ: server fn の入力面が1フィールド増えるが、`getIngestionJobs` usecase の既存契約をそのまま使うだけで追加ロジックは無い。

---

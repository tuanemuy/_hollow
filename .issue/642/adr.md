# ADR — Issue #642: 公開検索(P32)のソート選択肢追加

## ADR-001: 新着順の基準は `search_documents.updated_at`（index projection）とする

### Status
Proposed

### Context
「新着順」のタイムスタンプ基準に2つの候補がある。

1. `search_documents.updated_at` — ノート更新日時の index projection（#627 で導入済み）。結果カードに表示している `SearchHit.updatedAt` と同じ値。`sd` 単体で ORDER BY 可能
2. `publication_states.published_at` — 公開日。P32 の期間ファセットはこちらを基準にしている（ADR-006 / `dateBasis: "published_at"`）

期間ファセットとの一貫性を取るなら 2 だが、`published_at` は `search_documents` に projection されておらず、全クエリで `publication_states` join が常時必要になる（現在は date window がある場合のみ join）。また並び順の根拠となる値が結果カードに表示されない（カードは `updatedAt` を表示）ため、ユーザーから見て並びが説明不能になる。

### Decision
1 の `updated_at` 降順を採用する。Issue 本文も「`updated_at` 降順などのソート切替（#627 で projection 済み）」を想定スコープとして明記している。tie-breaker は `note_id ASC` でオフセットページネーションの安定性を確保する。

### Consequences
- 良い点: join 追加なし・マイグレーション不要。表示値（カードの更新日時）と並び順が一致し、ユーザーに説明可能
- トレードオフ: 期間ファセット（公開日基準）と時間軸が異なる。「新着順」が「最近公開された順」ではなく「最近更新された順」になる。spec にこの定義を明記して曖昧さを残さない。将来「公開日順」が必要になれば `published_at` の projection 追加（別Issue）で対応可能

---

## ADR-002: ソートUIは2択のサイクル式トグルボタンとする

### Status
Proposed

### Context
デザインモックの `.sort-btn` は下矢印（chevron）付きボタンで、ドロップダウンメニューを示唆する見た目。選択肢は「関連度順 / 新着順」の2つのみ。実装候補:

1. ドロップダウンメニュー（listbox / popover）— モックの示唆に忠実だが、2択のためにメニューの開閉・フォーカス管理・ARIA 実装を新規に持ち込む
2. クリックで2値を交互に切り替えるサイクル式トグルボタン — ボタンテキスト自体が現在の状態を示す

### Decision
2 のサイクル式トグルを採用する。見た目（h36px pill / 下矢印 / hover）はモックの `.sort-btn` に合わせ、AC-4 の「見た目と整合する」を満たす。挙動はワンクリックで切替（メニューより操作数が少ない）。選択肢が3つ以上に増えた時点でドロップダウン化を検討する。

### Consequences
- 良い点: クライアント側の状態・フォーカストラップ不要で `router.navigate` 1発のシンプルな実装。操作も1クリック
- トレードオフ: 下矢印がメニューを示唆するのに押すと即切り替わる、という軽微なアフォーダンス齟齬。ボタンラベルが常に現在値を表示するため実害は小さい。モックも同一の見た目（下矢印付きボタン）でラベルのみ動的という前提に揃える

---

## ADR-003: スタイル定数名は `SORT_BTN` ではなく `SEARCH_SORT_BTN` とする

### Status
Accepted

### Context
計画では `app/components/public/styles.ts` に `SORT_BTN` を追加する想定だったが、同ファイルには既に P31 ツールバー（`PublicTopControls`）用の `SORT_BTN` が存在し、名前が衝突する。

### Decision
P32 ソートトグル用の定数は `SEARCH_SORT_BTN` と命名する。クラス文字列の内容（モック `.sort-btn` 準拠）は計画どおり。

### Consequences
既存 P31 の `SORT_BTN` は無変更。P32 側は接頭辞 `SEARCH_` で他の P32 定数（`SEARCH_HIT_*` 等）と揃う。

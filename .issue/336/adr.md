# ADR — Issue #336: UI ボタンとリンクのスタイルを整理・統一する

## ADR-001: nav-item base の共通部分から「選択中の背景」を除外する

### Status

Accepted

### Context

`layout/styles.ts` の `NAV_ITEM`（サイドバーのナビリンク）と `directory/styles.ts` の `TREE_ITEM_LINK`（ディレクトリツリーのリンク）は、box model・タイポグラフィ・`rounded-md`・選択中の `font-medium`（`data-[active]` / `aria-[current=page]`）を共有している。これを common の `navItem` base へ SSOT 化するにあたり、「どこまでを共通 base に含めるか」を確定する必要があった。

両者で挙動が異なるのは**選択中の背景**:

- `NAV_ITEM`: 選択中背景（`bg-surface`）と hover 背景（`hover:bg-surface`）を**リンク自身**に塗る。
- `TREE_ITEM_LINK`: 背景は持たず、選択中の `font-medium` だけをリンクに残す。選択中背景・hover 背景は**行**（`TREE_ITEM_ROW`）側で `has-[a[data-active]]:` / `hover:` により塗られ、ハイライトがキャレット列・アクション列まで広がる設計（既存 JSDoc に明記）。

選択肢:

1. 背景も含めて共通 base に入れ、tree 側で上書き/打ち消す。
2. 背景は共通 base に**含めず**、各 consumer の固有差分として残す。

### Decision

選択肢 2 を採る。`navItem` base には両者で**完全に一致するトークンのみ**を含める:

```
flex items-center gap-2 px-3 py-[7px] rounded-md text-sm text-ink cursor-pointer
transition-colors motion-reduce:transition-none select-none no-underline
data-[active]:font-medium aria-[current=page]:font-medium
```

- `NAV_ITEM` = `${navItem} relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface`
- `TREE_ITEM_LINK` = `${navItem} flex-1 min-w-0 truncate`

### Consequences

- 良い点: 各 consumer の最終 class 集合が**変更前と完全に等価**（追加トークンはすべて互いに非競合の別プロパティのため、文字列結合順に依存せず生成 CSS が一致）。**視覚回帰ゼロ**。tree の「背景は行が描く」という意図的設計を base に巻き込まず温存できる。
- トレードオフ: 「選択中＝背景 surface」というナビの見た目は base ではなく consumer 側に残るため、完全な意匠統一ではない。ただしこれは tree の行ハイライト設計（#70 以降）由来の正当な差分であり、base に押し込むと tree 側で打ち消しが必要になり可読性・等価性ともに悪化する。

---

## ADR-002: public `PILL_BTN` は common `pillBtn` へ寄せず別系統のまま残す

### Status

Accepted

### Context

`public/styles.ts` の `PILL_BTN`（4 consumer: PublicLayout / ErrorPage / UserPublicTop / PublicSearch）は、common の `pillBtn`（authenticated app の統一済み pill primitive）と色・形・サイズ（`h-9 px-4 rounded-pill bg-surface`）はほぼ一致するが、挙動が異なる:

- `PILL_BTN` には **`active:scale` の押下フィードバックが無い**。
- **`data-[danger]` variant が無い**（`data-[primary]` のみ）。
- **disabled ガードが無い**（`disabled:opacity-55` / `aria-disabled:*` / `not-disabled:not-aria-disabled:` hover ガードがすべて欠落）。

umbrella #336 の狙いは統一だが、本 PR は「最小リスクの一塊」にスコープを絞っている（plan.md「3. スコープ定義」）。`PILL_BTN` を common `pillBtn` へ寄せると、未ログインで到達する public 画面に押下スケールアニメ等の**視覚・挙動変化が新規に発生**する。

### Decision

本 PR では `PILL_BTN` を変更せず別系統のまま残す。これは #273 が public pill を明示的にスコープ外とした判断の踏襲。public ボタン系統の common への寄せ（意匠差の意図確認・disabled/press 挙動の統一可否を含む）は、フォローアップ子 Issue として #336 のチェックリストに切り出す。

### Consequences

- 良い点: 本 PR の視覚回帰ゼロ原則を保てる。public の現行挙動（press アニメ無し・disabled 非対応）を意図せず変えない。
- トレードオフ: umbrella の「ボタン全般統一」は未完のまま残る。ただし残務は子 Issue として可視化され、umbrella の見取り図（plan.md 2.2 インベントリ）に沿って段階的に解消できる。

# ADR — Issue #459: ノート詳細アクションメニューのボタン構成・サイズを読みやすく整える

## ADR-001: ツールバーをオーバーフローメニュー方式で再構成する

### Status
Accepted

### Context
`NoteActions` は 8 個のボタンがベタ並びで、常用操作（編集・公開設定・移動・URLコピー・エクスポート）と低頻度／破壊的操作（複製・履歴・削除）が同じ視覚的重みで並んでいた。Issue #459 の直接の引き金は「アイコンのみボタンが横長で浮く」ことだが、根本は情報設計の平坦さ。

選択肢:
- (A) アイコンのみボタンの形だけ直す（円形化）。最小修正。
- (B) 主要のみラベル、他はアイコンのみ。密度最大だが破壊的操作のラベル消失リスク。
- (C) 全ラベル統一。#382 の編集=アイコンのみ決定を覆す。
- (D) オーバーフローメニュー（⋯）で常用／低頻度を分離。

### Decision
(D) を採用。常用操作を表に残し、複製・履歴・削除を ⋯ メニューへ退避する。メニューは既存の `DirectoryActionsMenu` / `UserMenu`（#289 ADR-003 の WAI-ARIA Menu パターン）を踏襲し、単一利用のためインライン実装する（汎用 Popover プリミティブ化は見送り）。

### Consequences
- 良い点: ツールバーの情報設計が「常用＝表 / 低頻度・破壊的＝メニュー」で整理され、横長アイコン問題も同時に解消。破壊的操作（削除）はメニュー内に収め、誤操作面でも穏当。
- トレードオフ: 複製・履歴・削除がワンクリック→2 アクションになる。低頻度操作なので許容。新規コンポーネント分のコードが増える。

---

## ADR-002: アイコンのみボタン原型を `pillBtn` の data-variant add-on として追加する

### Status
Accepted

### Context
アイコン1個に `pillBtn` の `px-4` が付き横長になる。アイコンのみ専用の原型が `common/styles.ts` に無い。原型の追加方法として、(a) 独立した定数で base トークンを複製、(b) `pillBtn` への add-on、の二択。

`pillBtn` の `px-4` を `px-0` に上書きするには、同一プロパティ（padding）が Tailwind の生成 CSS 順で解決される制約上、縮小方向（`px-0 < px-4`）は plain utility では負ける（`pillBtnSm` と同じ問題。#416 ADR-005）。

### Decision
(b) を採用し、`pillBtnIcon` を data-variant add-on（`data-[icon]:px-0 data-[icon]:w-9 data-[icon]:justify-center data-[icon]:max-sm:min-w-[44px]`）として追加する。`pillBtn` に append し `data-icon=""` で発火。data-variant は base utility の後にソートされ決定的に勝つ。`pillBtnPrimary` / `pillBtnDanger`（色のみの data-variant）とも合成可能。

`--radius-pill: 980px` のため `h-9 w-9`（36px 正方形）＋ `rounded-pill`（base 由来）は実質円形になり、ピルと同じラジアス系統で視覚的に馴染む。

### Consequences
- 良い点: `pillBtnSm` / `pillBtnTall` と同じ add-on パターンで一貫。base トークンの重複が無い。primary/danger と合成できる。
- トレードオフ: 利用側で `data-icon=""` の付与が必須（既存 add-on と同じ運用）。

---

## ADR-003: 公開設定ボタンから補助テキスト `· 公開設定` を外す

### Status
Accepted

### Context
公開設定ボタンは「ドット＋Globe＋状態ラベル（非公開等）＋`· 公開設定`」を表示していた。`· 公開設定` は冗長で、状態ラベルが主情報。

### Decision
`· 公開設定` の補助テキストを削除し、ドット色＋Globe＋状態ラベルのみとする。アクセシビリティは既存の `sr-only`「公開状態: 」＋状態ラベルで担保される。

### Consequences
- 良い点: ツールバーが簡潔になり、状態（公開/非公開/限定公開）の表示が主役になる。
- トレードオフ: 「これは公開設定への導線」という明示テキストが消えるが、Globe アイコン＋状態ラベルで導線の意味は保たれる。

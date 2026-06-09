# ADR — Issue #617: 公開検索画面（P32）のデザインモック整合

## ADR-001: 検索結果カードは grid 化せず単カラムで実装する

### Status
Accepted

### Context
モック（PC `P32-public-search.html`）の `.result-card` は `display:grid; grid-template-columns:1fr auto` で本文を左、更新日時を右列に置く。しかし今回のスコープでは更新日時を実装しない（`SearchHitDTO` に日付が無く、バックエンド拡張は別Issue）。日付が無い以上 grid の auto 列は常に空になる。モバイルモックの `.result-card` は元々 `flex-direction:column` の単カラムである。

### Decision
PC・モバイルとも単カラム（`flex flex-col gap-1` 相当、`.result-main` の縦 flex）で実装する。右列に置く要素（日付）が存在しない以上、`1fr auto` グリッドは無意味な構造であり持ち込まない。単カラムにすることでモバイルモックと構造が一致し `max-sm:` 分岐も最小化できる。padding はモック値（PC `py-5 px-3` / モバイル `max-sm:py-4 max-sm:px-2`）に合わせる。

別Issue で更新日時・キーワードハイライトを実装する際に、P30 の `PublicNoteViews` / `NOTE_ROW`（`grid grid-cols-[1fr_auto] ... max-sm:grid-cols-1` + 右列 `NOTE_DATE`）と同型へ grid 化する。これにより public 面のノート行アナトミーが将来的に統一される。

### Consequences
- 良い点: 空の右列を持つ無意味な grid を避けられ、モバイルと構造が一致して `max-sm:` 分岐が減る。今回のスコープ（フロント乖離のみ）に最小一致。
- トレードオフ: PC の見た目がモックの「右寄せ日付列」とは一致しない（が、日付自体が無いため不可避）。別Issue 着手時に grid 化のリファクタが必要になるが、P30 に同型先例があるため局所的で済む。

---

## ADR-002: ソートラベルに chevron-down を付けず、読み取り専用 span を維持する

### Status
Accepted

### Context
モックの `.sort-btn` は chevron-down アイコン付きの「関連度順」で、hover でグレー背景が付く（ドロップダウン的な見た目）。現状実装の `SORT_LABEL` はアイコンなしの読み取り専用 `<span>`。公開検索のソート軸は relevance 固定（score 順）でトグル不能であり、これは仕様として妥当。論点は「見た目の整合のためだけに chevron を付けるか」。

### Decision
chevron-down は付けず、読み取り専用 `<span>`（`SORT_LABEL`）を維持する。chevron-down は「押下するとソート選択肢が開く」インタラクションを強く示唆するが、本画面ではソートが固定でトグルできないため、アイコンは誤った操作可能性をユーザーに示すことになる。hover 背景も付けない（インタラクティブに見せない）。見た目の整合は色・余白・配置をモックに寄せる範囲に留める。最終判断は実装／レビューに委ねる。

代替案「chevron を付けて見た目をモック一致させ、`aria-disabled` 等で非操作を明示」も検討したが、視覚的にはなお押下可能に見えるため誤示唆リスクが残り、不採用とした。

### Consequences
- 良い点: 非操作要素を操作可能に見せないことで、ユーザーの誤クリック期待を防ぐ。アクセシビリティ的に正直な表現になる。
- トレードオフ: モックの `.sort-btn`（chevron 付き）とは見た目が完全一致しない。これは「relevance 固定」という機能的制約に起因する意図的差分であり、モック側に固定ソートが反映されていないことに由来する。必要ならモック側を「固定ラベル」に直す追従も将来検討可能。

---

## ADR-003: 検索バー surface 化後も送信ボタンは accent（data-primary）を維持する

### Status
Accepted

### Context
Issue #617 で検索バー input の背景を `bg-bg`（白）から `bg-surface`（淡グレー）へ、枠線なしに変更する。送信ボタン `SEARCH_FORM_BUTTON` は `${pillBtn} ${pillBtnPrimary}` + `data-primary` で accent（暗色）塗り。input 背景が surface に変わることで、ボタンが背景に埋もれて可読性が落ちないかが論点。ADR-004（#417）でボタンは中央寄せ配置（`top-1/2 -translate-y-1/2`）により input 内に収まるよう構造化済み。

### Decision
送信ボタンは `data-primary`（accent 塗り）を維持し、配色は変更しない。accent は暗色（`oklch(37.1% 0 0)` 系）であり、`bg-surface`（`#f5f5f7` 淡グレー）の input 上でも十分なコントラスト（暗 vs 淡）を持つため、surface 化によって可読性は損なわれない。ADR-004 の中央寄せ配置も維持し、input 高さを h-14(56px)/max-sm h-12(48px) に変更してもボタンが中央に収まることをブラウザで確認する。⌘Kヒントは採用せず、モック側（spec/design）をボタン記述に更新して整合させる（確定方針）。

### Consequences
- 良い点: ADR-004 で確立した base 合成（press feedback / disabled ガード / accent variant の SSOT）と中央寄せ配置を維持したまま、検索バーの視覚だけをモックへ寄せられる。送信手段（ボタン）という UX 上の意図（ADR-004）を後退させない。
- トレードオフ: input 高さ変更に伴うボタンの上下の収まり・右オフセットはブラウザで最終確認が必要（崩れではなく見た目確認）。モック側を書き換えるため、過去のデザイン成果物との差分が生じるが、確定方針に基づく意図的変更である。

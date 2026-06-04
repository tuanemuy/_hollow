# ADR — Issue #476: ノート一覧の絞り込みUI（タグ/期間/公開状態）を再検討する

## ADR-001: 絞り込みUIは「案2 — 全フィルターをチップ＋ポップオーバーに統一」を採用

### Status
Accepted

### Context
ノート一覧の `FilterBar` は、タグがチップ（トグル）である一方、期間（`<input type="date">`×2）と公開状態（`<select>`）がむき出しのフォーム要素として常時展開され、操作モデルが不揃いで一覧上部を圧迫していた。Issue #476 は4つのUI方向性（案1 折りたたみ／案2 チップ＋ポップオーバー統一／案3 faceted chips／案4 アイコントリガー）を比較検討する検討フェーズとして起票された。`.issue/476/mockup.html`（4案比較）と `.issue/476/mockup-case2.html`（案2の状態A〜E＋モバイル詳細）を作成し、案2の詳細モックのみ作り込んだ。

### Decision
案2を採用する。期間・公開状態もチップ化し、押すとポップオーバーで入力する。タグは件数つきトグルチップを維持、ディレクトリ・内部リンク参照は適用時のみチップ表示を維持。適用中のフィルターはすべて「pill チップ＋× で個別解除」という同一語彙で並べ、トリガー方法（タグ＝トグル、期間/公開状態＝ポップオーバー、ディレクトリ＝ツリー、参照＝ダイアログ）だけが異なる構造にする。

### Consequences
- 良い点: むき出しフォームが消えて一覧上部がすっきりする。全フィルターの見た目が統一され一貫性が出る。未適用時は最小限の主張（ghost トリガーチップ）に留まる。
- トレードオフ: 期間・公開状態の操作が1クリック増える（チップ→ポップオーバー）。ポップオーバーの a11y・モバイル配置を自前で担保する必要がある。

---

## ADR-002: ポップオーバーは新規 `FilterPopover` に局所化し、既存メニューパターンを踏襲する

### Status
Accepted

### Context
案2は「期間」「公開状態」の2つにポップオーバーを要する。プロジェクトには既に WAI-ARIA Menu パターンのインライン実装が3つある（`NoteActionsMenu` / `DirectoryActionsMenu` / `UserMenu`：roving tabindex・document-level dismiss・`Escape` でトリガーへフォーカス復帰）。`NoteActionsMenu` のコメントには「汎用 Popover primitive は follow-up」と明記されている。

選択肢:
1. FilterBar 内に dismiss ロジックを2回インラインで書く。
2. FilterBar スコープの小さな共有部品 `FilterPopover` を新設し、両チップで使う。
3. 既存3メニューも巻き込んで全社的な汎用 Popover primitive を作る。

### Decision
選択肢2を採る。`app/components/note/list/FilterPopover.tsx` を新設し、開閉・dismiss（外側クリック／Escape／focus-out）・フォーカス復帰・`aria-haspopup`/`aria-expanded`/`aria-controls` を内包する。中身は `children`、トリガーチップ描画は呼び出し側に委ねる汎用形。既存3メニューには手を入れない。

### Consequences
- 良い点: FilterBar 内の dismiss ロジック重複を防ぐ。スコープが Issue #476 の範囲（一覧の絞り込み）に閉じる。既存メニューの挙動に回帰リスクを持ち込まない。
- トレードオフ: 4つ目のインライン由来ポップオーバー実装が増える。汎用 Popover への統合は引き続き follow-up として残る（既存コメントの課題を解消はしない）。

---

## ADR-003: 期間ポップオーバーの反映は「即時反映」とし、明示「適用」ボタンは置かない

### Status
Accepted

### Context
モック（状態B）はプリセット＋ from/to ＋フッター「クリア／適用」を描いており、「適用」ボタンによる確定モデルにも読める。一方 Issue 制約は「フィルターはすべて URL search params ＋ `useOptimistic` で即時反映。`homeSearchUpdater` で部分更新。**この設計は維持する**」と明記している。既存の `FilterBar` も date input の `onChange` で即時に `router.navigate` している。

選択肢:
- A. 即時反映: プリセット押下・date 変更で即 URL 更新（既存モデル踏襲）。フッターは「クリア（範囲解除）／閉じる」。
- B. ドラフト→適用: ポップオーバー内はローカル状態で保持し「適用」押下で初めて URL 更新。

### Decision
選択肢A（即時反映）を採用する。具体的には:

- プリセット押下で `from`/`to` をクライアント計算し、既存の `run(action, nav)` を通じて `useOptimistic` パッチ＋ `router.navigate` で即時反映する（見た目は即時、サーバー確認後に baseline へ収束）。
- date input の手動変更も同様に即時反映し、プリセットの選択ハイライトは外れる。
- ポップオーバーのフッターは「クリア」（`from`/`to` を空にして URL 更新）と「閉じる」（ポップオーバーを閉じるのみ）の2つ。
- **モック状態Bの「適用」ボタンは検討フェーズの仮描画**であり、実装では置かない（「クリア／閉じる」に置き換える）。実装者はモックの「適用」を実装しないこと。

### Consequences
- 良い点: Issue 制約「この設計は維持する」に厳密に従う。状態管理の二重化（ローカルドラフト vs URL）を避け、実装と回帰リスクを抑える。他フィルター（タグ・公開状態）と反映タイミングが揃う。
- トレードオフ: from だけ入れて to 未入力の中間状態でも navigate が走る（既存挙動と同じ。`from` のみ／`to` のみの片側指定はスキーマ上許容されており問題なし）。モックの「適用」ボタンは見送るため、モックと細部が一致しない（注記で吸収）。

---

## ADR-004: ディレクトリ・内部リンク参照はトリガー据え置き、見た目のみ統一

### Status
Accepted

### Context
ディレクトリフィルターはサイドバーのツリー由来、内部リンク参照はノート選択ダイアログ由来で、どちらも「一覧の絞り込みバー上で値を選ぶ」性質ではない。案2のゴールは適用済みフィルターの**表示語彙**の統一であり、トリガー経路の変更ではない。

### Decision
ディレクトリ・内部リンク参照のトリガー方法（ツリー／ダイアログ）は変更しない。適用時のチップ表示を他フィルターと同じ pill チップ＋× 語彙に揃えるのみとする。

### Consequences
- 良い点: スコープが膨らまない。サイドバーのツリー連携・ノート選択ダイアログの既存挙動に回帰リスクを持ち込まない。
- トレードオフ: 「すべてのフィルターがチップから操作できる」完全な統一ではない（トリガー経路は2系統残る）。これは案2の意図どおり（モック状態D注記）。

---

## 実装メモ（実装フェーズで確定した判断）

ADR を新設するほどではないが、計画段階で未確定だった細部の判断を記録する。

- **`FilterPopover` のパネル role は静的2分岐**: biome の `useAriaPropsSupportedByRole` は `role={cond ? "menu" : "dialog"}` のような動的 role に対し aria-label のサポート可否を静的判定できずエラーになる。パネル要素を `haspopup === "menu"` で静的に2分岐し、それぞれ `role="menu"` / `role="dialog"` を直書きした。公開状態メニューの roving-tabindex 用に `panelRef` / `onMenuKeyDown` を props で受け、`role="menu"` 要素に直接付与する（中間ラッパー div を挟まない＝余計な interactive static element を作らない）。
- **公開状態の単一選択は `role="menu"` + `menuitemradio` + `aria-checked`** を採用（plan.md a11y ガイドの2案のうち menu 案）。`NoteActionsMenu` の roving-tabindex 実装を踏襲。
- **`visibilityLabel` は `Visibility | "all"` に拡張**（"すべて" を返す分岐を追加）。スウォッチ色は新規 `visibilitySwatchClass(v: Visibility | "all")`（公開=success／限定公開=warning／非公開・すべて=ink-tertiary）。いずれも styles.ts。`Visibility` 型自体は `OwnedNoteFilterItem["visibility"]`（非 null）のまま据え置き、FilterBar 側は `NonNullable<NoteListSearch["visibility"]>` を `VisibilityValue` として扱い "all" と合成。
- **期間プリセットのハイライトは `matchDateRangePreset(from, to, baseDate)`** で算出（純粋関数）。手動で日付を変えてどのプリセットとも一致しなくなれば自動的にハイライトが外れる。基準日 `new Date()` は React 側（イベントハンドラ／レンダー）で生成し、ロジックには引数で渡す。
- **期間チップの片側指定表示**: `from` のみ／`to` のみのときは開放端を `…` で表示（`6/1–…` / `…–6/30`）。スキーマ上 `from`/`to` は独立に optional なので中間状態も表示できる必要がある（ADR-003 のトレードオフ記述に対応）。
- **preset グリッドの `role="group"`**: biome `useSemanticElements` は `<fieldset>` を提案するが、フォーム制御の意味論は不適切なため `DirectoryTree` の前例に倣い biome-ignore で抑止。
- **page リセット**: 期間（プリセット／手動）・公開状態の追加・変更・個別解除すべてで `page: undefined` を付与（plan.md の統一ルール）。「すべてクリア」は `q`/`display` のみ保持。
- **ポップオーバーの水平配置（ブラウザ検証で確定）**: パネルは `absolute left-0 top-full` でトリガー左端基準。これだけだとトリガーが折返し行の左寄り／右寄りで片側がビューポートを溢れる（モバイル390pxで期間が左へ -253px 溢れるのを検証で検出）。`open` 後の `useLayoutEffect` でパネルを measure し、`[8px, vw-8px]` に収まるよう水平 `translateX(shiftX)` で補正する（依存ライブラリなし）。`shiftX` はクローズで 0 にリセットし次回 open で再計測。
- **ポップオーバーのパネル幅（ブラウザ検証で確定）**: 当初 `w-max`（max-content）だったが、ネイティブ `<input type="date">` の固有 max-content 幅が巨大で、パネルが `max-w` 上限（デスクトップで本文全幅 ≒1248px）まで膨張した（検証で検出）。パネルを固定幅 `w-[280px] max-w-[calc(100vw-2rem)]` にし、期間／公開状態とも一定サイズに統一。date input は `flex-1 min-w-0` で固定幅内に収める。

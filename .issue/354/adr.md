# ADR — Issue #354: P10 ノート一覧 モバイル対応 + 選択モード/絞り込み UX 刷新

## ADR-001: 選択モードの状態を SelectionContext（useReducer）に持たせる

### Status
Proposed

### Context
明示的な選択モードを導入するにあたり、モードのトグル状態をどこで持つかに選択肢がある: (a) SelectionContext（既存の useReducer）を拡張、(b) URL search param、(c) 各コンポーネントのローカル state。

### Decision
SelectionContext（useReducer）に `mode: boolean` を追加する。`exitSelectMode` で ids も同時に clear する。

理由:
- 選択 ids と mode を同じ Context でアトミックに扱える（mode OFF で ids clear、BulkActionBar の表示条件を一元化）。
- URL に載せると loader 再実行 / RSC 再ストリームを誘発し、要件4（即時反映）の方針と逆行する。選択モードは純粋なクライアント表示状態。
- `listSelectors.ts` の reducer は React 非依存で単体テスト済みの資産があり、拡張が低コスト。

### Consequences
- 良い点: 状態が一箇所に集約され、テスト可能。URL を汚さない。
- トレードオフ: 選択モードはリロードで保持されない（クライアント state のため）。これは仕様意図（一時的な操作モード）と整合。

---

## ADR-002: サイドバードロワーを薄い client wrapper + Context で実装する

### Status
Accepted

### Context
Issue は対象ファイルに `Sidebar.tsx` / `_app/index.tsx` を挙げるが、実体は `_app/route.tsx` が `Header` / `Sidebar` を `renderServerComponent` で **RSC payload** 化し、Server Component の `AppShellFrame` が children として合成している。`AppShell.tsx` はデッドコード。

論点は2つ:
1. ドロワー開閉の client state をどこに置くか。`AppShellFrame` 全体を client 化すると、RSC payload（header/sidebar）を client 親に跨がせるシリアライズ境界の検証が必要になり、Frame 内の副作用 import（`UploadDialogMount` 等）が client バンドルに混入するリスクがある。
2. ハンバーガーをどう描画するか。当初案の「Frame 側で header 左に absolute オーバーレイ」は、header の `grid grid-cols-[auto_1fr_auto]` のセルに参加できず、ロゴ（`max-sm` で `display:none`）や `px-6` padding と干渉し、デザインの `.header-left` 内にロゴと並ぶハンバーガー配置を忠実に再現できない。

### Decision
- **薄い client wrapper を新設**（例: `AppShellDrawer`）。`useState` で開閉 state を持ち、`DrawerContext` を provide する。`AppShellFrame` は Server Component のまま据え置き、`{header}` / `{sidebar}` / `{children}` をこの client wrapper に children として渡す。RSC payload は client island の children を通過するだけで、Frame の副作用 import は server に留まる。
- **位置付きの `<aside>` コンテナ（`data-open` 駆動）と backdrop は client wrapper 側に置く**。`Sidebar.tsx` の RSC payload はその `<aside>` の中身として渡す。`APP_SIDEBAR` クラス（styles.ts）の lg 未満ドロワー化はこのコンテナに適用。
- **ハンバーガーは Header 内に置く client island（`MenuButton`）**。`DrawerContext` を consume してトグルする。Header は RSC のままで、client component を子として内包できる（RSC は client island を children に持てる）。これによりデザインの `.header-left` 構造（ロゴと並ぶハンバーガー）を保てる。

### Consequences
- 良い点: Header / Sidebar / Frame の RSC 性と副作用 import の server 局在を保ったまま、共通の client Context で開閉を制御。デザインの header-left レイアウトを忠実に再現。P10 以外の `_app` 配下全ルートで一貫したドロワー挙動。
- トレードオフ: 新規 client wrapper + Context + MenuButton island の3点を追加する分、構成要素が増える。app-shell 全ルートに波及するため P10 以外のモバイル表示確認が必要。

---

## ADR-003: FilterBar の即時反映を useOptimistic で実装する

### Status
Proposed

### Context
FilterBar はフィルタ選択を `router.navigate()` → loader 往復後にしか反映しないため、選択状態がサーバ応答まで UI に出ない。React 19 primitives を直接使う規約のもと、即時反映の手段を選ぶ。

### Decision
`useOptimistic(baseline, reducer)` を使う。baseline は server-confirmed props。各操作は `startTransition` 内で `setOptimistic(...)` → `router.navigate(...)` を続けて呼ぶ。chip の active / select / 日付値は optimistic state から描画。結果リストは `useTransition` の `isPending` で `aria-busy` + pending 表示。

### Consequences
- 良い点: フィルタ選択が即座に UI 反映。サーバ確定とは独立に pending を表現。React 19 primitives 直利用の規約に合致。
- トレードオフ: optimistic state と URL/loader 確定値の二重ソースになる。transition 解決後の baseline 復帰、navigate 失敗時の宙吊り回避を検証で担保する必要がある。

---

## ADR-004: チェックボックスを単一の汎用 NoteCheckbox に共通化する

### Status
Proposed

### Context
List / Tile / Calendar が各々ネイティブ `<input type="checkbox"> + accent-accent` を持つ。デザイン `.note-check` 準拠のスタイル付きチェックボックスへ移行するにあたり、共通化の粒度を決める。

### Decision
ボタン本体だけを汎用 `NoteCheckbox`（`checked` / `onToggle` / `label` のみ受ける）として共通化する。Tile の絶対配置ラッパー等、view 固有の配置は呼び出し側に残す。

### Consequences
- 良い点: デザイン準拠 + 重複解消。過度な抽象化を避ける。
- トレードオフ: view 固有の配置ロジックは各所に残るが、これは意図的（本体スタイルのみ共通化）。

注: `NoteCheckbox` はネイティブ `<button role="checkbox" aria-checked>` で実装するため Space/Enter のキーボードトグルと focus-visible はブラウザ標準で担保される（明示の focus ring utility は付与する）。デザイン `.note-check` の「通常時 opacity:0 → hover で表示」は**あえて踏襲しない** — 選択モード ON 時は常時表示にする（モバイルは hover が無く、Issue の「明示的な選択モード」意図がデザインの hover-reveal より優先）。

---

## ADR-005: 選択モード ON 時の行クリックと BulkActionBar 表示条件

### Status
Accepted

### Context
List/Calendar はタイトルが `<Link>`、Tile はカード全体が `<Link>`。選択モード ON 時に、行/カードのクリックを「リンク遷移」と「選択トグル」のどちらに割り当てるかが view ごとに異なる。また BulkActionBar の表示条件（現状 `if (state.ids.size === 0) return null`）を mode 主条件に変える際、mode ON & 0件選択時の挙動が未定義だった。

### Decision
- **Link 競合（view 別に確定）**:
  - **Tile**: mode ON 時はカード外側の `<Link>` を `<button type="button">` にスワップし、カード全面で選択トグル。mode OFF 時のみ `<Link>` で遷移。チェックボックスはカードボタンの**兄弟**として絶対配置し（入れ子 button を避ける）、`NoteCheckbox` 内の `stopPropagation` で二重発火を防ぐ。
  - **List / Calendar**: mode ON 時はチェックボックス（`NoteCheckbox`、44px タッチターゲット・キーボード操作可）を選択操作の単一導線とし、タイトル `<Link>` を**プレーン `<span>` に差し替える**（mode OFF 時のみ `<Link>` で遷移）。
    - 当初は「行コンテナを onClick でトグル」を検討したが、Biome の `recommended` a11y ルール（`useKeyWithClickEvents` / 非 interactive 要素への onClick）が `<li onClick>` を弾く。行を `<button>` 化すると List 行内の DOM/レイアウト（grid 3列・更新日）と相性が悪く、二重タブストップ（行＋checkbox）も生む。チェックボックス単独導線は lint クリーンで、明示的選択モードの意図（44px の明確なターゲット）とも合致するためこちらを採用。
  - 条件分岐は可能な限り `data-mode` 属性 + Tailwind variant で表現し、DOM 構造そのものの差し替え（Link↔button / Link↔span）が必要な箇所のみ JSX 分岐する。
- **BulkActionBar 表示条件**: `state.mode` が true の間は常にマウントする（選択件数を `aria-live` で live 表示、0件時はアクションを disabled）。末尾の × は「選択解除」ではなく **選択モード終了（`exitSelectMode`、ids も clear）** に割り当てる。これにより mode ON 中はバーが安定したアンカーとして残り、0件で消えて再選択でちらつく挙動を避ける。

### Consequences
- 良い点: view ごとに最適なタップ導線。バーが mode 中ずっと表示され UX が安定。lint クリーンかつアクセシブル（checkbox がキーボード/タッチ両対応の単一トグル）。
- トレードオフ: List / Calendar では mode ON 時にタイトルがリンクでなくなる（選択モード中は遷移より選択が主目的なので許容）。view 別に分岐ロジックが分かれる。

---

## ADR-006: モバイルドロワーにモーダル相当のフォーカス管理を実装する

### Status
Accepted

### Context
PR レビューで、off-canvas ドロワー（lg 未満で backdrop + 背面スクロールロックを伴うモーダル相当）に、`common/Dialog.tsx` が持つフォーカストラップ・初期フォーカス移動・フォーカス復帰・`role`/`aria-modal`/`aria-label` が無いことが指摘された（閉時もドロワー内リンクがフォーカス可能で、開時もフォーカスが背面へ抜ける）。一方でドロワーは lg 以上では in-flow の sticky カラムであり、そこにモーダル挙動を持たせてはならない。

### Decision
`AppShellDrawer` に**モバイル時のみ**有効なモーダル挙動を実装する。`matchMedia("(max-width: 1023px)")` で `isMobile` を解決（SSR/初回はデスクトップ前提＝inert を付けない）し、
- 開時（mobile）: ドロワー内先頭要素へ初期フォーカス、Tab を `<aside>` 内にトラップ、Esc / lg 到達で close、close 時に起点（`MenuButton`）へフォーカス復帰。
- `<aside>` に `aria-label="サイドバー"` を常時付与し、mobile 時のみ `role="dialog"` + `aria-modal={open}` を付ける。
- 閉時（mobile）は `<aside>` を `inert` にし、画面外のリンクをタブ順・a11yツリーから除外する。デスクトップでは `isMobile=false` なので inert/trap/role は一切付かない。

`common/Dialog.tsx` はポータル + 常時モーダル前提で構造が異なるため直接再利用はせず、同等のトラップロジックをドロワー向けに実装した。

### Consequences
- 良い点: モバイルでドロワーがモーダルとして正しく振る舞う（フォーカスが漏れない・支援技術に伝わる・閉時に背面が操作不能）。デスクトップの in-flow サイドバーは無改変。
- トレードオフ: Dialog とトラップロジックが重複する。将来 off-canvas が増えるなら共通フックへの抽出を検討。

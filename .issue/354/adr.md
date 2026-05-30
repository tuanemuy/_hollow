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
  - **Tile**: mode ON 時はカード外側の `<Link>` を `<button type="button">` にスワップし、カード全面で選択トグル。mode OFF 時のみ `<Link>` で遷移。
  - **List / Calendar**: 行コンテナを mode ON 時に選択トグル可能にし、タイトル `<Link>` は mode ON 時 `pointer-events-none`（行 onClick が選択を担う）。mode OFF 時は従来どおりリンク遷移。
  - 条件分岐は可能な限り `data-mode` 属性 + Tailwind variant で表現し、DOM 構造そのものの差し替え（Link↔button）が必要な箇所のみ JSX 分岐する。
- **BulkActionBar 表示条件**: `state.mode` が true の間は常にマウントする（選択件数を live 表示、0件時はアクションを disabled）。末尾の × は「選択解除」ではなく **選択モード終了（`exitSelectMode`、ids も clear）** に割り当てる。これにより mode ON 中はバーが安定したアンカーとして残り、0件で消えて再選択でちらつく挙動を避ける。

### Consequences
- 良い点: view ごとに最適なタップ導線。バーが mode 中ずっと表示され UX が安定。アクセシビリティ（mode OFF 時はリンクの意味を保持）。
- トレードオフ: view 別に分岐ロジックが分かれるが、選択 UX の質を優先。

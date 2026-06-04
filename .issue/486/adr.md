# ADR — Issue #486: 設定画面のレイアウトが他画面と一貫していない

## ADR-001: 設定画面を `/_app` 配下にネストし、サイドバーを client 側で差し替える（案A）

### Status
Proposed

### Context
設定画面は現状トップレベルルート（`app/routes/settings/route.tsx`）として `/_app` の外にあり、独自の `SETTINGS_*` スタイルで Header（手書き「← Home」）・外枠・サブナビを再発明している。共通シェルと一貫させたいが、`/_app` の Sidebar は「ライブラリ/管理」を表示する固定 chrome（`_app` loader が `loadDirectoryTree` を実行し `staleTime: Infinity` でキャッシュ）であり、設定画面では設定専用サブナビを出す必要がある。

選択肢:
- **案A（採用）:** `/settings` を `/_app/settings` にネストし、共通シェルの `<aside>` スロットを client 側 pathname に応じて「ライブラリ Sidebar ↔ 設定サブナビ」で差し替える。
- **案B:** `/settings` をトップレベルのまま維持し、共通 chrome を再利用する共有レイアウトを作って設定側で独自 sidebar を渡す。設定側に `getCurrentUser` → `Header` レンダリングの loader を複製する必要がある。

### Decision
案Aを採用する。

理由:
- `_app` loader（ライブラリ Sidebar の RSC レンダリング + `staleTime: Infinity` キャッシュ）を一切変更せずに済む。案Bは Header レンダリング loader の複製が必要で、固定 chrome のキャッシュ機構を二重管理することになる。
- 共通シェルの `<aside>` の `sidebar` は型上 `ReactNode` の純粋スロットで、設定サブナビは RSC データ不要の純ナビ。client 側でレンダリング要素を差し替えても loader/キャッシュには一切影響しない。
- Header・drawer・focus trap・レスポンシブ挙動を完全に共有でき、Header が消えずナビゲーション体験が断絶しない（Issue 期待挙動を直接満たす）。
- Issue 本文が案として「Sidebar スロットを client 側で pathname 対応にする」を明示的に許容している。

### Consequences
- 良い点: 変更が presentation 層に閉じ、loader/キャッシュ機構を温存。共通 chrome を最大限再利用。
- トレードオフ: ライブラリ Sidebar の RSC ペイロードは設定セクションでも loader で計算される（`loadDirectoryTree` が走る）が表示されない。これは `staleTime: Infinity` 前提（他画面へ戻った時に即表示）を守るための意図的な選択。設定セクション限定の最適化（ディレクトリツリーを読まない）は固定 chrome 前提を崩すため見送る。
- トレードオフ: 汎用シェル（`AppShellDrawer`）に `pathname.startsWith("/settings")` という1か所の路由知識が残る（後述 ADR-002 で結合を最小化）。

---

## ADR-002: サイドバー差し替えを `AppShellDrawer`（client）で行い、設定ナビは prop で受け取る

### Status
Proposed

### Context
pathname に応じたサイドバー差し替えにはクライアントフック（`useLocation`）が必要。chrome の構成要素のうち、`AppShellFrame` は `UploadDialogMount` と ingestion の side-effect import をサーバ側に閉じ込めるサーバコンポーネント（Issue #354 ADR-002）であり、`AppLayout`（`_app/route.tsx`）のサーバ/クライアント境界も RSC ペイロード（`renderServerComponent`）を介する設計。確実に `"use client"` なのは `AppShellDrawer` のみ。

差し替え判定をどこに置くか、設定ナビ要素をどう供給するかが論点:
- (a) `AppShellDrawer` が `SettingsSidebarNav` を直接 import して pathname 判定する
- (b) `AppShellDrawer` は `settingsSidebar` を prop で受け取り pathname 判定だけ行う。要素は `AppLayout` が供給する（採用）

### Decision
(b) を採用する。`AppShellDrawer` に `settingsSidebar?: ReactNode` を追加し、`pathname.startsWith("/settings")` のときだけそれを `<aside>` に描画する。設定ナビ要素 `<SettingsSidebarNav />` は `AppLayout`（`_app/route.tsx`、アプリ合成のルート）が生成して `AppShellFrame` 経由で渡す。

理由:
- 汎用レイアウト層（`AppShellDrawer`/`AppShellFrame`）が identity 機能を直接 import する結合を避けられる。シェルに残るのは `/settings` という pathname 判定1か所のみ（Issue が許容する範囲）。
- 設定ナビ要素の供給責務をアプリ合成のルート（`AppLayout`）に置くのは自然。`AppLayout` は既に loader データと chrome 構成を所有している。
- pathname 判定を確実に client な `AppShellDrawer` に置くことで、`AppLayout`/`AppShellFrame` のサーバ/クライアント境界（ADR-002 / RSC ペイロード設計）に手を入れずに済む。

### Consequences
- 良い点: 汎用シェルの結合を最小化しつつ、サーバ/クライアント境界を温存。`SettingsSidebarNav` は要素として渡るだけなので、サーバコンポーネントの `AppShellFrame` を素通りできる。
- トレードオフ: `settingsSidebar` prop が `AppShellFrame` → `AppShellDrawer` の2段を通る。passthrough のみなので可読性コストは小さい。
- トレードオフ: 非設定画面でも `<SettingsSidebarNav />` 要素が生成される（描画はされない）。React 要素生成のみで mount されないため実コストはほぼゼロ。

---

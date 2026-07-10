# ADR — Issue #818: ノート編集画面（P12）のモバイル表示最適化

## ADR-001: ヘッダー簡略タイトル（mock `.header-doc`）を本 Issue のスコープ外とする

### Status
Proposed

### Context
モバイルモック `spec/design/pages/mobile/P12-editor.html` L226-235 / L1042 は、編集中にノートタイトルを共有ヘッダー中央へ簡略表示する `.header-doc` を持つ。Issue #818 はこれを「中核設計の未実装 3 項目」の一つに挙げている。

しかし実装上、ヘッダーは `app/routes/_app/route.tsx` が全 `/_app` 配下で構築する共有 `AppShell`（`AppShellFrame` → `AppShellDrawer` の `header` prop）であり、エディタ（`main` の `children` として深くネスト）とは疎結合で、per-route のタイトルスロットを持たない。`.header-doc` を実装するには次のいずれかが必要:

- (a) ヘッダーとエディタ children を跨ぐ client context provider を新設し、エディタが `state.title` を push、ヘッダーがスロットで consume する。
- (b) ヘッダーにポータルターゲットを設け、エディタから portal でタイトルを注入する。

いずれも共有シェルへの横断的な配管であり、「エディタのモバイル最適化」という Issue 粒度を超える。

`.header-doc` の機能は「本文スクロール中に編集対象ノートのタイトルを見失わないための**方向づけ（orientation）**」である。これは下部固定保存バー（ADR-003）が担う**アクション到達性とは別の関心事**であり、保存バーは orientation を代替しない（タイトル入力はスクロールで画面外へ出る）。したがって除外の根拠は「保存バーが代替するから不要」ではなく、次の 3 点に絞る:

- a11y 上は `aria-hidden="true"` の装飾であり、スクリーンリーダーからは隠されている（機能欠落ではない。視覚的には orientation の役割を持つが、a11y 上は装飾として機能要件化されていない）。
- Issue 課題1 のヘッダー項目は「未実装」と述べるのみで、機能的な受け入れ条件を一切課していない。
- 共有シェル横断の context/portal 配管コストが大きく、Issue 粒度を超える。

### Decision
ヘッダー簡略タイトルは本 Issue に含めず、フォローアップ Issue へ切り出す。除外の根拠は上記 3 点（aria-hidden の装飾／Issue が機能 AC を課していない／横断配管コスト大）であり、「保存バーが到達性を満たすから不要」という論拠は論点がズレるため採らない。本 Issue は**エディタコンポーネント内に閉じる 2 つの中核パターン**（下部固定保存バー・メタ折りたたみ）と、コントロール寸法統一・横スクロール解消に集中する。

### Consequences
- 良い点: 変更をプレゼンテーション層のエディタ配下に局所化でき、共有シェル改変による全 `/_app` ページへの回帰リスクを負わない。Issue のレビュー/検証境界が明確になる。
- トレードオフ: モックとの視覚的完全一致は次段階に持ち越し。ただし装飾要素であり機能欠落ではない。
- 引き継ぎ: フォローアップでは (a) context 方式を推奨（RSC 境界を跨がない client context。既存 `DrawerCtx` と同型で実装可能）。

---

## ADR-002: `APP_MAIN` のモバイル横パディング縮小を全 `/_app` 共通で適用する

### Status
Proposed

### Context
`APP_MAIN`（`app/components/layout/styles.ts`）は横パディング `px-6`（24px）で、全 `/_app` 配下ページの本文コンテナに共有される。P12 モックは本文パディング `var(--space-4)`（16px）を用いており、Issue #818 課題3 は 24px を「過大」として縮小を求める。

選択肢:
- (a) `APP_MAIN` に `max-sm:px-4` を追加し、全 `/_app` ページのモバイル横パディングを 16px に縮小する。
- (b) 編集画面だけローカルに縮小する（例: エディタフォームを `max-sm:-mx-2` で相殺、または編集ルート専用の main ラッパーを設ける）。

### Decision
(a) を採用し、`APP_MAIN` に `max-sm:px-4` を追加して全 `/_app` 共通で縮小する。

理由: モバイルモック群は本文パディングを一貫して `--space-4`(16px) に置いており、24px は編集画面固有ではなくアプリ全体のモバイル余白過多である。共有プリミティブを直すのが SSOT 原則に沿い、(b) の相殺ハックは負のマージンで横スクロール要因を却って生みうる。

### Consequences
- 良い点: 単一定数の変更で全モバイルページの余白が意図値へ揃う。負マージンの技巧を避けられる。
- トレードオフ: 全 `/_app` ページに波及するため、検証で他画面（P10 一覧等）に意図しない詰まりが出ないことを目視確認する必要がある（plan のリスク項参照）。デスクトップ（`sm` 以上）は `px-6` のまま不変。

---

## ADR-003: 下部固定保存バーはボタンを二重描画せず単一 DOM を再配置する

### Status
Proposed

### Context
mock `.save-bar`（L1010-1029）は保存/キャンセルを viewport 下部の `position: fixed` バーへ移す一方、デスクトップ（`sm` 以上）ではトップバー内に据える。実装方式:

- (a) `sm` 用（トップバー内）と `max-sm` 用（固定バー）でボタンを二重描画し、`hidden`/`block` で出し分ける。
- (b) ボタンを単一 DOM に保ち、コンテナへ `max-sm:fixed` 系ユーティリティを付与して mobile でのみ視覚的に切り離す（`BulkActionBar.tsx` の確立パターン）。

### Decision
(b) を採用する。`editorActions` 定数に `max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 …` を持たせ、`sm` 以上は現行の `ml-auto` インライン配置を維持する。backdrop は ADR-005（always-on 背景 + `supports-[backdrop-filter]:` blur）に従う。

### Consequences
- 良い点: `isPending` / `saveDisabled` / ボタンラベル（作成/保存/保存中…/ディレクトリ作成中…）の状態を単一要素で管理でき、二重描画による状態不整合・二重 submit ハンドラのリスクが無い。`BulkActionBar` と実装パターンが揃う。
- トレードオフ: `position: fixed` は祖先の transform/backdrop-filter/filter が含有ブロックを作ると崩れる。現状 `main` 祖先に該当要素が無いことを確認済みだが、将来のシェル変更に対する暗黙の前提となる（plan のリスク項に記載）。
- 補足: mock は save-status を topbar と save-bar に複製するが、実装では AutosaveIndicator を一箇所に留め、二重 `aria-live` 読み上げを避ける（意図的な差分）。その帰結として mobile 下方スクロール中は保存状態が視界外になる（plan のリスク項参照）。

---

## ADR-004: メタ折りたたみの `data-open` は開閉を制御する要素自身に置く

### Status
Proposed

### Context
メタ折りたたみは、mobile 専用 summary `<button>` のトグルで body（場所/タグ）の表示を切り替える。Tailwind の `data-[open]:` は **その要素自身が `[data-open]` を持つとき**に効くセレクタ（`&[data-open]{...}`）にコンパイルされる。当初案は `data-open` を外側 container（`metaDisclosure`）に置き、子（`metaBody`）で `data-[open]:max-sm:block` を使う設計だったが、これでは**親属性が参照されず開閉が全く効かない**（arch レビュー Round1 P-001）。

実装方式:
- (a) `data-[open]:` を使う `metaBody` 自身に `data-open` を付与する。
- (b) container に `group` を足し、`metaBody` を `group-data-[open]:max-sm:block`（Tailwind の group-data バリアント）にする。

既存コードの規約を調査した結果、プロジェクトに `group-data-*` の使用は**皆無**で、`data-*` 開閉パターン（`APP_SIDEBAR` の `<aside>` / `SIDEBAR_BACKDROP` / `NoteActionsMenu` / `DirectoryActionsMenu` 等）はすべて **`data-[open]:` バリアントを持つ要素自身に `data-open` を付与**している（`AppShellDrawer.tsx` L200 ほか）。

### Decision
(a) を採用する。`data-open={metaOpen || undefined}` は `data-[open]:max-sm:block` を持つ `metaBody` の `<div>` 自身に付与し、container（`metaDisclosure`）は枠/surface のみで開閉非依存とする。既存規約（group-data を使わず要素自身に `data-open`）に沿い、ADR-003 の「単一 DOM 再配置」方針とも整合する最小変更。

キャレット回転など複数子で親状態を共有したい場合に限り (b) の group-data も選べるが、本 Issue では summary 自身の `aria-expanded`（`aria-expanded:` バリアント）でキャレットを回せるため group は不要。

### Consequences
- 良い点: 既存の `data-*` 開閉規約と一貫し、開閉が確実に効く。container のスタイルは `data-open` 非依存なので副作用がない。
- トレードオフ: 将来キャレット回転を summary 外の要素で共有したくなった場合は group-data 方式（(b)）への移行が必要。その時点で本 ADR を更新する。

---

## ADR-005: メタ summary キャレットの回転は `data-open` を持つラッパー span で行う

### Status
Accepted（実装時）

### Context
メタ折りたたみ summary のキャレット（開時 180° 回転）を、CLAUDE.md の「状態は `data-*` 属性 + `data-[name]:` バリアント」規約に沿って表現したい。回転対象のグリフは共有 `Icon` コンポーネント（`app/components/common/Icon.tsx`）だが、`Icon` は `size` / `label` / `className` のみを受け取り **`data-*` 属性を SVG へ転送しない**。したがって `data-open` を `Icon` 自身へ付けることはできない。

選択肢:
- (a) キャレット `Icon` を `data-open` を持つ `<span>` でラップし、span に `data-[open]:rotate-180` を付ける（span の回転が内側 SVG を回す）。
- (b) `Icon` に `data-*` 転送 prop を追加する（共有コンポーネントの API 拡張）。
- (c) summary ボタンに `group` を付け `group-aria-expanded:` でキャレットを回す（group-data 系の導入）。

### Decision
(a) を採用。キャレットは `<span data-open={metaOpen || undefined} className="… data-[open]:rotate-180"><Icon icon={ChevronDown} …/></span>` とする。`data-open` は「`data-[open]:` バリアントを消費する要素自身に置く」という本 Issue の中核規約（ADR-004）とも一致し、`metaBody` と同じ形になる。(b) は本 Issue 範囲外の共有 API 拡張、(c) は既存コードに無い group パターンの導入になるため見送る。

### Consequences
- 良い点: 共有 `Icon` を変更せず、既存の `data-*` 開閉規約に完全に一致。装飾なので a11y への影響なし（回転は視覚のみ、開閉状態は summary の `aria-expanded` が担う）。
- トレードオフ: キャレット用に `<span>` ラッパーが 1 段増える。`Icon` に `data-*` 転送が入れば将来ラッパーを外せる（本 ADR を更新）。

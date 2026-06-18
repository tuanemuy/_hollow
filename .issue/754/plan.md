# 実装計画 — Issue #754: モバイルのノート一覧フィルターが横スクロール依存でUXが悪い（省スペースで見直したい）

**Issue:** #754
**作成日:** 2026-06-18
**複雑度:** 中〜大規模

---

## 目的

モバイル（`max-sm`）のノート一覧フィルターを、横スクロールに依存せず、かつ縦スペースを圧迫しない形に見直す。デスクトップ（`sm` 以上）の挙動は一切変えない。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `max-sm` で `FilterBar` のフィルター群が横スクロール（`overflow-x-auto`）に依存しなくなる。`filterBar` から `max-sm:overflow-x-auto` / `max-sm:flex-nowrap` が外れる、または横スクロール列がモバイルで描画されない | Issue本文「横スクロールを避けたい」 | 2, 3 |
| AC-2 | `max-sm` で、すべてのフィルター（タグ / 期間 / 公開状態 / 内部リンク参照 / クリア）に横スクロールなしで到達できる。**内部リンク参照は代替案(b)を採用**し、シート内では「適用中の参照チップ表示 + 解除」のみを提供する（新規選択はシート内ではネスト Dialog を開かない）。参照の新規追加/変更はシートを閉じてから既存 `NotePickerDialog` を開く別動線とし、いずれの動線も横スクロールに依存しない | Issue本文「スクロールしないと到達できないフィルターがある」 | 3 |
| AC-3 | `max-sm` でフィルターが常時占有する縦スペースが、現状の横スクロール1行（チップ高 `max-sm:h-8` 相当 + 既存 `mb-5`）と同等以下に収まる。具体的には、常時占有するのは「絞り込み」トリガーバー1行 + ディレクトリ行（既存）のみで、フィルター本体は折り返さずシートに退避し、シートは展開時のみ縦スペースを使う（=常時占有は現状の横スクロール1行と同等以下）。dangling 時のみフォールバックチップ行が追加で1行入るのは許容（AC-7 注記参照） | Issue本文「縦スペースを大きく取りたくない」 | 1, 3 |
| AC-4 | `sm` 以上ではデスクトップ UI の DOM・クラス・挙動が現状と完全に同一。検証は「デスクトップスコープ（`data-desktop-filters` ラッパ配下）に限定した既存アサーションが意味不変で通ること + デスクトップラッパ配下の主要要素（3 Popover トリガー・タグチップ・クリア×）の存在/クラスを列挙アサーションする機械的な DOM 確認」で担保する。モバイル UI 追加に伴うテストヘルパーのスコープ限定（デスクトップ系アサーションの意味は不変）は許容する | Issue本文「デスクトップの挙動は維持」（厳格制約） | 2, 3, 6 |
| AC-5 | モバイルの集約UI（ボトムシート）がアクセシブル：フォーカストラップ・ESCで閉じる・`role="dialog"` + `aria-modal` + アクセシブル名・トリガーへのフォーカス復帰を備える | Issue「やること」のa11y要件 | 3 |
| AC-6 | 適用中フィルターの件数がモバイルのトリガーに表示され、未到達フィルターの存在に気づける（発見性の改善）。件数 = タグ選択数（選択タグ数を1ずつ数える） + 期間(有=1) + 公開状態(有=1) + 内部リンク参照(有=1) + ディレクトリ(`optimisticDirectoryId !== undefined` で +1)。**件数のディレクトリ項は `hasAnyFilter`（FilterBar.tsx:297-302）と同一 predicate（`optimisticDirectoryId !== undefined`、dangling 非依存）に揃える**。これにより `hasAnyFilter`（クリア× の表示判定）の真偽と件数>0 が常に一致し（不変条件「hasAnyFilter ⇔ 件数>0」）、同一材料（`optimistic` 由来の値）から導出される。現在地パンくずとして表示中の非 dangling ディレクトリも件数に乗るが、クリア× の表示判定（`hasAnyFilter`）と整合させることを優先する | Issue本文「発見性が低い」 | 1, 3 |
| AC-7 | ディレクトリフィルター（パンくず / フォールバックチップ）の挙動は本変更で退行しない。dangling（`segments.length === 0`）時のみフォールバックチップ行がトリガーバーと縦に並んで追加1行となるのは許容範囲（稀ケース。AC-3 の例外） | Issue 関連ファイル `DirectoryBreadcrumb.tsx` | 3 |
| AC-8 | `pnpm typecheck && pnpm lint && pnpm format:check` が通り、FilterBar のユニットテストが更新後に通る | CLAUDE.md 開発フロー | 6 |

## スコープ

### 含まれないもの

- デスクトップ（`sm` 以上）のレイアウト・挙動・クラスの変更（AC-4 の制約。横スクロールはそもそもデスクトップでは発生せず `flex-wrap` のまま）。
- フィルターの種類・適用ロジック・URL search パラメータ・`useOptimistic` の挙動・ナビゲーション側（`homeSearchUpdater` / `run` / `reduceFilters`）の変更。UI構造の組み替えのみで、フィルター適用の振る舞いは現状維持。
- ディレクトリフィルターを「現在地パンくず」としてヘッダーに出す既存仕様（#743 ADR-002）の見直し。フォールバックチップの配置は現状維持。
- 新しいデザイントークンの追加（既存トークン・既存ユーティリティで完結させる）。
- バックエンド（ドメイン / ユースケース / アダプター）への変更（純粋にフロントの提示層）。

## 調査結果

- 関連ファイル:
  - `app/components/note/list/FilterBar.tsx` — クライアントコンポーネント。タグチップ列 + `TagPickerPopover` / `DatePopover` / `VisibilityPopover`（いずれも共通 `Popover` ベース）+ 内部リンク参照（`NotePickerDialog`）+ 全クリア × ボタン + ディレクトリフォールバックチップ。`useOptimistic` + `useTransition` でフィルター選択を楽観的反映、URLナビゲーションは `run()` に集約。
  - `app/components/note/list/styles.ts:111` — `filterBar`（横スクロールコンテナ）。`filterChip` / `filterChipGhost` / `filterChipRemove` / `filterChipCaret` / `filterClearX` などのチップ語彙。
  - `app/components/note/HomePage.tsx` — `FilterSection`（async server component）が `FilterBar` をレンダリング。props（tags / search 派生値 / directorySegments / referencingNoteTitle）を渡す。
  - `app/components/common/Dialog.tsx` — モーダルダイアログ primitive。フォーカストラップ・ESC・ボディスクロールロック・ポータル・初期フォーカス・`showCloseButton` / `closable` / `closeOnBackdropClick` を完備。**モバイルでは `dialogBackdrop`（`items-end`）+ `dialog`（`rounded-t-lg` / グラバー）で既にボトムシート表示になる**。
  - `app/components/common/styles.ts` — `dialogBackdrop`（`max-sm` で `items-end` のボトムシート、#587 ADR-001）/ `dialog` / `dialogGrabber` / `dialogActions`（`max-sm:flex-col-reverse`）/ `popoverSheetPanel`（非モーダルの bottom-anchored sheet、#588）/ `scrollbarHidden`（256-257）/ `TOUCH_TARGET`。
  - `app/components/note/list/listSelectors.ts:538` — `hasAnyHomeFilter(search)`。適用フィルターの有無判定。**件数を返すヘルパーは未存在**（AC-6 用に追加候補）。
  - `app/components/note/list/__tests__/FilterBar.test.tsx` — 既存ユニットテスト。`popoverSheetPanel` 由来の `max-sm:*` クラスをアサート（498-517 行）。
  - `app/components/note/list/NotePickerDialog.tsx` — `Dialog` を使う既存モーダル実装の手本（combobox + listbox、`closable` 連動）。
- あるべきアーキテクチャ（CLAUDE.md「Styling」/ `spec/design/`）:
  - utility-first 徹底。新規 CSS / `@apply` は禁止。state は `data-*` 属性 + `data-[name]:` variant（`data-x={value || undefined}`）。
  - 繰り返すユーティリティ文字列は module-scoped 定数へホイスト（`styles.ts`）。
  - ブレークポイントは `max-sm` を境に静的 variant で分岐（runtime state での出し分けではなく、CSS variant で「モバイルだけ別レイアウト」を表現するのが既存規約。`dialogBackdrop` / `BulkActionBar` / `popoverSheetPanel` がすべてこのパターン）。
  - モーダル/シートは独自実装せず既存 `Dialog`（モーダル・フォーカストラップ要）または `Popover` + `popoverSheetPanel`（非モーダル）を踏襲する。
  - 既存の `spec/design/pages/P10-home.html`（および `mobile/P10-home.html`）のモックは現状の横スクロール（`.filter-bar { overflow-x: auto }`）を規定している。本Issueはこのモックからの**意図的な逸脱**であり、ADR で根拠を残す（#749 ADR-001 の「チップ行は横スクローラ」という前提を本Issueが更新する）。
- 既存実装の状態:
  - 現状は「モバイルで横スクロール1行」（mock 準拠）。Issue はこれを問題視しており、あるべき姿（発見性・省スペース）と乖離している。乖離は本Issueで解消する。
  - `Dialog` がモバイルで既にボトムシート化される primitive を持っているため、**新しいシート primitive を発明する必要はない**。集約トリガー（モバイル用「絞り込み」ボタン）と、シート内に既存フィルターコントロールを再配置するレイアウトの追加で足りる。
- 依存関係:
  - `FilterBar` のみ（+ `styles.ts` の文字列、必要なら `listSelectors.ts` に件数ヘルパー追加）。`HomePage` / `FilterSection` は props 不変なら無改変。
  - `Dialog` / `Popover` は再利用するのみで改変しない（他画面への影響を避ける）。

## 設計

### ドメインモデルへの影響
なし（提示層のUI構造変更のみ。フィルター適用ロジック・URL search・ドメイン/ユースケースに影響しない）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

方針（ADR-001 参照）: **「モバイルは集約トリガー1つ → 既存 `Dialog` ボトムシートに全フィルターを展開」**。デスクトップは現状の `Popover` ベースのインライン・チップ列を完全維持する。`max-sm` / `sm:` の静的 CSS variant で出し分け、両系統を同一 DOM にレンダリングして CSS で `hidden` 切り替えするのではなく、**共通のフィルターコントロール群を内部コンポーネントに抽出**し、デスクトップは従来どおりインライン配置、モバイルはシート内に同じコントロールを描画する構成にする（ロジックは `FilterBar` 本体の `run()` / ハンドラを共有）。

具体構成:
- `FilterBar` 本体は引き続き全状態（`useOptimistic` / ハンドラ）を保持する単一の所有者。
- 既存のインライン UI（タグチップ列 + 3つの `Popover` + 内部リンク参照 + クリア×）を **`sm` 以上でのみ表示**（コンテナに `max-sm:hidden`）。
- 新規にモバイル専用の集約トリガー（`hidden max-sm:flex` のバー）を追加。トリガーは「絞り込み」ボタン（適用中フィルター件数バッジ付き、AC-6）+ 全クリア×（`hasAnyFilter` のとき）。トリガー押下で `Dialog` を開く。
- `Dialog`（`showCloseButton` + `closable` + `ariaLabelledBy`、初期フォーカスを先頭コントロールへ）内に、既存のフィルターコントロールを縦積みのセクションとして再配置：タグ（チップ群 or リスト）/ 期間（プリセット + 日付範囲）/ 公開状態（4択）/ 内部リンク参照。シート内のコントロールは `FilterBar` のハンドラ（`toggleTag` / `selectPreset` / `updateDate` / `selectVisibility` / `setPickerOpen` 等）をそのまま呼ぶ。
- ディレクトリのフォールバックチップ（`segments.length === 0` の dangling 解除）は現状の別行配置を維持（モバイルでも常時表示でよい。1チップで横スクロールしない）。
- 「適用中フィルター件数」を算出するため `listSelectors.ts` に件数ヘルパー（例 `countActiveHomeFilters` 相当）を追加するか、`FilterBar` 内の `optimistic` 由来の値から件数を組み立てる。**`optimistic`（楽観的状態）を正にしたい**ため、`FilterBar` 内で `selected.size` 等から件数を導出するのが整合的（`hasAnyFilter` の算出ロジックと同じ材料）。`listSelectors` への追加は任意。

注意（デスクトップ不変の担保）:
- デスクトップ側 DOM は現状の JSX をそのまま温存し、ラッパに `max-sm:hidden` を足すのみ。既存の `data-active` / `aria-*` / クラスは一切触らない。
- 既存テスト（`FilterBar.test.tsx`）はデスクトップ前提で動く想定。テストは `// @vitest-environment happy-dom`（`FilterBar.test.tsx:1`。リポジトリの既定環境は `node`、本ファイルのみ happy-dom にオプトイン）で実行され、**happy-dom は `window.matchMedia` を実評価せずメディアクエリを効かせないため、`max-sm:` variant は CSS として効かず、「デスクトップ列（`max-sm:hidden`）」と「モバイルトリガーバー（`hidden max-sm:flex`）」が両方 DOM に存在する**。`max-sm:hidden` を足してもクエリセレクタは要素を見つけられるので、デスクトップ系アサーションは（スコープ限定すれば）無改変の意味で通る。一方、モバイルトリガーを足すと既存テストヘルパー（`buttonByText` は container 内の全 `button` を前方一致走査、`tagButton` は `button[aria-pressed]` 全件走査）が重複要素を拾いうるため、テストヘルパーのクエリ起点をデスクトップラッパ（`data-desktop-filters` 配下）に限定する。重複が起きない設計（共通コントロールは1箇所、シートはトリガーで開いた時だけ `Dialog` がマウント）を優先しつつ、トリガーバーは happy-dom 上は常時 DOM 存在する前提でスコープ分離を Step 6 で確定する。

## 実装ステップ

内側のレイヤーは無関与のため、提示層内で「件数導出 → スタイル定数 → コンポーネント構造 → テスト」の順に進める。

### 1. 適用中フィルター件数の導出（AC-6）

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`（必要に応じ `listSelectors.ts`）
- **変更内容:** `optimistic` 由来の各 boolean/size を引数に取る単一の純粋関数「件数導出ヘルパー」を `FilterBar` 内に用意し、件数 = タグ選択数（選択タグ数を1ずつ）+ 期間(有=1) + 公開状態(有=1) + 内部リンク参照(有=1) + ディレクトリ(`optimisticDirectoryId !== undefined` で +1) を返す。**ディレクトリ項の predicate は `hasAnyFilter`（FilterBar.tsx:297-302）と完全一致させる（`optimisticDirectoryId !== undefined`、dangling 非依存）。** 「dangling のみ +1」は採らない（非 dangling ディレクトリ選択時に「クリア× は出るが件数=0」となり不変条件 `hasAnyFilter ⇔ 件数>0` が崩れるため）。既存の `hasAnyFilter`（`optimistic` 入力）はこのヘルパーの結果を使って `hasAnyFilter = count > 0` と導出し、件数とブール判定が必ず同じ材料・同じ predicate から導出されて乖離しないようにする（バッジ0なのにクリア×が出る等の不整合を構造的に排除）。
  - 入力の整理: `listSelectors.ts:538` の `hasAnyHomeFilter(search)` は **server 確定値 `search`** を入力に取る別系統の判定であり、件数バッジは **楽観的値 `optimistic` を正にしたい**ため入力が異なる。したがって `hasAnyHomeFilter` をそのまま件数化に流用せず、件数ヘルパーは `optimistic` 入力で `FilterBar` 内に置く。`listSelectors` へ出すか否かは「入力が違う（optimistic vs search）」を根拠に判断し、3箇所目の独立実装（二重定義）は作らない。
- **理由:** モバイル集約トリガーに件数バッジを出して発見性を確保するため（AC-6）。`useOptimistic` の楽観的値を正にするため `FilterBar` 内で導出する。件数とブール判定の単一情報源化（CLAUDE.md「判定の単一情報源 / illegal states unrepresentable」）。

### 2. スタイル定数の追加（横スクロール撤去 + モバイル分岐）

- **対象ファイル:** `app/components/note/list/styles.ts`
- **変更内容:**
  - `filterBar` から `max-sm:flex-nowrap` / `max-sm:overflow-x-auto` / `max-sm:gap-2` / `max-sm:pb-0.5` / `${scrollbarHidden}` を撤去し、デスクトップのインライン列ラッパに `max-sm:hidden`（+ テストスコープ用 `data-desktop-filters` 相当の目印）を付与する（このコンテナはモバイルで非表示になるため横スクロール指定が不要になる。AC-1）。
  - **`scrollbarHidden` import 削除（明示タスク）:** `styles.ts:4` の `scrollbarHidden` import 利用は現状 `filterBar`（111行）の1箇所のみ。撤去で未使用になるため `import` ごと削除する（残置すると Biome の未使用 import で lint 落ち）。`common/styles.ts` 側の `scrollbarHidden` 定数自体は BulkActionBar 等が使うため残す。
  - 内側のタグ列ラッパ（`FilterBar.tsx:316` の `inline-flex … max-sm:flex-nowrap max-sm:shrink-0`）の `max-sm:*` は残置可。デスクトップ列ごと `max-sm:hidden` になることでモバイルでは描画されず無害化されるため、撤去不要（AC-1 を「横スクロール列がモバイルで描画されない」枝で満たす依存を明記）。
  - モバイル集約トリガーバー・件数バッジ・シート内セクション見出し等の繰り返しユーティリティ文字列を module-scoped 定数としてホイスト（utility-first / ホイスト規約）。
  - JSDoc を更新し「#749 ADR-001（チップ行は横スクローラ）を本Issue（#754）が更新：モバイルは集約シートに移行」と明記。
- **理由:** CLAUDE.md の Styling 規約（横スクロール撤去・`max-sm:` variant 分岐・文字列ホイスト・JSDoc更新）に沿うため。AC-1 / AC-3。

### 3. FilterBar のモバイル集約UI追加（コア）

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - 既存のインライン UI 群（タグチップ列 + 3 Popover + 内部リンク参照 + クリア×）を包む既存の `<div className={filterBar}>` を、デスクトップ専用（`sm` 以上表示 / `max-sm:hidden`）にし、テストスコープ用に `data-desktop-filters` 相当の `data-*` 属性を付与する。中身の JSX は不変。
  - 新規に `hidden max-sm:flex` のモバイルトリガーバー（テストスコープ用 `data-mobile-filter` 相当）を追加：「絞り込み」ボタン（`aria-haspopup="dialog"` / `aria-expanded` / 件数バッジ）+ `hasAnyFilter` 時の全クリア×（既存 `filterClearX` 再利用 / 既存 `clearAll` 呼び出し）。シート（`Dialog`）にも `data-filter-sheet` 相当の `data-*` を付け、モバイル UI を既存テストのクエリ範囲から分離できるようにする。
  - **`aria-pressed`/`aria-checked` を付けない制約（arch S-003）:** モバイルトリガー（「絞り込み」ボタン）・件数バッジには `aria-pressed`/`aria-checked` を**付けない**。状態は `aria-haspopup="dialog"` + `aria-expanded` のみで表現する。理由：既存テストヘルパー `tagButton` は `button[aria-pressed]` を全件走査するため、トリガー/バッジに `aria-pressed` を持たせるとデスクトップラッパ限定の前段でセレクタの母集合が変わる。スコープ限定（`data-desktop-filters` 配下）の実装漏れがあっても二重に安全にするための制約。
  - 新規 state `filterSheetOpen`（`useState<boolean>`）を追加。トリガーで開く。**シート開閉 state はローカル `useState`（`pickerOpen` / `showAllTags` / `openPopover` と同型）で保持する（arch S-005）。** `run()` のナビゲーションでコミット時に fresh props → `useOptimistic` が baseline へスナップして `FilterBar` が再レンダーされても、`filterSheetOpen` は props 由来でないため保持され、連続フィルタ操作中もシートは閉じない。props と同期する `useEffect` は不要（入れると意図せぬ閉動作を招くため入れない）。
  - `Dialog`（`open={filterSheetOpen}` / `onClose` / `ariaLabelledBy={sheetTitleId}` / `showCloseButton` / `closable`）を追加し、内部に既存フィルターコントロールを縦積みセクションとして再配置：
    - タグ：既存 `filterChip` をグリッド/フロー配置でトグル（横スクロールなし）。多数時は既存の「もっと見る」を踏襲。
    - 期間：既存 `DATE_RANGE_PRESETS` プリセット + 日付範囲入力（`DatePopover` 内のフォーム JSX を関数に抽出して共用 or シート用に再掲）。
    - 公開状態：既存 `VISIBILITY_OPTIONS` 4択（`menuitemradio` 相当 or ラジオ群）。
    - 内部リンク参照：**代替案(b)で確定**。シート内では「適用中の参照チップ表示 + 解除（`clearReferencingNoteId`）」のみを置き、ネスト Dialog は開かない。新規追加/変更はシートを閉じてから既存 `NotePickerDialog` を開く別動線（下記「注意点」参照）。
  - シート内コントロールは `FilterBar` 既存ハンドラ（`toggleTag` / `selectPreset` / `applyDateRange` / `updateDate` / `selectVisibility` / `clearVisibility` / `clearReferencingNoteId` / `setPickerOpen`）をそのまま呼ぶ。`run()` 経由のナビゲーション・楽観的更新ロジックは一切変えない。
  - **シート内クリア後の挙動（arch S-004）:** シート内にも全クリア導線（デスクトップの clear× 相当）を置く場合、クリアで `hasAnyFilter` が false になっても **`filterSheetOpen` は維持し、シートは開いたままにする**（クリア直後に空のシートが閉じてしまうと、ユーザーが続けて別のフィルターを設定し直す動線が途切れるため）。`clearAll` は `run()` でナビゲートするだけで `filterSheetOpen` に触れないので、シート内クリアでシート state を変更しない＝開いたまま、が既定挙動。トリガーバー（シート外）の全クリア× は**シートが閉じている時のみ表示・操作可能**（シートが開いていると背後で押せない）前提とする。
  - ディレクトリのフォールバックチップ（`segments.length === 0`）の別行は現状維持。dangling 時はトリガーバー（1行）の下にフォールバックチップ行が縦に並ぶ。両行とも横スクロールしない単一行に収め、AC-3（省スペース）を割らないレイアウトにする（稀ケースのため許容。AC-7 注記）。
  - `Dialog` がフォーカストラップ・ESC・スクロールロック・トリガー復帰を担うため、a11y はほぼ primitive 任せ（AC-5）。`Popover`（非モーダル）ではなく `Dialog`（モーダル）を選ぶ根拠は ADR-001。
- **共通化の方針（デスクトップ DOM 不変）:** 期間フォーム・公開状態リストの共通化は「内側のプレゼンテーション部分のみ（プリセットグリッド `grid grid-cols-3` + 日付 input 行、公開状態の選択肢群）を props 駆動の純コンポーネントに切り出し、デスクトップは従来どおり `Popover` の children に、モバイルはシート内に同じ子を置く」方向とする。`Popover` シェル・トリガー（chip/ghost）・外側 DOM 構造は触らず、変更を内側に閉じ込めて AC-4 を守る（P-003 のテストスコープ分離とも整合）。
- **注意点（ネスト Dialog の回避 — 動線確定）:** 内部リンク参照は現状 `NotePickerDialog`（=`Dialog`、`NotePickerDialog.tsx:194`）を開く。モバイルでフィルターシート（`Dialog`）の中からさらに `NotePickerDialog`（`Dialog`）を開くとネスト Dialog になる。**実コードを精査した結果、`Dialog.tsx:256` は `event.stopPropagation()` であって `stopImmediatePropagation()` ではない。** `stopPropagation` は同一ターゲット（両 Dialog とも `document` に直付け）に登録された兄弟リスナの発火を止めないため、ネスト時は ESC 1回で**両方の document-level keydown ハンドラが必ず発火し、両 Dialog が同時に閉じる**（登録順序に依存しない確定挙動。round-1 の「登録順序依存」という記述は誤りだったため訂正）。NotePicker だけを閉じる挙動はネスト許容では得られない。
  - **採用する動線（代替案(b)で確定）:** シート内では「適用中の参照チップ表示 + 解除（`clearReferencingNoteId`）」のみを提供し、ネスト Dialog を一切開かない。参照の新規追加/変更はシートを閉じてから既存 `NotePickerDialog` を開く別動線とする。代替案(a)（シートを一旦閉じてから NotePicker を開く）はフォーカス復帰連鎖（シート閉→NotePicker マウント時の `activeElement` 次第で NotePicker クローズ後の復帰先が `<body>` に落ちうる、arch S-002）が脆いため不採用。(b) はネスト/復帰連鎖が一切発生せず最も堅い。
  - これにより ESC は常に単一 Dialog（フィルターシート）のみを閉じ、フォーカス復帰もシートのトリガーへ一意に戻る（AC-5）。代替案(a) を採らないため `previousActiveRef` の保存タイミング問題（arch S-002）は発生しない。
- **注意点（aria-busy の引き継ぎ）:** `filterBar` の `aria-busy={isPending}`（FilterBar.tsx:314）はデスクトップラッパに付いている。`max-sm:hidden` でモバイル時は非表示になるため、モバイルのトリガー/シートにも pending 表現（`aria-busy` か視覚的 pending）を引き継ぐ必要があるか本ステップで確認し、フィルター適用中の状態フィードバックがモバイルで欠落しないようにする。
- **理由:** 横スクロール撤去（AC-1/2）と省スペース（AC-3）を両立しつつ、既存モーダル primitive を踏襲して a11y を担保（AC-5）。デスクトップ JSX は不変で AC-4 を守る。

### 4. HomePage / FilterSection の確認（変更最小）

- **対象ファイル:** `app/components/note/HomePage.tsx`
- **変更内容:** 原則無改変。`FilterBar` の props シグネチャを変えない方針のため。万一新 prop が必要になった場合のみここで配線（避けるのが望ましい）。
- **理由:** 影響範囲をフィルターUIに閉じる（AC-4 / スコープ）。

### 5. デスクトップ無変更の検証

- **対象ファイル:** （検証のみ）
- **変更内容:** デスクトップ系の DOM/クラス/挙動が現状と同一であることを、デスクトップスコープに限定した既存アサーション（ghost chip の前後関係 `compareDocumentPosition`、`popoverSheetPanel` 由来クラスの `cls).toContain(...)`）が意味不変で通ること + `sm` 表示での目視（モック `P10-home.html` と差分なし）で確認する。snapshot ではなく既存の DOM 構造アサーションが無改変の意味で通ることをチェックリスト化する。
- **理由:** AC-4 の厳格制約の担保。

### 6. テスト更新

- **対象ファイル:** `app/components/note/list/__tests__/FilterBar.test.tsx`
- **変更内容:**
  - **テストヘルパーのスコープ限定（確定タスク）:** happy-dom はメディアクエリ未評価でモバイル UI も常時 DOM 存在するため、(1) 既存ヘルパー `buttonByText` / `tagButton` のクエリ起点をデスクトップラッパ（`data-desktop-filters` 配下）に絞り、モバイルトリガー/シートの重複要素を拾わないようにする、(2) モバイル UI 向けの新規テストは `data-mobile-filter` / `data-filter-sheet` スコープに限定する。「曖昧化したら直す」ではなく、衝突しない設計を先に固定する。
  - **デスクトップ不変の機械的検証（追加）:** デスクトップラッパ（`data-desktop-filters`）配下の主要要素（3 Popover トリガー・タグチップ・クリア×）の存在/クラスを列挙アサーションする回帰テストを追加し、ラッパ追加・クラス変更による退行を機械的に検出する。
  - 追加テスト：(a) デスクトップラッパに `overflow-x-auto` / `flex-nowrap` が**含まれない**こと（AC-1 の回帰防止）、(b) モバイルトリガー（絞り込みボタン）が存在し件数バッジを反映すること（AC-6。件数とクリア× 表示が同一材料・同一 predicate から導出されることも確認。特に**非 dangling ディレクトリ選択時に件数≥1 かつ `hasAnyFilter` も true** で乖離しないことを 1 ケース固定する）、(c) トリガー押下で `Dialog`（`role="dialog"` / アクセシブル名）が開きフィルターコントロールが描画されること（AC-2/5）、(d) シート内コントロールが既存ハンドラ経由で `router.navigate` を呼ぶこと、(e) シート内に内部リンク参照の「適用中チップ + 解除」が描画され、解除で `clearReferencingNoteId` 経由のナビゲートが起きること（AC-2 代替案(b) の到達性検証。ネスト Dialog を開かないことの確認）。
  - **`aria-pressed`/`aria-checked` を付けない制約の検証（arch S-003）:** モバイルトリガー/件数バッジが `aria-pressed`/`aria-checked` を持たないこと（`tagButton` の全件走査と衝突しないこと）をアサートする。
  - **代替案(b) 採用によりネスト Dialog のフォーカス復帰連鎖（arch S-002）は発生しない**ため、ESC で親子同時クローズ／NotePicker 復帰順を固定するテストは不要。代わりに「シート ESC/× で `filterSheetOpen` が閉じ、トリガーへフォーカス復帰する」単一 Dialog の挙動（`Dialog` primitive 任せ）を確認する。
  - happy-dom はメディアクエリ（`window.matchMedia`）未評価のためモバイル/デスクトップ両 UI が DOM 上に共存しうる点に留意し、上記 `data-*` でスコープを分けてテスト可能にする。
- **理由:** AC-1〜6 の検証可能性確保（AC-8）。

## 設計判断

モバイルフィルターUIの方式（集約トリガー + ボトムシート / 適用中チップのみ表示 / よく使うフィルターだけ常時表示）の選定と、シート実装に既存 `Dialog`（モーダル）を採るか `Popover` + `popoverSheetPanel`（非モーダル）を採るかのトレードオフを `adr.md`（ADR-001 / ADR-002）に記載。

## リスクと注意点

- デスクトップ不変の担保が最重要：既存 JSX を温存しラッパに `max-sm:hidden` を足すだけに留める。インライン UI の DOM 構造を組み替えると AC-4 を破りやすい。
- happy-dom（`FilterBar.test.tsx` の `// @vitest-environment happy-dom`。既定環境は `node`）はメディアクエリ（`window.matchMedia`）を評価しないため、モバイル UI とデスクトップ UI が同時に DOM 上に存在し、既存テストのセレクタ（`buttonByText` の全 `button` 走査・`tagButton` の `button[aria-pressed]` 走査）が想定外の重複要素を拾うリスク。シート内コントロールが同種ボタンを再掲する設計だと顕在化する。対策はヘルパーのクエリ起点をデスクトップラッパ（`data-desktop-filters`）に限定する設計の事前固定（Step 6）。シートは `Dialog` が `open` で unmount するため未オープン時はシート内要素は不在だが、トリガーバーは常時 DOM 存在する前提でスコープ分離する。
- 期間フォーム / 公開状態リストの JSX をデスクトップ Popover とモバイルシートで重複させると保守性が落ちる。共通サブコンポーネントへ抽出するのが望ましいが、抽出しすぎてデスクトップ DOM が変わると AC-4 を破る——抽出は「中身を変えずに包む」範囲に限定する。
- `scrollbarHidden` が `styles.ts` で未使用になった場合の import 整理（lint 警告）。他箇所（BulkActionBar 等）では引き続き使用されるため `common/styles.ts` 側の定数自体は残す。
- ディレクトリフォールバックチップとモバイルシートの二重表示で縦スペースが増えないか確認（フォールバックは稀ケースのため許容範囲）。
- シート開閉 state（`filterSheetOpen`）はローカル `useState` でナビゲーション再レンダーをまたいで保持される（`pickerOpen` と同型、arch S-005）ため、連続フィルタ操作中もシートは閉じない。実装者は props と同期する `useEffect` を入れないこと（意図せぬ閉動作の原因になる）。

## テスト方針

- ユニット（`FilterBar.test.tsx`）：AC-1（横スクロールクラス不在）/ AC-6（件数バッジ）/ AC-2・5（シート展開・`role="dialog"`・アクセシブル名）/ ハンドラ経由ナビゲーション。既存テストの無改変パスでデスクトップ不変（AC-4）を確認。
- 静的検査：`pnpm typecheck && pnpm lint:fix && pnpm format`（AC-8）。
- 手動/ブラウザ（`max-sm` ビューポート）：横スクロールが消えていること、絞り込みボタン → ボトムシート展開、各フィルター操作の反映、ESC / ×で閉じる・トリガーへフォーカス復帰、件数バッジの更新。`sm` 以上ではモック `P10-home.html` と差分なし。

## レビュー履歴

### 1周目（2026-06-18）

- **[coverage P-001 / arch P-001]** テスト環境を「jsdom」→「happy-dom」に修正（`FilterBar.test.tsx:1` の `// @vitest-environment happy-dom`、既定環境は `node`）。`window.matchMedia` 未評価で両 UI が DOM 共存しうるという論旨は維持。plan の設計注意 / Step 6 / リスク、adr.md Consequences を更新。
- **[coverage P-001 / arch P-003]** AC-4 を「デスクトップスコープ限定の既存アサーション + 機械的 DOM 確認」で検証可能な形に書き換え。Step 3 でデスクトップラッパに `data-desktop-filters`、モバイルに `data-mobile-filter`/`data-filter-sheet` を付与、Step 6 でヘルパー（`buttonByText`/`tagButton`）のスコープ限定を確定タスク化。
- **[coverage P-002]** AC-3 を「常時占有はトリガーバー1行 + ディレクトリ行のみ、本体はシート展開時のみ縦消費＝現状横スクロール1行と同等以下」と検証可能に具体化。手動確認にも反映。
- **[arch P-002]** ネスト Dialog（シート内 `NotePickerDialog`）の検証手順と代替案（一旦閉じてから開く / シート内は適用中チップ + 解除のみ）を Step 3 注意点に追加。adr.md に「ネスト Dialog の扱い」節を追記。
- **[coverage S-002 / arch P-004]** 件数導出を `optimistic` 入力の単一純粋関数に集約し `hasAnyFilter = count > 0` で一本化。`hasAnyHomeFilter`（search 入力）とは入力が違うため二重定義しない方針を Step 1 に明記。件数の数え方を AC-6 に明記。
- **[coverage S-001 / arch S-005]** dangling フォールバックチップ行とトリガーバーの縦並びでも AC-3 を割らないレイアウトを Step 3 / AC-7 注記に明示。
- **[coverage S-003 / arch S-006]** タグ列 `max-sm:flex-nowrap` 残置がデスクトップ列 `max-sm:hidden` で無害化される依存を Step 2 に明記。`aria-busy` のモバイル引き継ぎ確認を Step 3 に追記。
- **[arch S-002]** 期間/公開状態の共通化は「内側プレゼンテーション部分のみ純コンポーネント抽出・外側 DOM 不変」方針を Step 3 に明記。
- **[arch S-003]** シート内の公開状態・期間は menu/listbox でなく `fieldset` + ラジオ群で構成する方針を adr.md（ADR-001 Consequences）に確定。
- **[arch S-004]** `styles.ts` の `scrollbarHidden` import 削除を Step 2 の明示タスク化（`common/styles.ts` 側定数は残置）。
- **[arch S-001]** デスクトップラッパ配下の主要要素（3 Popover トリガー・タグチップ・クリア×）の存在/クラス列挙アサーションを Step 6 に追加。

### 2周目（2026-06-18）

- **[coverage P-001]（要修正）** 件数式のディレクトリ項を `hasAnyFilter`（FilterBar.tsx:297-302）と同一 predicate（`optimisticDirectoryId !== undefined`、dangling 非依存）に統一。「dangling のみ +1」を廃し、不変条件「hasAnyFilter ⇔ 件数>0」を非 dangling ディレクトリ選択時も成立させた。AC-6 / Step 1 を修正。
- **[coverage S-001]** `filterBar` の行番号参照を 111 に統一（102 は `filterLabel`）。実コードで確認済み（plan 内の参照は既に 111 で一貫、誤参照の残置なし）。
- **[coverage S-002 / arch S-001]** AC-2 に内部リンク参照の到達動線（代替案(b)：シート内は適用中チップ + 解除、新規選択はシート外別動線）を一文固定。ネスト Dialog の ESC 挙動を実コードに即して訂正（`Dialog.tsx:256` は `stopPropagation` で、登録順序非依存・ESC で両 Dialog 同時クローズ）。Step 3 / adr.md「ネスト Dialog の扱い」に反映。
- **[arch S-002]** 代替案(b) 採用によりフォーカス復帰連鎖が発生しない旨を Step 3 / Step 6 / adr.md に明記（(a) の `previousActiveRef` 保存タイミング問題を回避）。
- **[arch S-003]** モバイルトリガー/件数バッジに `aria-pressed`/`aria-checked` を付けない制約（`tagButton` 全件走査と非衝突）を Step 3 / Step 6 に明示。
- **[arch S-004]** シート内クリア後は `filterSheetOpen` を維持（クローズしない）、トリガーバーの× はシート閉時のみ操作可能、を Step 3 に明記。
- **[arch S-005]** シート開閉 state はローカル `useState`（`pickerOpen` と同型）で保持し props 同期 `useEffect` を入れない旨を Step 3 / リスク節に追記。

2周目で要修正問題（coverage P-001）を解消、計画確定。

# 実装計画 — Issue #354: P10 ノート一覧: モバイル対応 + 選択モード/絞り込み UX の全面刷新

**Issue:** #354
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

P10（ノート一覧画面）の操作系を `spec/design/pages/P10-home.html` を正として一括刷新する。
1. モバイルレイアウト対応（CTA アイコン化、サイドバードロワー化、FilterBar / BulkActionBar のモバイル最適化）
2. 明示的な選択モード（チェックボックス常時表示をやめ、トグルで切り替え）
3. デザイン準拠のスタイル付きチェックボックス（List/Tile/Calendar 共通化）
4. 絞り込みの即時反映（`useOptimistic` で選択状態を即時、結果は pending 表示）

## スコープ

### 含まれるもの
- ヘッダー / P10 ツールバー CTA のモバイルアイコン化
- サイドバー（ディレクトリツリー/ライブラリ/タグ）の lg 未満オフキャンバスドロワー化（app-shell 層）
- FilterBar のモバイル最適化 + タグファセット件数制限 / 「もっと見る」
- BulkActionBar のデザイン準拠（dark sticky-bottom pill）+ モバイル最適化
- 明示的な選択モードの導入（SelectionContext 拡張）
- 共通 `NoteCheckbox` コンポーネント新規作成、ネイティブ input 置換
- FilterBar の `useOptimistic` 即時反映
- `selectionReducer` の mode 遷移ユニットテスト追記

### 含まれないもの
- サイドバーの恒久的な情報設計（ライブラリナビ等の再設計） — 別 Issue
- アップロードモーダル本体のモバイル対応（#257 CLOSED の領域）
- Header / NoteListToolbar の二重 CTA の統廃合（各々モバイル最適化のみ）
- `searchToViewQuery` / `viewQueryToSearch`（保存ビュー変換ロジック）の変更
- `AppShell.tsx`（デッドコード）への変更
- サイドバー内アップロードリンクの個別 CTA アイコン化（ドロワー化で吸収される。CTA アイコン化の対象はヘッダー / NoteListToolbar の2箇所）
- FilterBar の active chip 色変更は **FilterBar ローカル定数に限定**。共有 `CHIP_ACTIVE`（layout/styles.ts）は他画面に波及するため変更しない

### スコープの補足
- **CalendarView も選択機能を持つため、チェックボックス置換・選択モード連動の対象に含める**（Issue の対象ファイル目安には未記載だが、List/Tile と同じ選択 UX を維持するための必然的拡張）。

## 実装ステップ

### 要件1: モバイルレイアウト対応

#### 1. サイドバードロワー化（ADR-002）

- **対象ファイル:** `app/components/layout/AppShellFrame.tsx` / 新規 client wrapper（例 `AppShellDrawer.tsx`）+ Context / `app/components/layout/Header.tsx`（`MenuButton` client island 追加）/ `app/components/layout/styles.ts`
- **変更内容:**
  - **薄い client wrapper（`AppShellDrawer`）を新設**。`useState` で開閉 state を持ち `DrawerContext` を provide。`AppShellFrame` は **Server Component のまま**据え置き、`{header}` / `{sidebar}` / `{children}` をこの wrapper に children として渡す（RSC payload と副作用 import を server に局在させる）。
  - 位置付きの `<aside>` コンテナ（`data-open` 駆動）と backdrop は wrapper 側に置き、`Sidebar.tsx` の RSC payload をその中身として渡す。
  - ハンバーガーは Header 内の client island `MenuButton`（`lg:hidden`）として配置し、`DrawerContext` を consume してトグル。Header は RSC のまま client island を子に内包する。デザインの `.header-left`（ロゴと並ぶハンバーガー）構造を保つ。
  - `styles.ts` の `APP_SIDEBAR` を、lg 未満は `fixed inset-y-0 left-0 w-[280px] z-[100] -translate-x-full data-[open]:translate-x-0 shadow-md transition-transform motion-reduce:transition-none`、lg 以上は従来の sticky グリッドに改修。`border-b lg:border-r` の「本文上に縦積み」前提を撤去。
  - backdrop 要素（`max-lg` のみ、`data-[open]:block hidden fixed inset-0 z-[90] bg-black/20`）、クリックで close。
  - ドロワー展開中のアクセシビリティ: 背面スクロール抑止 / Esc クローズ / フォーカス管理は既存ダイアログ（`common/Dialog.tsx` 等）のパターンがあれば踏襲する。`DrawerContext` の Provider は header（`MenuButton`）・aside・backdrop すべての共通祖先に置く。
- **理由:** デザインのオフキャンバスドロワー仕様に準拠。Frame の RSC 性を壊さずに client Context で開閉を制御し、P10 以外のルートでも一貫。

#### 2. ヘッダー / ツールバー CTA のアイコン化

- **対象ファイル:** `app/components/layout/Header.tsx` / `app/components/layout/styles.ts` / `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:**
  - 新規作成 pill のラベルを `<span className="max-sm:hidden">` でラップし、`max-sm` でアイコンのみ幅（`max-sm:w-11 max-sm:px-0 max-sm:justify-center`）に。`aria-label` を恒常付与。
  - アップロードはデザイン通りアイコンのみ（`ICON_BTN` ベース、ラベルは sm 未満で hidden）。`UploadButton` に className を渡し分け。
  - `NoteListToolbar` の新規作成 / アップロード / ビュー保存 CTA も同様にラベルを `max-sm:hidden` でアイコン化。
- **理由:** デザインのモバイル CTA 圧縮に準拠。44px タッチターゲットと aria-label を維持。

#### 3. FilterBar のモバイル最適化 + タグ折りたたみ

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - タグファセットに件数制限（`VISIBLE_TAG_LIMIT`）+ 「もっと見る (+N) / 閉じる」トグル（`useState`）。
  - コンテナを `flex flex-wrap gap-2` でモバイル幅に収め、期間 input / 公開状態 select / 内部リンク参照を折り返す。日付 input は `max-sm` で全幅寄せを検討。
  - active chip をデザイン準拠の `bg-ink text-white` に寄せる。
- **理由:** タグが多すぎてモバイルで溢れる問題の解消、FilterBar 全体のモバイル最適化。

#### 4. BulkActionBar のデザイン準拠 + モバイル最適化

- **対象ファイル:** `app/components/note/list/BulkActionBar.tsx`
- **変更内容:**
  - light sticky-top → **dark sticky-bottom pill**（`sticky bottom-4 z-40 mx-auto max-w-[720px] bg-ink text-white rounded-pill shadow-md`）に作り替え。
  - アクション群を `inline-flex items-center gap-1 overflow-x-auto flex-nowrap`、白文字 pill（hover `bg-white/12`、danger hover）、divider、末尾 × は選択解除。
  - モバイル: `max-sm:max-w-[calc(100vw-32px)]`、actions 横スクロール。繰り返し文字列は module-scope 定数化。
- **理由:** デザイン準拠 + モバイルでアクションが溢れない。

### 要件2: 明示的な選択モード

#### 5. 選択モードを SelectionContext に追加

- **対象ファイル:** `app/components/note/list/listSelectors.ts` / `app/components/note/list/SelectionContext.tsx`
- **変更内容:**
  - `SelectionState` に `mode: boolean` を追加。`SelectionAction` に `enterSelectMode` / `exitSelectMode`（exit で ids も clear）/ `toggleSelectMode` を追加。`selectionReducer` を拡張（pure）。
  - `emptySelection = { ids: new Set(), mode: false }`。
- **理由:** 選択 ids と mode を同じ Context でアトミックに扱う。

#### 6. 選択モードトグル UI（ADR-005）

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`（or `NoteList.tsx`）
- **変更内容:**
  - ツールバーに「選択」トグルボタン（`pillBtn`、`data-primary={selectionMode || undefined}`、`aria-pressed`）を追加。dispatch で `toggleSelectMode`。
  - `NoteList.tsx` の `BulkActionBar` を **`state.mode` が true の間は常にマウント**（0件選択時はアクション disabled、件数を live 表示）。BulkActionBar 末尾の × は `exitSelectMode`（mode OFF + ids clear）に割り当て。
- **理由:** 明示的な選択モード切り替え。mode 中はバーが安定したアンカーとして残り 0件でちらつかない。

#### 7. 各 view を選択モード連動に（ADR-005）

- **対象ファイル:** `app/components/note/list/ListView.tsx` / `TileView.tsx` / `CalendarView.tsx`
- **変更内容:**
  - `state.mode` が false のときチェックボックスを非表示にし、行/カードクリックは通常リンク遷移。`mode` true のとき checkbox を表示。
  - mode ON 時の Link 競合は view 別に解決（ADR-005）: **Tile** は外側 `<Link>` を `<button>` にスワップしカード全面でトグル、**List/Calendar** は行コンテナでトグルしタイトル `<Link>` を `pointer-events-none`。条件分岐は可能な限り `data-mode` 属性 + variant、DOM 差し替えが必要な箇所のみ JSX 分岐。
- **理由:** 常時チェックボックス表示をやめ、モバイルで hover に依存しない選択導線にする。

### 要件3: デザイン準拠チェックボックス

#### 8. 共通 `NoteCheckbox` コンポーネント新規作成

- **対象ファイル:** `app/components/note/list/NoteCheckbox.tsx`（新規）
- **変更内容:**
  - デザイン `.note-check` を踏襲した `<button type="button" role="checkbox" aria-checked aria-label>`。`data-checked={checked || undefined}` で `bg-accent border-accent text-white`、未チェックは `border-[1.5px] border-hairline-strong`。中身は lucide `Check`（`Icon`）。`max-sm:min-w-[44px] max-sm:min-h-[44px]`。
  - List / Tile / Calendar のネイティブ input + `accent-accent` を全置換。クラス文字列は module-scope 定数化。
- **理由:** デザイン準拠 + 重複解消。

### 要件4: 絞り込み即時反映

#### 9. FilterBar に `useOptimistic` 導入

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - サーバ確定値（props）を baseline に `useOptimistic` でクライアント即時状態を構築。各操作で `startTransition` 内に `setOptimistic(...)` → `router.navigate(...)`。
  - **optimistic 管理下に置くのは FilterBar が所有する search キーのみ**（`tagNames` / `from` / `to` / `visibility` / `referencingNoteId`）。`q`（Header 検索）/ `viewId`（保存ビュー）/ `page` は props 直読みのまま `router.navigate` の prev スプレッドで保持し、optimistic 差分計算に含めない。これらが別経路で変わっても baseline（props）が更新されれば commit 時に自動整合する。
  - chip の active 判定 / select 値 / 日付値を optimistic state から描画。結果リストは `isPending` で `aria-busy` + 半透明 pending 表示。
  - **既存の `disabled={isPending}` ゲートを撤去する**。現状 FilterBar は全コントロールに `disabled={isPending}` を付与しており、これを残すと pending 中の連続トグルが無効化され「即時反映＋取りこぼしなし」が成立しない。pending 表現は結果リスト側（`aria-busy` + 半透明）に移し、コントロールは optimistic state 駆動で常時操作可能にする。
  - リコンサイル: loader 往復後に props が更新され、transition 解決で optimistic は baseline に戻り自動整合。
- **理由:** フィルタ選択がサーバ応答まで UI に出ない問題の解消。

#### 10. テスト追記

- **対象ファイル:** `app/components/note/list/__tests__/listSelectors.test.ts`
- **変更内容:** `selectionReducer` の mode 遷移（enter / exit→ids clear / toggle）を pure テストで追加。
- **理由:** 選択モードの不変条件をピン留め。

## 設計判断

詳細は `adr.md` を参照。

- **選択モードの状態管理 = SelectionContext（useReducer）拡張**（URL でもローカル state でもなく）。選択 ids と mode をアトミックに扱え、URL に載せないことで loader 再実行を避け要件4と整合。
- **サイドバードロワーは app-shell 層（AppShellFrame）に実装**。Header / Sidebar は RSC payload で P10 と独立。両者を合成する Frame が唯一の共通祖先。ハンバーガーは Frame 側の `lg:hidden` client ボタンとして header 左に重ねる。
- **useOptimistic の畳み込み**: baseline = server-confirmed props。各トグルは current ベースで反映。`router.navigate` を副作用として並走、transition 解決で props 更新時に optimistic 破棄 → baseline 復帰。
- **チェックボックスのコンポーネント化粒度 = 単一汎用 `NoteCheckbox`**。view 固有のラッパーは呼び出し側に残し、ボタン本体だけ共通化。
- **active chip 色**: デザイン準拠で `bg-ink` に寄せる。

## リスクと注意点

- **app-shell 全ルートへの波及**: ドロワー化は `_app` 配下全ページのサイドバー表示を変える。P10 以外でモバイル表示が壊れないか要確認。RSC payload を children として渡す構造を維持しハイドレーション境界を壊さない。
- **`AppShell.tsx` はデッドコード**。live は `AppShellFrame`。誤って両方直さない。
- **選択モード OFF/ON 時の行クリック挙動**: タイトルは `<Link>`。mode ON 時にリンク遷移と選択の競合を避ける（mode ON 時は checkbox 限定 or `preventDefault`）。
- **CalendarView も選択対象**: チェックボックス置換・mode 連動を List/Tile と同じく適用（取りこぼし注意）。
- **`useOptimistic` × `router.navigate` の二重管理**: transition 解決後に baseline へ正しく戻ること、navigate 失敗時に optimistic が宙吊りにならないこと、保存ビュー復元 / クリア操作との整合を確認。
- **デザイントークン / ブレークポイント**: 新規メディアクエリは書かず `max-sm:` / `lg:` / `max-lg:` variant を使う。新規トークン追加は不要。
- **BulkActionBar の sticky 位置変更**（top→bottom）: 既存で `sticky top-[var(--header-height)]` に依存する箇所がないか、モバイルで bottom 固定がコンテンツ最下部と干渉しないか確認。

## テスト方針

- **ユニット**: `listSelectors.test.ts` に `selectionReducer` の mode 遷移を追加。
- **実機 / レスポンシブ**（375px / 640px / 1024px 境界）:
  - サイドバー: lg 未満でハンバーガー → ドロワーがスライドイン、backdrop タップで閉、lg 以上で sticky 復帰。P10 以外でも確認。
  - CTA: sm 未満でアイコンのみ（44px タッチターゲット、aria-label 維持）。
  - FilterBar: タグ多数時に件数制限 + 「もっと見る」展開、モバイル幅で折り返す。
  - BulkActionBar: 選択時に dark pill が画面下に sticky、モバイルでアクション横スクロール。
- **選択モード**: OFF 時 checkbox 非表示・行クリックで詳細遷移、ON 時 checkbox 表示・BulkActionBar 出現・複数選択→一括操作が従来通り、OFF で選択クリア。List/Tile/Calendar 各 view で確認。
- **絞り込み即時反映**: 操作した瞬間に選択状態が UI 反映、結果リストが pending → サーバ確定後に整合。連続トグルで取りこぼしなし、クリア/保存ビュー復元との整合。
- 最終: `pnpm typecheck && pnpm lint:fix && pnpm format`。

### ブレークポイント対応表（検証時の確認境界）

| 切り替え対象 | 境界 | 375px | 640px(sm) | 1024px(lg) |
|---|---|---|---|---|
| CTA アイコン化（ヘッダー/ツールバー） | sm | アイコンのみ | ← 切替 → フルラベル | フルラベル |
| サイドバードロワー化 | lg | ドロワー | ドロワー | ← 切替 → sticky |
| FilterBar 折り返し/タグ制限 | sm | 折返+制限 | 余裕 | 横並び |
| BulkActionBar 横スクロール | sm | 横スクロール | pill | pill |

## レビュー履歴

### 1周目
**修正した点（要件カバレッジ視点）**:
- [P-001] サイドバー内アップロードリンクはドロワー化で吸収される旨をスコープに明記。CTA アイコン化対象はヘッダー / ツールバーの2箇所であることを明確化。
- [P-002] BulkActionBar の表示条件（mode ON で常時マウント・0件時 disabled・× で exitSelectMode）を ADR-005 と plan ステップ6 に明記。

**修正した点（アーキ・リスク視点）**:
- [P-001] ハンバーガーの absolute オーバーレイ案を撤回。Header 内 client island `MenuButton` + `DrawerContext` consume に変更（ADR-002）。デザインの `.header-left` 構造を保持。
- [P-002] `AppShellFrame` を client 化せず、薄い client wrapper（`AppShellDrawer`）+ Context を新設して開閉 state を持たせ、Frame は Server Component のまま据え置く構成に変更（ADR-002）。副作用 import を server に局在。
- [P-003] 選択モード ON 時の Link 競合を view 別に確定（Tile=Link↔button スワップ、List/Calendar=行トグル + タイトル pointer-events-none）（ADR-005、ステップ7）。

**取り込んだ改善提案**:
- [S-001/要件] ブレークポイント対応表をテスト方針に追加。
- [S-002/要件] CalendarView を対象に含める理由をスコープ補足に明記。
- [S-003/要件] デザインの hover-reveal をあえて踏襲しない判断を ADR-004 に明記。
- [S-001/アーキ] useOptimistic の管理対象を FilterBar 所有キーに限定する境界を明記（ステップ9）。
- [S-002/アーキ] active chip 色変更を FilterBar ローカルに限定（共有 CHIP_ACTIVE は不変）をスコープに明記。
- [S-003/アーキ] NoteCheckbox のキーボード/focus はネイティブ `<button>` で担保、focus-visible 付与を ADR-004 に明記。

**見送った提案とその理由**:
- なし（指摘はすべてスコープ内で反映可能だった）。

### 2周目
**修正した点**:
- [P-001/アーキ] FilterBar の既存 `disabled={isPending}` ゲート撤去を plan ステップ9 に明記。これを残すと pending 中の連続トグルが無効化され「即時反映＋取りこぼしなし」が成立しないため。pending 表現は結果リスト側に移す。

**取り込んだ改善提案**:
- [S-002/アーキ] ドロワー展開中の背面スクロール抑止 / Esc / フォーカス管理を既存ダイアログパターン踏襲でステップ1に追記。`DrawerContext` Provider の配置スコープ（header/aside/backdrop の共通祖先）も明記（S-001/アーキ）。

**確認結果**:
- 要件カバレッジ視点: 両周通じて要件1〜4 全項目カバー、スコープ整合性良好。2周目は**問題点ゼロ**。
- S-001（要件・ドロワー一元化の機能後退懸念）/ S-003（アーキ・BulkActionBar の mode 参照順序）は実機検証・実装順序で対応する性質のものでテスト方針に内包済み。

**終了判断**: 2周目で要件視点は問題点ゼロ、アーキ視点の P-001 を反映済み。残る指摘は実機検証/実装順序レベルで plan に内包されたため、レビューループを2周で終了し実装フェーズへ引き継ぐ。

# 実装計画 — Issue #540: impl: 領域1「ノートを書く・読む・探す」(P10/P11/P12/P20) のモック実装追従（#514 子）

**Issue:** #540
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

#510 で確定した領域1「ノートを書く・読む・探す」のデザインモック（`spec/design/pages/P10-home.html` / `P11-note-detail.html` / `P12-editor.html` / `P20-views.html` および P10-* ダイアログ群）に、実装（`app/routes/` / `app/components/` / 各 `styles.ts`）を追従させる。SSOT はモックと `spec/design/index.md` / `tokens.md`。デザイントークン経由で寸法・色を当て、リテラル px の新規持ち込みを避ける。

## スコープ

### 含まれるもの

- **SHELL サイドバー精緻化（P10/P11/P12 共通）**: 「すべてのノート」への件数バッジ、「保存したビュー」セクションのビュー列挙（最大数件）、ライブラリ/管理セクションの構成をモックに寄せる。
- **P10 一覧**: FilterBar 帯の境界表現をモック（余白区切り・border-bottom 廃止）に合わせる。表示モードタブ・保存ビュー select・ツールバー CTA の文言/形態確認。
- **P11 詳細**: 本文下メタブロックの順序（プロパティ → バックリンク）に揃える。**「場所」（ディレクトリパス）行を追加**（index.md §2.1 + P11 モック双方が本文下メタへの掲載を要求。`directorySegments` は `NoteDetail` が取得済みで DTO 拡張不要）。「公開状態」行はメタに追加しない（index.md §2.1 のメタ項目列挙に含まれず、#459 でトップツールバーの公開設定ピルに集約済み。メタ追加は二重化）。バックリンクカードのメタ行（ディレクトリパス）追従。ノート本文内の内部リンク（wikilink）ピル / hashtag のスタイル追従（**ただし下記「設計判断」の条件付き**）。
- **P12 エディタ（chrome/レイアウトのうち本 Issue 範囲）**: 「設計判断」で確定する範囲のみ。document スタイルのタイトル入力・モードタブ配置・autosave 表示位置・タグ chip 表示など、#522/#287/#157/#77-80 に属さない部分。
- **P20 保存ビュー**: ビューカードの絞り込み条件 chip 列挙（タグ/期間/公開状態/ソート/ディレクトリ）、行アクションの整理（適用 + その他メニュー化の是非）、broken バナーの `.alert` 案D 追従の是非。

### 含まれないもの（既存 Issue / 別 Issue で対応）

- #499 ノート行クリック領域 / #474 無スタイル errorComponent
- #522 エディタのフォーカス枠線・余白 / #287 inline メディア挿入 / #157 リアルタイム編集衝突 / #77 #78 #79 #80 WYSIWYG 拡張
- **「最近更新」「お気に入り」サイドバー項目** — バックエンドに対応概念（recent/favorites のドメイン・ルート）が存在しない新機能であり、モック追従の範囲を超える（後述 ADR-001）。
- **トースト/`.alert` 案D の基盤刷新** — index.md §9 で「実装は別 Issue」と明記。本 Issue では既に `.alert` 案D 化済みの導線に倣うのみ。
- ダイアログ群（P10-*）の**新規実装** — 対応コンポーネントは既存（後述）。本 Issue ではモック乖離が確認できた場合のみ微修正。

## 実装ステップ

### A. SHELL サイドバー（P10/P11/P12 共通）

#### A-1. 「すべてのノート」への件数バッジ

- **対象ファイル:** `app/components/layout/Sidebar.tsx`、`app/components/layout/action.ts`（`loadDirectoryTree`）、必要なら `app/components/note/loaders.ts`
- **モック差分:** モックは `ライブラリ > すべてのノート` に `<span class="count">127</span>`（右寄せ件数バッジ）を持つ。`.nav-item .count { margin-left: auto; font-size: 12px; color: var(--color-ink-tertiary); }`。実装はバッジなし。
- **変更内容:** サイドバーのデータ取得（現状 `loadDirectoryTree` のみ）に、アクティブノート総件数を取得する loader 呼び出しを追加し、「すべてのノート」リンクの右端に件数を表示する `<span>`（`ml-auto text-xs text-ink-tertiary` を `layout/styles.ts` に定数化、例: `NAV_COUNT`）を追加する。件数は `loadOwnedNotes`（`status: "active"`, limit 最小）の `count` 等、既存 loader の戻り値から得る。
- **理由:** モック追従。ライブラリの全体ボリュームを一目で示す。

#### A-2. 「保存したビュー」セクションのビュー列挙

- **対象ファイル:** `app/components/layout/Sidebar.tsx`、`app/components/layout/action.ts`
- **モック差分:** モックは独立した `保存したビュー` セクションに保存ビューを 1 件ずつ nav-item として列挙する。実装は `保存ビュー` を単一リンク（`/views`）として置くのみで列挙しない。
- **変更内容:** サイドバーで個人ビュー（`loadSavedViewsByKind` / `kind:"personal"`）を取得し、`保存したビュー` セクション見出し + 各ビューへのリンク（`<Link to="/" search={{ viewId }}>`）を列挙する。件数が多い場合の上限（例: 先頭 N 件 + 「すべて表示」リンク）を設ける。0 件時はセクションごと、または「保存ビューはまだありません」相当を出す（モックは 0 件状態を描いていないため最小実装で可）。`/views` への導線は管理/セクション末尾のリンクとして残す。
- **理由:** モック追従。サイドバーから 1 クリックでビュー適用できる導線（P20 ページ説明文とも整合）。

#### A-3. セクション構成の整合（任意・低リスク）

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **モック差分:** モック末尾セクションは `タグ / ゴミ箱 / エクスポート`。実装の「管理」セクションは `タグ / ゴミ箱 / エクスポートジョブ / アップロード`。
- **変更内容:** 実装にある「アップロード」「エクスポートジョブ」は機能上必要な導線であり、モックの簡略表記より実装が正。文言を大きく変えず現状維持を基本とする（モックは設計プロトタイプで全導線を網羅していない）。差分は意図的として **ADR-005** に記録する。
- **理由:** モックは導線の網羅ではなく構成イメージ。既存の必要導線を削らない。

### B. P10 一覧

#### B-1. FilterBar 帯の境界をモックに合わせる

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`(ルート `div` の className)
- **モック差分:** モック `.filter-bar { padding: 0; margin-bottom: var(--space-5); }`、CSS コメントで「`border-bottom` を持たせると note-list 先頭行の `border-top` と二重線になるため、境界は下マージン（余白）で表現する。横パディングは 0 にして先頭チップの左端を見出し・ツールバーと揃える」と明記。実装は `px-2 py-3 border-b border-hairline mb-3`（横 padding あり・下線あり・mb-3）。
- **変更内容:** ルート `div` を `flex flex-wrap items-center gap-3 mb-5 max-sm:gap-2`（`px-2 py-3 border-b border-hairline mb-3` を除去、`mb-5` = `--space-5`）に変更。`aria-busy` 等の機能は維持。
- **理由:** モック CSS コメントが明示する設計意図（二重線回避・左端揃え・余白で区切る、index.md §2.2）への追従。

#### B-2. 表示モードタブ / 保存ビュー select / CTA の確認

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`、`app/components/note/list/NoteListToolbar.tsx`
- **モック差分:** モックは表示モードを `pill-btn` タブ群（active=accent/white）で表現し（CSS コメントで `DisplayModeSwitch` = pill 群、#292 ADR-002 を明記）、右に 選択 / ビューとして保存 / 新規作成 / アップロード。実装は既にこの形態で一致。保存ビュー select も `.view-select`（h-36 相当）とほぼ一致だが、実装は `h-9`。
- **変更内容:** 形態は一致しているため原則変更なし。`view-select` の高さ（モック 36px=`h-9`、実装 `h-9`）・角丸（`rounded-md`）は一致。差分が無ければ本ステップは確認のみで no-op。寸法ノーマライズ（index.md #461）に反する任意値があれば是正。
- **理由:** モックと実装が既に整合。盲目的な変更を避ける。

### C. P11 詳細

#### C-1. 本文下メタブロックの順序と項目構成

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`（`NoteMetaPanel` と backlinks の描画順）、`app/components/note/detail/NoteMetaPanel.tsx`
- **モック差分:** モックは本文下に **プロパティ（作成/更新/場所/タグ/公開）→ バックリンク** の順。実装は **バックリンク → プロパティ（作成日/更新日/公開日/タグ/元ファイル/状態）** の順で、かつ **`場所` 行が欠落**している。index.md §2.1 は本文下メタ項目を「作成日 / 更新日 / **場所** / タグ」と明示列挙し、P11 モックも `場所` 行（`Research / 論文メモ`）を持つ（コメント「場所はここに集約 #356 ADR-002」）。一方 `公開状態` は index.md §2.1 のメタ項目列挙に**含まれず**、モックでは下部メタにも pub-pill があるが、実装は #459 でトップ `action-toolbar` の公開設定ピル（ラベル付き・状態ドット）に集約済み。
- **変更内容:**
  - 順序を **プロパティ → バックリンク** にモック準拠で入れ替える（`NoteDetail.tsx` の JSX 順、または `NoteMetaPanel` 内のセクション順）。
  - **`場所` 行を `NoteMetaPanel` に追加する**（`META_KEY`「場所」+ `directorySegments` を `/` 区切りでパス表示）。`directorySegments` は `NoteDetail.tsx` が既に取得し `NoteBreadcrumb` へ渡しているため、`NoteMetaPanel` にも props で渡せば DTO/loader 拡張不要。ルート直下（segments 空）の表示は `NoteBreadcrumb` の既存方針（「すべてのノート」等）に倣う。breadcrumb（上部・回遊導線）とメタの場所行（下部・プロパティ表示）の併存は廃止済み右メタレールとの二重化ではなく、SSOT が許容する構成（ADR-002 参照）。
  - **`公開状態` 行はメタに追加しない**（index.md §2.1 非列挙 + #459 でトップツールバーに集約済み。メタ追加はトップピルとの二重化になる。ADR-002 参照）。
  - 既存の `元ファイル` / `状態(ゴミ箱)` 行は実装固有の必要情報として維持。
- **理由:** メタとバックリンクの提示順をモックに合わせ、SSOT（index.md §2.1 + モック）が要求する `場所` 行の追従漏れを解消しつつ、`公開状態` の二重化（#459 集約）は避ける。

#### C-2. バックリンクカードのメタ行追従（任意）

- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`
- **モック差分:** モックの `.backlink-card` は `backlink-title` + `backlink-meta`（uppercase のディレクトリパス）+ `backlink-snippet` の 3 段。実装は title + snippet の 2 段（meta 行なし）。
- **変更内容:** バックリンク DTO（`BacklinkDTO`）がディレクトリパス情報を保持しているか確認し、保持していれば `backlink-meta` 相当（`text-[11px] uppercase tracking-[0.06em] text-ink-tertiary`）を追加。DTO に無ければ本ステップは見送り、ADR に「DTO 拡張は別 Issue」と記録（loader/DTO 拡張はバックエンド変更でスコープ肥大のため）。
- **理由:** モック追従。ただし DTO 非保持なら別 Issue。

#### C-3. ノート本文の内部リンク（wikilink）/ hashtag スタイル — 条件付き（設計判断参照）

- **対象ファイル:** `app/styles/index.css`（`.note-detail-content` 配下）/ レンダリングパイプライン（`app/core/domain/note/service.ts` 等）
- **モック差分:** index.md §6 と P11 モックは `[[wikilink]]` を「surface ピル + 先頭にアクセント色ドット」、`#hashtag` を「accent 素テキスト」で表示。実装は `[[wikilink]]` / `#hashtag` を **本文 HTML 内のプレーンテキストのまま保持**しており（`NoteService.extractMetadataFromHtml` は抽出のみ、レンダリング時に `<a class="wikilink">` / `<span class="hashtag">` へ変換していない）、ピル/hashtag スタイルが適用される要素が存在しない。
- **変更内容:** 「設計判断 D-2」で本 Issue スコープと判断した場合のみ、本文レンダリング時に内部リンク/hashtag をマークアップ化し（要 domain/adapter 変更）、`.note-detail-content` に `.wikilink` / `.hashtag` ルールを追加する。スコープ外と判断した場合は CSS のみ先行追加せず（適用先が無いため死にコードになる）、別 Issue 化する。
- **理由:** モック追従だが、適用にはレンダリングパイプライン（ドメイン）変更が必要で #287/#77-80 と隣接する。線引きを設計判断で確定する。

### D. P12 エディタ（スコープ線引きは設計判断 D-1）

#### D-1. document スタイルのタイトル入力

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`、必要なら `app/components/note/editor/styles.ts`（新規 or 既存）
- **モック差分:** モックは大型の borderless `.title-input`（`text-3xl` / `font-regular` / `tracking-tightest` / 透明背景 / ラベルなし / placeholder「無題のノート」）。実装はラベル付き `fieldControl`（標準フォーム入力 `h-10`）。
- **変更内容:** 設計判断 D-1 で「タイトルを document スタイルにする」を採用する場合、タイトル入力を borderless 大型入力に置換（`w-full bg-transparent border-0 outline-none text-3xl font-regular tracking-tightest text-ink placeholder:text-ink-tertiary` 相当を定数化）。ラベルは a11y のため `sr-only` で維持。フォーカス可視化は #522 スコープなので outline 既定（`:focus-visible` のグローバル `--shadow-focus`）に委ね、本 Issue では枠線・余白の作り込みをしない。
- **理由:** モックのエディタ体験の中核。#522（フォーカス枠線・余白）と切り分けつつタイトル組版を追従。

#### D-2. モードタブ・autosave・エディタアクションの topbar 配置

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`、`app/components/note/editor/EditorModeSwitch.tsx`
- **モック差分:** モックは `.editor-topbar`（モードタブ pill 群 + `save-status`（saved-dot + テキスト）+ `editor-actions`（`margin-left:auto`））を 1 行にまとめる。実装は header に h1 + AutosaveIndicator、別の場所に EditorModeSwitch、最下部に保存/キャンセル、と分散。
- **変更内容:** 設計判断 D-1 の採用範囲に応じて、モードタブ + autosave 表示 + 主アクション（保存/キャンセル）を 1 つの topbar 行（`flex items-center gap-3 flex-wrap`、autosave/actions は `ml-auto`）に再配置する。EditorModeSwitch は既に pill 群（mock の `.mode-tab` と一致）なので形態変更は不要。
- **理由:** モックのエディタ chrome 追従。

#### D-3. タグ chip 表示 — 設計判断 D-1 で要否確定

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`、`editorState.ts`
- **モック差分:** モックはタグを `.tag-chip`（× 付き chip）で表示。実装はカンマ区切りの単一テキスト入力（`state.tagInput`）。
- **変更内容:** chip UI 化は `editorState` のタグモデル（`tagInput` 文字列 → chip 配列 + 追加入力）変更を伴い影響が大きい。設計判断 D-1 で「本 Issue では chip 化しない（カンマ入力維持）」を推奨。採用時のみ最小の見た目調整に留める。
- **理由:** chip 化は状態モデル変更で肥大化しやすい。エディタ体験追従の優先度内で線引きする。

### E. P20 保存ビュー

#### E-1. ビューカードの絞り込み条件 chip 列挙

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`、`app/components/view/SavedViewsList/styles.ts`
- **モック差分:** モックの `.view-chips` は表示モード chip に加え、`公開状態: 非公開` / `更新: 過去 30 日` / `ソート: 更新降順` / `#research` / `ディレクトリ: …` 等、**ビューの絞り込み条件を chip 列挙**する。期間 chip はモックでは「過去 30 日」「今年」「1年以上前」等の**プリセット名**で表示される。実装は表示モード chip + broken chip のみ。
- **変更内容:** `SavedViewDTO.query`（`directoryId` / `tagIds` / `dateRange` / `visibilityFilter` / `keyword` / `referencingNoteId`）と `SavedViewDTO.sort`（`{by, direction}`）から各条件のラベル chip を生成して列挙する。
  - **タグ**: `tagNameById` で `#name` 化。
  - **公開状態**: `visibilityLabel`（出典は **`app/components/note/list/styles.ts`**。`listSelectors` ではない）。複数選択時の表記は実データに合わせる。
  - **期間**: `dateRange` は ISO datetime 文字列（`ViewQueryDTO.dateRange.{from,to}`）。`listSelectors` の `matchDateRangePreset` でプリセット一致を試み、一致すれば `dateRangePresetLabels` のラベル（「過去 30 日」等）を、一致しなければ `formatDateRangeChipLabel`（`M/D–M/D` 形式、ISO→`YYYY-MM-DD` への date-only 変換が必要）にフォールバック。
  - **ソート**: 既存のラベルヘルパが**存在しない**ため、`{by, direction}` → 日本語ラベルの小さな対応表を新設（例: `by`={updatedAt:"更新", createdAt:"作成"} × `direction`={desc:"降順", asc:"昇順"}）。配置先は `SavedViewsList/styles.ts` 等の局所ヘルパ。
  - chip は既存 `chip`（`common/styles`）を使い新規 px トークンを作らない。
- **本ステップは無条件のコア要件**（E-2/E-3 のような設計判断による条件付けはしない。データは `SavedViewDTO` に全て揃っており実装可能）。
- **理由:** モック追従。ビューの内容を一覧で把握できる中核情報。

#### E-2. 行アクションの整理（適用 + その他メニュー化）— 設計判断 D-3

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`、`styles.ts`
- **モック差分:** モックの `.row-actions` は `適用`（主ボタン）+ `⋯` overflow メニュー（編集/名前変更/複製/既定にする・解除/削除）。実装は 6 個のテキストアクションをフラットに横並べ。
- **変更内容:** 設計判断 D-3 で「`common/Menu` primitive を使った overflow メニュー化」を採用する場合、適用ボタン + `MENU_BTN`（⋯）+ `<Menu>` 項目群に再構成。採用しない場合は現状維持（機能等価・乖離は意図的として ADR 記録）。
- **理由:** モック追従だが、フラット配置でも機能等価で a11y も担保済み。コスト対効果で線引き。

#### E-3. broken バナーの `.alert` 案D 追従 — 設計判断 D-4

- **対象ファイル:** `app/components/view/SavedViewsList/styles.ts`（`brokenBanner` 系）
- **モック差分:** モックの broken バナーは案D `.alert.alert-warning`（白地 + セマンティックヘアライン枠 + `--shadow-xs` + アイコン/見出し warning 着色 + 本文 ink-secondary）。実装は filled warning surface バナー（`bg-warning-surface`）。
- **変更内容:** index.md §9 は P20 を `.alert` 採用ページに列挙しつつ「`.alert` 基盤刷新の追従は別 Issue」とも記す。設計判断 D-4 で「本 Issue で案D 化」or「別 Issue（基盤刷新）に委ねる」を確定。本 Issue で行う場合は `brokenBanner` 系を案D の配色（白地 + `border` セマンティック枠 + `shadow-xs`）に書き換える。
- **理由:** モック追従だが `.alert` 統一は横断テーマ。重複作業を避けるため線引き。

### F. P10 ダイアログ群（確認のみ、乖離時のみ微修正）

- **対象ファイル:** `app/components/note/list/{MoveNoteDialog,BulkExportDialog,BulkVisibilityDialog,NotePickerDialog,SaveViewDialog}.tsx`、`app/components/directory/{CreateDirectoryDialog,RenameDirectoryDialog,MoveDirectoryDialog}.tsx`、`app/components/view/ViewFormDialog.tsx`
- **モック差分:** P10-* / P20-view-form-dialog ダイアログモックに対応するコンポーネントは既存。`common/Dialog` primitive 準拠（index.md §9）。
- **変更内容:** 各ダイアログをモックと突き合わせ、寸法・文言・チップ・ボタン形態の明確な乖離があれば最小修正。新規実装・大規模改修はしない。
- **理由:** 既存実装が概ね追従済み。スコープ肥大を避け差分のみ是正。

## 設計判断

詳細は `.issue/540/adr.md` を参照。要点:

- **ADR-001:** 「最近更新」「お気に入り」サイドバー項目はバックエンド非対応の新機能のため本 Issue スコープ外（モック追従の対象から除外）。
- **ADR-002（改訂）:** P11 メタの `場所` 行は index.md §2.1 + モック双方が要求するため**追加する**（`directorySegments` 流用）。`公開状態` 行は index.md §2.1 非列挙 + #459 でトップ集約済みのため**追加しない**（二重化回避）。順序は プロパティ → バックリンク にモック準拠。
- **ADR-003:** P12 エディタ追従の線引き — タイトル document 化（D-1）と topbar 配置（D-2）は本 Issue で実施、タグ chip 化（D-3）と #522/#287/#157/#77-80 領域は対象外。
- **ADR-004:** 内部リンク/hashtag ピル（C-3）・P20 行アクションメニュー化（E-2）・broken バナー `.alert` 化（E-3）は、ドメイン変更/横断テーマ性を踏まえ本 Issue では「見た目の追従に閉じる範囲」のみ実施し、パイプライン/基盤変更は別 Issue に切り出す。
- **ADR-005:** SHELL サイドバー「管理」セクションの `アップロード` / `エクスポートジョブ` 導線はモック簡略表記に合わせて削らず現状維持（意図的差分）。

## リスクと注意点

- **モックと index.md の矛盾**: P11 メタの 場所/公開状態 行（モック）vs 二重化禁止（index.md §2.1 / #356）。index.md が上位 SSOT として優先。実装前にレビューで合意を取る。
- **サイドバーのデータ取得増**: A-1/A-2 でサイドバー loader に件数・保存ビュー取得を足すと、全アプリ画面（P10/P11/P12/設定）の SHELL に I/O が増える。既存 `loadDirectoryTree`（`layout/action.ts`）と `Promise.all` で束ね、N+1 や重複 fetch を避ける（`cache()` dedup を尊重）。
- **新機能の混入回避**: 「最近更新/お気に入り」を安易に追加しない（ADR-001）。モックにあっても backend 非対応なら作らない。
- **リテラル px 持ち込み禁止**: 件数バッジ・chip・タイトル入力は既存トークン/ユーティリティ（`text-xs`, `rounded-pill`, `text-3xl`, `tracking-tightest` 等）で構成し、任意値 px を新規追加しない（index.md #461）。
- **死にコード回避**: C-3 で CSS だけ追加してもマークアップ側が wikilink 要素を生成しなければ無効。パイプライン変更とセットでなければ追加しない。
- **既存テストへの影響**: `app/components/note/list/__tests__`、`layout/__tests__`、`view/SavedViewsList/__tests__`、`note/detail/__tests__` のスナップショット/構造アサーションが SHELL・メタ順・FilterBar 変更で壊れる可能性。変更に合わせて更新する。
- **エディタ状態モデル**: D-1/D-2 は `NoteEditor` の JSX 再配置に留め、`editorReducer` のロジック（autosave/lock/mode 切替の dirty 判定）には手を入れない。手を入れると #233/#286/#157 の不変条件を壊すリスク。

## テスト方針

`.issue/540/testing.md` を参照。要点: ローカル開発サーバを起動し、(1) サイドバーの件数バッジ・保存ビュー列挙、(2) P10 FilterBar の境界・チップ、(3) P11 メタ順序・バックリンク、(4) P12 タイトル/topbar、(5) P20 条件 chip 列挙 をモックと並べて目視比較。`pnpm typecheck && pnpm lint:fix && pnpm format` と関連ユニットテストを通す。

## レビュー履歴

### 1周目（プランナー自己レビュー: 要件カバレッジ / アーキ・リスク）
**確認・反映した点**:
- 要件カバレッジ: Issue 本文の追従ポイント（一覧の検索/フィルタ/表示モード/保存ビュー列挙・件数バッジ、詳細のメタ/バックリンク/内部リンク、エディタ P12、SHELL サイドバー精緻化）を A〜F のステップに割り当て済みであることを確認。スコープ外 Issue（#499/#474/#522/#287/#157/#77-80）を「含まれないもの」で明示。
- 実現可能性: `loadOwnedNotes`（`count` 返却）/ `loadSavedViewsByKind` が `cache()` 済みで存在することを確認。
- 初版では P11 メタの 場所/公開状態 を「モック vs index.md 矛盾」として両方とも追加見送りと裁定（後に 2 周目で訂正）。

### 2周目（2視点並列レビュー: 要件カバレッジ / アーキ・リスク）
**修正した点（要修正 P-001 — 両視点が一致して指摘）**:
- **P11「場所」メタ行の追従漏れを修正（C-1 / ADR-002 改訂）**: 初版 ADR-002 は「index.md §2.1 が場所のメタ二重化を禁止」と読んでいたが、実際の index.md §2.1 は本文下メタ項目を「作成日 / 更新日 / **場所** / タグ」と明示列挙しており、P11 モックも `場所` 行を持つ（#356 で廃止されたのは右メタレールであって本文下メタの場所行ではない）。SSOT 読み直しにより「場所行は本 Issue で追加（`directorySegments` 流用、DTO 拡張不要）」へ訂正。`公開状態` は §2.1 非列挙 + #459 のトップ集約を根拠にメタ非追加を維持（場所と公開状態を分離して判断）。testing.md 確認項目 3 も訂正。
- **E-1 の chip ラベル生成を具体化（要修正 P-002）**: 期間 chip はモックがプリセット名（「過去 30 日」等）で表示するため `formatDateRangeChipLabel`（`M/D–M/D` 形式）単独では不足。`matchDateRangePreset` + `dateRangePresetLabels` でプリセット一致を優先しフォールバックする手順、ISO→date-only 変換、ソートラベル対応表の新設、`visibilityLabel` の正しい出典（`note/list/styles.ts`）を明記。E-1 を無条件コア要件と明示。

**取り込んだ改善提案**:
- A-3 のサイドバー管理セクション意図的差分を **ADR-005** として正式化（S-001/S-003）。
- A-1 件数取得のコスト（`loadOwnedNotes` は notes 配列も引く重い loader）への注意をリスク欄の既存記述で担保。count-only 経路があれば優先する旨を実装時の留意点として残す。

**見送った提案とその理由**:
- 「最近更新 / お気に入り」サイドバー追加 — backend 非対応の新機能のためスコープ外（ADR-001）。
- broken バナーの `.alert` 案D 化・行アクション overflow メニュー化 — 横断テーマ/コスト過大の可能性があり、条件付き（ADR-004）に留めた。

### 3周目
2 周目で要修正 P-001/P-002 を反映し、両視点の指摘は解消。残る指摘は軽微な改善提案（取り込み済み）のみで新規ブロッカーなしと判断し、レビューループを終了。

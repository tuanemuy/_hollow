# P10-home 突き合わせ
対応: route=`app/routes/_app/index.tsx`, components=[`note/list/NoteList`,`FilterBar`,`NoteListToolbar`,`DisplayModeSwitch`,`ListView`,`BulkActionBar`,`NoteCheckbox`], styles=[`note/list/styles.ts`,`layout/styles.ts`,`common/styles.ts`]

共通シェルは `SHELL.md` の A 判定を反映済み（ヘッダーのアップロード→pill化 / 「新規」→「新規作成」 / 検索 placeholder「ノートを検索」）。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー右「アップロード」icon-btn → pill-btn（アイコン+ラベル） / 観点:component / 旧:円形 icon-btn → 実装:UploadButton(pill) / 修正:pill-btn 化（SHELL.md）。
- [x] ヘッダー「新規」→「新規作成」 / 観点:component。
- [x] 検索 placeholder「ノート、タグ、本文を検索」→「ノートを検索」 / 観点:component。
- [x] 先頭パンくず（ホーム > すべてのノート）削除 / 観点:layout / 旧:breadcrumb 有 → 実装(NoteList):パンくず無し、h1+件数サブタイトルのみ / 修正:breadcrumb ブロック削除。
- [x] サブタイトル「127 件 · 最終更新 たった今」→「127 件のノート」 / 観点:component / 実装:`{count} 件のノート`。
- [x] 表示モードのセグメントコントロール（`.segmented` pill 内白タブ）→ pill-btn タブ群（`DisplayModeSwitch`：`pillBtn`+`data-primary` でアクティブ=accent/white） / 観点:component / 修正:`.segmented`→`.display-tabs`/`.display-tab`（アクティブ accent 背景）。アイコンは付かない（テキストのみ。#292 ADR-002 選択UIは別カテゴリ）。
- [x] 「更新順」ソートボタン（`.sort-btn`）削除 / 観点:component / 実装:NoteListToolbar にソートボタン無し / 修正:削除。
- [x] ツールバー右に 選択 / ビューとして保存 / 新規作成 / アップロード CTA を追加（NoteListToolbar） / 観点:component / 旧:無 → 実装:あり / 修正:`.toolbar-group` 右側に pill 群追加。新規・アップロードはアイコンのみ（ツールバー内は密度優先）。
- [x] 保存ビュー `<select>`（`.view-select`）をツールバー左に追加（savedViews>0 時） / 観点:component。
- [x] フィルタ行（`.filter-row`：すべて/公開済み/タグ×/フィルター追加 + 右に save-view-pill）を FilterBar(#497) に置換 / 観点:component / 実装:枠線付き 1 行帯、タグチップ（件数バッジ）+ 期間/公開状態/内部リンク参照ゴーストチップ + すべてクリア(右寄せ pill) / 修正:`.filter-bar`/`.filter-chip`(h-7)/`.filter-chip-ghost`(破線)/`.filter-clear`。「すべて」「公開済み」固定チップ・「ビューとして保存」のフィルタ行内 pill・「フィルター追加」チップは廃止。
- [x] タグチップの件数バッジ追加（filterChip 内 `.chip-count`、active 時 white/85） / 観点:component。
- [x] フィルタチップ高さ 30px → 28px（`h-7`、#461 チップ正規化） / 観点:token。
- [x] ノート行 meta の公開状態を「pub-dot + 公開中/非公開/限定公開」→ 可視チップ（`vis-chip` = visibilityChipClass：public=success-surface/unlisted=warning-surface/private=surface）+ ラベル「公開/限定公開/非公開」 / 観点:component+variant / 修正:`.pub-dot` 廃止、`.vis-chip` 化。
- [x] ノート行 meta からディレクトリパス（Research / 論文メモ 等）削除 / 観点:component / 実装(ListView):meta は タグ + `·` + vis-chip のみ。
- [x] 一括操作バーの「削除」→「ゴミ箱へ」 / 観点:component / 実装(BulkActionBar):confirmLabel/ラベル「ゴミ箱へ」。
- [x] bulk-action 高さ 32px→28px（`h-7`）、font 13px→`--text-sm` / 観点:token。
- [x] px 直値 font-size の fluid トークン化（#461 ADR-001）: 検索input/pill-btn/nav-item/display-tab/view-select/filter-clear/note-snippet/note-meta/note-tags/note-date/bulk-count の `14px|13px`→`--text-sm`、note-title `16px`→`--text-base`、page-subtitle `15px`→`--text-md` / 観点:token。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- サイドバー（ライブラリの「最近更新/お気に入り」、件数バッジ、保存ビューの個別列挙）はモックを正に残す。詳細は `SHELL.md` B 節。別Issue化候補:Yes。
- タイル / カレンダー表示のモック描画は無し（リストのみ）。TileView/CalendarView は実装にあるがモックは1状態のみで未描画。別Issue化候補:No（モックは代表状態の描画方針）。

## C. 要判断（曖昧）
- ノート行の選択インジケータ（`.note-check` 円形）はモックでは row に常時描画。実装は選択モード時のみ表示（`mode` true 時に `auto` 列追加）。モックは選択状態の見本として常時描画を残しているが、実装の「選択モード時のみ」を厳密に反映すると通常時はチェック列が消える。論点:見本として selected 行を残すか、通常表示（チェック無し）に寄せるか。→ 見本性を優先し現状の selected 行表示を残置（要判断）。
- サイドバーの directory tree インライン操作メニュー open 表現（SHELL.md C 節参照）。

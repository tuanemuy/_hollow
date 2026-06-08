# 実装計画 — Issue #588: モバイルモック(#536)の実装追従 ② 画面別レイアウト

**Issue:** #588
**作成日:** 2026-06-08
**複雑度:** 中〜大規模

---

## 目的

#536 / PR #584 のモバイルモック（実体は `spec/design/pages/mobile/{name}.html`、390px基準・320〜430px overflow=0）を実装(`app/`)に追従させるシリーズの **②画面別レイアウト追従**。①共通基盤(#587/PR #596、main済)が提供した `BottomActionBar`/`popoverSheetPanel`/Dialog ボトムシート/タッチ床44px/drawer 精緻化を**各画面が消費・継承**し、画面固有のモバイル導線（下部固定CTAバー化、FilterBar/BulkBar のシート化・固定化、メタ/アクションの縦積み・横スクロール、1カラム化）だけを差分実装する。admin(P40-P47=#589)は対象外。

## スコープ

### 含まれるもの（admin 除く全画面のモバイルレイアウト追従）

- **入口・認証・例外**: P01-signup / P01b-admin-setup / P02-email-verify / P03-login / P04-password-reset-request / P05-password-reset / P06-email-change-confirm / P07-landing / P34-error
- **ノート中核**: P10-home / P11-note-detail / P12-editor + ダイアログ群（P10-bulk-export / bulk-visibility / directory-create / directory-move / directory-rename / filterbar-popovers / move-note / note-picker / save-view-dialog, common-confirm-dialog）
- **取込・書出**: P13-upload / P13-upload-modal / P13a-upload-modal / P15-export / P16-export-jobs
- **整理・公開**: P14-publish-settings / P17-trash / P18-tags / P18-merge-tag-dialog / P20-views / P20-view-form-dialog
- **公開・共有**: P30-user-public-top / P31-public-note / P32-public-search / P33-share-link

### 含まれないもの

- admin テーブルのカード化（→ #589）
- 設定 P21-P24（#543 で別途追従、本 Issue の列挙外）
- **#563/#568 の backend 依存機能**（公開バックリンク・関連ノート・検索ファセット・QRコード・未保存警告・タグ検索など）。本 Issue は **見た目のレイアウト追従（縦積み・シート化・横スクロール）のみ**を扱い、機能追加には手を出さない
- Popover の role/focus 改善（#506）、scroll cue（#272）など #587 が据え置いた横断改善

## dedup 調査結果（着手前確認）

コミット時系列で確定:

| Issue | 状態 | 対象 | mobile対応状況 |
|---|---|---|---|
| #514 | OPEN(親) | 全領域 | — |
| #540 | merged(mobile前) | P10/P11/P12/P20 | デスクトップ追従のみ。**mobile未対応** |
| #542 | merged(mobile前) | P17/P18/P14 | デスクトップ追従のみ。**mobile未対応** |
| #543 | merged(mobile前) | P21-P24(設定) | **#588スコープ外** |
| #544 | merged(mobile前) | P30-P33 | デスクトップ追従のみ。一部 `max-sm:` あり |
| #545 | CLOSED | P40-P47(admin) | **#588スコープ外**(=#589) |
| #546 | CLOSED(mobile後) | P01-P07/P34 | form-error案D化+P34ナビ補助のみ。**mobileレイアウト未対応** |
| #563 | OPEN(トラッカー) | P14/P18の機能追加 | backend依存。レイアウトと無関係 |
| #568 | OPEN(トラッカー) | P30-P33のbackend機能 | usecase新設前提。レイアウトと無関係 |

**結論**: モバイルモック作成より前に領域別追従が land したため、#588 列挙の全画面で**モバイルレイアウトは未着手**。ただし実作業量は app-shell 系（Step1-6）に集中し、認証・公開（Step7-8）は土台があり軽微。

## ①共通基盤(#587)の提供物と継承方法

1. **Dialog ボトムシート**: `dialogBackdrop`/`dialog`/`dialogGrabber` が狭幅で下端吸着シート化。**全ダイアログは Dialog primitive 経由で自動継承済**。#588 は狭幅目視と内部スクロール確認のみ。
2. **`popoverSheetPanel`**: 狭幅フルワイドシート用 panel 定数（現状 dead constant）。FilterBar の `FILTER_POPOVER_PANEL`（`w-[280px]` 固定）をこの定数ベースへ寄せる。
3. **`BottomActionBar`/`BOTTOM_ACTION_BAR`**: 下部固定CTAバー frame（fixed/safe-area/blur/`lg:hidden`/z-40）。Header の CTA をモバイルでこの frame へ退避。
4. **BulkActionBar z=45 固定化**: 現状 `sticky bottom-4` 中央ピル → `max-sm:fixed inset-x-0 bottom-0 z-45` フルワイドへ（cta-bar 40 と排他）。
5. **タッチ床44px**: `fieldControl`/`pillBtn` に適用済（全フォーム継承）。

## 実装ステップ

### Step 1: P10系 共通基盤の消費（最重要・他グループの土台）

- **対象:** `layout/Header.tsx`・`layout/BottomActionBar.tsx`(消費)・`note/list/FilterBar.tsx`・`note/list/BulkActionBar.tsx`・`note/list/NoteList.tsx`・`note/HomePage.tsx`
- **変更:**
  1. 下部固定CTAバー: P10 で `BottomActionBar` を配置し新規作成+アップロードCTA差し込み（モック `.cta-bar`: primary `flex:1`、upload icon-only）。Header の同CTA を `max-lg:hidden`／`lg:` 表示。
  2. FilterBar シート化: `FILTER_POPOVER_PANEL` を `popoverSheetPanel` 継承へ寄せ、狭幅でフルワイドシート化＋ `clampToViewport` shiftX を狭幅無効化。filter-bar 自体は横スクロール許可。
  3. BulkActionBar 固定化: `BULK_BAR` を `max-sm:fixed inset-x-0 bottom-0 z-45` フルワイドへ。cta-bar と排他（選択0件時のみ cta-bar）。
- **参照モック:** `mobile/P10-home.html`・`mobile/P10-filterbar-popovers.html`

### Step 2: P10 ダイアログ群（継承確認 + 差分）

- **対象:** `note/list/{MoveNoteDialog,NotePickerDialog,SaveViewDialog,BulkExportDialog,BulkVisibilityDialog}.tsx`、`directory/*Dialog.tsx`、`common/ConfirmDialog.tsx`
- **変更:** ボトムシートは自動継承済。狭幅で①長いリスト(note-picker/move-note)の内部スクロール、②フォーム1カラム、③ボタン縦並びが要るものだけ調整。多くは無変更で目視PASS見込み。
- **参照モック:** `mobile/P10-*-dialog.html`・`mobile/common-confirm-dialog.html`

### Step 3: P11 ノート詳細（ギャップ大）

- **対象:** `note/detail/{NoteDetail,NoteActions,NoteMetaPanel,NoteBreadcrumb,NoteActionsMenu}.tsx`
- **変更:** アクションツールバーを狭幅 `overflow-x-auto` 横スクロール、メタ・バックリンクの縦積み確認、余白/タッチ床調整。
- **参照モック:** `mobile/P11-note-detail.html`

### Step 4: P12 エディタ（ギャップ中）

- **対象:** `note/editor/{NoteEditor,FrontMatterEditor,EditorModeSwitch,MediaUploader,styles.ts}`
- **変更:** ツールバー横スクロール、FrontMatter 1カラム、エディタ高さ safe-area 考慮、EditLockBanner 縦積み。
- **参照モック:** `mobile/P12-editor.html`

### Step 5: 取込・書出 P13/P15/P16（ギャップ大）

- **対象:** `ingestion/{UploadPage,UploadForm,IngestionQueue,IngestionJobRow}.tsx`、`export/{ExportForm,ExportJobsList,ExportJobDetail}/`
- **変更:** アップロードフォーム/キューカード1カラム化、ジョブ行縦積み、ExportForm 1カラム化、ジョブリストのカード/縦積み。UploadDialog は Dialog 継承済。
- **参照モック:** `mobile/{P13-upload,P13-upload-modal,P13a-upload-modal,P15-export,P16-export-jobs}.html`

### Step 6: 整理・公開 P14/P17/P18/P20

- **対象:** `publication/PublishSettings.tsx`、`trash/TrashList.tsx`、`tag/*`、`view/*`
- **変更:** P14 公開設定1カラム化・メタ縦積み（QRは#563スコープ外）。P17 ゴミ箱行縦積み。P18/P20 は概ね対応済→目視と細部調整。
- **参照モック:** `mobile/{P14-publish-settings,P17-trash,P18-tags,P18-merge-tag-dialog,P20-views,P20-view-form-dialog}.html`

### Step 7: 入口・認証・例外 P01-P07/P34（軽微）

- **対象:** `auth/*`、`landing/*`、`public/ErrorPage.tsx`
- **変更:** フォームは1カラム+タッチ床継承済。`alert-content` 縦積み、ランディング余白、P34アクションボタン縦積み確認。
- **参照モック:** `mobile/{P01-signup,P01b-admin-setup,P02-email-verify,P03-login,P04,P05,P06,P07-landing,P34-error}.html`

### Step 8: 公開・共有 P30-P33（軽微〜中）

- **対象:** `public/{UserPublicTop,PublicNoteDetail,PublicSearch,ShareLinkGate,PublicHeader,PublicFooter}.tsx`
- **変更:** トップバー/著者ミニ縦積み、フィルタツールバー縦積み、フッター縦積み、メタ inline 化。**公開バックリンク/関連ノート/検索ファセットは #568 スコープ外**。
- **参照モック:** `mobile/{P30-user-public-top,P31-public-note,P32-public-search,P33-share-link}.html`

## 設計判断

詳細は `adr.md` 参照。要点:

- **ADR-001**: 下部固定CTAバーの配置レイヤー（P10 限定で配置、frame/content 分離継承）
- **ADR-002**: BulkActionBar の `max-sm:fixed` 切替（`sm:` 以上は現状維持、ランタイム分岐なし）
- **ADR-003**: FilterBar の `clampToViewport` 狭幅無効化（Popover primitive 変更最小）

## リスクと注意点

- **z-index 積層整合**: cta-bar(40)/bulk-bar(45)/sidebar(100)/backdrop(90)/dialog(100)。bulk-bar fixed 化時に cta-bar との排他表示を SelectionContext で正しく出し分け。
- **CTA二重表示**: Header CTA 退避時、NoteListToolbar の選択/保存CTA と cta-bar が視覚競合しないよう配置分離。
- **Dialog 全波及の副作用**: note-picker/move-note の狭幅内部スクロールを個別目視。
- **既存 desktop 非回帰**: 全変更を `max-sm:`/`max-lg:` で囲い `sm:`/`lg:` 以上は現状維持。
- **トークン逸脱回避**: リテラル px を新規持ち込まない。既存スケール/トークンへ写す。
- **#563/#568 越境禁止**: 機能追加には手を出さず、レイアウトのみ。

## PR分割の方針

**決定（2026-06-08、ユーザー確認）: 全画面（Step1-8）を1本の PR で実装する。**

Issue 本文は「まとまった単位で PR を分けてよい」とするが分割は任意。今回は Issue を一気通貫で閉じるため1本にまとめる。実装は画面グループ単位でサブエージェントへ並列委譲し、Step1（基盤消費）を先行させてパターンを確立してから残グループを並列展開する。レビュー負荷は pr-review のラウンドで吸収する。

## テスト方針

- 静的ゲート: `pnpm typecheck && pnpm lint:fix && pnpm format`
- ブラウザ目視: agent-browser で主要画面(P10/P11/P12/P14/P30-P33)を 390px 表示し `scrollWidth <= clientWidth`（overflow=0）確認。320px と 430px 両端でも横スクロール非発生を確認
- non-regression: desktop(lg以上)で既存挙動が変わらないこと

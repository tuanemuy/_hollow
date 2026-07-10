# 実装計画 — Issue #825: feat(note): P12 モバイルエディタの残 UX 改善（ツールバー圧縮・ネイティブダイアログのカスタム UI 化）

**Issue:** #825
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

P12 ノートエディタのモバイル UX を仕上げる。WYSIWYG ツールバーを圧縮（低頻度書式をオーバーフローメニュー化）し、ネイティブダイアログ（未保存確認 `window.confirm` / リンク URL 入力 `window.prompt` / スキーム警告 `window.alert`）を既存のダイアログ/メニュープリミティブによるカスタム UI に置き換えて、UI 一貫性と a11y を改善する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 実機 390px 幅で WYSIWYG ツールバーの主要書式ボタン群（Bold/Italic/UL/OL/Link/Image + `⋯`）が横スクロールなしに収まって一目で見え、低頻度書式は「その他」オーバーフローメニュー（`⋯`）から到達できる。**収束条件:** 主要 7 枠が 390px に収まらない場合は主要ボタンをさらにオーバーフロー送りにして収める（横スクロールを残さない） | Issue 対象1 | 2, 3, 4 |
| AC-2 | デスクトップ（`sm` 以上）のツールバー表示・操作は現状と同一 — **全ボタンが現状の DOM 並び順（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code/Link/Image）のままインライン表示**され、オーバーフロー機構（トリガー・Menu ラッパー）は一切描画されない（`sm:hidden` で DOM から消え、空ラッパーによる余白増もない）。**外側ラッパー・レールはデスクトップで grow しない**（レール幅の置換 `flex-1` はモバイル限定＝`max-sm:` 修飾。デスクトップは現状どおり shrink-to-fit・左寄せ pill で 1px 不変） | Issue スコープ外「デスクトップレイアウトの変更」 | 1, 2, 3, 4 |
| AC-3 | オーバーフローメニューは WAI-ARIA Menu 準拠（roving tabindex・Esc/外側クリックで閉じる・トリガーへフォーカス復帰）で、各項目からトグル書式を適用できる。**適用中の状態は「メニューを開いた時点で」各項目に視覚表示（チェック等）で判別できる**（`MenuItem` は `aria-pressed` 非対応のため、適用直後はメニューが閉じ再オープン時に反映される — ADR-001 参照） | Issue 対象1 / spec §7.1 a11y | 2, 3, 4 |
| AC-4 | モード切替時の未保存確認が `window.confirm` ではなくアプリ内ダイアログ（`ConfirmDialog`、モバイルはボトムシート）で表示され、確認するとモード切替が進み、キャンセルすると現在のモード・内容が保持される | Issue 対象2 | 5, 6 |
| AC-5 | 未保存確認ダイアログで「切り替える」を選んだ後、装飾ロス（WYSIWYG 非対応タグ）がある場合は従来どおり装飾ロス確認ダイアログが続けて 1 回だけ表示される（二重プロンプトなし） | 既存 #696 挙動の維持 | 5, 6 |
| AC-6 | リンク挿入/更新が `window.prompt` ではなくアプリ内ダイアログ（`Dialog`、モバイルはボトムシート）で行え、URL テキスト入力・挿入・解除ができる | Issue 対象2 | 7, 8 |
| AC-7 | 非対応 URL スキーム入力時のエラーが `window.alert` ではなくリンクダイアログ内のインラインメッセージ（`role="alert"`）で表示され、ダイアログは開いたまま再入力できる | Issue 対象2 / a11y | 7, 8 |
| AC-8 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通り、既存の editor 系ユニットテストが新 UI に合わせて更新され緑になる | CLAUDE.md 開発フロー | 9 |
| AC-9 | 設計 SSOT モック `spec/design/pages/mobile/P12-editor.html` のモバイルツールバー節が本計画の overflow-menu 方式（主要ボタン + `⋯` オーバーフローメニュー）へ**更新**されている（`.tb-heading` 見出しドロップダウン + `overflow-x: auto` 前提を置き換える）。**完了条件は「更新」**とし、注記のみでの清算は採らない（coverage S-002） | arch-risk P-002 / 設計 SSOT 整合 | 10 |

## スコープ

### 含まれないもの

- 保存ロジック・自動保存（`useAutosave`）・編集ロック（`useEditLock`）の挙動変更 — 本 Issue はモード切替時の**確認 UI の見た目/実装**のみを差し替え、確認の分岐条件（`isDirty` 判定・`abortInFlight` の呼び出し順）は現状の意味論を保つ。
- デスクトップの**レイアウト**変更 — ツールバーのボタン配置はデスクトップで現状維持（AC-2）。ネイティブダイアログのカスタム化はデスクトップにも及ぶが、これは「レイアウト」ではなくダイアログの実装差し替えであり、既存の `dialog` スタイルがデスクトップでは中央モーダルとして描画されるため見た目の一貫性はむしろ向上する（下記「調査結果 > 依存関係」参照）。
- ツールバーの見出し（H2/H3）を単一ドロップダウンに統合する案（モックの `.tb-heading`）— 圧縮効果が薄くデスクトップにも波及するため今回は採らない（ADR-001 参照）。
- 本文 `min-h` のビューポート相対化・`overflow-wrap` 適用・`APP_MAIN` パディング等 — #818 で対応済み（実装確認済み。下記参照）。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/WysiwygEditor.tsx` — ツールバー本体（`buttons` 配列 + Link/Image ボタン、`editorToolbar` を使用）。`onAddLink` が `window.prompt`（L406）+ `window.alert`（L413）を使用。書式ボタンは Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code の 9 個 + Link + Image = 計 11 個。
  - `app/components/note/editor/NoteEditor.tsx` — `onModeChange`（L255-325）内で未保存確認に `window.confirm`（L283）を使用。装飾ロス確認は既に `ConfirmDialog`（L668-689、`pendingWysiwygSwitch` state で遅延）で実装済み。
  - `app/components/note/editor/styles.ts` — `editorToolbar`（L54、モバイルは `overflow-x-auto` の横スクロールレール）等。
  - `app/components/common/styles.ts` — `dialog`/`dialogBackdrop`/`dialogGrabber`/`dialogActions`（ボトムシート化済みモーダル）、`menuPanel`/`menuItem`、`popoverSheetPanel`、`fieldControl`、`formError`、`EDITOR_TOOLBAR_BTN`（WysiwygEditor 内ローカル）。
  - `app/components/common/Dialog.tsx` / `ConfirmDialog.tsx` — フォーカストラップ・Esc・Portal・ボトムシート対応済みのダイアログ基盤。`ConfirmDialog` は「`window.confirm` の置き換え」として設計されている（JSDoc L60）。
  - `app/components/common/Menu.tsx` / `usePopover.ts` — WAI-ARIA Menu プリミティブ（roving tabindex・dismiss・フォーカス復帰）。**パネルは Portal ではなく `<div className="relative">` 内の `absolute` インライン描画**（`Menu.tsx:142-170`、`usePopover.ts` に `createPortal` なし）。→ overflow クリップ制約の根拠（arch-risk P-001）。
  - `app/components/note/detail/NoteActionsMenu.tsx` — **オーバーフローメニューの既存実装パターン**（`⋯` トリガー + `<Menu>`/`<MenuItem>`、`MoreHorizontal` アイコン）。本 Issue のツールバー圧縮はこれを踏襲する。ただし `NoteActionsMenu` の親は overflow コンテナでないため成立している点に注意（本 Issue の `editorToolbar` は `overflow-x-auto` を持つのでレール外配置が必須 — 設計参照）。
  - `app/components/note/editor/styles.ts:54` の `editorToolbar` は `max-sm:overflow-x-auto`（+ `gap-[2px]`）を持つ。CSS 仕様上 `overflow-x: auto` は `overflow-y` の used value も `auto` に昇格させるため、この div は**両軸のクリッピングコンテナ**になる。ここに `<Menu>` を直接子として置くとインライン `absolute` パネルが箱外＝クリップされ、モバイルでメニューが見えない（arch-risk P-001）。→ トリガー + `<Menu>` はレール（overflow コンテナ）の**外側**に配置する。
  - `EDITOR_TOOLBAR_BTN`（`WysiwygEditor.tsx:137`）はモバイルで `TOUCH_TARGET_SQUARE`（`max-sm:min-w-[44px]/min-h-[44px]`）を持ち、実効 44px 角。主要 6 + `⋯` = 7 枠 × 44 ≈ 308px + gap/padding で 390px に**余裕をもって収まる**見込み（arch-risk S-003）。
  - `spec/design/pages/mobile/P12-editor.html` — モバイルモック（設計 SSOT）。現状 `.toolbar` は `overflow-x: auto` を維持しつつ見出しを `.tb-heading` ドロップダウンに集約している（mock L700-715, L1256-1273）。本計画は overflow-menu 方式を採るため**この SSOT モックを overflow-menu 方式へ更新する必要がある**（arch-risk P-002 / step 10 / AC-9。完了条件は「更新」、注記のみは不可）。
  - `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx` — `window.confirm` をモックしてモード切替の分岐を検証。ダイアログ化により**書き換えが必要**。
- あるべきアーキテクチャ（CLAUDE.md / spec/design/index.md より）:
  - フロントエンドは utility-first。共通スタイルは module-scoped 定数を流用（`common/styles.ts`）。新規 CSS / `@apply` は禁止。
  - state style は `data-*` 属性 + `data-[x]:` variant（`data-x={value || undefined}`）で表現。
  - モバイル対応は `max-sm:`/`sm:` の静的 breakpoint variant で行い、実行時 JS breakpoint 判定は避ける（`editorActions` ADR-003「single DOM, no double render」等）。
  - ダイアログはモバイルでボトムシート化（`dialog`/`dialogBackdrop` が `max-sm:` で `items-end` + `rounded-t-lg` + grabber + safe-area を提供）。
  - ネイティブ `confirm/prompt/alert` はアプリ内ダイアログに置換するのが既定方針（`ConfirmDialog` の存在自体がその証左）。
- 既存実装の状態:
  - ツールバー: `editorToolbar` はモバイルで横スクロールレール化済み（overflow=0 は達成）。ただし全ボタンが一目で見えない — 本 Issue の対象。
  - 装飾ロス確認は既にカスタムダイアログ化済み（`ConfirmDialog` + `pendingWysiwygSwitch`）で、未保存確認だけがネイティブ `window.confirm` のまま残っている（乖離）。本 Issue で同じ遅延 state パターンに揃える。
  - #818 のモバイル対応（保存 CTA バー `editorActions`、メタ折りたたみ `metaDisclosure`、`min-h-[52vh]`、`overflow-wrap`、safe-area）は実装済み。本 Issue はその「残 UX」のみを扱う。
- 依存関係:
  - ネイティブダイアログのカスタム化は**モバイル・デスクトップ両方**に作用する（`confirm/prompt/alert` は両環境で使われている）。ただしデスクトップでは `dialog` スタイルが中央モーダルとして描画されるため「レイアウト変更」ではなく実装差し替え。UX 一貫性の観点で望ましく、Issue の狙い（UI 一貫性・a11y）に合致する。
  - ツールバー圧縮はモバイルのみ（`max-sm:`/`sm:` の可視性分岐）で、デスクトップは不変（AC-2）。
  - `noteEditorModeChange.test.tsx`・（存在すれば）link/prompt 関連テストの更新が必須。

## 設計

内側レイヤー（ドメイン/ユースケース/アダプター）への影響は無い。純粋にプレゼンテーション層（クライアントコンポーネント）の UI 変更。

### ドメインモデルへの影響
なし。書式適用・リンク挿入・モード切替はいずれも TipTap/クライアント状態の操作で、ドメイン・ユースケースに変更は入らない。

### ユースケース / アプリケーションロジック
なし。保存/ドラフト/ロックの server-fn 呼び出しやその分岐条件は変更しない。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

3 つの UI 変更を、既存プリミティブの流用で行う。

1. **ツールバー圧縮（オーバーフローメニュー、モバイルのみ）** — `WysiwygEditor.tsx`
   - **単一の `buttons` 配列を維持**し、各要素に `group: "primary" | "overflow"` フラグを付与する。現状 `buttons` 配列外（別 JSX）でレンダーしている Link/Image も、まず統一データ（1 本の配列 or 同型の宣言）に集約して `group: "primary"` とする。**元の並び順は保持**し、可視性だけを breakpoint で分岐させる（＝低頻度書式を「並び替えず」に、モバイルでのみオーバーフローへ送る）。
     - overflow グループ: Strike / H2 / H3 / Quote / Code（元順のまま）。
     - primary グループ: Bold / Italic / UL / OL / Link / Image。
   - **レイアウト（レール外配置 — option A に一本化）** — `editorToolbar`（`overflow-x-auto` の両軸クリップコンテナ）の**外側**にオーバーフロートリガー + `<Menu>` を置く。当初併記していた option B（現 `editorToolbar` を維持し Menu ラッパーだけを `flex flex-col` 直下の兄弟に出す案）は、兄弟がツールバー行の**下に別行落ち**して `⋯` が行末に付かず追従もしないため UX を満たさず、**採用しない**（arch-risk P-001）。具体的には:
     - 外側に非クリップの `flex items-center gap-[2px]` ラッパーを新設し、その中に「スクロールレール（現 `editorToolbar` = 全ボタンを元順で描画）」と「オーバーフロー機構（`sm:hidden` の `<Menu>` ラッパー）」を兄弟として並べる。要点は **`<Menu>` の inline `absolute` パネルが overflow コンテナの内側に来ないこと**（arch-risk P-001）。
     - **sticky 追従の移設（最重要）** — 現状 `editorToolbar` の `sticky top-[calc(var(--header-height)+var(--space-2))] z-20`（および `mb-4`）は、親 `WysiwygEditor` ルートの背の高い `flex flex-col`（`EditorContent` を含む、`WysiwygEditor.tsx:515`）を containing block としてヘッダー直下に追従している。この外側ラッパーは 1 行分の高さしか持たないため、**`sticky top-… z-20` と `mb-4` を外側ラッパーへ移設**し、外側ラッパー自身を sticky 要素にする（ラッパーは overflow コンテナでないため Menu パネルはクリップされない）。内側のスクロールレール（`editorToolbar` = `overflow-x-auto`）は**非 sticky の内側スクローラに降格**する。これで追従を維持しつつクリップも回避できる。`editorToolbar` は `WysiwygEditor.tsx:550` の 1 箇所専用なので `styles.ts` 側の分割で完結する（arch-risk P-001-1）。
     - **幅（`max-sm:self-stretch` → `max-sm:flex-1 min-w-0`）** — レールの `max-sm:self-stretch` は cross 軸（現 `flex-col` では水平）で全幅化する指定。外側ラッパーが flex-**row** になると cross 軸が垂直になり全幅化しない。モバイルで `⋯` を行末に置きつつレールを可変幅で埋めるため、レールは **`max-sm:flex-1 min-w-0`** に置換する（`flex-1` は必ず `max-sm:` 修飾でモバイル限定にする）。**無修飾の `flex-1` にしてはならない** — デスクトップの外側ラッパー（cross 軸 stretch で全幅）内でレールが main 軸いっぱいに grow し、現状の shrink-to-fit・左寄せ pill が全幅化して AC-2 を壊す。デスクトップでは外側ラッパー・レールとも grow させず、レールは既定 flex `0 1 auto` の shrink-to-fit・左寄せを保つ（arch-risk P-001-2 / round-3 arch-risk P-001）。
     - **`role="toolbar"` の移設** — 現状 `role="toolbar" aria-label="書式"` はレール（`editorToolbar`）に載っている（`WysiwygEditor.tsx:550`）。`⋯` トリガーをレール外に出すとオーバーフロー操作がツールバーのグルーピングから外れるため、**`role="toolbar" aria-label="書式"` を外側ラッパーへ移し**、`⋯`（オーバーフロートリガー）も含めて 1 つのツールバーとして提示する（arch-risk P-001-3）。
     - レール（全ボタン）:
       - primary ボタン: 常時表示（`EDITOR_TOOLBAR_BTN`）。
       - overflow ボタン: レール内に**元の位置のまま** `max-sm:hidden` を付与（= デスクトップのみ表示）。デスクトップの DOM 並び・見た目は完全に不変（AC-2）。
       - モバイルでは overflow ボタンが消え、レールには primary 6 個だけが元順で連続して残る（AC-1）。
     - オーバーフロー機構: **`sm:hidden` のコンテナで `<Menu>` 全体を包む**。これによりデスクトップでは Menu の `<div className="relative">` ラッパー自体が DOM から消え、空ラッパーによる `gap-[2px]` 分の余白増を防ぐ（AC-2 / arch-risk S-001）。`⋯`（`MoreHorizontal`）トリガーからメニューを開き、項目 = overflow グループ書式。
   - オーバーフローメニューは `NoteActionsMenu` を踏襲し `<Menu>`/`<MenuItem>` を使用（`panelClassName="absolute right-0 mt-1 z-40 min-w-[…]"`）。適用中状態は各 `MenuItem` の children にトグル状態（チェック等）を反映し、**メニューを開いた時点で判別可能**にする（下記 ADR-001 / リスク参照）。
   - `disabled`（`isDisabled`）を primary ボタン・トリガー・各メニュー項目に一貫して伝播する。

2. **未保存確認ダイアログ化** — `NoteEditor.tsx`
   - `window.confirm`（L283）を `ConfirmDialog`（既 import 済み）に置換。
   - 新 state `pendingUnsavedSwitch: { nextMode: EditorMode } | null`（既存 `pendingWysiwygSwitch` と同じ「view-only の遷移保留」用途なので orchestrator の `useState`）。
   - `onModeChange` を再構成:
     - blur → 最新 state を `stateRef` から読み `isDirty` 判定（現状ロジック維持）。
     - `isDirty` なら `setPendingUnsavedSwitch({ nextMode })` して return（`ConfirmDialog` を開く）。
     - `isDirty` でなければ「装飾ゲート + `setMode`」の末尾処理を実行。
   - 末尾処理を `proceedModeSwitch(nextMode)` ヘルパーに抽出し、①not-dirty パス ②未保存確認の onConfirm パス で共有。
   - 未保存確認 `ConfirmDialog` の `onConfirm`: `abortInFlight()` → `proceedModeSwitch(pending.nextMode)` → `setPendingUnsavedSwitch(null)`。`onClose`: `setPendingUnsavedSwitch(null)`（= 切替中止、現モード維持）。
   - 未保存ダイアログと装飾ダイアログが同時に開かないよう、装飾ゲートは `proceedModeSwitch` 内で走る（未保存 onConfirm が閉じてから装飾が開く）。
   - `ConfirmDialog` は破壊的配色（`pillBtnDanger`）固定だが、「保存せず切り替え」は破棄的操作なので許容。`title`「未保存の変更があります」・`confirmLabel`「切り替える」。

3. **リンクダイアログ化** — `WysiwygEditor.tsx`（+ 新規 `LinkDialog` を editor 配下 or WysiwygEditor 内）
   - `onAddLink` から `window.prompt` / `window.alert` を除去。
   - 新 state `linkDialog: { open: boolean; initialHref: string; hasLink: boolean } | null`。ツールバーのリンクボタンで開く。
   - `LinkDialog`（`Dialog` プリミティブベース）: `ariaLabelledBy` タイトル、URL 入力（`fieldControl`、`initialFocusRef`）、送信で `isAllowedLinkUri` を検証 → NG なら `formError` の `role="alert"` インライン表示（`window.alert` 置換、ダイアログは開いたまま）、OK なら親の `onSubmit(url)` を呼ぶ。既存リンクがある場合は「解除」ボタン（`unsetLink`）を表示。
   - 親（WysiwygEditor）が `editor.chain().focus().extendMarkRange("link").setLink(...)` / `unsetLink()` を実行（TipTap 操作は親に残す）。
   - `Dialog` の `closeOnBackdropClick`・grabber・safe-area によりモバイルはボトムシート化。

## 実装ステップ

### 1. ツールバーのボタン定義を単一データに統合
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:** 現状 `buttons` 配列（9 個）と別 JSX の Link/Image（`WysiwygEditor.tsx:569-590`）を **1 本の宣言に集約**し、各要素に `group: "primary" | "overflow"` を付与する（Link/Image は `primary`）。**配列の並び順は現状の DOM 順（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code/Link/Image）を維持**する。overflow = Strike/H2/H3/Quote/Code、primary = それ以外。
- **理由:** レール（デスクトップ全表示・モバイル primary 表示）とオーバーフローメニュー（モバイル）で同じアクション定義を再利用し、二重定義を避ける。単一配列 + フラグにすることで**並び替えなしで可視性のみ分岐**でき、AC-1/AC-2 を両立（coverage P-001 / S-003）。

### 2. レール外配置のレイアウト分割（sticky/幅/role の移設）+ オーバーフロートリガー整備
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`、`app/components/note/editor/styles.ts`
- **変更内容:** option A（外側ラッパー方式）に一本化。`editorToolbar`（`max-sm:overflow-x-auto` = 両軸クリップコンテナ）の**外側**にオーバーフロー機構を出す。
  1. **外側ラッパーの新設と sticky 移設:** 非クリップの外側ラッパーを新設し、そこに `editorToolbar` から移した `sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4` を載せ、`flex items-center gap-[2px]` とする（ラッパーは overflow コンテナでないため Menu パネルをクリップしない）。この中に「スクロールレール（元 `editorToolbar` = 全ボタンを元順で描画。sticky/mb-4 を外したうえで `overflow-x-auto` の**非 sticky 内側スクローラ**に降格）」と「`sm:hidden` で包んだ `<Menu>`（`⋯` = `MoreHorizontal` トリガー）」を兄弟に並べる。`styles.ts` の `editorToolbar` を「外側ラッパー用（sticky）」と「内側レール用（scroller）」に分割する（`editorToolbar` は `WysiwygEditor.tsx:550` の 1 箇所専用なので styles.ts 側で完結）。
  2. **幅の置換:** レールの `max-sm:self-stretch` を **`max-sm:flex-1 min-w-0`** に置換（flex-row ラッパー内でモバイルのみ全幅化＋`⋯` を行末に固定）。`flex-1` は必ず `max-sm:` 修飾でモバイル限定にすること（無修飾だとデスクトップでレールが grow して pill が全幅化＝AC-2 違反）。**外側ラッパー自身にも `flex-1` を持たせない**（デスクトップは全幅の透明ラッパー内に shrink-to-fit・左寄せ pill が乗る＝現状と同一見た目）。styles.ts 分割の JSDoc にレールのデスクトップ shrink-to-fit を維持する旨を残す。
  3. **role の移設:** `role="toolbar" aria-label="書式"` をレールから**外側ラッパーへ移設**し、`⋯` トリガーを含めて 1 つのツールバーとして提示する。
  4. `<Menu>` の `panelClassName` は `NoteActionsMenu` に倣い `absolute right-0 mt-1 z-40 min-w-[…]`。
- **理由:** Menu パネルは Portal ではなくインライン `absolute` 描画（`Menu.tsx:142-170`）のため、overflow コンテナの内側だとクリップされて見えない（arch-risk P-001）。レール外に出すことで既存プリミティブ非改変のまま解消する。ただしレール外配置を素直に実装すると、`editorToolbar` の documented なヘッダー直下 sticky 追従が背の低い外側ラッパーに閉じ込められて回帰する — これを防ぐため sticky/mb-4 を外側ラッパーへ移設し、レールを非 sticky スクローラに降格する（arch-risk P-001-1）。`self-stretch` は flex-row ラッパー内で全幅化しないため `max-sm:flex-1 min-w-0` に置換（`flex-1` はモバイル限定修飾に留め、デスクトップで外側ラッパー・レールを grow させない＝AC-2 の 1px 不変を守る）（P-001-2 / round-3 arch-risk P-001）。`⋯` をツールバーのグルーピングに含めるため role も移設（P-001-3）。`sm:hidden` ラッパーでデスクトップでは Menu の `relative` ラッパーごと DOM から消し、空ラッパーによる余白増も防ぐ（arch-risk S-001）。「`editorToolbar` はそのまま単独利用」の当初方針は撤回。option B（Menu を `flex flex-col` 直下の別兄弟に出す案）は別行落ちで UX を満たさないため不採用。

### 3. レールのレンダリング再構成（モバイル圧縮）
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:** レール（`editorToolbar`）に全ボタンを**元順で**描画し、overflow グループ要素にのみ `max-sm:hidden` を付与（デスクトップは全ボタン元順のまま = AC-2、モバイルは primary 6 個が連続表示 = AC-1）。オーバーフロー機構はレール外（step 2）。
- **理由:** AC-1（モバイルで主要ボタンが一目・横スクロールなし）と AC-2（デスクトップ完全不変・並び替えなし）を CSS variant のみで両立（coverage P-001）。

### 4. オーバーフロー `<Menu>` の実装
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:** `NoteActionsMenu` パターンで `<Menu open onOpenChange>` + overflow アクションの `<MenuItem icon onSelect>` を実装。各項目の `onSelect` は既存の `onClick`（`editor.chain()...run()`）を呼ぶ。適用中状態は children で判別可能にする（例: ラベル横にチェック/「適用中」）。**メニューを開いた時点で現在の適用状態が判別できる**こと（AC-3）。トグル後はメニューが閉じる（`runAndClose`）挙動を許容（適用直後の状態変化は再オープン時に反映）。`disabled` を伝播。
- **理由:** WAI-ARIA 準拠（AC-3）を primitive に委譲。

### 5. `onModeChange` の再構成 + `proceedModeSwitch` 抽出
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** 未保存確認の `window.confirm` を除去。`isDirty` なら `pendingUnsavedSwitch` を立てて return。装飾ゲート + `setMode` の末尾を `proceedModeSwitch(nextMode)` に抽出し、not-dirty パスで直接呼ぶ。`pendingUnsavedSwitch` state を追加。
  - **抽出範囲の注意（arch-risk S-001）:** 装飾ロスゲートは `NoteEditor.tsx:311` で `if (surface === "edit" && nextMode === "wysiwyg")` に限定されている（新規ノート面は #696 以前挙動＝ AC-6 を維持するため `setMode` 直行）。`proceedModeSwitch` へ抽出する際もこの `surface === "edit"` 条件分岐を**そのまま内包**すること。条件を落とすと新規ノート面で装飾ダイアログが誤って出て AC-6 を壊す。
- **理由:** 同期 `confirm` を非同期ダイアログに置換するための遅延遷移パターン（既存 `pendingWysiwygSwitch` と同型）。

### 6. 未保存確認 `ConfirmDialog` の追加
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** `pendingUnsavedSwitch !== null` で開く `ConfirmDialog` を追加。`onConfirm` = `abortInFlight()` → `proceedModeSwitch(nextMode)` → clear。`onClose` = clear。既存装飾 `ConfirmDialog` と同時に開かないことをコード順で担保。
- **理由:** AC-4 / AC-5。

### 7. `LinkDialog` の実装
- **対象ファイル:** `app/components/note/editor/LinkDialog.tsx`（新規）
- **変更内容:** `Dialog` ベース。URL 入力（`fieldControl` + `initialFocusRef`）、`isAllowedLinkUri` 検証（NG は `formError`/`role="alert"` インライン）、`onSubmit(url)` / `onRemove()` / `onClose()`。挿入/更新ボタン（`pillBtn pillBtnPrimary`）、リンク有り時のみ「解除」、キャンセル。スキーム検証ヘルパーは `WysiwygEditor` と共有（`isAllowedLinkUri` を export するか util に切り出し）。
- **理由:** AC-6 / AC-7。native prompt/alert 置換。

### 8. `WysiwygEditor.onAddLink` の差し替え
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:** `onAddLink` を「`linkDialog` を開く」だけにし、`window.prompt`/`window.alert` を削除。`LinkDialog` の `onSubmit`/`onRemove` で TipTap の `setLink`/`unsetLink` を実行。既存リンクの `href` を `initialHref` に渡す。
- **理由:** AC-6 / AC-7。

### 9. テスト更新・型/整形
- **対象ファイル:** `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`、`noteEditorImageButtonWiring.test.tsx` / `wysiwygEditorImageButton.test.tsx`（再確認）、必要なら新規テスト
- **変更内容:** `window.confirm` モックを廃し、未保存 `ConfirmDialog` のボタンクリックで検証する形に書き換え（「未保存 → 確認 → 装飾ダイアログの順・二重プロンプトなし」= AC-5 を維持）。
  - **影響範囲（arch-risk S-002）:** `confirmMock` を前提にしているのは「confirm conditions」だけでなく **#286（in-flight autosave cancel、`vi.useFakeTimers()` 使用）・#696（装飾ゲート）・#697（FrontMatter 永続）の各 describe が全対象**。fake timers と `Dialog` の mounted `useEffect`/rAF フォーカスの相互作用（ボタン click 経路が `act` 内なら動く見込み）に留意して書き換える。
  - ツールバー再構成の影響で `noteEditorImageButtonWiring.test.tsx` / `wysiwygEditorImageButton.test.tsx`（image button 配線）が緑のままであることを再確認する。
  - オーバーフローメニュー（AC-1/3）とリンクダイアログ（AC-6/7）の基本テストを追加。`pnpm typecheck && pnpm lint:fix && pnpm format`。
- **理由:** AC-8 / 回帰防止。

### 10. 設計 SSOT モックの更新（乖離清算）
- **対象ファイル:** `spec/design/pages/mobile/P12-editor.html`
- **変更内容:** モバイルツールバー節（mock L700-715, L1256-1273）を本計画の overflow-menu 方式へ**更新する**（`.tb-heading` 見出しドロップダウン + `overflow-x: auto` 前提 → 主要ボタン + `⋯` オーバーフローメニュー）。
- **完了条件（coverage S-002 / AC-9）:** **モックを overflow-menu 方式へ更新することを完了条件とする。**「注記のみ」での清算は採らない（SSOT を実装の正へ揃えるのが本 step の目的であり、注記止まりだと次の実装者/レビュアーが誤ったモックを基準にし続けるため）。
- **理由:** #818 が当該モックを設計 SSOT に格上げしており、更新しないと次の実装者/レビュアーが誤ったモックを基準にする（arch-risk P-002）。乖離を一時ファイルの adr.md だけに残さない。

## 設計判断

- ADR-001: ツールバー圧縮は「モバイル限定のオーバーフローメニュー（CSS breakpoint 分岐、デスクトップ不変）」を採用。詳細は `adr.md`。
- ADR-002: ネイティブダイアログ置換は「未保存確認 = 既存 `ConfirmDialog` + 遅延遷移 state」「リンク入力 = `Dialog` ベース新規 `LinkDialog`」で行い、`window.alert` はダイアログ内インライン `role="alert"` に置換。詳細は `adr.md`。

## リスクと注意点

- `onModeChange` の同期 → 非同期化により、`window.confirm` を前提とした `noteEditorModeChange.test.tsx` が広範に壊れる。テスト書き換えのボリュームが最大のリスク。挙動の意味論（順序・二重プロンプト回避 = AC-5）を厳密に維持すること。
- `<MenuItem>` はトグル/`aria-pressed` を持たない（`menuitem` role）。オーバーフロー内書式の「適用中」表現は children での視覚表示に留まり、押下状態の SR 通知は rail 上の主要ボタン（`aria-pressed` 保持）ほど厳密でない。トグル後にメニューが閉じる（`runAndClose`）ため実用上は許容だが、厳密なトグル semantics が要る場合は Menu プリミティブ拡張が別途必要（ADR-001 で明示）。
- どのボタンを overflow 送りにするかで 390px の収まりと使い勝手が変わる。`EDITOR_TOOLBAR_BTN` はモバイルで `TOUCH_TARGET_SQUARE`（`max-sm:min-w-[44px]`）により**実効 44px 角**。主要 6 個（Bold/Italic/UL/OL/Link/Image）+ `⋯` の 7 枠 × 44 ≈ 308px + gap/padding で 390px に**余裕をもって収まる**見込みだが、実機幅で最終確認する（収まらなければ主要をさらに削る = AC-1 収束条件）。
- オーバーフロー機構をレール（`overflow-x-auto` の両軸クリップコンテナ）の**外側**に出す（レイアウト分割）ことが実現可能性の要。Menu パネルが Portal でないため、レール内に置くとクリップされる（arch-risk P-001）。実装時にレール外配置を崩さないこと。
- **レール外配置は `editorToolbar` の sticky 追従を壊す新リスクを内包する（arch-risk P-001 最重要）。** 背の低い外側ラッパーに sticky を残すと追従範囲が 1 行に閉じ込められ、スクロールで即流れて消える（documented なヘッダー直下追従の回帰）。対策として (1) `sticky/z-20/mb-4` を外側ラッパーへ移設しレールを非 sticky 内側スクローラに降格、(2) レール幅を `max-sm:self-stretch` → `max-sm:flex-1 min-w-0`（`flex-1` はモバイル限定修飾。無修飾だとデスクトップで pill が全幅化し AC-2 違反 — 外側ラッパー・レールともデスクトップで grow させない）、(3) `role="toolbar"` を外側ラッパーへ移設し `⋯` を含める、の 3 点を step 2 のとおり必ず実施する。option B（Menu を別兄弟に出す案）は別行落ちで不採用。
- ネイティブダイアログ置換はデスクトップにも作用する。デスクトップで中央モーダル化されること自体は許容だが、「デスクトップレイアウト不変」を厳密に読む立場との齟齬に注意（scope に明記済み）。
- `LinkDialog` は `WysiwygEditor` の TipTap 操作（`setLink`/`unsetLink`/`extendMarkRange`）を親に残し、ダイアログは入力・検証・コールバックのみを担う責務分離を守る（TipTap editor 参照をダイアログに渡さない）。
- リンクダイアログを外側 `<form>`（NoteEditor）内にネストする場合、`ConfirmDialog` 同様に submit の `stopPropagation` で親フォーム submit を抑止すること。
- `LinkDialog` 化により、ボタン押下 → ダイアログでフォーカストラップ → submit で `editor.chain().focus().extendMarkRange("link").setLink()` を実行する経路になる。ProseMirror は選択を state に保持し `.focus()` で復元される想定だが、(a) 選択テキストへのリンク付与が意図どおり効くこと、(b) 選択なし（新規リンクだが未選択）の挙動が現行 `window.prompt`（実質 no-op 挿入）と同一であること、を manual-test の確認項目に含める（arch-risk S-004）。

## テスト方針

- ユニット（happy-dom）:
  - モード切替: dirty 時に未保存 `ConfirmDialog` が開く／「切り替える」で切替が進む／キャンセルでモード・内容維持（AC-4）。dirty かつ非対応タグ有りで「未保存確認 → 装飾確認」の順に 1 回ずつ表示され二重プロンプトしない（AC-5）。not-dirty では未保存ダイアログが出ない。
  - オーバーフローメニュー: モバイル相当で低頻度書式が `⋯` メニューから適用できる／トリガーの a11y 属性・dismiss（AC-1/AC-3）。
  - リンクダイアログ: 開閉・URL 入力で `setLink`／空/解除で `unsetLink`／非対応スキームでインライン `role="alert"` 表示 & ダイアログ継続（AC-6/AC-7）。
- 型/lint/format: `pnpm typecheck && pnpm lint:fix && pnpm format`（AC-8）。
- 手動/ブラウザ（manual-test / agent-browser）: 390px 幅で主要ボタンが横スクロールなしに収まり（収まらなければ主要を削って収束 = AC-1）、`⋯` メニューがレール外に見切れず開いて低頻度書式に到達できること。未保存確認・リンク入力がボトムシートで表示され、キーボード/フォーカストラップが機能すること。デスクトップでツールバーの並び順・見た目・操作が現状と完全に同一（余白増もなし）であること。リンクダイアログ: 選択テキストへのリンク付与が効くこと・選択なしの挙動が現行と同一であること（arch-risk S-004）。

## レビュー履歴

### 1周目
**修正した点**:
- coverage P-001（AC-2 と step3 のグループ物理再配置の矛盾）: 単一 `buttons` 配列 + `group` フラグ方式に改め、「元の並び順を維持し可視性のみ breakpoint 分岐（overflow 書式を `max-sm:hidden` でモバイルのみ隠す）」に統一。AC-2・設計 UI 節・step 1/3・ADR-001 の「グループ順に物理配置」記述を全面書き換え。
- arch-risk P-001（オーバーフロー Menu パネルが `editorToolbar` の `overflow-x-auto`/`-y` 昇格でクリップ）: **最重要対応**。Menu/usePopover が Portal を持たない（インライン `absolute` 描画）ことを実コードで確認し、トリガー + `<Menu>` をスクロールレールの**外側**に配置する「レール外配置」を採用。「`editorToolbar` はそのまま利用」方針を撤回し、設計 UI 節・step 2/3・調査結果・リスクに反映。
- arch-risk P-002（設計 SSOT モック `P12-editor.html` との乖離未清算）: 実装 step 10 として「モックを overflow-menu 方式へ更新（または注記）」を追加。ADR-001 の Decision/Consequences に SSOT モック更新の明記を追加。

**取り込んだ改善提案**:
- coverage S-001: AC-1 に「実機 390px で収まらなければ主要を削って収める」収束条件を明記。
- coverage S-002: AC-3 の「適用中」判別タイミングを「メニューを開いた時点」と定義（step 4 にも反映）。
- coverage S-003: step 1 を「Link/Image を含め単一データに集約」する前提へ修正（P-001 の単一配列 + フラグ方式と統合）。
- arch-risk S-001: オーバーフロー機構を `sm:hidden` コンテナで包み、デスクトップで空 Menu ラッパーによる 2px 余白増を出さないことを設計・AC-2 に明記。
- arch-risk S-002: step 9 に fake timers 使用の #286 等を含む全 describe が書き換え対象であること、image button テストの再確認を明記。
- arch-risk S-003: タップ床を 36px → 実効 44px に訂正し「主要セットは余裕をもって収まる」前提を明確化（調査結果・リスク）。
- arch-risk S-004: LinkDialog 開閉時の TipTap 選択保持（選択テキストへの付与・未選択時の挙動）を manual-test 検証項目に追加（リスク・テスト方針）。

**見送った提案とその理由**:
- なし（要修正 P 3 件・改善提案 S 7 件をすべて取り込み）。

### 2周目
**修正した点**:
- arch-risk P-001（レール外配置による sticky 追従の回帰）: **最重要対応**。option A（外側ラッパー方式）に一本化し、(1) `sticky/z-20/mb-4` を外側ラッパーへ移設・内側レールを非 sticky スクローラに降格、(2) レール幅を `max-sm:self-stretch` → `flex-1 min-w-0`、(3) `role="toolbar"` を外側ラッパーへ移設し `⋯` を含める、の 3 点を設計 UI 節・step 2・ADR-001・リスクに明記。option B（別兄弟に出す案）は別行落ちで UX を満たさないため計画から除外。

**取り込んだ改善提案**:
- arch-risk S-001: `proceedModeSwitch` 抽出時に装飾ゲートの `surface === "edit"` スコープ（`NoteEditor.tsx:311`、新規ノート面の AC-6 維持）を内包する旨を step 5 に明記。
- coverage S-001: AC↔step 紐づけ表に step 2 を AC-1/AC-3 の必須イネーブラとして追加。step 10 は AC-9 を新設して紐づけ。
- coverage S-002: step 10（SSOT モック更新）の完了条件を「モックを overflow-menu 方式へ更新する（注記のみは不可）」と明示し、AC-9 として検証ゲート化。

**見送った提案とその理由**:
- なし（要修正 P 1 件・改善提案 S 2 件をすべて取り込み）。

### 3周目（最終）
**修正した点**:
- coverage P-001（ADR 完了条件の食い違い）: `adr.md` ADR-001 末尾の SSOT モック清算条件から「（または『#825 で overflow-menu 採用』の設計注記を追記）」の括弧書きを削除し、「更新して乖離を清算する（注記のみは不可 — plan.md AC-9 / step 10）」に統一。plan.md の AC-9 / step 10（更新必須・注記のみ不可）と ADR の完了条件を一致させ、注記止まりの抜け道を ADR 経由でも塞いだ。
- arch-risk P-001（レール幅置換の breakpoint 未修飾）: 置換先を `flex-1 min-w-0`（無修飾）→ **`max-sm:flex-1 min-w-0`**（モバイル限定修飾）に統一。plan.md（設計 UI 節・step 2.2・step 2 理由・リスク）と adr.md（ADR-001 point 2）の該当箇所すべてで「`flex-1` はモバイル限定・デスクトップでは外側ラッパー・レールとも grow させない（shrink-to-fit・左寄せ pill を維持＝AC-2 の 1px 不変）」旨を明記。無修飾 `flex-1` だとデスクトップ pill が全幅化して AC-2 を壊すトラップを防止。

**取り込んだ改善提案**:
- coverage S-001: AC-2 の対応ステップに step 2 を追加（`1, 3, 4` → `1, 2, 3, 4`）。DOM 再編（外側ラッパー新設・sticky/幅/role 移設）がデスクトップ不変を破った際に AC-2 で検知できるようトレーサビリティを精緻化。

**見送った提案とその理由**:
- なし（要修正 P 2 件・改善提案 S 1 件をすべて取り込み、3 周で収束）。

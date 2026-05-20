# 実装計画 — Issue #54: Dialog 共通化（フォーカストラップ・Esc クローズ・Portal レンダリング）

**Issue:** #54
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

プロジェクト内の 6 つのモーダルダイアログ（`ConfirmDialog`, `MoveNoteDialog`, `BulkExportDialog`, `BulkVisibilityDialog`, `SaveViewDialog`, `MergeTagDialog`）に共通する 3 つの A11y 改善余地 — **フォーカストラップ・Esc クローズ・Portal レンダリング** — を、`app/components/common/Dialog.tsx` に新設する共通ラッパーで一括解決する。Issue #2 Phase 3 レビュー W-001/W-002 の指摘と ADR-005 の方針に沿った実装。

## スコープ

### 含まれるもの

- `app/components/common/Dialog.tsx` の新設（focus trap + Esc + Portal + panel スタイルを内包する shell コンポーネント）
- 既存ダイアログ 6 件の置き換え:
  - `app/components/common/ConfirmDialog.tsx` (role="alertdialog")
  - `app/components/note/list/MoveNoteDialog.tsx`
  - `app/components/note/list/BulkExportDialog.tsx`
  - `app/components/note/list/BulkVisibilityDialog.tsx`
  - `app/components/note/list/SaveViewDialog.tsx`
  - `app/components/tag/MergeTagDialog.tsx`
- `MergeTagDialog` のローカル定数のうち、Dialog 内部に集約される `DIALOG_BACKDROP` / `DIALOG` / `DIALOG_TITLE` / `DIALOG_ACTIONS` を削除（フォーム部品の `FIELD_INPUT` 等は触らない — スタイル統合の範囲は dialog shell に閉じる）

### 含まれないもの

- `AccountDeleteForm`（`<section role="dialog">` で実装された画面遷移型フォーム、Issue 対象に明示されていない）
- 新規依存ライブラリ追加（focus-trap-react, react-focus-lock 等）
- アニメーション・トランジション
- ネイティブ `<dialog>` 要素への移行
- ダイアログ用の `__tests__` 整備（プロジェクト全体のテスト基盤が現状薄く、要件外）
- 背景クリックでダイアログを閉じる挙動（既存挙動と互換性を保つため）
- `aria-modal` 以外の AT 隔離手段（兄弟 `aria-hidden` / `inert` 付与）— モダンブラウザ + AT 組み合わせでは `aria-modal="true"` で十分

## 実装ステップ

### 1. 共通 `<Dialog>` コンポーネントの新設

- **対象ファイル:** `app/components/common/Dialog.tsx` (新規)
- **変更内容:**
  - `"use client";` 付与、`react-dom` から `createPortal` を import
  - 構造: 外側 `Dialog` と内側 `DialogInner` の 2 コンポーネントに分離する。`Dialog` は `if (!open) return null;` で早期 return するだけで、`open === true` のとき `<DialogInner ...>` をマウントする。**これにより内側 effect は open 遷移時に確実に mount/unmount され、hooks 順序違反や cleanup 漏れが起きない**
  - `DialogInner` の props:
    ```ts
    type DialogProps = Readonly<{
      open: boolean;
      onClose: () => void;
      role?: "dialog" | "alertdialog"; // default "dialog"
      ariaLabel?: string;
      ariaLabelledBy?: string;
      ariaDescribedBy?: string;
      closable?: boolean;             // default true。false で Esc を無視（isPending 中の安全弁）
      children: React.ReactNode;
    }>;
    ```
  - `DialogInner` の振る舞い:
    - **SSR ガード:** `useState(false)` の `mounted` フラグを `useEffect(() => setMounted(true), [])` で true にし、`mounted === false` のとき `null` を返す。これにより `"use client"` 配下でも SSR パスで `document` を触らない
    - **Esc キー:** `useEffect` で `document.addEventListener("keydown", ...)` を attach、`Escape` で `closable !== false` のとき `onClose()` を呼ぶ
    - **previousActive の保存:** `useRef<HTMLElement | null>` に mount 直前の `document.activeElement` を保存する。ただし保存値が panel 内側に既に居る場合（StrictMode の二重 mount 等）はガードして上書きしない
    - **フォーカストラップ:**
      - `useRef<HTMLDivElement>` を panel に付与
      - mount 後 `requestAnimationFrame` で `role === "alertdialog"` のときは panel 自体に `tabindex="-1"` を付けてパネルにフォーカス（destructive 確認で「キャンセル」にフォーカスする WAI ベストプラクティス相当）、それ以外は panel 内の最初のフォーカス可能要素にフォーカス
      - `keydown` の `Tab`/`Shift+Tab` で先頭⇄末尾を wrap
      - focusable セレクタ: `'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'`
      - focusable 要素ゼロのときは panel 自体に `tabindex="-1"` を付けて fallback
    - **focus 復帰:** unmount 時に保存した `previousActive` へ `focus()`。`activeElement instanceof HTMLElement` と `isConnected === true` でガード。両方 false ならフォールバックせず（ブラウザのデフォルト = body にフォーカスが落ちる）何もしない
    - **スクロールロック:** `open` 中は `document.body.style.overflow` を保存して `"hidden"`、cleanup で復元。**注: 単一ダイアログ同時表示前提**（コードコメントに明記）
    - **aria-modal:** `<Dialog>` 内部で常に `aria-modal="true"` を付与する（モーダル前提の wrapper であり、callsite に判断させない）
    - **panel スタイル内包:** `createPortal(<div className={dialogBackdrop}><div ref={panelRef} role aria-* className={dialog}>{children}</div></div>, document.body)`。callsite は `<form onSubmit={...}>` だけを `children` として渡し、`dialog` クラスを自分で当てない
  - スタイル: `app/components/note/styles.ts` から `dialogBackdrop` / `dialog` を import して内部適用（cross-domain import は Dialog 1 ファイルに閉じる）
- **理由:** 6 ダイアログの差分を最小化しつつ A11y 改善を一箇所に集約。panel スタイルも内包することで callsite から `dialog`/`dialogBackdrop` の import が消え、cross-domain 依存の拡散を防ぐ

### 2. ConfirmDialog の置き換え

- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`
- **変更内容:**
  - `dialog` / `dialogBackdrop` の import を削除
  - 外側 `<div className={dialogBackdrop} role="alertdialog" aria-modal aria-labelledby aria-describedby>` を `<Dialog open={open} onClose={onClose} role="alertdialog" ariaLabelledBy={titleId} ariaDescribedBy={description !== undefined ? descId : undefined} closable={!isPending}>` に置換
  - `<form className={dialog}>` から `className` を削除（または `<form onSubmit={submit}>` に戻す） — panel スタイルは Dialog が内包する
  - `if (!open) return null;` は Dialog 側に委譲して削除
- **理由:** 既存 8 callsite の API（props）を維持しながら A11y を一括強化

### 3. MoveNoteDialog の置き換え

- **対象ファイル:** `app/components/note/list/MoveNoteDialog.tsx`
- **変更内容:**
  - `dialog` / `dialogBackdrop` の import を削除
  - 外側 `<div>` を `<Dialog open={open} onClose={onClose} ariaLabel="ノートを移動" closable={!isPending}>` に置換
  - `<form className={dialog}>` から `className` を削除
  - `if (!open) return null;` を削除
- **理由:** 同パターン適用

### 4. BulkExportDialog / BulkVisibilityDialog / SaveViewDialog の置き換え

- **対象ファイル:**
  - `app/components/note/list/BulkExportDialog.tsx`
  - `app/components/note/list/BulkVisibilityDialog.tsx`
  - `app/components/note/list/SaveViewDialog.tsx`
- **変更内容:** ステップ 3 と同パターン。`ariaLabel` はそれぞれ「一括エクスポート」「公開設定を一括変更」「ビューとして保存」、`closable={!isPending}` を渡す
- **理由:** 同パターン適用

### 5. MergeTagDialog の置き換え

- **対象ファイル:** `app/components/tag/MergeTagDialog.tsx`
- **変更内容:**
  - ローカル定数 `DIALOG_BACKDROP` / `DIALOG` / `DIALOG_TITLE` / `DIALOG_ACTIONS` を削除（Dialog 内部に集約）
  - 外側 `<div>` を `<Dialog open={open} onClose={onClose} ariaLabel="タグを統合" closable={!isPending}>` に置換
  - `<h2 className={DIALOG_TITLE}>` は Dialog の外で残すべきタイトル要素なので、`note/styles.ts` の `dialogTitle` を import するか、または `text-lg font-medium mb-4` をインラインで書く（cross-domain import を増やしたくないため後者を採用）
  - `<div className={DIALOG_ACTIONS}>` も同様にインライン `inline-flex gap-2 mt-4 justify-end w-full` を直書き
  - `DIALOG_DESCRIPTION` (`text-[13px] text-ink-secondary mt-2`) はインラインで残す
  - フォーム部品 (`FIELD_INPUT` / `FIELD_LABEL` / `FORM_ERROR` / `PILL_BTN`) はそのまま — 本 Issue のスコープではない
- **理由:** Dialog 内部に backdrop/panel スタイルが集約されるため、MergeTagDialog からは関連ローカル定数を撤去できる。フォーム部品のスタイル統合は Issue スコープ外（別 Issue 候補）

### 6. 静的検証

- **対象:** すべての変更ファイル
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行しエラーゼロを確認
- **理由:** CLAUDE.md の "After changes" コマンド規約

### 7. ConfirmDialog の callsite における isPending 引き渡し確認

- **対象:** ConfirmDialog の 8 callsite（`NoteActions`, `IngestionJobRow`, `TagActions`, `TrashRowActions`, `SavedViewsList`, `BulkActionBar`, `AccountDeleteForm`, `NoteListToolbar` 周辺）
- **変更内容:** 各 callsite が `isPending` プロップを ConfirmDialog に渡しているか確認。渡していないものは、内部で `isPending=false` 扱いになり Esc 抑制が効かないことを確認の上、本 Issue では追加プロップ伝達はしない（既存挙動と同等）。漏れがあれば progress.md に記録
- **理由:** ADR-004 の安全弁が機能する範囲を明確化

## 設計判断

詳細は `.issue/54/adr.md` を参照。

- **ADR-001:** Dialog の置き場は `app/components/common/`
- **ADR-002:** focus trap は自前実装
- **ADR-003:** 背景クリックではダイアログを閉じない
- **ADR-004:** `closable={false}` プロップで isPending 中の Esc を無効化
- **ADR-005:** Portal target は `document.body` 固定
- **ADR-006:** AccountDeleteForm はスコープ外
- **ADR-007:** MergeTagDialog のローカル定数のうち Dialog 内部に集約されるものだけ削除（フォーム部品は触らない）
- **ADR-008:** Dialog は panel スタイル（`dialog`）も内包し、`aria-modal="true"` は内部で固定付与
- **ADR-009:** focus 復帰先のフォールバックなし（ブラウザのデフォルト挙動に委ねる）
- **ADR-010:** `Dialog` / `DialogInner` の 2 階層構造で hooks 順序と cleanup を保証

## リスクと注意点

- **SSR/RSC 互換性:** `"use client"` 配下でも TanStack Start は SSR パスを通る。`DialogInner` 内で `useState(false)` の `mounted` フラグを使い、初回サーバーレンダリングでは `null` を返すことで `document` 参照を回避する
- **z-index の競合:** 既存 `dialogBackdrop` は `z-[100]`。Portal 化で親スタッキングコンテキストから外れるが、安定方向に変わる。`InternalLinkSuggestPopup` の `z-[200]` とは順序維持
- **focus restoration:** トリガー要素が close 後に unmount されている可能性（BulkExport の `router.navigate`、Confirm 後の行削除など）。`previousActive instanceof HTMLElement && previousActive.isConnected` でガード。両方 false なら何もしない（ブラウザのデフォルト = body）
- **`isPending` 中の Esc 抑制:** `closable={!isPending}` で各 callsite が安全弁を渡す。実装漏れがあると進行中のフォーム送信を中断するリスク。ConfirmDialog の 8 callsite については上記ステップ 7 で確認
- **focusable 要素ゼロ問題:** `disabled` で全要素が外れた瞬間に focus chain が空になる。panel 自体に `tabindex="-1"` を付けて fallback
- **MergeTag の shadow 差分:** Dialog 内部の panel は `shadow-lg`（`note/styles.ts` の `dialog`）。これまでの MergeTagDialog ローカル定数 `shadow-[0_16px_32px_rgba(0,0,0,0.15)]` から `shadow-lg` に変わる。ビジュアル差分はレビュー対象 / PR 説明にスクショ添付
- **BulkExportDialog の navigate 後 focus 復帰:** submit 成功で `onClose()` → `router.navigate("/exports/$jobId")` の流れ。trigger 要素は新ページの DOM 上に存在しないため focus 復帰は no-op になる（テスト時の例外扱い）
- **HTMLElement 型ナローイング:** `document.activeElement` は `Element | null`。`focus()` 呼び出し前に `instanceof HTMLElement` でガードしないと typecheck エラー
- **StrictMode 下の二重保存:** `previousActive` を保存する effect が StrictMode で 2 回走ると、2 回目の保存値が panel 内側になり focus restoration が壊れる。`if (panelRef.current?.contains(activeEl)) return;` ガードを入れる（StrictMode 未導入だが防御的に）

## テスト方針

### 自動

- `pnpm typecheck`
- `pnpm lint:fix && pnpm format:check`
- `pnpm test`（既存テストの回帰を確認）

### 手動（testing.md 参照）

- 6 ダイアログそれぞれを開いて以下を確認:
  - Esc で閉じる（isPending 中は除く）
  - Tab/Shift+Tab がダイアログ内を循環
  - 開時に最初のフォーカス可能要素（または alertdialog は panel）にフォーカス
  - 閉時に元のトリガー要素へフォーカス復帰（BulkExport は navigate のため例外）
  - DevTools で `<body>` 直下に Portal されていること
  - 進行中（isPending）に Esc を押しても閉じない
  - MergeTagDialog の shadow が他ダイアログと揃う
  - 既存の送信動作が回帰しない

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | × | × |
| 取り込んだ点 | 全体構成・focusable セレクタ・スクロールロック・リスク分析 | `closable={false}` プロップ・isPending 安全弁・SSR mounted フラグ・Dialog が panel スタイルも内包する API 設計 | YAGNI 適用（フック分離せず単一 Dialog）・MergeTag ローカル定数撤去をスコープ内に含める判断 |

## レビュー反映

### 修正した点

- **P-001（要件カバレッジ視点）:** `aria-modal="true"` の付与責務を Dialog 内部固定に明記（実装ステップ 1）
- **P-002（要件カバレッジ視点）:** `open === false` 時の hooks 順序問題を `Dialog` / `DialogInner` の 2 階層分離で解消（実装ステップ 1、ADR-010）
- **P-001（実現可能性視点）:** `"use client"` でも SSR パスは通る前提に修正。`mounted` フラグで SSR ガード（実装ステップ 1、リスク欄）
- **P-002（実現可能性視点）:** `tag/MergeTagDialog.tsx` から `note/styles.ts` への新規 cross-domain import を回避（panel スタイルを Dialog 内部に集約。MergeTagDialog はインラインで書く）（実装ステップ 5、ADR-008）
- **P-003（両視点）:** ADR-007 を縮退。Dialog 内部に集約される定数だけ削除、フォーム部品（`FIELD_INPUT` 等）は触らない（実装ステップ 5、ADR-007）
- **P-004（実現可能性視点）:** StrictMode 下の previousActive 二重保存ガード追加（リスク欄）

### 取り込んだ改善提案

- **S-001（要件カバレッジ視点）:** `aria-modal` のみで AT 隔離は十分、`inert` / 兄弟 `aria-hidden` 操作はスコープ外と ADR-006 / 「含まれないもの」に明記
- **S-002（要件カバレッジ視点）:** alertdialog は panel にフォーカス（destructive 確認の WAI ベストプラクティス）として実装ステップ 1 に反映
- **S-003（要件カバレッジ視点）:** focus 復帰先のフォールバックなしを ADR-009 として明示
- **S-004（要件カバレッジ視点）:** BulkExport の navigate 例外を testing.md チェック項目に注釈
- **S-001（実現可能性視点）:** Dialog が panel スタイルも内包（実装ステップ 1、ADR-008）
- **S-005（実現可能性視点）:** HTMLElement 型ナローイング必須をリスク欄に明記
- **S-006（実現可能性視点）:** ConfirmDialog 8 callsite の isPending 確認を実装ステップ 7 に追加

### 見送った提案とその理由

- **S-002（実現可能性視点、ADR-004 表現修正）:** ADR-004 の「callsite が明示」の表現は plan.md 文脈で「XxxDialog の各実装が `closable={!isPending}` を渡す」意味で十分明確。本文も「各 callsite」を「各 XxxDialog 内部」と読める文脈で記述済み
- **S-003（実現可能性視点、スクロールロック参照カウント）:** 現状単一ダイアログ前提で十分。コードコメントに「単一ダイアログ同時表示前提」と残すのみで対応（実装ステップ 1）

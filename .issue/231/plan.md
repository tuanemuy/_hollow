# 実装計画 — Issue #231: アクションボタン群にアイコンを導入する（アイコンライブラリ選定 + 主要画面への適用）

**Issue:** #231
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

UI がほぼテキストのみのボタンで構成されている現状を解消し、`spec/design/index.md` §7 で既に「線画・1.5px ストローク・16/20/24px・currentColor」と規定されているアイコン運用を実装に追いつかせる。具体的には ①`lucide-react` を依存追加し、②主要アクションボタン群と既存のハンドコード SVG/`mask-image` をアイコン化し、③`app/components/common/Icon.tsx` の薄いラッパーで a11y とサイズの規約を強制し、④`spec/design/index.md` §7 を拡張して「いつアイコンを使うか／使わないか」のガイドラインを追記する。関連 Issue #217（検索アイコン豆腐）の真因（`Header.tsx` の `mask-image` 方式）も本 Issue 内で同時解消する。

## スコープ

### 含まれるもの
- `lucide-react` の依存追加
- `app/components/common/Icon.tsx` ラッパー新設（薄い層、a11y / size 強制）
- 既存ハンドコード SVG/`mask-image` の置換:
  - `app/components/layout/Header.tsx` + `app/components/layout/styles.ts` の `SEARCH_BOX_ICON`
  - `app/components/public/PublicLayout.tsx` の `SearchIcon`（およびその参照箇所: `public/styles.ts`, `ErrorPage.tsx`, `PublicSearch.tsx`, `UserPublicTop.tsx`）
- 主要アクションへのアイコン付与:
  - ヘッダー: 「新規作成」「アップロード」（アバターは画像/イニシャル維持。なお Issue 本文「ヘッダーのナビゲーション（検索、アップロード、**設定**、ユーザー）」のうち「設定」ボタンは現状 `Header.tsx` に存在しないためスコープ外）
  - ノート一覧ツールバー（`NoteListToolbar.tsx`）: 「ビューとして保存」「新規作成」「アップロード」
  - ノート一覧一括操作（`BulkActionBar.tsx`）: 「移動」「公開設定」「エクスポート」「ゴミ箱へ」「選択解除」
  - 取り込みキュー: 「ノートとして保存」「再生成」「破棄」「ノートを開く」
  - ノート詳細アクション: 「編集」「公開設定（=共有①）」「移動」「URL コピー（=共有②）」「複製」「エクスポート」「履歴」「削除」
  - トラッシュ行: 「復元」「完全削除」
  - 確認ダイアログ: タイトル左にアイキャッチ
  - 空状態のアイキャッチ: アップロードキュー空 / トラッシュ空 / タグ空（`EMPTY_STATE` を使う3箇所）
  - 管理画面: `SECTION_HEADER_CLASS` 配下のすべての見出し（`app/components/admin/Jobs/index.tsx` の 4 箇所）
- `spec/design/index.md` §7 を拡張して運用ガイドライン追記（単一情報源を維持）
- `Icon` ラッパーの単体テスト

### 含まれないもの
- Landing / Auth 系のハンドコード SVG（装飾アイコン 30+ 箇所） — 本 Issue は「アクションボタン群」「主要画面」の名指しスコープ
- サイドバー全体のアイコン化（spec ではアイコン付きだが量が多く、別 Issue が適切）
- Tiptap エディタツールバー（既製 UI に依存）
- 機械的 Lint 強制（Biome 未サポート、ESLint 追加は依存増のため見送り。`Icon` ラッパー型 + テスト + レビューガイドの三層で担保）

## Issue 用語の対応

Issue 本文の「ノート一覧／詳細のアクション（編集、ゴミ箱、共有、エクスポート）」は実装上の以下に対応する:

| Issue の用語 | 実装上の対応 |
|------|------|
| 一覧の「編集」 | 一括選択モードでは個別「編集」アクションは存在しない（個別行クリックで詳細遷移）。一括操作で「移動 / 公開設定 / エクスポート / ゴミ箱へ」を扱う |
| 一覧の「ゴミ箱」 | `BulkActionBar.tsx` の「ゴミ箱へ」 |
| 一覧の「共有」 | `BulkActionBar.tsx` の「公開設定」（公開範囲を変えること = 共有方法の制御） |
| 一覧の「エクスポート」 | `BulkActionBar.tsx` の「エクスポート」 |
| 詳細の「編集」 | `NoteActions.tsx` の「編集」 |
| 詳細の「ゴミ箱」 | `NoteActions.tsx` の「削除」（ゴミ箱へ移動） |
| 詳細の「共有」 | `NoteActions.tsx` の「公開設定」（公開範囲）+ 「URL コピー」（共有 URL の取得）の 2 アクションに分割 |
| 詳細の「エクスポート」 | `NoteActions.tsx` の「エクスポート」 |

## ライブラリ選定

| 候補 | バンドル | tree-shake | カバレッジ | React 19 / RSC | 備考 |
|------|----------|------------|------------|----------------|------|
| **lucide-react** | 個別 1〜3KB/個 | ◎ ESM 個別エクスポート | 1500+ | ◎ 純粋関数コンポーネント | spec/design §7 と完全一致（線画 1.5px ストローク） |
| @radix-ui/react-icons | 同等 | ○ | 300+ | ○ | Radix 未採用なので相性メリットなし |
| Heroicons | やや重い | ○ | 300+ | ○ | 線が太め、トーン不一致 |

**推奨: `lucide-react`** — ① spec/design §7 が Lucide を明示的に許可、②HTML プロトタイプの SVG 形状（24 viewBox / stroke 1.5px）と一致、③個別 import で tree-shake 効く、④React 19 / RSC 互換（pure functional component）。

## 実装ステップ

### 1. `lucide-react` を依存に追加
- **対象ファイル:** `package.json`
- **変更内容:** `pnpm add lucide-react` を実行し dependencies に追加
- **理由:** 完了条件①

### 2. `Icon` ラッパー新設
- **対象ファイル:** `app/components/common/Icon.tsx`（新規）
- **変更内容:**
  ```ts
  import type { LucideIcon } from "lucide-react";

  type IconSize = 16 | 20 | 24;
  type IconProps = {
    icon: LucideIcon;
    size?: IconSize;       // default 16
    label?: string;        // 指定時: role="img" + aria-label / 未指定: aria-hidden
    className?: string;    // text-* で色を継承する用途のみを想定（width/height の上書きはしないこと）
  };
  ```
  `strokeWidth={1.5}` をデフォルト固定。`size` を `width`/`height` の両方に伝搬。`label` 有無で aria 属性を自動切替（装飾アイコンの `aria-hidden` 漏れを構造的に防止）。
  JSDoc に「`Icon` を `<button>` の唯一の子にする場合、`label` ではなく `<button>` 側に `aria-label` を付ける（accessible name の二重指定を避ける）」と明記。
- **理由:** §7 の「サイズ 16/20/24・currentColor・線画 1.5px」と §8 の `aria-hidden`/`aria-label` を一元強制。

### 3. `Icon` ラッパーの単体テスト
- **対象ファイル:** `app/components/common/__tests__/Icon.test.tsx`（新規）
- **変更内容:** label 未指定 → `aria-hidden="true"` 付与、label 指定 → `role="img" aria-label={label}` 付与、size の各値（16/20/24）で `width`/`height` 属性が正しく設定されることを検証
- **理由:** ADR-003 第二防衛線

### 4. `Header.tsx` の検索アイコン置換（#217 真因解消）
- **対象ファイル:** `app/components/layout/Header.tsx`, `app/components/layout/styles.ts`
- **変更内容:**
  - `SEARCH_BOX_ICON` 定数は wrapper-only クラス文字列に置き換える（同名のまま中身だけ差し替え。`mask-image` 関連の utility は全削除）: `"absolute left-[11px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none"`（元 `left-[13px]` + 14px 幅 = 右端 27px。size=16 にするため left を 11px に詰めて右端 27px を維持し、`SEARCH_BOX_INPUT` の `pl-[38px]` 余白 11px を保つ）
  - `Header.tsx` 内で input 横に `<Icon icon={Search} size={16} className={SEARCH_BOX_ICON} />` を置く（従来の `<span className={SEARCH_BOX_ICON} aria-hidden />` から JSX 要素自体を入れ替え）
- **理由:** 完了条件②、#217 の検索アイコン豆腐（CSP/URL エンコーディング起因）を同時解消。視覚バランスは右端アライメントで一致を維持。

### 5. `PublicLayout.tsx` の `SearchIcon` 置換
- **対象ファイル:** `app/components/public/PublicLayout.tsx`, `app/components/public/styles.ts`, `app/components/public/ErrorPage.tsx`, `app/components/public/PublicSearch.tsx`, `app/components/public/UserPublicTop.tsx`
- **変更内容:**
  - ハンドコード `SearchIcon` を完全削除（re-export を含む）
  - `SEARCH_ICON` の wrapper クラス（現状 `absolute left-[13px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none`）は流用するが、`left` を `left-[11px]` に詰める（現状は size=16 + left-13 で右ギャップ 9px。これを Header と統一すべく right ギャップ 11px に揃える軽微な視覚調整、DevTools で確認）
  - `USER_SEARCH_INPUT` (`pl-10`) + `USER_SEARCH_ICON` (`left-3.5`) の組は実装時に size=16/20 のいずれかを選択し視覚調整（DevTools で確認）
  - import 全箇所を `<Icon icon={Search} size={16} className={...} />` に更新
- **理由:** Issue 名指しの置換対象。Header.tsx と right ギャップを 11px に揃えて一貫性向上。

### 6. ヘッダーのアクションにアイコン付与
- **対象ファイル:** `app/components/layout/Header.tsx`, `app/components/ingestion/UploadButton.tsx`
- **変更内容:** 「新規作成」→ `<Icon icon={Plus} />` + テキスト、「アップロード」（`UploadButton`）→ `<Icon icon={Upload} />` + テキスト。アバターはそのまま。`PILL_BTN` は既に `gap-1.5` を持つので追加 CSS 不要。
- **副次効果（重要）:** `NoteListToolbar.tsx` も同じ `pillBtn`/`pillBtnPrimary` + `UploadButton` を使うため、Step 7 の対象でもある。Step 7 と一緒に確認すること。
- **理由:** 完了条件②

### 7. ノート一覧ツールバーのアクションにアイコン付与
- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:** 「ビューとして保存」→ `<Icon icon={Bookmark} />`、「新規作成」→ `<Icon icon={Plus} />`（Step 6 と同じアイコン）、「アップロード」は `UploadButton` 経由（Step 6 で吸収）。
- **理由:** 完了条件②、Issue「ノート一覧／詳細のアクション」のうち一覧ツールバー側

### 8. ノート一覧の一括操作にアイコン付与
- **対象ファイル:** `app/components/note/list/BulkActionBar.tsx`
- **変更内容:** 「移動」→ `<Icon icon={FolderInput} />`、「公開設定」→ `<Icon icon={Globe} />`、「エクスポート」→ `<Icon icon={Download} />`、「ゴミ箱へ」→ `<Icon icon={Trash2} />`、「選択解除」→ `<Icon icon={X} />`
- **理由:** 完了条件②、Issue「ノート一覧／詳細のアクション（編集・ゴミ箱・共有・エクスポート）」の一覧側

### 9. 取り込みキューのアクションにアイコン付与
- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** 「ノートとして保存」→ `<Icon icon={Check} />`、「再生成」→ `<Icon icon={RefreshCw} />`、「破棄」→ `<Icon icon={Trash2} />`、「ノートを開く」→ `<Icon icon={ArrowRight} />`。すべて icon + text。
- **理由:** 完了条件②

### 10. ノート詳細アクションにアイコン付与
- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`, `app/components/note/detail/UrlCopyButton.tsx`
- **変更内容:** 「編集」`<Pencil />` / 「公開設定」`<Globe />`（=共有①）/ 「移動」`<FolderInput />` / 「URL コピー」`<Link2 />`（=共有②、コピー成功時のアイコン切替は本スコープでは行わず別 Issue 候補） / 「複製」`<Copy />` / 「エクスポート」`<Download />` / 「履歴」`<History />` / 「削除」`<Trash2 />`
- **理由:** 完了条件②、Issue の「共有」は実装上「公開設定」「URL コピー」の 2 つに分割

### 11. トラッシュ行アクションにアイコン付与
- **対象ファイル:** `app/components/trash/TrashRowActions.tsx`
- **変更内容:** 「復元」→ `<Icon icon={RotateCcw} />`、「完全削除」→ `<Icon icon={Trash2} />`
- **理由:** 完了条件②

### 12. 確認ダイアログのアイキャッチ
- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`
- **変更内容:** タイトル `<h2 id={titleId}>` の左に `<Icon icon={AlertTriangle} size={20} />` を `label` 未指定（= `aria-hidden`）で配置。タイトル領域を `flex items-center gap-2` で包む。`alertdialog` の `aria-labelledby={titleId}` 整合は維持される（装飾アイコンは accessible name に混入しない）。
- **理由:** 完了条件②、Issue 提案③「確認ダイアログのアイキャッチ」

### 13. 空状態のアイキャッチ
- **対象ファイル:** `app/components/ingestion/UploadPage.tsx`, `app/components/trash/TrashList.tsx`, `app/components/tag/TagManager.tsx`
- **変更内容:** 各空状態テキストの上に 24px アイコンを 1 個 `label` 未指定（= `aria-hidden`）で配置。`<Inbox />`（アップロード）/ `<Trash2 />`（ゴミ箱）/ `<Hash />`（タグ）。アイコンは `<Icon icon={...} size={24} className="mx-auto mb-3 text-ink-tertiary" />` の形で配置し（`size={24}` を明示）、`EMPTY_STATE` のクラス文字列は変えない（他の利用者へ影響させない）。
- **補足:** 実装時に `grep -rn "EMPTY_STATE\|emptyState" app/components` で他に `EMPTY_STATE` を使っていない空状態（検索結果0件など）が存在しないか念のため確認する。本 Issue では「Issue 提案③で名指しされた空状態 = `EMPTY_STATE` を使う 3 箇所」を対象とする。
- **理由:** 完了条件②、Issue 提案③「空状態のアイキャッチ」

### 14. 管理画面のセクションヘッダ
- **対象ファイル:** `app/components/admin/Jobs/index.tsx`（`SECTION_HEADER_CLASS` の利用 4 箇所すべて）
- **変更内容:** 各セクションヘッダの見出しテキスト左に 16px アイコンを追加（例: 「未完了ジョブ」→ `<Clock />`、「最近の失敗」→ `<AlertCircle />` 等、見出しに対応するもの）。実装時に `grep -rn SECTION_HEADER_CLASS app/components/admin` で他の利用者がいないか再確認する（現状は `Jobs/index.tsx` 1ファイル 4 箇所のみ）。
- **理由:** 完了条件②

### 15. デザインガイドラインに追記
- **対象ファイル:** `spec/design/index.md`
- **変更内容:** §7 を拡張する（§12 等の新セクションは作らず、単一情報源を維持）。追加する内容:
  - **使う場面:** 主要アクションボタン（ヘッダーのナビ・一覧ツールバー・一括操作・行/詳細のアクション・確認ダイアログ・空状態）
  - **使わない場面:** 本文・チップ内部・サイドバーセクションタイトル・絵文字代替の単なる装飾
  - **a11y 契約:** 「アイコン+テキストボタン」のとき装飾アイコン → `aria-hidden`（`Icon.label` 未指定）／「アイコンのみボタン」 → `<button>` 側に `aria-label` 必須・`Icon` 側は装飾扱い（`label` 未指定）。`Icon` を `<button>` の唯一の子にして `Icon.label` を渡すと accessible name が二重になるため避ける。
  - **サイズの選び方:** 16 = テキスト併用 / インライン、20 = アイコンのみボタン / 確認ダイアログのアイキャッチ、24 = 空状態のアイキャッチ
  - **配色:** `currentColor` のみ（親の `text-*` トークンに従う）
  - **使用ライブラリ:** `lucide-react` を `Icon` ラッパー経由で使用。生 lucide コンポーネントの import や `import * as` 形式の barrel import は禁止
- **理由:** 完了条件④、§7 単一情報源の維持

### 16. 既存テスト・型・lint 通過の確認
- **対象ファイル:** 影響範囲のテスト全般
- **変更内容:**
  - `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` を緑にする
  - 事前に `grep -rn "getByText.*\(ノート\|削除\|編集\|エクスポート\|アップロード\|ビューとして保存\|新規作成\|公開設定\|移動\|複製\|履歴\|URL\|破棄\|再生成\|ノートとして保存\|復元\|完全削除\)" app/components` で文字列依存のテストを洗い出し、必要なら `getByRole('button', { name: ... })` 形式に追従。e2e/snapshot は本 Issue では対象外（unit/typecheck/lint のみ）
- **理由:** 既存品質ゲート

## 設計判断

- **Icon ラッパーは薄く** — ADR-002 を参照。
- **aria-label 必須化** — ADR-003 を参照（型 + テスト + ガイドラインの三層）。
- **「主要アクション」の絞り込み基準** — Issue 完了条件本文の列挙画面 + 既にハンドコード SVG/`mask-image` がある箇所 + `spec/design/pages/*.html` でアイコン付きとして設計されている動線。Landing/Auth/サイドバー全面/Tiptap ツールバーは別 Issue。
- **`Icon` 経由を強制する手段** — レビューガイド + spec/design 明文化で運用担保（機械的 Lint なし、ADR-003）。

## リスクと注意点

- **バンドルサイズ** — lucide-react は個別 import で tree-shake が効く（1〜3KB/個・gzip 前）。barrel import (`import * as Icons`) は禁止し、レビューで担保。
- **a11y 漏れ** — `Icon` ラッパー型で装飾アイコンの `aria-hidden` 漏れは防止可能。「アイコンのみボタン」の `aria-label` 漏れはレビュー観点（今回スコープでは「アイコンのみボタン」は存在せず、すべて icon+text）。
- **SSR / RSC 互換** — lucide-react v0.x は React 19 対応済み、純粋関数コンポーネントのため `"use client"` 不要。
- **CLS** — `width`/`height` を size 値で明示するためレイアウトずれは発生しない。`className` 経由での `w-*`/`h-*` 上書きは禁止（`Icon` JSDoc に明記）。
- **検索アイコン位置調整** — Step 4/5 で size 14→16 になるため、wrapper の `left-[13px]` を `left-[11px]` に詰めて右端アライメントを維持（input の `pl-[38px]` 余白 11px と整合）。
- **既存テストの影響** — ボタンを文字列で `getByText` しているテストは事前 grep で洗い出す。`getByRole('button', { name: ... })` 形式なら影響なし。
- **#217 との関係** — Step 4 で `Header.tsx` の `mask-image` 撤去により #217 (1) の検索アイコン豆腐は同時解消。ただし #217 は他にも独立した小修正項目（(2)〜(4)）を含むため、PR 本文では `Closes #217` ではなく `Refs #217` に留める。

## テスト方針

- **自動テスト**
  - `pnpm typecheck` — `Icon` ラッパーの `size` リテラル型で誤用検出
  - `pnpm lint:fix && pnpm format` — Biome 通過
  - `pnpm test:unit` — 既存テスト維持 + `Icon` ラッパー単体テスト追加
- **動作確認（testing.md 参照）**
  - ヘッダー検索アイコンが虫眼鏡として描画される（#217 解消）
  - 一覧ツールバー・一括操作・取り込みキュー・ノート詳細・トラッシュの各アクションで icon+text が視認できる
  - 確認ダイアログのアイキャッチが `alertdialog` accessible name に混入しない（DevTools Accessibility ツリーで確認）
  - 空状態（アップロード/トラッシュ/タグ）でアイコンが表示される

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点 P-001, P-002）:**
- 「ノート一覧」のスコープ漏れを修正。Step 7（`NoteListToolbar.tsx`）と Step 8（`BulkActionBar.tsx`）を追加。「含まれるもの」にも追記。
- 「共有」の解釈を「Issue 用語の対応」表に明記。一覧側 = 公開設定、詳細側 = 公開設定 + URL コピーの 2 つに分割。

**修正した点（アーキ・リスク視点 P-001, P-002, P-003）:**
- ADR-003 の「型レベル」担保表現を「装飾アイコンの `aria-hidden` 漏れ防止のみに限定」に修正（adr.md 側で対応）。
- Step 4/5 の検索アイコン padding 整合性を明記: size 14→16 になるため wrapper の `left-[13px]` を `left-[11px]` に詰めて `pl-[38px]` 余白 11px を維持。
- Step 15 の追記場所を「§7 拡張のみ」に確定（§12 新設の二択を排除、単一情報源を維持）。

**取り込んだ改善提案:**
- S-001（要件）/ 副次効果として `NoteListToolbar.tsx` を Step 7 に独立化し、Step 6 から参照を張った。
- S-002（要件）/ Step 14 で `grep -rn SECTION_HEADER_CLASS app/components/admin` を実装時に再確認する旨を明記。
- S-003（要件）/ Step 16 にテスト追従用 grep コマンドを具体的に書き出し。
- S-004（要件）/ #217 を `Closes` ではなく `Refs` に留める旨を「リスクと注意点」に明記。
- S-001（アーキ）/ `Icon` ラッパー JSDoc に「`className` は色継承のみで `width`/`height` 上書き禁止」を明記。
- S-002（アーキ）/ Step 13 で `<Icon ... className="mx-auto mb-3 text-ink-tertiary" />` の具体形を明記。`EMPTY_STATE` クラス文字列は触らない方針を維持。
- S-003（アーキ）/ Step 16 で「e2e/snapshot は本 Issue では対象外」を明示。
- S-006（アーキ）/ Step 10 で UrlCopyButton のコピー成功時のアイコン切替は「本スコープ外、別 Issue 候補」と明記。

**見送った改善提案:**
- S-004（アーキ）/ `biome.json` の `noRestrictedImports` で barrel import を機械的に禁止: ADR-003 の方針（依存・設定の追加を避け、レビュー + 文書化で担保）と整合させるため見送り。Biome の対応ルール調査と CI 影響評価が必要で、本 Issue スコープを膨らませる。将来 lucide の barrel import 事故が発生したら別 Issue で導入検討。
- S-005（アーキ）/ ADR-003 の Lint 導入再検討トリガーを具体化: 現時点で抽象度を保ち、運用の中で実態に応じて判断する方針。本 Issue では未来の Issue 化基準まで決め込まない。

### 2周目

**両視点とも問題点ゼロ／APPROVED で終了。**

**取り込んだ改善提案:**
- S-001（要件）/ 「設定」ボタンが現状ヘッダーに存在しないためスコープ外であることをスコープ説明に1行明記。
- S-002（要件）/ Step 13 に `grep -rn "EMPTY_STATE\|emptyState" app/components` で他の空状態が存在しないか確認する旨を補足追記。
- S-001（アーキ）/ Step 5 の表現を「維持」から「Header と right ギャップ 11px に揃える軽微な視覚調整」に修正し、実装者の判断を正確化。
- S-002（アーキ）/ Step 4 で `SEARCH_BOX_ICON` 定数を「同名のまま中身を wrapper-only に置き換える」「`<span>` から JSX 要素自体を入れ替える」と明示。
- S-003（アーキ）/ Step 13 で `size={24}` を `<Icon ... size={24} ... />` の具体形に明記し、デフォルト 16 にフォールバックしないよう担保。

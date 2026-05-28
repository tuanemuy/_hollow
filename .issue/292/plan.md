# 実装計画 — Issue #292: ボタンの「テキストのみ／アイコンのみ／アイコン+ラベル」使い分けガイドラインを spec に追加

**Issue:** #292
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

`spec/design/index.md` §7.1 に「ボタン形態の使い分け」サブセクションを追加して3形態（アイコン+ラベル／テキストのみ／アイコンのみ）の判断基準と a11y 要件を SSOT 化する。あわせて棚卸しで判明した既存実装のガイドライン違反箇所を同一PRで修正する。

## スコープ

### 含まれるもの

- `spec/design/index.md` §7.1 末尾への「ボタン形態の使い分け」サブセクション追加
- 棚卸しで違反と判定された以下の実装修正:
  - `app/components/common/ConfirmDialog.tsx` に `confirmIcon` prop 追加 + 既存呼び出し側全箇所へのアイコン指定
  - `app/components/admin/Jobs/index.tsx` の「再実行」「再構築を実行」へのアイコン付与
  - `app/components/trash/TrashList.tsx` 空状態 CTA「すべてのノートに戻る」へのアイコン付与
  - `app/components/note/detail/NoteActions.tsx` trashed 分岐の「ゴミ箱を開く」へのアイコン付与
  - `app/components/common/styles.ts` `dialogCloseButton` のモバイル時 44×44px タップ領域確保
- 上記変更の動作確認（視覚的一貫性、aria-label、44pxタップ領域）

### 含まれないもの

- 公開側 `EMPTY_LIST` のアイキャッチ追加（**#284 の責務**）
- `TagActions` のアイコン+ラベル化（**スコープ外、別Issue化候補としてplan末尾に記録**）
- WysiwygEditor / Tiptap ツールバーのアイコン化（#231 でスコープ外と判断済み）
- サイドバー、Landing / Auth ページのハンドコード SVG の `Icon` ラッパー移行（同上）
- `auth/styles.ts` `REVEAL_BTN` 周辺（auth系は #231 / #292 の対象に含まれていない）

## 実装ステップ

### 1. `spec/design/index.md` §7.1 への「ボタン形態の使い分け」サブセクション追加

- **対象ファイル:** `spec/design/index.md`
- **変更内容:** §7.1「アイコン運用ガイドライン」の末尾（「className の使い方」の後）に新規サブヘッダ「ボタン形態の使い分け」を追加。3形態それぞれの「使う場面 / 使わない場面 / a11y 要件」を箇条書きで明文化する。
- **必須要素（Issue本文との対応を漏らさない順序で列挙）:**
  1. アイコン+ラベル（既定）の説明と例
  2. テキストのみの説明と例（タブ／セグメント／トグルグループ、フィルタチップ、リンク的ボタン）
  3. アイコンのみの 4 つの必須要件（`aria-label` / `title` / 同種ボタン非並置 / 44×44px）
  4. **同一ツールバー / アクション群内では形態を揃える**（混在禁止）
     - 直後の同じ箇条書き内で **2つの例外** を明示する:
       - (a) **タブ／セグメント／トグルグループは選択 UI として混在ルールの対象外**（`DisplayModeSwitch` のような切替系。ADR-002）
       - (b) **密度差を出したい場合は primary をアイコン+ラベル / secondary をテキストのみで揃える**（アイコンのみは混ぜない。Issue本文の「同一ツールバー」項末尾の例外ルール）
  5. 空状態 CTA はアイコン+ラベル
  6. **公開側 `EMPTY_LIST` の空状態アイキャッチは #284 範囲外**（既存 §7.1 本文に「(#231 の初期スコープ外)」と書かれているため、新サブセクションでは「§7.1 本文の通り」と参照に留めて重複させない。S-003 対応）
  7. **チップ内付属の close ボタンは親 chip のタップ領域と一体扱い**（FilterBar の "×" を許容するための注釈）
  8. **管理画面（admin）の小型行アクション (`h-7` / `BTN_SM_CLASS`) は情報密度優先でデスクトップ前提**（モバイル想定外として §3 44px 要件の例外を明記。ADR-005）
- **理由:** Issue 本文「完了条件」の最重要項目。SSOT を spec に置くことでレビュー基準を統一する。

### 2. `app/components/common/ConfirmDialog.tsx` に `confirmIcon` prop を追加

- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`
- **変更内容:** optional な `confirmIcon?: LucideIcon` prop を追加し、指定時は confirm ボタンのテキスト前に `<Icon icon={confirmIcon} />` を挿入（`size` 指定なし＝デフォルト 16。spec「アイコン+テキスト併用は `size={16}`」と整合）。`Icon` の `className` は不要（`size` SSOT は prop）。
- **pending 中の挙動:** `confirmIcon` は pending（`isPending`）中も維持する（`confirmLabel` だけが「リセット中...」のように差し替わる）。形態の一貫性を優先（S-004 対応）。
- **キャンセル:** 現状維持（テキストのみ）。複数ダイアログで共通の secondary 動作。Issue本文「同一ツールバー」項末尾の例外ルール (b)「primary をアイコン+ラベル / secondary をテキストのみ」と整合。
- **理由:** Issue 本文「確認ダイアログのアクション = アイコン+ラベル」を満たす。prop 化で型安全（`LucideIcon` で強制）かつ `Icon` ラッパー経由のサイズ統一を維持。

### 3. ConfirmDialog 呼び出し側に `confirmIcon` を渡す（全10箇所）

`grep -rln '<ConfirmDialog' app/components/` で抽出した全 JSX 呼び出し箇所と採用アイコン（2周目レビュー P-001/P-002 で訂正済み — `AccountDeleteForm` は `ConfirmDialog` を使わず独自確認 UI のため除外、`NoteActions` は実在する1箇所のみ）:

| ファイル | アクション (`confirmLabel`) | 採用アイコン | 備考 |
|---|---|---|---|
| `app/components/note/list/BulkActionBar.tsx` | 一括ゴミ箱移動 | `Trash2` | 既存 import 利用 |
| `app/components/trash/TrashRowActions.tsx` | 「完全削除」 | `Trash2` | 既存 import 利用 |
| `app/components/note/detail/NoteActions.tsx` | 「ゴミ箱へ」 | `Trash2` | 既存 import 利用 |
| `app/components/note/history/NoteRevisionRestorePanel.tsx` | 「復元する」 | `RotateCcw` | 新規 import |
| `app/components/ingestion/IngestionJobRow.tsx` | 「破棄」 | `Trash2` | 既存 import 利用 |
| `app/components/ingestion/IngestionPreviewForm.tsx` | 「破棄」 | `Trash2` | 新規 import |
| `app/components/admin/PromptsForm/index.tsx` | 「リセット」 | `RotateCcw` | 新規 import |
| `app/components/admin/DesignTokensForm/index.tsx` | 「リセット」 | `RotateCcw` | 新規 import |
| `app/components/view/SavedViewsList/index.tsx` | 「削除」 | `Trash2` | 既存 import 利用 |
| `app/components/tag/TagActions.tsx` | 「削除」 | `Trash2` | 既存 import 利用（**ADR-004 注意**: TagActions の行アクションボタン全体の icon+label 化はスコープ外。ただし `ConfirmDialog` の `confirmIcon` 付与は本Step3の一括対応に含める＝ガイドライン違反の確認ダイアログ側だけは整合させる。P-003 対応）|

- **変更内容:** 上記表の通り、各呼び出しに `confirmIcon={<選定アイコン>}` を追加。
- **理由:** Step 2 を実効化し、全10箇所のカバレッジを plan で固定（P-001 対応）。prop 省略時は従来通り（破壊変更なし）。
- **`AccountDeleteForm` の扱い:** 独自の inline 確認 UI（`useState` ベース、`pillBtn`/`pillBtnDanger` 等のスタイル未適用、ボタンが unstyled）であり、デザインシステム適用前の MVP 実装。「アカウントを完全に削除する」ボタンへのアイコン付与だけ単独で行ってもスタイル基底が不揃いのため不整合。**本Issueスコープ外** とし、フォローアップ候補に記録（後述）。

### 4. `app/components/admin/Jobs/index.tsx` のテキストのみボタンにアイコン付与

- **対象ファイル:** `app/components/admin/Jobs/index.tsx`
- **変更内容:**
  - `IngestionRow` / `ExportRow` の「再実行」ボタンに `<Icon icon={RefreshCw} />` を挿入（`size` はデフォルト 16 のまま省略 — S-002）
  - 「再構築を実行」ボタン（`SearchIndexSection`）にも同様にアイコン挿入
  - `lucide-react` import に `RefreshCw` を追加
- **理由:** 周辺ボタンや行アクション群がアイコン+ラベルで揃っており、現状の混在がガイドライン違反となる。

### 5. `app/components/trash/TrashList.tsx` 空状態 CTA にアイコン付与

- **対象ファイル:** `app/components/trash/TrashList.tsx`
- **変更内容:** 「すべてのノートに戻る」リンクに `<Icon icon={ArrowLeft} />` を挿入。`lucide-react` から `ArrowLeft` を import。
- **理由:** spec「空状態 CTA はアイコン+ラベル」に整合。

### 6. `app/components/note/detail/NoteActions.tsx` trashed 分岐の修正

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:** "trashed" 状態で表示される「ゴミ箱を開く」リンクに `<Icon icon={Trash2} />` を挿入（`Trash2` の import 状況を実装時に確認、未importなら追加）。
- **理由:** 単独表示でも primary CTA 相当。NoteActions 全体がアイコン+ラベル方針なので整合させる。

### 7. `app/components/common/styles.ts` `dialogCloseButton` のモバイル時 44px 対応

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `dialogCloseButton` 文字列に `max-sm:min-w-[44px] max-sm:min-h-[44px]` を追加。
- **挙動上の注意（P-001 訂正）:** CSS の `min-width` は `width` を上書きするため、モバイル時 (`max-width: 639px`) は **視覚サイズも 32px → 44px に拡張される**（既存パターン `ICON_BTN` と同じ挙動）。デスクトップ (`min-width: 640px` 以上) では `w-8 h-8` の 32×32px が維持される。`absolute top-3 right-3` 配置のため、モバイル時に `dialogTitle`（`pr-*` 無し）と視覚的に重なる可能性があるが、現状の各ダイアログのタイトル長では実害なし。タイトル長が増えた場合は別 Issue で対処。
- **理由:** §3「タップ領域 44×44px 確保」に整合させる。既存パターン `ICON_BTN` と同等の対応（ADR-003）。

### 8. 棚卸し時の追加チェック（実装着手前のサブステップ）

- **目的:** Issue 本文「完了条件」の「icon-only ボタンすべてに `aria-label` が付いている（修正後の状態）」のカバレッジ確認（P-002 対応）。
- **手順:** 棚卸し時に以下を実行:
  1. `grep -rn '<button' app/components/ --include='*.tsx'` で `<button>` の使用箇所を抽出
  2. アイコン子のみで構成されているもの（テキストノードや `children` にラベル文字を持たないもの）を絞り込み、各箇所で `aria-label` 属性または `aria-labelledby` の有無を目視確認
  3. 欠落があれば本 Step 内で追加修正する

### 9. lint / typecheck / format の実行

- `pnpm typecheck && pnpm lint:fix && pnpm format`

### 9.5. `testing.md` の作成（実装前または並行）

- Phase 1 完了時点で `.issue/292/testing.md` を作成する（後続 Step 10 のマニュアルテスト手順書）。
- 内容: 修正対象画面 6 種以上の確認手順、aria-label 確認、44px タップ領域確認、視覚的一貫性確認。

### 10. マニュアルテストの実行と記録

- `.issue/292/testing.md` の手順に沿って主要画面の視覚的一貫性・aria-label・44pxタップ領域を確認。スクリーンショットを `.issue/292/manual-test/` に保存。

## 設計判断

詳細は `.issue/292/adr.md` を参照:

- **ADR-001**: ConfirmDialog のアイコン指定は `confirmIcon` prop で受ける（型安全 + Icon サイズ統一）
- **ADR-002**: DisplayModeSwitch はテキストのみのまま維持（タブ／セグメント／トグルグループは混在ルールの例外として spec に明記）
- **ADR-003**: Dialog 閉じるボタンは `max-sm:min-*` で対応（モバイル時は視覚サイズも 44px に拡大される、`ICON_BTN` と同パターンで意図通り）
- **ADR-004**: TagActions の行アクションボタン全体の icon+label 化は本Issueスコープ外（ConfirmDialog の `confirmIcon` 付与のみ含める）
- **ADR-005**: 管理画面の `BTN_SM_CLASS` (`h-7`) は情報密度優先のデスクトップ前提、§3 44px 要件の例外として spec に明記

## リスクと注意点

- **混在ルールとタブ/セグメントの例外明記が必須**: spec で明確化しないと、レビュー時に `DisplayModeSwitch` がガイドライン違反と判定される。Step 1 で必ず例外を明記する。
- **ConfirmDialog のシグネチャ変更による回帰**: 既存呼び出し箇所すべてに `confirmIcon` を渡す変更が必要。漏れても破壊変更にはならないが、Step 3 の表で全11箇所カバレッジを固定済み。
- **既存テストへの影響**: `getByRole("button", { name: "..." })` ベースは accessible name が変わらないので影響なし。スナップショット系は要確認。
- **管理画面のモバイル対応**: `BTN_SM_CLASS` は `h-7` (28px) で 44px 未達。ADR-005 でデスクトップ前提の例外とする方針を確定。

## 棚卸し結果（既存実装の判定一覧）

| 該当ファイル | 現状（形態と問題点） | あるべき | 対処 |
|---|---|---|---|
| `layout/Header.tsx` 新規作成 / アップロード | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `layout/Header.tsx` アバター Link | テキストのみ + `aria-label` ✓ | テキストのみ | 維持 |
| `layout/Header.tsx` 検索バー装飾アイコン | 装飾 + sr-only ラベル ✓ | — | 維持 |
| `note/list/NoteListToolbar.tsx` 各ボタン | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `note/list/NoteListToolbar.tsx` 保存ビュー select | テキストのみ + `aria-label` ✓ | テキストのみ | 維持（select は形態対象外） |
| `note/list/DisplayModeSwitch.tsx` 各タブ | テキストのみ | テキストのみ（タブ例外） | 維持 + spec 例外明記 |
| `note/list/BulkActionBar.tsx` 各ボタン | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `note/detail/NoteActions.tsx` 通常 toolbar | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `note/detail/NoteActions.tsx` trashed 分岐「ゴミ箱を開く」 | テキストのみ | アイコン+ラベル | **修正** |
| `note/detail/UrlCopyButton.tsx` | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `trash/TrashRowActions.tsx` 各ボタン | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `trash/TrashList.tsx` 空状態 CTA | テキストのみ | アイコン+ラベル | **修正** |
| `ingestion/IngestionJobRow.tsx` 各ボタン | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `ingestion/IngestionQueue.tsx` 空状態 | CTA 無し | — | 維持 |
| `admin/Jobs/index.tsx` セクション見出し | アイコン+ラベル ✓ | アイコン+ラベル | 維持 |
| `admin/Jobs/index.tsx` 「再実行」 | テキストのみ | アイコン+ラベル | **修正** |
| `admin/Jobs/index.tsx` 「再構築を実行」 | テキストのみ | アイコン+ラベル | **修正** |
| `common/ConfirmDialog.tsx` confirm ボタン | テキストのみ | アイコン+ラベル | **修正（prop化）** |
| `common/Dialog.tsx` 閉じる "×" | アイコンのみ + `aria-label` ✓ / 32×32px | アイコンのみ / 44×44px | **修正（mobile）** |
| `note/list/FilterBar.tsx` chip 解除 "×" | アイコンのみ + `aria-label` ✓ / 16×16px | チップ内付属（例外） | 維持 + spec 注釈 |
| `public/PublicLayout.tsx` サインアップ/ログイン | テキストのみ | テキストのみ | 維持 |

## フォローアップ Issue 候補（本 Issue 範囲外）

- `app/components/tag/TagActions.tsx` のアイコン+ラベル化（行アクションだが現状テキストのみ、他の行アクションと不整合）
- `app/components/identity/AccountDeleteForm/index.tsx` のデザインシステム適用（独自 inline 確認 UI が unstyled）+ 「アカウントを完全に削除する」ボタンへのアイコン付与
- `app/components/admin/UsersTable/index.tsx` の行アクション（「一時停止」「復帰」「管理者に昇格」「管理者を解除」等）の判定（管理画面情報密度を尊重した形態を確定）
- WysiwygEditor / Tiptap エディタ内ツールバーのアイコン+ラベル化
- サイドバーのフラットなテキスト+装飾のアイコンラッパー移行
- Landing / Auth ページのハンドコード SVG を `Icon` ラッパー経由に置換
- `auth/styles.ts` `REVEAL_BTN` 等 auth 系 icon-only ボタンの a11y / タップ領域監査

## テスト方針

- **自動テスト**: 既存テストの維持。`ConfirmDialog` への `confirmIcon` prop 追加は省略時動作が変わらないため既存テストで担保。
- **マニュアルテスト**: `.issue/292/testing.md` に視覚的一貫性 / aria-label / 44px タップ領域確認を記載。

## レビュー履歴

### 1周目（2026-05-29）

**両視点（要件カバレッジ / アーキ・リスク）レビュー結果から反映した修正**:

- **[P-001 / 両者]** ConfirmDialog 呼び出し全11箇所を Step 3 に表形式で列挙し、各アクションへの採用アイコンを確定（`Trash2` / `RotateCcw`）。AccountDeleteForm の追加漏れも併せて反映。
- **[P-002 / 要件]** Step 8 を新設し、棚卸し時に `<button>` の aria-label 欠落チェックを実施するサブステップを追加（Issue 完了条件「icon-only ボタンすべてに `aria-label` が付いている」のカバレッジ確保）。
- **[P-003 / 要件]** Step 1 必須要素 4 に Issue 本文「primary をアイコン+ラベル / secondary をテキストのみ」例外ルールを追加。
- **[P-001 / アーキ]** ADR-003 を訂正。`min-width` が `width` を上書きする実挙動を正しく記述（モバイル時は視覚サイズも 44px に拡大される、`ICON_BTN` と同パターン）。あわせて `dialogTitle` との視覚的重なりの許容根拠を追記。
- **[P-003 / アーキ]** ADR-004 と Step 3 の TagActions 矛盾を解消。「行アクションボタン全体はスコープ外、ConfirmDialog の `confirmIcon` 付与は本Step3に含める」と明示。

**取り込んだ改善提案**:

- **[S-001 / 要件]** ADR-002 を「タブ／セグメント／トグルグループ」と抽象化、spec 例外記述も同様の表現に。
- **[S-002 / 要件]** UsersTable / SavedViewsList / NoteRevisionRestorePanel / IngestionPreviewForm / PromptsForm / DesignTokensForm の判定を ConfirmDialog 表に明示（Step 3）。
- **[S-003 / 要件]** spec への EMPTY_LIST 範囲外記述は既存 §7.1 本文と重複させず参照に留める方針を Step 1 必須要素 6 に明記。
- **[S-004 / 要件]** ADR-005 を新設し、管理画面の `BTN_SM_CLASS` (`h-7`) を §3 44px 例外として spec に明記する方針を確定。
- **[S-001 / アーキ]** ADR-001 に「confirm ボタンは `size={16}`、AlertTriangle アイキャッチは `size={20}`」のサイズ根拠を追記。
- **[S-002 / アーキ]** plan の全 Step で `<Icon icon={...} size={16} />` 表記を `<Icon icon={...} />`（デフォルト 16）に統一。
- **[S-004 / アーキ]** ConfirmDialog の `confirmIcon` は pending 中も維持する方針を Step 2 に明記。
- **[S-005 / アーキ]** spec の例外記述の位置を「混在禁止ルールの直後の同じ箇条書き内」と Step 1 で明示。

**見送った提案**:

- なし（全提案を取り込みまたは plan に方針記載）

### 2周目（2026-05-29）

**両視点レビュー結果から反映した修正**:

- **[P-001 / アーキ]** Step 3 表から `AccountDeleteForm` を除外（実コードを再確認したところ `ConfirmDialog` を使わず独自の `useState` ベース inline 確認 UI を持っていることが判明、`grep 'ConfirmDialog'` のローカル変数 `confirmDialog` への false positive だった）。総数を 11 → 10 に訂正。あわせて AccountDeleteForm 全体のデザインシステム適用をフォローアップ Issue 候補に追加。
- **[P-002 / アーキ]** Step 3 表の `NoteActions` 行で「ゴミ箱へ移動」「完全に削除」と2アクション併記していた誤記を訂正。実際の `<ConfirmDialog>` 呼び出しは1箇所（`confirmLabel="ゴミ箱へ"`）のみで、「完全削除」は `TrashRowActions` 側の別呼び出し。

**取り込んだ改善提案**:

- **[S-001 / 要件]** Step 9.5 を新設し、`testing.md` の作成タイミングを plan に明示（実装前または並行）。
- **[S-001 / アーキ]** UsersTable / DesignTokensForm の追加ボタン群をフォローアップ Issue 候補に追加（admin 行アクションの形態確定として）。

**見送った提案とその理由**:

- **[S-002 / アーキ]** Step 8 監査範囲を `<button>` から `<Link>` / `<a>` / `role="button"` まで広げる提案: 棚卸し表で既に主要な `<Link>` 系（Header / TrashList CTA 等）を網羅しているため、grep ベース監査は `<button>` に絞り、漏れは棚卸し表で担保。提案の実質は spec 文言で「accessible name を持たない要素は許容しない」と原則を述べることで吸収可能 → Step 1 の必須要素 3 (アイコンのみの要件) の `aria-label` 必須記述で代替済み。
- **[S-003 / アーキ]** §3 本文末尾に「§7.1 admin 例外を参照」のクロスリンクを 1 行追加: spec 修正範囲を最小化したいため、§7.1 内に集約する現方針を維持。将来 spec 全体のクロスリンク整備時に対応。
- **[S-004 / アーキ]** ADR-003 トレードオフ記述の testing.md への反映: testing.md 作成時に注意点として記載するが、plan 内では現状の記述で十分。

### 3周目

2周目で全ての P 級指摘が解消、新規 P 級なし、見送った S 級は方針明記済みのため **2周目で終了**。

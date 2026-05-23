# 実装計画 — Issue #88: common/styles.ts 新設で Dialog 周りの cross-domain import を解消

**Issue:** #88
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

`app/components/common/Dialog.tsx` / `ConfirmDialog.tsx` が `@/components/note/styles` から dialog 系の utility 文字列を import している依存方向の逆転（`common/ → note/`）を、`app/components/common/styles.ts` を新設して根本解消する。あわせて `MergeTagDialog` の SSOT 破り（インライン直書き）と primary ボタンの API 不整合を解消する。

Issue #54 / PR #87 のフォローアップであり、レビュー review-001 の W-Arch-001 / W-Arch-002 / W-Arch-006 と ADR-008 で「別 Issue で根本解消」と明記された宿題に当たる。

## スコープ

### 含まれるもの

- `app/components/common/styles.ts` 新設（note/styles.ts の中身をベースに、ドメイン非依存スタイル定数の SSOT に）
- `app/components/note/styles.ts` の整理（note 固有のものがなければ削除、note 内 callsite も `common/styles` 参照に書き換え）
- `app/components/common/Dialog.tsx` / `ConfirmDialog.tsx` を `@/components/common/styles` 参照に切り替え
- `app/components/tag/MergeTagDialog.tsx`:
  - `dialogTitle` / `dialogActions` を `common/styles` 参照に統一（インライン直書きは無し、既に `note/styles` 経由で参照されている — レビュー review-001 W-Arch-002 の現状確認の上で対応）
  - primary ボタンを `${pillBtn} ${pillBtnPrimary}` + `data-primary=""` パターンに統一
  - フォーム系（`FIELD_INPUT` / `FIELD_LABEL` / `FORM_ERROR`）も `common/styles` の dialog 文脈用 utility（`fieldControl` / `fieldLabel` / `formError`）に置換

### 含まれないもの

- `app/components/layout/styles.ts` 側の `PILL_BTN` / `FIELD_INPUT` 等の整理（layout shell 専用として残置）
- 他コンポーネント（`TagActions`, `CreateTagForm`, `IngestionJobRow`, `TrashList` 等）の `PILL_BTN` → `pillBtn` 置換（layout shell 用途として残置、本 Issue スコープ外）
- ダイアログのデザイン変更（あくまで参照元の差し替えのみ）
- review-001 で別 Issue 候補とされた他の項目（W-Arch-005 `ariaLabel` → `ariaLabelledBy` 移行、W-Rob-006 AT 隔離など）

## 実装ステップ

### 1. `app/components/common/styles.ts` を新設

- **対象ファイル:** `app/components/common/styles.ts` (新規)
- **変更内容:** `app/components/note/styles.ts` の全 export をそのままコピーする。冒頭のファイル JSDoc は `note components` 表記を「共有 UI primitives（ドメイン非依存）」に書き換える。`.issue/70/adr.md` ADR-002 への参照リンクは保持する。**個別 export の JSDoc（特に `dialog` の `.issue/104/adr.md` ADR-005 参照および `dialogCloseButton` の a11y 契約説明）は文言そのまま保持する** — これらは Dialog の挙動契約と紐づくため変更不可。
- **理由:** 既存定数の中身は全て note 固有要素を含まない汎用スタイル。SSOT を `common/` 配下に移すことで `common → note` の依存方向逆転を断つ。

### 2. `app/components/common/Dialog.tsx` の import を切り替え

- **対象ファイル:** `app/components/common/Dialog.tsx`
- **変更内容:** `from "@/components/note/styles"` を `from "./styles"` に変更（同ディレクトリの styles.ts を相対 import）。import している symbol は `dialog`, `dialogBackdrop`, `dialogCloseButton` のまま。
- **理由:** cross-domain import 解消（W-Arch-001）。

### 3. `app/components/common/ConfirmDialog.tsx` の import を切り替え

- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`
- **変更内容:** `from "@/components/note/styles"` を `from "./styles"` に変更。import symbol は `dialogActions, dialogTitle, pillBtn, pillBtnDanger` のまま。
- **理由:** ConfirmDialog も `common/` 内 → 同一ドメインの相対 import に統一する。Issue 本文「ConfirmDialog も `common/ → common/` になる」要件。

### 4. `app/components/tag/MergeTagDialog.tsx` を統一 API に揃える

> **事実関係の補足:** Issue 本文では「MergeTagDialog が `dialogTitle` / `dialogActions` をインラインで直書きしている」と書かれているが、これは PR #87 マージ前の認識。マージ後の現状コードでは既に `@/components/note/styles` 経由で参照済みで、文字通りインライン直書きされている定数は `DIALOG_DESCRIPTION`（説明文専用ローカル定数）のみ。**本 Issue では `DIALOG_DESCRIPTION` を触らず**、`note/styles` → `common/styles` への参照付け替えのみ実施する。

- **対象ファイル:** `app/components/tag/MergeTagDialog.tsx`
- **変更内容:**
  1. import 文を整理: `dialogActions`, `dialogTitle` を `@/components/note/styles` → `@/components/common/styles` に。
  2. layout 系 utility への依存も `common/styles` に切替:
     - `FIELD_LABEL` → `fieldLabel`（同一文字列、完全互換）
     - `FORM_ERROR` → `formError`（同一文字列、完全互換）
     - `FIELD_INPUT` → `fieldControl`（微差あり — `transition-all` → `transition-colors`、`disabled:opacity-55 disabled:cursor-not-allowed` 追加。詳細は adr.md ADR-001）
     - `PILL_BTN` → `pillBtn` / `${pillBtn} ${pillBtnPrimary}`（差分は adr.md ADR-001）
  3. キャンセルボタン: `className={PILL_BTN}` → `className={pillBtn}`
  4. primary ボタン: `className={PILL_BTN} data-primary=""` → ``className={`${pillBtn} ${pillBtnPrimary}`} data-primary=""``
  5. 残った `../layout/styles` import 句を整理（不要 import の削除）
- **理由:** Issue 本文 4 項目「primary ボタンを `${pillBtn} ${pillBtnPrimary}` + `data-primary` パターンに揃える」要件、および W-Arch-006 解消。Dialog 文脈は `common/styles` 系を使うのが一貫性のある選択。

### 5. note 配下 callsite を `common/styles` 参照に書き換え

- **対象ファイル:** `app/components/note/` 配下で `from "../styles"` または `from "./styles"` を使っている全 `.tsx` ファイル
- **変更内容:**
  1. 実装前に `grep -rln "from \"\\.\\./styles\"\\|from \"\\./styles\"" app/components/note/` で対象ファイルを再確認（事前調査では `../styles` 21 件のみで、`./styles` パターンは note 直下に無し）
  2. `from "../styles"` → `from "@/components/common/styles"` に置換。各ファイルで import している symbol は変更なし
- **理由:** note/styles.ts を削除するため、依存元の参照を切り替える必要がある。`./styles`（note 直下から）パターンの拾い漏れを防ぐため再帰 grep で対象確定する。

### 6. `app/components/note/styles.ts` を削除

- **対象ファイル:** `app/components/note/styles.ts` (削除)
- **変更内容:** ファイル削除。
- **理由:** 中身（16 export = `pillBtn` / `pillBtnPrimary` / `pillBtnDanger` / `field` / `fieldLabel` / `fieldControl` / `fieldTextarea` / `formError` / `chip` / `dialogBackdrop` / `dialog` / `dialogCloseButton` / `dialogTitle` / `dialogActions` / `radioRow` / `checkboxRow`）はすべて汎用スタイル定数で「note 固有」のものはゼロ確認済み。`common/styles.ts` を SSOT として残し、再エクスポート用のシムも置かない（紛らわしさ回避、SSOT 1 個に絞る）。

### 7. dangling reference の解消（コメント・ドキュメント）

- **対象ファイル:**
  - `CLAUDE.md` L47（`see app/components/note/styles.ts, auth/styles.ts, ...` の例示）
  - `app/components/tag/styles.ts` L1-7（JSDoc コメント内の `note/styles.ts` 参照）
- **変更内容:** どちらも `note/styles.ts` の例示を `common/styles.ts` に書き換える。`CLAUDE.md` は例示順を `common/styles.ts, auth/styles.ts, layout/styles.ts, public/styles.ts` に。`tag/styles.ts` の JSDoc も同様。
- **理由:** ステップ 6 で note/styles.ts を物理削除すると、これらの文書参照が dangling になる。次の改修者を混乱させないため、削除と同コミットで書き換える。
- **対象外:** `.issue/55/plan.md` 等、過去 Issue の `.issue/*/plan.md` や `.issue/*/adr.md` にも `note/styles.ts` の参照が残るが、これらは**当時の現実を記録したスナップショット**なので touch しない（履歴改ざんを避ける、活コードへの影響なし）。

### 8. 型チェック・lint・format・テストで整合性確認

- ステップ 5（callsite 書き換え）直後: `pnpm typecheck` と `pnpm format`（Biome の import 並び替えで差分が膨らむのを早期収束させる）
- 全体完了後:
  - `pnpm typecheck`
  - `pnpm lint:fix`
  - `pnpm format`
  - `pnpm test` で既存テストが壊れていないこと（Dialog 系のテストがある場合）

## 設計判断

- **ADR-001（adr.md 参照）**: MergeTagDialog で layout 系 utility (`PILL_BTN` / `FIELD_INPUT`) を `common/styles` の `pillBtn` / `fieldControl` に置換することで生じる微妙な visual 差分の扱い。
- **ADR-002（adr.md 参照）**: note/styles.ts を削除する vs re-export シムとして残す選択。

## リスクと注意点

- **note/styles への参照点（全リポジトリ grep 済み）**: 実コード参照は `app/components/common/Dialog.tsx` / `ConfirmDialog.tsx` / `app/components/tag/MergeTagDialog.tsx` の 3 ファイルのみ、note 内相対参照は 21 ファイル。コメント・ドキュメント参照は `CLAUDE.md` L47 と `app/components/tag/styles.ts` L1-7 の 2 箇所。`spec/` / `docs/` / `__tests__/` 配下に note/styles への参照は無いことを確認済み。
- **callsite が多い (21 ファイル想定)**: 機械的置換で済むが、grep の網羅性に注意。`@/components/note/styles` 形式と `../styles` 形式の両方を確認する。
- **MergeTagDialog の visual regression**:
  - layout `PILL_BTN` には `active:scale-[0.985] motion-reduce:active:scale-100` と `max-sm:min-h-[44px]` が含まれるが、`pillBtn` には含まれない。タップターゲット縮小 (44 → 36px) はモバイルで悪影響の可能性。
  - layout `FIELD_INPUT` の `transition-all` が `common/fieldControl` で `transition-colors` になる。border 色以外のプロパティ遷移が止まるが、影響は微小。
  - これらは testing.md のビジュアル確認項目で検証する。
- **インライン直書きの所在**: Issue 本文では「MergeTagDialog がインライン直書きしている」と記述されているが、現状コード読みでは既に `note/styles` 経由で参照されている（`dialogActions`, `dialogTitle`）。`MergeTagDialog` の `DIALOG_DESCRIPTION` (`text-[13px] text-ink-secondary mt-2`) のみインライン定数として残っているが、これは説明文専用で他箇所では使われていないため本 Issue では触らない（個別の小さなインライン局所利用は SSOT 違反というより「ローカル定数」として許容）。
- **Dialog.tsx は `./styles` 相対 import、その他は `@/components/common/styles` パス**: 同じ意味だが書き分けは「同一ディレクトリの場合は相対」が既存規約。整合性のため Dialog.tsx / ConfirmDialog.tsx だけ `./styles`、それ以外は alias パスで揃える。

## テスト方針

- `pnpm typecheck && pnpm lint && pnpm test` で構造的に壊れていないこと
- ステップ 5（callsite 書き換え）完了直後に `pnpm typecheck` を 1 度走らせ、`from "../styles"` の書き換え漏れによる import エラーを早期検出する（ステップ 6 でファイル削除する前に潰す）
- 開発サーバー (`pnpm dev`) でダイアログ系画面 (ノート編集・ノート削除確認・タグ統合・一括操作) を開いて、視覚的に regression がないこと
- **モバイルビューポート（〜639px）でも MergeTagDialog のキャンセル/統合ボタンのタップターゲットを目視確認**（ADR-001 のタップターゲット縮小判断の検証）
- 詳細は `.issue/88/testing.md` を参照

## レビュー履歴

### 1周目（2026-05-23）

**修正した点:**
- [P-001 / 視点2]: `CLAUDE.md` L47 と `app/components/tag/styles.ts` L1-7 の dangling reference 解消をステップ7として明示追加
- [P-002 / 視点2 + S-001 / 視点1]: ステップ4の冒頭に「Issue 本文の前提（インライン直書き）は PR #87 マージ時点で既に解消済み」の事実関係を明記。`DIALOG_DESCRIPTION` には触らない旨を強調
- [S-003 / 視点1]: ステップ5に「事前 grep で対象ファイル再確認」を明記、コマンドも具体化
- [S-001 / 視点2]: ステップ5の grep コマンドを再帰版 (`grep -rln`) に修正。`./styles` パターンも拾える形に
- [S-004 / 視点1]: ステップ6に note/styles.ts の 16 export を全列挙し、ドメイン非依存である根拠を明示
- [S-003 / 視点2]: リスク欄に「全リポジトリ grep で note/styles 参照は 3 + 21 + 2 件のみ」「spec/docs/__tests__ には参照無し」を明記
- [S-004 / 視点2]: テスト方針にステップ5直後の typecheck 運用を明示

**取り込んだ改善提案:**
- [S-002 / 視点1 + 視点2]: ADR-001 の Consequences と本 plan.md のテスト方針に、モバイルビューポートでのタップターゲット目視確認を追加。スコープ拡大は見送り、別 Issue 化のルートを ADR で再確認

**見送った提案とその理由:**
- なし（全提案を取り込みまたは反映済み）

### 2周目（2026-05-23）

**修正した点:**
- [P-001 / 視点2]: ステップ1に「個別 export の JSDoc（特に `dialog` の `.issue/104/adr.md` ADR-005 参照と `dialogCloseButton` の a11y 契約説明）は文言そのまま保持」を明記
- [S-001 / 視点1]: レビュー履歴1周目の表記を 14 → 16 export に統一（実数と一致）
- [S-001 / 視点2]: ステップ7に「過去 Issue の `.issue/*` 配下スナップショットは touch しない」旨を対象外として明記
- [S-002 / 視点2]: ステップ8でステップ5直後に `pnpm format` も走らせる旨を明記（Biome の import 並び替えによる差分膨張を早期収束）
- [S-003 / 視点2]: ADR-001 Consequences に WCAG 2.5.5 (Enhanced 44px) / 2.5.8 (Minimum 24px) の整理と、隣接ターゲット間隔・Dialog 余白による誤動作リスク低減根拠を追記

**取り込んだ改善提案:**
- [S-002 / 視点1]: ADR-002 Consequences に「副次効果（layout/styles.ts との重複統合の SSOT 候補化）」を追記

**見送った提案とその理由:**
- なし（全提案を反映済み）

### 3周目（2026-05-23）— 終了

**結果:** 両視点とも「問題点ゼロ」報告。視点2は **APPROVED** で締めくくり。レビューループ終了。

**取り込んだ改善提案:**
- 視点2 から「testing.md にモバイル確認の合格基準（誤動作なし／画面端見切れなし）を明記」→ testing.md 作成時に反映する

**見送った提案とその理由:**
- 視点2 から「Biome import 並び替えによる diff 膨張の注意書き」→ ステップ8 で `pnpm format` 早期実行を明記済みのため追記不要

# 実装計画 — Issue #459: ノート詳細アクションメニューのボタン構成・サイズを読みやすく整える

**Issue:** #459
**作成日:** 2026-06-04
**複雑度:** 中〜大規模（presentation 層・設計判断あり）

---

## 目的

ノート詳細の `NoteActions` ツールバーを「このメニューにとって読みやすく押しやすい」構成に整える。直接の引き金は、アイコンのみボタン（編集・複製）が `pillBtn`（`h-9 px-4` ＝テキスト併記前提の横長）を流用していて横長に浮いていること。根本は、常用操作と低頻度／破壊的操作が同じ重みでベタ並びしていてツールバー全体の情報設計が読みにくいこと。

## スコープ

### 含まれるもの

- `app/components/common/styles.ts` にアイコンのみボタンの原型（円形・正方形ベース・テキスト用横余白なし）を追加
- `app/components/note/detail/NoteActions.tsx` のツールバー再構成
  - 表に出す常用操作：編集／公開設定／移動／URLコピー／エクスポート
  - オーバーフローメニュー（⋯）に退避：複製／履歴／削除
- `app/components/note/detail/NoteActionsMenu.tsx` を新設（既存 `DirectoryActionsMenu` / `UserMenu` の WAI-ARIA Menu パターンを踏襲）
- `app/components/note/detail/UrlCopyButton.tsx` をアイコンのみ円形に変更（コピー完了の状態は icon swap ＋ aria-live は sr-only）
- 公開設定ボタンの補助テキスト `· 公開設定` を削除（状態ラベルだけ残す）
- 既存テスト `NoteActions.test.tsx` の更新と、メニューの a11y テスト追加

### 含まれないもの

- §7.1「ボタン形態の使い分け」の規範そのものの見直し（#460 で別途扱う）
- 汎用 Popover プリミティブの抽出（既存パターン同様、単一利用なのでインラインで実装。#289 ADR-003 の方針を踏襲）
- ドメイン／アプリケーション層の変更（不要）

## 設計判断（ユーザーとの対話で確定）

| 論点 | 決定 |
| --- | --- |
| 構成方向性 | オーバーフローメニュー（⋯）方式。常用操作を表に、低頻度／破壊的操作をメニューへ |
| メニュー振分け | 表：編集・公開設定・移動・URLコピー・エクスポート / メニュー：複製・履歴・（区切り）・削除 |
| 表のボタン形態 | 公開設定のみ状態ラベル付き、他は円形アイコンのみ。編集はアクセント塗りの円 |
| 公開設定の文言 | `· 公開設定` の補助テキストは削除。状態ラベル（非公開/限定公開/公開）のみ残す |
| アイコンのみ原型 | `pillBtn` への data-variant add-on（`pillBtnIcon`）として追加。`px-0`/`w-9`/`justify-center` を data-variant で上書き（生成 CSS 順の制約のため。#416 ADR-005 と同じ理由） |

詳細は `adr.md` 参照。

## 実装ステップ

### 1. アイコンのみボタン原型を追加

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `pillBtnIcon` を data-variant add-on として追加。`data-[icon]:w-9 data-[icon]:px-0 data-[icon]:justify-center data-[icon]:max-sm:min-w-[44px]`。`pillBtn` に append し `data-icon=""` で発火。`pillBtnPrimary` / `pillBtnDanger` と合成可能（色は data-variant なので基底に依存しない）。
- **理由:** アイコン1個に `px-4` が付いて横長になるのを解消。`pillBtnSm` と同じく縮小方向（`px-4→px-0`）は plain utility では生成 CSS 順で負けるため data-variant にする。

### 2. オーバーフローメニュー（⋯）コンポーネントを新設

- **対象ファイル:** `app/components/note/detail/NoteActionsMenu.tsx`（新規）
- **変更内容:** `DirectoryActionsMenu` を雛形に、roving tabindex / 外側クリック・Esc クローズ / フォーカス復帰 / `runAndClose`（ダイアログへフォーカス引き継ぎ）を踏襲。props で `onDuplicate` / `onHistory` / `onDelete` と `disabled` を受ける。トリガーは `pillBtnIcon` の円。メニュー項目はアイコン+ラベル（複製＝Copy / 履歴＝History / 削除＝Trash2・danger）。削除の前に区切り線。
- **理由:** ConfirmDialog を開く削除・transition を伴う複製・遷移の履歴をメニュー項目として安全に扱うため、確立済みパターンを再利用する。

### 3. NoteActions ツールバーを再構成

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:**
  - 編集：`pillBtnIcon` ＋ `pillBtnPrimary`（円・アクセント）。`data-icon="" data-primary` ＋ `aria-label`/`title`（#382 維持）
  - 公開設定：`pillBtn` のラベル付きピルのまま、`· 公開設定` テキストを削除
  - 移動／エクスポート：`pillBtnIcon` の円アイコンに（`aria-label` ＋ `title` を付与）
  - 複製・履歴・削除のボタンを撤去し、`NoteActionsMenu` に集約。削除の ConfirmDialog・複製の transition・履歴遷移のハンドラはメニューへ渡す
  - 履歴はメニュー項目化に伴い `<Link>` から `router.navigate` ベースに（`UserMenu` の設定項目と同型）
- **理由:** 常用操作と低頻度／破壊的操作を視覚的に分離し、ツールバーの情報設計を整える。

### 4. UrlCopyButton をアイコンのみ円形に

- **対象ファイル:** `app/components/note/detail/UrlCopyButton.tsx`
- **変更内容:** ボタンを `pillBtnIcon` の円に。可視ラベルを外し `aria-label`（既定「URLをコピー」）＋ `title`。コピー成否は icon swap（Link2→Check）で視覚的に伝え、aria-live の status 領域は `sr-only` にして行レイアウトを崩さない。
- **理由:** 形態Aに合わせ、常用操作として円アイコンで揃える。SR への状態通知は維持する。

### 5. テスト更新・追加

- **対象ファイル:** `app/components/note/detail/__tests__/NoteActions.test.tsx`（更新）, 必要なら `NoteActionsMenu` のテスト
- **変更内容:** 編集＝アイコンのみ（aria-label・可視テキストなし）の #382 ロックは維持。複製はメニュー項目へ移動したので、対応するアサーションを「⋯ メニューを開くと複製/履歴/削除の menuitem が出る」に更新。メニューの aria（`aria-haspopup="menu"` / `aria-expanded`）も検証。
- **理由:** #382 の意図（編集はアイコンのみ）は守りつつ、複製の配置変更を反映する。

## リスクと注意点

- **#382 テストの複製アサーション**：複製が `<button aria-label="複製">` 直置きから menuitem に移るため、当該テストは更新が必要。編集のロックは温存する。
- **メニュー項目からの ConfirmDialog 起動**：`runAndClose` がトリガーへフォーカスを戻してから `setOpen(false)` → `fn()` する順序を守る（Dialog の `previousActiveRef` が body を掴むのを防ぐ。DirectoryActionsMenu のコメント参照）。
- **公開設定の状態判別**：`· 公開設定` を消しても、ドット色＋状態ラベル（非公開/限定公開/公開）で意味は保たれる。
- **44px タップ領域**：円アイコンは `h-9 w-9`（36px）なので `max-sm:min-w/h-[44px]` でモバイルのタップ領域を確保（§7.1 MUST と整合。#460 の見直し対象だが現状は維持）。
- **`role="toolbar"`**：メニュートリガーを含めてもツールバーの意味は保たれる。`aria-label="ノート操作"` は維持。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit`（NoteActions / NoteDetail / NoteMetaPanel への波及確認）
- ローカルサーバーでノート詳細を目視：円アイコンの形・⋯メニューの開閉・キーボード操作・削除確認ダイアログ・URLコピー

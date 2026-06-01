# 実装計画 — Issue #382: テキスト併記が冗長なボタンをアイコンのみに整理する

**Issue:** #382
**作成日:** 2026-06-01
**複雑度:** 小規模

---

## 目的

「アイコン + テキストラベル」を併記しているボタンのうち、アイコンだけで十分に意味が伝わるものをアイコン単体表示に整理し、ツールバー / アクション行の情報密度を下げる。可視テキストを外す箇所は `aria-label`（必要に応じて `title`）でアクセシブルネームを担保し、a11y を損なわない。

## スコープ

### 含まれるもの（高優先度＝アイコンのみで伝わる）

- `app/components/note/detail/NoteActions.tsx`
  - **編集**（`Pencil`）→ アイコンのみ化
  - **複製**（`Copy`）→ アイコンのみ化
- `app/components/note/list/NoteListToolbar.tsx`
  - **新規作成**（`Plus`）→ 全ブレークポイントでアイコンのみ化（現状は `max-sm` でのみラベルを隠す）
  - **アップロード**（`Upload`）→ 全ブレークポイントでアイコンのみ化（同上）

### 含まれないもの（テキスト維持・現状維持）

- **既にアイコンのみ**で本Issueの対応不要:
  - ハンバーガーメニュー `MenuButton.tsx`（`Menu`・`aria-label` 済み）
  - WYSIWYG 書式ツールバー `WysiwygEditor.tsx`（`Bold` 等・`aria-label`/`title` 済み）
  - 選択解除（×）`BulkActionBar.tsx`（`X`・`aria-label` 済み）
- **中優先度: テキスト維持**（Issue 補足「判断に迷う中・低優先度はテキストを維持」に従う）
  - 公開設定（`Globe`）— 「公開/世界」と曖昧
  - エクスポート / ダウンロード（`Download`）— テキストありの方が安全
  - 復元（`RotateCcw`）— やや曖昧
- **低優先度: テキスト維持**（破壊的操作・専門的・多義的）
  - 削除 / 完全削除 / ゴミ箱へ、リネーム、統合、移動、再生成、ノートを開く
- `NoteListToolbar` の **選択**（`CheckSquare`）/ **ビューとして保存**（`Bookmark`）は高優先度リスト外のため現状維持（`max-sm` 折りたたみのまま）
- アイコン自体の差し替え・新規アイコン追加

## 実装ステップ

### 1. NoteActions.tsx の「編集」をアイコンのみ化

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:** 「編集」`<Link>` から可視テキスト `編集` を削除し、`aria-label="編集"` と `title="編集"` を付与する。`<Icon icon={Pencil} />` は `label` を渡さない現状のまま（装飾＝`aria-hidden`）維持。
- **理由:** `Pencil` は普遍的な編集シンボルで、アイコン単体で意味が伝わる。アクセシブルネームは親要素の `aria-label` で担保（Icon の JSDoc 規約: アイコンが `<button>`/`<Link>` の唯一の子のときは親に `aria-label`、Icon には `label` を渡さない）。

### 2. NoteActions.tsx の「複製」をアイコンのみ化

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:** 「複製」`<button>` から可視テキスト `複製` を削除し、`aria-label="複製"` と `title="複製"` を付与する。
- **理由:** `Copy` は比較的明確なシンボル。手順1と同じ a11y 方針。

### 3. NoteListToolbar.tsx の「新規作成」をアイコンのみ化

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:** `新規作成` の `<span className={CTA_LABEL}>新規作成</span>` を削除する。`<Link>` には既に `aria-label="新規作成"` があるため、`title="新規作成"` を追加してマウスホバー時のツールチップも担保。
- **理由:** `Plus` は新規作成の標準シンボル。これまでモバイルでのみアイコンのみだったものを全幅で統一。

### 4. NoteListToolbar.tsx の「アップロード」をアイコンのみ化

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:** `<UploadButton>` 内の `<span className={CTA_LABEL}>アップロード</span>` を削除する。`UploadButton` には既に `aria-label="アップロード"` を渡しているため、`title="アップロード"` を併せて渡せるよう `UploadButton` が `title` を中継できなければ `aria-label` のみで担保（`UploadButton` の `Props` は `aria-label` のみ受け取る現状なので、まず最小変更として `aria-label` 維持＋テキスト削除で対応。`title` を出したい場合は `UploadButton` に `title` prop 中継を追加するか検討）。
- **理由:** `Upload` は明確なシンボル。手順3と統一。

> `CTA_LABEL` 定数は「選択」「ビューとして保存」ボタンで引き続き使用するため残す。

## 設計判断

- アイコンのみ化の a11y 担保は **親（`<button>`/`<Link>`）の `aria-label`** で行い、`Icon` には `label` を渡さない（accessible name の二重化を避ける）。詳細は `adr.md` ADR-001。
- 高優先度のみ対応し、中・低優先度はテキスト維持。判断境界は `adr.md` ADR-002。
- マウスユーザー向けに `title` 属性を付け、WYSIWYG ツールバーの既存パターン（`aria-label` + `title`）に揃える。`UploadButton` は現状 `title` を中継しないため、ここは `aria-label` のみで担保し過剰な改修はしない。

## リスクと注意点

- `pillBtn` は `px-4` のままなので、アイコンのみでも一定幅のピル形状になる（既存のモバイル折りたたみと同じ挙動で、円形ボタンにはしない）。WYSIWYG の `EDITOR_TOOLBAR_BTN`（円形）とは別系統で、本Issueでは形状を変えない。
- 可視テキスト削除により accessible name が `aria-label` のみになる。スクリーンリーダーでの読み上げ名が変わらないことを確認する。
- 既存のユニットテストに対象コンポーネントの直接テストは無い（`NoteActions` / `NoteListToolbar` の `__tests__` は未存在）。回帰防止のため最小限の a11y テスト追加を検討（アイコンのみ化後も accessible name が残ることの確認）。
- `編集` は `data-primary`（プライマリピル）なので、テキストを抜いてもプライマリ配色が維持されることを確認。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` で静的検証。
- `pnpm test:unit` で既存テストの回帰確認。対象コンポーネントの軽量レンダリングテスト（happy-dom + `createRoot`、`Icon.test.tsx` のパターン）を追加し、アイコンのみ化したボタンに `aria-label` が付き可視テキストが消えていることを検証。
- ブラウザ（manual-test）でノート詳細のアクション行・ホームのツールバーを目視確認し、アイコンのみ表示・ホバーで `title` が出ること・操作が機能することを確認。

# 動作確認計画 — Issue #292: ボタンの「テキストのみ／アイコンのみ／アイコン+ラベル」使い分けガイドラインを spec に追加

**Issue:** #292
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（DB変更なし、フロントエンドの UI 変更のみ）。

### 検証環境の起動

```bash
pnpm dev
```

`http://localhost:5173` 等で Vite 開発サーバーが起動する（実ポートは起動ログを参照）。

型・lint・format の事前確認（CLAUDE.md「After changes」ルール）:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

自動テスト:

```bash
pnpm test:unit
```

### デプロイ方法

ステージング環境への反映:

```bash
pnpm deploy:staging
```

検証環境のみで完結する変更（spec ドキュメント追加と UI コンポーネントの軽微な修正のみ）。本番デプロイは通常リリースサイクルに合わせる。

---

## 確認項目

### 1. spec ドキュメントの追加内容

- **目的:** `spec/design/index.md` §7.1 末尾に「ボタン形態の使い分け」サブセクションが追加され、Issue 要件の必須要素が網羅されていることを確認する。
- **手順:**
  1. `spec/design/index.md` を開く
  2. §7.1 末尾に新サブセクション（「ボタン形態の使い分け」相当）があるか確認
- **期待結果:** 以下が記述されている:
  1. アイコン+ラベル（既定）の使う場面と例
  2. テキストのみの使う場面（タブ／セグメント／トグルグループ、フィルタチップ、リンク的ボタン）
  3. アイコンのみの 4 つの必須要件（aria-label / title / 同種ボタン非並置 / 44×44px）
  4. 同一ツールバー混在禁止 + 2 つの例外（タブ／セグメント例外、primary/secondary 形態混合例外）
  5. 空状態 CTA はアイコン+ラベル
  6. 公開側 `EMPTY_LIST` は #284 範囲（既存記述を参照する形で重複を避ける）
  7. チップ内付属の close ボタンは親 chip と一体扱い
  8. 管理画面の `BTN_SM_CLASS` は §3 44px 例外
- **確認ポイント:** 既存 §7.1 「アイコン運用ガイドライン」の他項目との整合（重複・矛盾がないこと）

### 2. ヘッダー / NoteListToolbar / BulkActionBar / NoteActions の現状維持確認

- **目的:** Issue 本文「修正時の確認事項」の「同一ツールバー / アクション群内で形態が揃っているか」「icon-only ボタンの aria-label」を確認する。
- **手順:**
  1. ログイン後、メインのノート一覧ページに遷移
  2. ヘッダー右側（新規作成 / アップロード / アバター）を目視
  3. ノート一覧ツールバー（保存ビュー / 新規作成 / アップロード / 表示モード切替）を目視
  4. ノート複数選択 → 一括操作バー（移動 / 公開設定 / エクスポート / ゴミ箱へ / 選択解除）を目視
  5. ノート詳細を開く → アクションバー（編集 / 公開設定 / 移動 / URL コピー / 複製 / エクスポート / 履歴 / 削除）を目視
- **期待結果:** いずれのツールバーも「アイコン+ラベル」で揃っている。`DisplayModeSwitch`（リスト/タイル/カレンダー）のみテキストのみ、これは spec のタブ／セグメント例外として許容。
- **確認ポイント:** DevTools の Accessibility ペインで各ボタンの accessible name がラベルテキスト通りであること。

### 3. 修正対象 — admin/Jobs のテキストのみボタンへのアイコン付与

- **目的:** 「再実行」「再構築を実行」がアイコン+ラベル化されていることを確認する。
- **手順:**
  1. 管理者ユーザーでログインし `/admin/jobs` ページに遷移
  2. 取り込み（ingestion）行の「再実行」ボタンを目視
  3. エクスポート行の「再実行」ボタンを目視
  4. 検索インデックス（`SearchIndexSection`）の「再構築を実行」ボタンを目視
- **期待結果:** 各ボタンが `RefreshCw` アイコン + ラベルテキスト「再実行」「再構築を実行」で表示される。
- **確認ポイント:** 同セクション内の見出し（アイコン+ラベル）と視覚的に揃っており、混在ではなくなっていること。

### 4. 修正対象 — TrashList 空状態 CTA へのアイコン付与

- **目的:** 「すべてのノートに戻る」リンクにアイコンが付与されていることを確認する。
- **手順:**
  1. すべてのノートをゴミ箱から削除 or 新規ユーザーで `/trash` にアクセス（空状態を表示）
  2. 空状態の CTA「すべてのノートに戻る」を目視
- **期待結果:** `ArrowLeft` アイコン + ラベルテキスト「すべてのノートに戻る」で表示される。
- **確認ポイント:** `EMPTY_STATE` のアイキャッチアイコン（既存）と CTA が一連の流れとして自然に見えること。

### 5. 修正対象 — NoteActions trashed 分岐「ゴミ箱を開く」へのアイコン付与

- **目的:** ゴミ箱に移動済みノートの詳細画面で「ゴミ箱を開く」リンクにアイコンが付与されていることを確認する。
- **手順:**
  1. ノートを 1 つゴミ箱に移動
  2. ゴミ箱内のノート詳細を開く
  3. アクション領域に表示される「ゴミ箱を開く」リンクを目視
- **期待結果:** `Trash2` アイコン + ラベルテキスト「ゴミ箱を開く」で表示される。

### 6. 修正対象 — ConfirmDialog の confirm ボタンへのアイコン付与（全11呼び出し箇所）

- **目的:** 削除・破棄・リセット・復元等の確認ダイアログ confirm ボタンに、文脈に合うアイコンが付与されていることを確認する。
- **手順（11箇所すべて確認）:**
  1. ノート詳細 → 削除（NoteActions） → `Trash2` + 「ゴミ箱へ」
  2. ノート一覧で複数選択 → 一括ゴミ箱（BulkActionBar） → `Trash2` + 「ゴミ箱へ」相当
  3. `/trash` で個別の「完全削除」（TrashRowActions） → `Trash2` + 「完全削除」
  4. ノート履歴で版を選択 → 「復元する」（NoteRevisionRestorePanel） → `RotateCcw` + 「復元する」
  5. 取り込みジョブ詳細で「破棄」（IngestionJobRow） → `Trash2` + 「破棄」
  6. 取り込みプレビュー → 「破棄」（IngestionPreviewForm） → `Trash2` + 「破棄」
  7. `/admin/prompts` で「リセット」（PromptsForm） → `RotateCcw` + 「リセット」
  8. `/admin/design-tokens` で「リセット」（DesignTokensForm） → `RotateCcw` + 「リセット」
  9. 保存済みビュー一覧で「削除」（SavedViewsList） → `Trash2` + 「削除」
  10. タグ一覧で「削除」（TagActions） → `Trash2` + 「削除」
  11. ディレクトリ削除ダイアログ（DeleteDirectoryDialog） → `Trash2` + 「削除」（ADR-006 で plan 表に追加した11件目）
- **期待結果:** 各 confirm ボタンが指定アイコン + ラベルで表示され、pending 中（isPending=true 時）もアイコンは維持される（ラベルだけが「リセット中...」等に切替）。
- **確認ポイント:**
  - AlertTriangle アイキャッチ（既存、`size={20}`）と confirm ボタン内アイコン（`size={16}`）のサイズ違いが spec 通りであること
  - キャンセルボタンはテキストのみのまま（spec の primary/secondary 例外）

### 7. 修正対象 — Dialog 閉じるボタン (`×`) のモバイル時タップ領域

- **目的:** Dialog の "×" ボタンがモバイル時に 44×44px に拡大され、デスクトップでは 32×32px のまま維持されることを確認する。
- **手順:**
  1. 任意のダイアログを開く（例: 「URL コピー」「アップロード」「移動」）
  2. デスクトップビューで右上の "×" ボタンの実描画サイズを DevTools の Inspect で計測 → 32×32px
  3. DevTools で viewport を `375 × 667`（iPhone SE）等のモバイルサイズに切替 → 同じ "×" ボタンを再計測 → 44×44px
- **期待結果:** デスクトップ 32px / モバイル 44px の挙動。
- **確認ポイント:**
  - モバイル時、ダイアログタイトル（例:「アップロード」「移動」）と "×" ボタンが視覚的に重なっていないこと（重なる場合は ADR-003 のトレードオフ通り別 Issue 対応とする）
  - DevTools の Accessibility ペインで `aria-label="閉じる"` が維持されていること

### 8. icon-only ボタンの aria-label 確認

- **目的:** Issue 本文「完了条件」の「icon-only ボタンすべてに `aria-label` が付いている（修正後の状態）」を確認する。
- **手順:**
  1. DevTools の Accessibility ペインで各画面を巡回
  2. 主な icon-only ボタンの accessible name を確認:
     - Dialog 閉じる "×" → `aria-label="閉じる"`
     - FilterBar のアクティブチップ解除 "×" → `aria-label="<フィルタ名>を解除"` 等
     - ヘッダーアバター（テキストのみだが accessible name 確認） → `aria-label="<displayName> のメニュー"`
- **期待結果:** すべての icon-only ボタンに `aria-label` または `aria-labelledby` が設定されている。
- **確認ポイント:** スクリーンリーダー（VoiceOver / NVDA）で各ボタンが意味のある名前で読み上げられること。

---

## エッジケース・異常系

### 1. ConfirmDialog の `confirmIcon` 省略時の動作

- **目的:** `confirmIcon` を指定しないダイアログ（呼び出し側で省略した場合）が従来通りアイコンなしで表示されることを確認する。
- **手順:**
  1. 開発時に任意の `<ConfirmDialog>` 呼び出しから一時的に `confirmIcon` を外して動作確認
  2. アイコンが表示されず、ラベルテキストのみになることを確認
- **期待結果:** `confirmIcon` 省略時は破壊変更なしで従来通り動作する。

### 2. pending 中の confirm ボタン表示

- **目的:** `isPending=true` 中も `confirmIcon` が維持されることを確認する。
- **手順:**
  1. `/admin/prompts` で「リセット」をクリック → 確認ダイアログ → confirm
  2. pending 中（「リセット中...」表示）にアイコンが維持されているか確認
- **期待結果:** ラベルが「リセット中...」に変わってもアイコン（`RotateCcw`）は表示され続ける。

---

## 既存機能への影響確認

- **ConfirmDialog のシグネチャ変更**: `confirmIcon?: LucideIcon` は optional のため、既存呼び出しは破壊変更なし。`getByRole("button", { name: "..." })` ベースのテストは accessible name 不変。
- **`dialogCloseButton` のサイズ変更**: モバイル時のみ拡大されるため、デスクトップの視覚バランスは維持。各ダイアログのタイトルが短い現状では重なりなし。
- **`pnpm test:unit` がすべて通ること**: ConfirmDialog 関連のテストが破壊変更なしで通ることを確認。
- **`pnpm typecheck` で `LucideIcon` 型の解決が正しいこと**: `import type { LucideIcon } from "lucide-react"` が既存パターン通り。

---

## 確認チェックリスト

- [ ] `spec/design/index.md` §7.1 末尾に「ボタン形態の使い分け」サブセクションが追加されている（8 必須要素網羅）
- [ ] ヘッダー / NoteListToolbar / BulkActionBar / NoteActions / TrashRowActions / IngestionJobRow の現状維持（アイコン+ラベルで揃い、混在なし）
- [ ] DisplayModeSwitch がテキストのみで維持（タブ／セグメント例外）
- [ ] admin/Jobs 「再実行」「再構築を実行」にアイコン付与
- [ ] TrashList 空状態 CTA 「すべてのノートに戻る」にアイコン付与
- [ ] NoteActions trashed 分岐「ゴミ箱を開く」にアイコン付与
- [ ] ConfirmDialog 呼び出し全11箇所に `confirmIcon` が指定され、適切なアイコン表示
- [ ] Dialog "×" ボタンがデスクトップ 32px / モバイル 44px で挙動
- [ ] すべての icon-only ボタンに `aria-label` がある
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がエラーなく完了
- [ ] `pnpm test:unit` がエラーなく完了
- [ ] スクリーンショット 6 枚以上を `.issue/292/manual-test/` に保存

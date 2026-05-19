# 動作確認計画 — Issue #54: Dialog 共通化（フォーカストラップ・Esc クローズ・Portal レンダリング）

**Issue:** #54
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーションを適用（未実施なら）
pnpm dev              # 開発サーバー起動（Vite via Cloudflare workerd）
```

ブラウザで起動 URL（既定 `http://localhost:3000` 付近、vite が出力する URL）を開く。サインインして以下の画面で各ダイアログを開ける状態にする:

- `/notes`(ノート一覧、複数選択で一括ダイアログ群が出る)
- `/tags` (タグ管理、MergeTagDialog)
- 任意のノート詳細（ConfirmDialog）

### デプロイ方法

ステージング・本番への反映は本 Issue の動作確認では行わない（フロントエンド変更のみで検証環境で十分確認可能）。デプロイが必要になった場合は:

```bash
pnpm deploy:staging   # ステージング環境への反映
```

## 確認項目

### 1. Esc キーでダイアログが閉じる

- **目的:** すべてのダイアログで Esc キー押下時に `onClose` が呼ばれ、ダイアログが閉じることを確認。
- **手順:**
  1. `/notes` で 1 件以上のノートを選択し、一括アクションバーから「移動」をクリック → MoveNoteDialog を開く。
  2. キーボードで Esc を押下。
  3. 同様に「エクスポート」「公開設定」をクリック → BulkExportDialog / BulkVisibilityDialog で Esc を押下。
  4. `/notes` のツールバー「ビューとして保存」→ SaveViewDialog で Esc を押下。
  5. `/tags` で任意のタグ行「統合」→ MergeTagDialog で Esc を押下。
  6. 任意のノート詳細でゴミ箱や削除アクション → ConfirmDialog で Esc を押下。
- **期待結果:** 6 ダイアログすべてが Esc で閉じる。
- **確認ポイント:** ダイアログ外（例えば入力 input 内）にフォーカスがある状態でも Esc が効くこと。

### 2. Tab / Shift+Tab でフォーカスがダイアログ内を循環

- **目的:** モーダルの focus trap が動作することを確認。
- **手順:**
  1. MoveNoteDialog を開く。
  2. Tab を押し続けて、フォーカスが「ディレクトリ select → キャンセル → 移動」と循環し、「移動」から Tab すると先頭（select）に戻ることを確認。
  3. Shift+Tab で逆方向の循環も確認。
  4. 同様の操作を他 5 ダイアログ（BulkExport / BulkVisibility / SaveView / MergeTag / Confirm）で実施。
- **期待結果:** フォーカスがダイアログ外（背後のページ要素）に抜けない。
- **確認ポイント:** Tab 循環の途中で `disabled` 状態のボタン（例えば `target === ""` のときの送信ボタン）はスキップされること。

### 3. 開時に最初のフォーカス可能要素にフォーカス

- **目的:** ダイアログを開いた直後、初期フォーカスが適切に当たることを確認。
- **手順:**
  1. 各ダイアログを開く。
  2. ブラウザの DevTools で `document.activeElement` を確認、または視覚的にフォーカスリングを確認。
- **期待結果:**
  - **alertdialog（ConfirmDialog）:** panel 自体にフォーカス（destructive 確認の WAI ベストプラクティス相当 — 何もキーが効いてしまわない安全側）
  - **dialog（その他 5 件）:** 最初の入力要素 / select / ボタンにフォーカス
- **確認ポイント:** focus リングがダイアログ内部に視認できること。

### 4. 閉時に元のトリガー要素へフォーカス復帰

- **目的:** ダイアログを閉じた後、フォーカスが開く前の要素（トリガーボタン）に戻ることを確認。
- **手順:**
  1. `/tags` で「統合」ボタンをクリック → MergeTagDialog を開く。
  2. Esc またはキャンセルを押して閉じる。
  3. フォーカスが「統合」ボタンに戻っていることを確認。
  4. MoveNoteDialog、BulkVisibilityDialog、SaveViewDialog、ConfirmDialog でも同様に確認。
- **期待結果:** トリガー要素にフォーカスが戻る。
- **確認ポイント:** Tab を押すと、その後の次タブ移動が正しい順序で進む（フォーカスが body に落ちていない）。

### 5. Portal で `<body>` 直下にレンダリングされる

- **目的:** ダイアログが Portal 化され、リスト要素（`<li>`）配下ではなく `<body>` 直下にレンダリングされることを確認。
- **手順:**
  1. `/tags` で「統合」ボタンをクリック（`TagActions` は `<li>` 配下からダイアログを開く構造）→ MergeTagDialog を開く。
  2. ブラウザ DevTools の Elements パネルで、ダイアログの DOM 位置を確認。
- **期待結果:** ダイアログの `<div role="dialog">` が `<body>` 直下、すなわちアプリケーションのルート要素の外側にレンダリングされている。
- **確認ポイント:** 他 5 ダイアログも同様に `<body>` 直下にあること。

### 6. `aria-modal="true"` および `role` が正しく付与される

- **目的:** A11y 属性が適切に付与されていることを確認。
- **手順:**
  1. 各ダイアログを開いた状態で DevTools の Elements パネルでルート div を確認。
- **期待結果:**
  - すべて `aria-modal="true"` を持つ。
  - ConfirmDialog は `role="alertdialog"`、その他 5 件は `role="dialog"`。
  - `aria-label` または `aria-labelledby` のいずれかが付与されている。

### 7. body スクロールがロックされる

- **目的:** ダイアログ open 中に背後のページがスクロールしないことを確認。
- **手順:**
  1. `/notes` でノート一覧が縦に長い状態を作る（スクロール可能な状態）。
  2. MoveNoteDialog を開く。
  3. マウスホイールやキーボードの ↓ で背後のページをスクロールしようとする。
- **期待結果:** ページがスクロールしない（`body { overflow: hidden }`）。
- **確認ポイント:** ダイアログを閉じた後、スクロールが復活する。

## エッジケース・異常系

### 1. 進行中（isPending）に Esc を押しても閉じない

- **目的:** ADR-004 の安全弁（`closable={!isPending}`）が機能することを確認。
- **手順:**
  1. MoveNoteDialog を開いてディレクトリを選択し、「移動」をクリック。
  2. 移動 API が走っている間（ボタンが「移動中...」表示の間）に Esc を押す。
- **期待結果:** ダイアログが閉じない（API レスポンスが返ってきて `onClose` が呼ばれるまで開いたまま）。
- **確認ポイント:** 同じ挙動を BulkExport / BulkVisibility / SaveView / MergeTag / Confirm でも確認。

### 2. focusable 要素ゼロのとき panel にフォーカス

- **目的:** 全要素が `disabled` になった瞬間にフォーカスが外れないことを確認。
- **手順:**
  1. MoveNoteDialog を開く（select は初期値 ""、送信ボタンは `disabled`）。
  2. 「キャンセル」ボタンが唯一フォーカス可能な要素となる。
- **期待結果:** Tab/Shift+Tab がキャンセルボタン内でループする、もしくは panel にフォーカスが落ちる。
- **確認ポイント:** 「キャンセル」のみ disabled になることはないため、実際には完全な focusable ゼロ状態にはなりにくい。

### 3. BulkExportDialog の navigate 後フォーカス

- **目的:** submit 成功後の `router.navigate` で元のトリガー要素が DOM から消える例外ケースを確認。
- **手順:**
  1. `/notes` でノートを 1 件以上選択、「エクスポート」をクリック → BulkExportDialog を開く。
  2. 「実行」を押下、API 成功で `/exports/$jobId` へ遷移する。
- **期待結果:** ダイアログは閉じ、新ページ `/exports/$jobId` に遷移。フォーカスは body に落ちる（元の要素は存在しない）。アプリがクラッシュしないこと。
- **確認ポイント:** コンソールにエラーが出ないこと。

## 既存機能への影響確認

### 1. 各ダイアログの送信動作が回帰しない

- MoveNoteDialog: ディレクトリ移動が完了する。
- BulkExportDialog: エクスポートジョブが作成され `/exports/$jobId` へ遷移する。
- BulkVisibilityDialog: 公開設定が一括変更される。
- SaveViewDialog: ビューが保存される。
- MergeTagDialog: タグが統合される。
- ConfirmDialog: 確認後にアクション（削除など）が実行される。

### 2. MergeTagDialog のビジュアル

- **目的:** ローカル定数撤去で shadow が `shadow-[0_16px_32px_rgba(0,0,0,0.15)]` から `shadow-lg` に変わることのビジュアル確認。
- **手順:** `/tags` で MergeTagDialog を開き、他ダイアログ（MoveNoteDialog 等）と影の見た目を比較。
- **期待結果:** 影の濃さや距離が他ダイアログと同等で、不自然でないこと。
- **確認ポイント:** PR 説明に before/after スクショを添付すること。

### 3. z-index の競合なし

- **目的:** Portal 化で stacking context が変わっても他要素と被らないことを確認。
- **手順:** 各ダイアログを開いた状態で、ヘッダー・サイドバー・ポップアップ（タグ補完等）と重なる位置に表示してみる。
- **期待結果:** ダイアログが最前面に表示される。

## 確認チェックリスト

- [ ] Esc で 6 ダイアログ全てが閉じる
- [ ] Tab/Shift+Tab がダイアログ内を循環（6 ダイアログ全件）
- [ ] 開時の初期フォーカスが想定通り（dialog は最初の要素 / alertdialog は panel）
- [ ] 閉時に元のトリガー要素へフォーカス復帰（BulkExport 除く）
- [ ] DevTools で `<body>` 直下に Portal されている（6 ダイアログ全件）
- [ ] `aria-modal="true"` および `role` の付与確認
- [ ] body スクロールが open 中ロックされ、close 後に復元
- [ ] isPending 中の Esc が無効化される
- [ ] BulkExport の navigate 後にエラーが出ない
- [ ] 6 ダイアログの送信動作が回帰しない
- [ ] MergeTagDialog のビジュアル（shadow 差分）が許容範囲
- [ ] z-index 競合なし

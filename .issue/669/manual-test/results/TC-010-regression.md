# TC-010: 既存機能への影響確認（Issue #669）

**実行日:** 2026-06-13
**環境:** http://localhost:3000（pnpm dev）/ agent-browser セッション `verify-tc-regression` / Dev Admin でログイン

## 結果サマリー

| # | 項目 | 結果 |
|---|------|------|
| 1 | Ingestion プレビューのディレクトリ欄（fieldset variant 維持） | PASS |
| 2 | 他画面の invalidate（mutation 後の画面更新） | PASS |
| 3 | エディターのモード切替（ビジュアル ⇔ FrontMatter ⇔ HTML） | PASS |

## 詳細

### 1. Ingestion プレビューのディレクトリ欄 — PASS

- `/tmp/tc010-regression.md` を作成し、AppShell のアップロードダイアログ（`/#upload`）から添付。
- プレビュー（IngestionPreviewForm）が表示され、ディレクトリ欄は従来どおり fieldset（legend「ディレクトリ ✨ AI 提案」、border 1px solid、radius 12px）で描画されることを computed style で確認。
- 機能確認: 既存ディレクトリのコンボボックスから「検証ディレクトリ」を選択 →「選択中: 検証ディレクトリ（/検証ディレクトリ）」＋解除ボタンが表示され従来どおり動作。
- 確認後、ジョブは「破棄」で破棄済み。テスト中に `/upload` ページ経由で作成した別ジョブも破棄済み。

### 2. 他画面の invalidate — PASS

- ホーム一覧の選択モードで「Test Note 02」を選択 → 一括操作「移動」で 検証ディレクトリ へ移動。
- 移動直後、ページリロードなしで一覧が更新（並び順・更新日が即時反映、選択状態クリア）されることを確認。除外しすぎの退行なし。
- 復元: 同ノートをルート（/）へ移動し直し、「すべてのノート 19」の一覧に戻っていることを確認。検証ディレクトリは空に戻った。
- 注: 移動操作により当該ノートの更新日時が 2026-06-13 に変わる（移動の副作用、内容は不変）。

### 3. モード切替 — PASS

- Test Note 02 の編集画面（`/notes/.../edit`）で確認。
- ビジュアル → FrontMatter: FrontMatter エディター（「FrontMatter は空です…」＋キー追加フォーム、生編集(JSON)ボタン）が表示。
- FrontMatter → HTML: textarea に HTML ソース（`<h1>Test Note 02</h1>...`）が表示。
- HTML → ビジュアル: ProseMirror エディターが復帰し本文内容も保持。
- 保存せずに終了（ノート内容に変更なし）。

## 備考

- `/upload` の直接 URL アクセス（SSR）はレスポンスが返らずタイムアウトする事象を観測（curl でも再現、`/` の SSR は正常）。クライアントサイド遷移では問題なく表示される。本 Issue の変更とは無関係の可能性が高いが、別途調査を推奨。

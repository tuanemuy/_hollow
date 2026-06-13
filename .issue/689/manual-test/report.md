# Browser Verify Report — Issue #689

**実行日時**: 2026-06-13
**テストソース**: .issue/689/testing.md
**サーバー**: http://localhost:3000
**修正ラウンド**: 1回（TC-body）

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 6 |
| PASS | 6 |
| FAIL | 0 |
| PASS率 | 100% |
| 起票Issue数 | 0 |

---

## シードデータ

- 認証: dev-admin（`dev-admin@example.com`）。パスワード資格情報が無いため、セッション cookie `__Host-session=dev-admin-session-token` をブラウザに注入して認証（`docs/test.md` 標準手順）。
- ノート: タグ付き（`01950622-…001`、タグ test/guide/design）、タグ無し（`019eb23f-…b920`）。
- ディレクトリ: ROOT 直下に「テストディレクトリ」「Research」「TC4新規ディレクトリ」、Research 配下に「書籍要約」（depth 2）。折りたたみ・検索・祖先自動展開の検証に十分。
- `pnpm db:migrate`（適用済み・No migrations）、`pnpm seed:dev-admin`（冪等）を実行。

---

## テスト結果一覧

| TC | テスト名 | 種別 | 最終結果 | 初回結果 | 修正ラウンド | 備考 |
|----|---------|------|---------|---------|-------------|------|
| TC-tags-1 | タグ行のチップUI（AC-1） | 正常系 | PASS | PASS | - | チップ+borderless入力が同一list内に共存 |
| TC-tags-2 | タグ追加/削除/保存/autosave/重複/空（AC-2） | 正常系 | PASS | PASS | - | IME抑止のみ手動確認推奨 |
| TC-title | タイトルの見出しフォント・行高（AC-3） | 正常系 | PASS | PASS | - | font-heading適用・lineHeight=fontSize×1.12 |
| TC-body | 本文エディタのボーダーレス化（AC-5） | 正常系 | PASS | FAIL | Round 1 | InlineEditor.tsx の枠線も撤去して解消 |
| TC-dir | ディレクトリ行の単一pill＋ツリードロップダウン（AC-4） | 正常系 | PASS | PASS | - | 検索/折りたたみ/キーボード/選択/新規作成/閉じる全機能 |
| TC-dir-edge | 検索ヒットゼロ | 異常系 | PASS | PASS | - | 候補ゼロでもクラッシュせず空状態 |

---

## 起票した Issue

なし（唯一の FAID は変更箇所起因かつ即時修正可能だったため Phase 2 に戻って修正・再検証した）。

---

## 失敗詳細（修正済み）

### TC-body: 本文エディタのボーダーレス化

- **失敗ステップ**: 本文 host の computed style 測定
- **期待**: border / border-radius が 0、padding 維持
- **実際（初回）**: border 1px solid / border-radius 8px が残存
- **分類**: 実装バグ（対象コンポーネント取り違え）
- **原因分析**: 計画/Issue は `WysiwygEditor.tsx`（新規画面の WYSIWYG タブ専用）のみを枠線撤去対象としていたが、編集画面 P12（モック対象）の「ビジュアル」タブは `InlineEditor`（`inline` モード）を描画する。実エディタ（`InlineEditor.tsx` L863 `.note-detail-content` host）に枠線・角丸が残っていた。
- **対応**: `InlineEditor.tsx` L863 の host className から `rounded-md border border-hairline` を撤去（`p-4` / `min-h-[480px]` / `focus-within:*` は温存）。typecheck/lint/format 通過後に再測定し border 0px / radius 0px / padding 16px を確認 → PASS。
- **Issue 起票**: 不要

---

## 環境情報

- **OS**: Darwin
- **agent-browser**: 0.27.1
- **サーバーコマンド**: pnpm dev（PORT=3000）
- **ポート**: 3000

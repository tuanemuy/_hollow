# ブラウザ検証レポート — Issue #473: DTOブランド廃止→string

**実行日:** 2026-06-05
**テストソース:** `.issue/473/testing.md`（確認項目4 ブラウザスモーク）
**サーバー:** http://localhost:3006（`pnpm dev`）
**認証:** dev-admin（cookie `__Host-session` 注入、admin/active）
**性質:** 型レベルのリファクタ（DTOブランド廃止→string）。全キャストは型消去によりランタイム不変。

## 結果サマリー

| TC | 対象 | 結果 | 備考 |
|----|------|------|------|
| TC-1 | ノート一覧（`/` = `_app/index.tsx`） | PASS | サイドバー・ディレクトリツリー・ノートリスト・表示形式タブ全描画。500/例外なし。シード空のため一覧0件だが空状態は正常 |
| TC-2 | ノート詳細（getNoteDetail / sourceFile 表示） | SKIP | シードにノート0件で詳細を開けず。getNoteDetail 射影は統合テスト570件でカバー済み |
| TC-3 | タグ管理（`/tags`、`toDtoUserId` インライン動線） | PASS | タグ管理画面・追加フォーム・空状態を正常描画 |
| TC-4 | admin（`/admin`） | PASS | 管理ダッシュボード描画、403/500 なし |

**合計:** 4件（PASS: 3 / SKIP: 1 / FAIL: 0）

## 検出事項（回帰ではない）

`/admin/users` で `SystemError: Stored user has malformed id: ...bob00001`。

- 原因: ローカル D1 のシードに混入した**不正な16進id（'bob' を含む）を持つ既存ユーザー行**。`UuidV7Generator.validate` が rehydration 時に正しく拒否（domain/adapter 層）。
- **Issue #473 のリファクタ起因ではない。** 弾いている検証は domain 層の値検証（今回未変更）で、リファクタ前後で挙動不変。`/admin/users` は実装どおりエラー境界へグレースフルに退避。
- 対処: 不要（ローカルシードの再投入または当該不正行削除で解消。コード修正不要）。

その他コンソールは既存の無関係ログ（Vite 接続・React DevTools 案内・バンドルサイズ警告）のみ。`undefined`・型起因のクラッシュは皆無。

## 注記

- テスト手順書の `/notes` は誤りで、認証済みノート一覧の正ルートは `/`（`/notes` 単体は仕様どおり 404）。testing.md の文言は実装どおりの動線に読み替えて実施した。
- ランタイム不変のリファクタであり、ユニット3117件＋統合570件＋本スモークで非回帰を担保。

## スクリーンショット

- `screenshots/tc1-notes-list.png`
- `screenshots/tc2-note-detail.png`（空状態のホーム）
- `screenshots/tc3-tags.png`
- `screenshots/tc4-admin.png`

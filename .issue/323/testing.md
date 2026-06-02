# 動作確認計画 — Issue #323: UploadDialog editing tree-load effect の view 全体依存を解消する

**Issue:** #323
**作成日:** 2026-06-02

---

## 確認環境

本 Issue は React の `useEffect` 依存配列のリファクタ（観測可能な挙動は不変）。検証は既存ユニットテスト＋静的チェックで担保する。実機ブラウザ確認は必須ではない。

### 検証環境の起動
- ユニットテスト: `pnpm test:unit`
- 型チェック: `pnpm typecheck`
- Lint: `pnpm lint`

（任意でブラウザ確認する場合の dev サーバー起動: `pnpm build` の後 `pnpm start`。ただし本変更は内部リファクタのため通常不要。）

### デプロイ方法
なし（検証環境のみで確認できる）。

## 確認項目

### 1. tree-load effect のリグレッション

- **目的:** editing 遷移時に directory tree が従来どおりロードされ、再生成等の view 更新で挙動が変わらないこと。
- **手順:**
  1. `pnpm test:unit` を実行
  2. `app/components/ingestion/__tests__/UploadDialog.test.tsx` の全テストが pass することを確認
- **期待結果:** 全テスト pass。特に editing 遷移（happy path）、再生成（再生成→waiting→editing）、再試行系が緑。
- **確認ポイント:** tree ロード関連の挙動が回帰していないこと。

### 2. 静的チェック

- **目的:** 依存配列変更が型・lint 規約に適合していること。
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint`
- **期待結果:** どちらもエラーなし（特に biome `useExhaustiveDependencies` の警告が出ないこと）。

## 既存機能への影響確認

- アップロード → プレビュー編集（editing）への遷移で directory picker のツリーが表示されること。これは `UploadDialog.test.tsx` の editing 遷移テストでカバー済み。

## 確認チェックリスト

- [ ] `pnpm test:unit` 全 pass
- [ ] `pnpm typecheck` エラーなし
- [ ] `pnpm lint` エラーなし
- [ ] tree-load effect の依存配列が `[isEditing, tree.length, getTree]` になっている
</content>

# 動作確認計画 — Issue #6: [spec-sync] todo ドメイン削除

**Issue:** #6
**作成日:** 2026-05-18

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm dev
```

### デプロイ方法

ローカル検証環境のみで確認可能。スタジングへのデプロイが必要な場合:
```bash
pnpm deploy:staging
```

---

## 確認項目

### 1. TypeScript 型エラーがないこと

- **目的:** todo ドメイン削除後に型参照が残っていないことを確認する
- **手順:**
  1. `pnpm typecheck` を実行する
- **期待結果:** エラーが 0 件であること
- **確認ポイント:** `TodoRepository`, `D1TodoRepository`, `TodoEvent`, `todoEventDecoders` への参照が残っていないか

### 2. Lint エラーがないこと

- **目的:** 削除済みモジュールへのインポートが残っていないことを確認する
- **手順:**
  1. `pnpm lint` を実行する
- **期待結果:** エラーが 0 件であること

### 3. ユニットテストがパスすること

- **目的:** ドメイン・アプリケーション層のテストが壊れていないことを確認する
- **手順:**
  1. `pnpm test:unit` を実行する
- **期待結果:** すべてのテストが PASS すること
- **確認ポイント:** todo 関連テストが削除され、他のテストが影響を受けていないか

### 4. 統合テストがパスすること

- **目的:** インフラ系テスト（OCC guard / UoW / eventRelayWorker 等）がフィクスチャ置き換え後も正しく動作することを確認する
- **手順:**
  1. `pnpm test:integration` を実行する
- **期待結果:** すべての統合テストが PASS すること
- **確認ポイント:** `occGuard`, `unitOfWork`, `helpers`, `eventRelayWorker` の各テストが新フィクスチャ（tags / processedEvents / note events）で正しく動作すること

### 5. アプリ起動後 /todo ルートが存在しないこと

- **目的:** フロントエンドから todo 画面が完全に削除されていることを確認する
- **手順:**
  1. `pnpm dev` でアプリを起動する
  2. ブラウザで `http://localhost:3000/todo` にアクセスする
- **期待結果:** 404 ページ（Not Found）が表示されること
- **確認ポイント:** todo ルートが routeTree から除去されていること

### 6. 他画面に影響がないこと

- **目的:** todo 削除が他の機能に副作用を与えていないことを確認する
- **手順:**
  1. `pnpm dev` でアプリを起動する
  2. トップページ（`/`）にアクセスし、正常に表示されることを確認する
  3. ノート一覧など主要機能にアクセスし正常に動作することを確認する
- **期待結果:** todo 以外の画面が正常に表示・操作できること

---

## エッジケース・異常系

### 1. マイグレーションが正しく適用されること

- **目的:** 0005_drop_todos.sql マイグレーションが既存の D1 DB に正しく適用できることを確認する
- **手順:**
  1. `pnpm db:apply:local` を実行する
- **期待結果:** エラーなくマイグレーションが適用されること（`todos` テーブルが存在しても DROP IF EXISTS で安全に処理される）

---

## 既存機能への影響確認

- **eventRelayWorker**: todo イベントデコーダ除去後、他ドメインのイベントリレーが正常に動作すること（`pnpm test:integration` で確認）
- **UnitOfWork**: `todoRepository` スロット除去後、他の全リポジトリが正常にコンテキストに載ること（`pnpm test:integration` で確認）
- **ルートツリー**: todo ルート除去後に TanStack Router のルートツリーが正しく生成されること（`pnpm dev` 起動確認）

---

## 確認チェックリスト

- [ ] `pnpm typecheck` → エラー 0 件
- [ ] `pnpm lint` → エラー 0 件
- [ ] `pnpm test:unit` → 全 PASS
- [ ] `pnpm test:integration` → 全 PASS（occGuard / unitOfWork / helpers / eventRelayWorker テスト含む）
- [ ] ブラウザで `/todo` → 404
- [ ] ブラウザでトップ・ノート画面など → 正常表示
- [ ] `pnpm db:apply:local` → マイグレーション 0005 適用成功

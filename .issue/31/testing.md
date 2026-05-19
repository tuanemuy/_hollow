# 動作確認計画 — Issue #31: SavedView に visibility フィルタを永続化

**Issue:** #31
**作成日:** 2026-05-18

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
# D1 マイグレーション適用（ローカル）
pnpm db:apply:local

# 開発サーバー起動
pnpm dev
```

ブラウザで dev サーバーの URL（既定は `http://localhost:5173`）を開く。

### デプロイ方法

```bash
# ステージング dry-run
pnpm deploy:staging:dry

# ステージング適用（必要時のみ、ユーザー確認後）
pnpm deploy:staging
pnpm db:apply:staging
```

### シードデータ

検証用ノートを最低 2 件用意する。
- ログイン後、`/notes/new` 等から手動で作成
- 1 件を **public**（公開状態 public）、1 件を **private** のまま保持
- 期待: `?visibility=public` をかけると public のノートだけが一覧に出る

---

## 確認項目

### 1. `?visibility=public` の URL を SavedView として保存できる

- **目的:** URL の visibility フィルタが SavedView 保存リクエストに載ること
- **手順:**
  1. ログイン後 `/?visibility=public` にアクセス
  2. 一覧が `visibility=public` で絞られていることを確認
  3. 「ビューとして保存」ダイアログを開く
  4. 名前（例: `Public only`）を入力して保存
- **期待結果:** 保存成功。エラー表示なし
- **確認ポイント:** ネットワークタブで `createSavedViewFn` の payload に `query.visibilityFilter: ["public"]` が含まれていること

### 2. 保存した SavedView を選択すると visibility が復元される

- **目的:** SavedView → URL ↔ filter の往復で visibility が消えないこと
- **手順:**
  1. 確認項目 1 で保存した SavedView を一覧から選択（`?viewId=<id>` に遷移する）
  2. 表示されるノート一覧を確認
  3. 公開状態フィルタの UI（`FilterBar` の visibility select / badge）の表示を確認
- **期待結果:**
  - 一覧が public のノートのみで構成されている
  - URL からは `?viewId=<id>` だけが見えても、内部的に visibility=public が効いている
- **確認ポイント:** F12 → Network → loader レスポンスで、ノート一覧が public 件数と一致していること

### 3. visibility なしの SavedView は visibility をフィルタしない

- **目的:** 「フィルタなし」=「空配列」のシリアライズが正しく往復すること
- **手順:**
  1. visibility 指定なしの URL（例: `/`）でビューを保存（名前: `All visibilities`）
  2. 保存した SavedView を選択
- **期待結果:** 全 visibility のノートが表示される（private 含む）
- **確認ポイント:** Network で SavedView の `query.visibilityFilter` が `[]` であること

### 4. `viewQueryEquals` が visibility 差分を検出する（UI 表示）

- **目的:** URL と SavedView の visibility が一致しないとき、UI 上で「保存済みビューと現在のフィルタが不一致」のサインが出ること（既存の SavedViewsList の current view ハイライト挙動）
- **手順:**
  1. 確認項目 1 の `Public only` SavedView を選択（`?viewId=<id>`）
  2. URL を `/?viewId=<id>&visibility=unlisted` に書き換える
- **期待結果:** SavedView 一覧の `Public only` がハイライト（current）扱いされない、または「未保存の変更あり」相当の UI が出る
- **確認ポイント:** `viewQueryEquals` が `visibilityFilter` 差分を検出していること

---

## エッジケース・異常系

### 1. 既存の SavedView（`visibilityFilter` キーなし）が復元できる

- **目的:** 後方互換デコード（ADR-003）
- **手順:**
  1. **Issue #31 実装前に作成された SavedView がローカル DB にある状態を再現する**。再現が難しい場合は、`wrangler d1 execute` で `query_json` を手動で書き換え、`visibilityFilter` キーを取り除く
  2. 該当 SavedView を選択
- **期待結果:** エラーにならず、visibility フィルタなしとして一覧表示される
- **確認ポイント:** `RehydrationError` / `SystemError(DataIntegrityError)` がスローされないこと

### 2. 不正な visibility 値が JSON に入っている

- **目的:** `PublicationVisibility.create` が `BusinessRuleError` を投げ、`RehydrationError` 経由で `SystemError(DataIntegrityError)` になることを確認
- **手順:** `wrangler d1 execute` で `query_json.visibilityFilter = ["bogus"]` を仕込む → SavedView 一覧を読み込む
- **期待結果:** 該当 SavedView のロード時に `SystemError(DataIntegrityError)` が出る
- **確認ポイント:** エラー応答が UI 上の SerializedError ハンドラで適切に処理されること

---

## 既存機能への影響確認

- **referencingNoteId の往復**: Issue #8 で対応した referencingNoteId 永続化が壊れていないこと（同じ `createSavedView` パスを通る）
- **既存 SavedView のロード**: `query_json` にキーがない既存行が `RehydrationError` を起こさないこと（エッジケース 1 と同じ）
- **`viewQueryEquals` の他フィールド**: tagIds / directoryId / dateRange / keyword / referencingNoteId の比較が依然として機能すること

---

## 確認チェックリスト

- [ ] `pnpm typecheck` がパスする
- [ ] `pnpm test:unit` がパスする（既存 + 新規テスト）
- [ ] `pnpm lint` がパスする
- [ ] 確認項目 1: `?visibility=public` を SavedView として保存できる
- [ ] 確認項目 2: SavedView 選択時に visibility が復元される
- [ ] 確認項目 3: visibility なしの SavedView が「フィルタなし」として動作する
- [ ] 確認項目 4: visibility 差分が `viewQueryEquals` で検出される
- [ ] エッジケース 1: 既存 SavedView（`visibilityFilter` キーなし）が壊れない
- [ ] referencingNoteId 等の他フィールド永続化が回帰していない

# 動作確認計画 — Issue #48: search 経路 (searchOwnNotes) の updatedAt / directoryId / slug projection 実値化 + ADR-013/014 解消

**Issue:** #48
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

ローカル D1 マイグレーション（本 Issue では schema 変更はないが、初回環境構築や別 PR との衝突回避のため念のため実行）:

```bash
pnpm db:apply:local
```

### デプロイ方法

ステージング:

```bash
pnpm deploy:staging
```

本 Issue の変更は DB schema 変更を含まないため、`db:apply:staging` は不要。worker (`relay` / `consumer` / `pruner` / `dlq`) も touch しないので `deploy:staging:relay` 等は不要。

---

## 確認項目

### 1. search 結果のリスト表示で実 `updatedAt` が出る

- **目的:** Issue #29 までは search 経路で `updatedAt = new Date(0)` のため `1970-01-01` 表示だった。本 Issue 後は実際の更新日時が出ることを確認
- **前提:** 同一 owner で過去の異なる日付に更新した複数のノート（例: 今日 / 昨日 / 1 週間前）にユニークなキーワード（例: "uniquekw"）を含めて作成
- **手順:**
  1. ログイン
  2. ホーム画面で `/?q=uniquekw` にアクセス（または header の検索ボックスから検索）
  3. リスト表示の各行の右側（更新日時カラム）と本文下のフッタ部の更新日時を確認
- **期待結果:** 各ノートの実際の `updatedAt` が日本語短縮日付（例: `2026年5月20日`）で表示される。`1970年1月1日` は表示されない
- **確認ポイント:** すべての行で実日付が出ること、`1970` の文字列が DOM に無いこと

### 2. search 結果のリスト表示で公開状態バッジが出る

- **目的:** Issue #1 〜 #29 までは `showVisibilityBadge = mode === "filter"` ガードで search 経路ではバッジ非表示だった。本 Issue 後は両モードで表示されることを確認
- **前提:** 同一キーワードを含む `private` / `unlisted` / `public` の 3 ノートを用意
- **手順:**
  1. `/?q=uniquekw` で検索
  2. リスト表示の各行の visibility chip（`公開` / `限定公開` / `非公開`）を確認
- **期待結果:** 各ノートに正しい visibility chip が表示される
- **確認ポイント:** chip の色とテキスト（public=success/緑系、unlisted=warning/橙系、private=tertiary/灰系）

### 3. search 結果でカレンダー表示が機能する (ADR-014 解消)

- **目的:** Issue #29 までは search 経路で `display=calendar` だとフォールバック文言が出ていた。本 Issue 後は実日付でグルーピングされて表示されることを確認
- **前提:** 同一キーワードを含む複数日付のノート（少なくとも 2 つの異なる日付）
- **手順:**
  1. `/?q=uniquekw&display=calendar` にアクセス
  2. カレンダー表示が出ることを確認
- **期待結果:** 日付ごとに見出し（例: `2026年5月20日（水）`）でグルーピングされ、各日付配下にノート一覧が出る。「検索結果はカレンダー表示に対応していません」のフォールバック文言は**出ない**
- **確認ポイント:** グルーピング見出しが実日付であること（`1970年1月1日` でないこと）

### 4. search 結果でタイル表示でバッジが出る

- **目的:** tile 表示でも visibility chip が search 経路で表示されることを確認
- **前提:** 項目2と同じ
- **手順:**
  1. `/?q=uniquekw&display=tile` にアクセス
- **期待結果:** タイル表示でも各ノートに visibility chip が表示される
- **確認ポイント:** chip 色と文言

### 5. search 結果の各行から detail ページへ遷移できる

- **目的:** `directoryId` / `slug` の実値化により、行の link が正しい detail URL を指すこと
- **手順:**
  1. `/?q=uniquekw` で検索
  2. リスト表示の任意の行のタイトル link をクリック
- **期待結果:** `/notes/<noteId>` の detail ページに遷移する
- **確認ポイント:** link クリックで遷移できること、404 にならないこと

### 6. filter 経路は既存挙動を維持

- **目的:** リグレッション確認。filter 経路の表示が壊れていないこと
- **手順:**
  1. `/` （クエリなし）にアクセス → 一覧表示で実 `updatedAt` と visibility chip が出る
  2. `/?display=calendar` → カレンダー表示で日付グルーピング
  3. `/?display=tile` → タイル表示で chip
  4. `/?tagNames=foo` 等のフィルタ → フィルタが効く
- **期待結果:** Issue #29 までの挙動と完全一致

## エッジケース・異常系

### 1. search 結果 0 件

- **目的:** 該当ノート無しのとき正しい空状態が出ること
- **手順:** `/?q=nonexistentterm` にアクセス
- **期待結果:** 「該当するノートがありません」の空状態 UI が出る。`findByIds` が空配列で呼ばれてもエラーにならない
- **確認ポイント:** コンソールエラー無し

### 2. search index に hit があるが DB から削除された競合ケース (ADR-002: drop 動作)

- **目的:** drop ポリシーが機能すること
- **手順:**
  1. ノート作成 → search index への index 完了を待つ
  2. ノートを物理削除（purge）
  3. index relay が走る前に同キーワードで検索
- **期待結果:** 該当 hit が結果から drop され、検索ページ全体は正常に表示される。500 エラーにならない、コンソールエラーも出ない
- **確認ポイント:** index relay 走行後は通常通り index 側からも消える
- **再現難易度:** 高（タイミングウィンドウが短い）。手動再現が困難な場合は、unit test (`searchOwnNotes.test.ts` の drop ケース) で代替確認

### 3. cursor pagination の順序保持

- **目的:** search の score 降順が `findByIds` 経由で崩れないこと
- **前提:** 同キーワードを含むノート 10 件以上を作成（score に差が出るようにタイトル/本文の match 度を変える）
- **手順:**
  1. `/?q=keyword&limit=5` 等で 1 ページ目を取得
  2. ノートの並び順を記録
  3. F5 リロード
- **期待結果:** 並び順が一致する（順序が安定）。score 降順に並ぶ
- **確認ポイント:** リロードで順番がバラバラにならない

## 既存機能への影響確認

- **`searchPublicNotes` 経路への影響なし**: 公開検索（`/users/<username>` の検索など、共有 `SearchHitDTO` を使う他経路）が壊れていないこと
- **`listNotesByOwner` (filter 経路) への影響なし**: ホームの非検索表示・カレンダー・タイルが既存通り動作すること
- **`NoteRepository.findById` 等の他 port メソッドへの影響なし**: detail ページ、編集、削除等が動作すること
- **`pnpm typecheck` 通過**: port 追加で他の `implements NoteRepository` 箇所が壊れないこと
- **`pnpm test:unit` 通過**: 既存テストが緑、新規 unit test も緑
- **`pnpm test:integration` 通過**: 新規 `findByIds` integration test を含めて緑

## 確認チェックリスト

- [ ] (1) search 結果リストで実 `updatedAt` 表示
- [ ] (2) search 結果リストで visibility バッジ表示（3 種類とも色とテキスト確認）
- [ ] (3) search + `display=calendar` で日付グルーピング表示、フォールバック文言が出ない
- [ ] (4) search + `display=tile` でバッジ表示
- [ ] (5) search 結果の行 link から detail ページに遷移できる
- [ ] (6) filter 経路（クエリなし）の表示がリグレッションなし
- [ ] (E1) search 0 件で空状態 UI が出る
- [ ] (E3) cursor pagination 順序が安定
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` 通過
- [ ] `pnpm test:unit && pnpm test:integration` 通過

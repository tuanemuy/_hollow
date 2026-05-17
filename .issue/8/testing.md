# 動作確認計画 — Issue #8: P10 公開状態・内部リンク参照フィルタ + listNotesByOwner projection 拡張

**Issue:** #8
**作成日:** 2026-05-17

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
# D1 マイグレーション適用（ローカル）
pnpm db:apply:local

# 開発サーバー起動（Vite + Cloudflare 開発モード）
pnpm dev
```

ブラウザで `http://localhost:5173`（dev サーバーが表示する URL）を開く。

### デプロイ方法

```bash
# ステージング dry-run（実際には反映しない検証）
pnpm deploy:staging:dry

# ステージング適用（必要時のみ、ユーザー確認後）
pnpm deploy:staging
pnpm db:apply:staging
```

### シードデータ

検証用ノートを 3 種以上 (private / unlisted / public + 相互に内部リンクを持つもの) 用意する必要がある。
- ログイン後、`/notes/new` 等から手動で 3〜5 件作成
- 1 件を公開（公開状態 = public）、1 件を限定公開（unlisted）、残りを private のまま
- 1 件のノート本文に `[[他ノートのタイトル]]` を含め、解決済み内部リンクを作る

---

## 確認項目

### 1. `?visibility=public` で結果が絞られる（filter 経路）

- **目的:** filter 経路（`q` 空）で visibility パラメータが効くこと
- **手順:**
  1. ログイン後 `/?visibility=public` にアクセス
  2. 一覧に表示されるノートが公開済（public）のみであることを確認
  3. 各ノードカードの公開状態 badge が `public` を示すこと
- **期待結果:** public ノートのみ表示、badge が実値を反映
- **確認ポイント:** Issue #1 ADR-013 で抑制されていた badge が表示されている

### 2. `?visibility=private` で行が無いノートも含まれる

- **目的:** `publication_states` 行が無い note も private 扱いされること
- **手順:**
  1. `/?visibility=private` にアクセス
  2. publication 操作をしていないノート（行なし）+ 明示的に private に戻したノート、両方が表示されること
- **期待結果:** 行欠損 + `visibility='private'` 行の和集合
- **確認ポイント:** ADR-003 の wantsPrivate 分岐ロジックが正しく動く

### 3. `?visibility=unlisted` で限定公開のみ表示

- **目的:** unlisted も正しく絞り込めること
- **手順:** `/?visibility=unlisted` で限定公開ノートのみ表示されることを確認
- **期待結果:** unlisted ノートのみ
- **確認ポイント:** badge も unlisted を反映

### 4. フィルタ未指定で挙動が retrograde しない

- **目的:** 受入条件「フィルタ未指定で listNotesByOwner の挙動が retrograde しない」
- **手順:**
  1. `/` にアクセス（クエリパラメータなし）
  2. 既存と同じ全件が表示されること
  3. 件数表示も既存挙動と同じであること
- **期待結果:** 全 note が表示される。retrograde なし
- **確認ポイント:** 既存の `status: 'active'` フィルタはそのまま効く

### 5. `?referencingNoteId=<id>` で内部リンク参照フィルタが効く

- **目的:** 内部リンク参照フィルタが URL 駆動で動くこと
- **手順:**
  1. 内部リンクを含むノート（例: ノート A が `[[ノートB]]` を持つ）の参照先ノート B の id を特定（DB を見るか URL を控える）
  2. `/?referencingNoteId=<ノートBのid>` にアクセス
  3. ノート A のみが表示されることを確認
- **期待結果:** 該当ノートを参照しているノートのみ表示
- **確認ポイント:** `noteInternalLinks.resolvedNoteId` が一致する `fromNoteId` のみ返る

### 6. `referencingNoteId` chip 解除

- **目的:** FilterBar の内部リンク参照解除 UI が動くこと
- **手順:**
  1. `/?referencingNoteId=<id>` にアクセス
  2. FilterBar に「参照中: <短縮id>」chip が表示されることを確認
  3. chip の × ボタンをクリック
  4. URL から `referencingNoteId` が消え、一覧が全件に戻る
- **期待結果:** 解除操作で URL とフィルタ状態が更新される

### 7. NoteListItemDTO.visibility が実値を反映（受入条件）

- **目的:** 受入条件「NoteListItemDTO.visibility が実値を反映」
- **手順:**
  1. `/` で各種公開状態のノートが混在する一覧を表示
  2. 各カードの公開状態 badge が実値（private/unlisted/public）になっていること
- **期待結果:** badge が `'private'` 固定ではなく実値を反映
- **確認ポイント:** ADR-001（旧 #1）解消の確認

### 8. SavedView 経路で referencingNoteId / visibility が往復する

- **目的:** ADR-007 対応。SavedView 保存・復元で本 Issue で追加した URL パラメータが消失しない
- **手順:**
  1. `/?visibility=public&referencingNoteId=<id>` にアクセス
  2. 「ビューを保存」操作を行う
  3. 別の URL に遷移後、保存したビューを再度開く
  4. URL に `?visibility=public&referencingNoteId=<id>` が復元されることを確認
- **期待結果:** 両パラメータが SavedView 保存・復元の往復で保持される

### 9. 複合フィルタ AND

- **目的:** 各フィルタが AND で合成されること
- **手順:** `/?visibility=public&tagNames=foo&referencingNoteId=<id>` にアクセス
- **期待結果:** 3 条件すべてに合致するノートのみ表示
- **確認ポイント:** candidate id 集合の Set 交差が正しく動く

## エッジケース・異常系

### 1. `?visibility=` 空値

- **目的:** URL に visibility= とだけ書かれた場合
- **手順:** `/?visibility=` にアクセス
- **期待結果:** zod schema `.catch(undefined)` でフォールバックされ、フィルタなしと同じ全件表示

### 2. `?referencingNoteId=invalid-id`（存在しない id）

- **目的:** 存在しない note id が指定された場合
- **手順:** `/?referencingNoteId=00000000-0000-0000-0000-000000000000`
- **期待結果:** 0 件として表示。エラーにならない
- **確認ポイント:** adapter の早期 return `[]` ロジック

### 3. 公開状態 select の操作（filter 経路 / search 経路 両方）

- **目的:** ADR-008 の既知挙動確認
- **手順:**
  1. `/`（filter 経路）で公開状態 select を `public` に変更 → 一覧が絞られる
  2. ヘッダー検索で `q` に何か入力 → search 経路に切り替わる
  3. search 経路で公開状態 select を `public` に変更
- **期待結果:**
  - filter 経路では結果が絞られる
  - search 経路では select 操作は URL に反映されるが、結果には反映されない（ADR-008 既知挙動）
- **確認ポイント:** 「結果に反映されない」は ADR-012 解消用の別 Issue で対応予定

## 既存機能への影響確認

- **タグフィルタ** (`?tagNames=`): 引き続き動作することを確認
- **日付フィルタ** (`?from=&to=`): 引き続き動作
- **ディレクトリフィルタ** (`?directoryId=`): 引き続き動作。FilterBar の「クリア」ボタンが directoryId も含めて clear することを確認（既存軽微 bug 修正の検証）
- **ノート検索** (`?q=`): 引き続き動作
- **件数表示**: filter 適用後も count は全件のままという既存挙動が維持されている（ADR-009 既知挙動）
- **カレンダー表示**: visibility 関連の変更で calendar 表示に影響していないこと

## 確認チェックリスト

- [ ] `?visibility=public` で public のみ
- [ ] `?visibility=private` で行なし + 行あり private が両方
- [ ] `?visibility=unlisted` で unlisted のみ
- [ ] フィルタ未指定で全件表示（retrograde なし）
- [ ] `?referencingNoteId=<id>` で参照しているノートのみ
- [ ] FilterBar の referencingNoteId chip × 解除が動く
- [ ] visibility badge が実値を反映
- [ ] SavedView 保存・復元で visibility / referencingNoteId が往復
- [ ] 複合フィルタ AND
- [ ] `?visibility=` 空値で全件
- [ ] `?referencingNoteId=` 存在しない id で 0 件
- [ ] search 経路で公開状態 select の既知挙動（UI 反映されるが結果は変わらない）
- [ ] 既存タグ/日付/ディレクトリ/検索フィルタが retrograde しない
- [ ] `pnpm typecheck && pnpm lint && pnpm test` がすべてグリーン

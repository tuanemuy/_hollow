# 動作確認計画 — Issue #32: 内部リンク参照フィルタの新規入力 UI (P11 詳細からの導線)

**Issue:** #32
**作成日:** 2026-05-19

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

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

`/notes/new` から手動で 3 件以上のノートを作成する:

- **ノート A**: 任意のタイトル（例: 「ターゲット」）、本文に特記なし
- **ノート B**: 任意のタイトル、本文に `[[ターゲット]]` を含めてノート A への内部リンクを持たせる
- **ノート C**: 任意のタイトル、本文に `[[ターゲット]]` を含めてノート A への内部リンクを持たせる

3 件以上保存後、ノート A を開くとバックリンクに B / C が表示されることを念のため確認する。

---

## 確認項目

### 1. P11 詳細から「このノートを参照しているノート一覧を見る」リンクで navigate できる（主要受入条件）

- **目的:** Issue 本文スコープ 1 — P11 ノート詳細画面からの導線が機能する
- **手順:**
  1. ノート A の詳細画面（`/notes/<A.id>`）を開く
  2. メタ情報パネルの「バックリンク」セクション内に「このノートを参照しているノート一覧を見る」リンクが表示されることを確認
  3. リンクをクリック
  4. URL が `/?referencingNoteId=<A.id>` に遷移すること
  5. ノート一覧にノート B / C のみが表示され、ノート A 自身は含まれないこと
- **期待結果:** ノート A を参照しているノート群（B / C）が一覧に出る
- **確認ポイント:** リンクテキストが ADR-004 で pin した文言「このノートを参照しているノート一覧を見る」と一致

### 2. FilterBar の chip にノートタイトルが表示される（P11 経由）

- **目的:** Issue 本文スコープ 3 — chip 表示が UUID 断片からタイトルに改善される
- **手順:**
  1. 上記 1. の手順でノート A から `/?referencingNoteId=<A.id>` に遷移
  2. FilterBar の chip を確認
- **期待結果:** chip ラベルが `参照中: ターゲット`（ノート A のタイトル）となっていること
- **確認ポイント:** UUID 断片（`参照中: <8 文字>`）ではなくタイトル文字列が出ている

### 3. URL 直叩きでも chip タイトルが表示される

- **目的:** P11 経由でなくとも resolver が機能すること
- **手順:**
  1. ブラウザのアドレスバーに直接 `/?referencingNoteId=<A.id>` を入力（A は自分の保有ノート）
  2. ページが読み込まれた後、FilterBar の chip を確認
- **期待結果:** `参照中: ターゲット`（A のタイトル）が表示される
- **確認ポイント:** SSR で title が解決されること（クライアント側で遅延表示にならない）

### 4. SavedView 復元時にも chip タイトルが表示される

- **目的:** `viewQueryToSearch` の復元処理（`app/components/note/list/listSelectors.ts` 行 162 周辺）と本 Issue の resolver が整合すること（Issue #8 ADR-007 で referencingNoteId は SavedView 経路でも往復済み）
- **手順:**
  1. `/?referencingNoteId=<A.id>` でフィルタが効いた状態に
  2. 「ビューとして保存」で SavedView を作成（任意の名前）
  3. アドレスバーを別タブで `/?viewId=<保存した view id>` に切り替え
  4. 復元後の FilterBar chip を確認
- **期待結果:** chip ラベルが `参照中: ターゲット` で復元される
- **確認ポイント:** SavedView 経由でも title resolver が呼ばれていること（baseSearch.referencingNoteId 経由）

---

## エッジケース・異常系

### 5. 他人のノート id を URL に入れた場合（owner mismatch）

- **目的:** ownership check が loader 側で機能し、情報漏洩しないこと
- **手順:**
  1. 別ユーザーアカウントでノート X を作成し、その id を控える
  2. 元のユーザーに戻り、`/?referencingNoteId=<X.id>` を直接 URL 入力
- **期待結果:**
  - ページが 200 で表示される（500 にならない）
  - ノート一覧は 0 件（または該当なし）
  - chip ラベルは `参照中: <X.id の先頭 8 文字>`（UUID 断片表示）
  - 他ユーザーのノートタイトルは **表示されない**

### 6. 不正な UUID（schema パス通過後、`findById` が 0 件で `null` フォールバック）

- **目的:** 形式上 UUID と異なる文字列でも resolver が安全にフォールバックして 500 にならないこと
- **手順:**
  1. `/?referencingNoteId=not-a-uuid-string` を URL 入力（`noteListSearchSchema` は `z.string().min(1)` で通す）
- **期待結果:**
  - ページが 200 で表示される
  - chip ラベルは `参照中: not-a-uu`（先頭 8 文字）
  - ページ全体は壊れない
- **メカニズム:** `NoteId.create` は trim/length チェックのみで UUID 形式は検証しないため、文字列は port 層を通過する。`noteRepository.findById('not-a-uuid-string')` が D1 で 0 件 → `null` → resolver は `{ title: null }` を返す

### 7. 存在しない id

- **目的:** `findById` の `null` フォールバックが効くこと
- **手順:**
  1. 形式は有効な UUID だが DB に存在しない id を `/?referencingNoteId=<...>` で渡す
- **期待結果:** ページ 200、chip は UUID 断片表示、一覧は 0 件

### 8. chip の × ボタンで解除（既存挙動の維持）

- **目的:** Issue #8 で実装された解除機能が retrograde していないこと
- **手順:**
  1. `/?referencingNoteId=<A.id>` の状態で FilterBar chip の × ボタンをクリック
- **期待結果:**
  - URL から `referencingNoteId` パラメータが消える
  - chip 自体が表示されなくなる
  - 一覧が通常表示に戻る

---

## 既存機能への影響確認

- **NoteMetaPanel のバックリンクセクション**: 既存のバックリンク件数表示・リンク一覧の表示崩れ / リンク先遷移が変わっていないこと
- **NoteActions の操作群**: 編集 / 公開 / 移動 / 複製 / 削除 / URL コピー の動作が変わらないこと
- **FilterBar の他フィルタ**: タグ chip / 期間 / 公開状態 / クリア ボタンの挙動が retrograde していないこと
- **search 経路 (`q` 非空)**: 検索結果ページで `referencingNoteId` パラメータが既存通り扱われ、リスト・chip が壊れないこと
- **count 表示**: ホーム上の total 件数は filter 未反映の既存挙動を維持していること（Issue #8 ADR-009 で別 Issue 化済み）

---

## 確認チェックリスト

- [ ] 1. P11 から新リンクで `/?referencingNoteId=<id>` に navigate できる
- [ ] 2. P11 経由で chip にタイトルが表示される
- [ ] 3. URL 直叩きで chip にタイトルが表示される
- [ ] 4. SavedView 復元時にも chip にタイトルが表示される
- [ ] 5. 他人のノート id では chip が UUID 断片、ノートタイトルは漏れない
- [ ] 6. 不正な UUID でも 500 にならず chip は UUID 断片
- [ ] 7. 存在しない id でも 500 にならず chip は UUID 断片
- [ ] 8. chip × ボタンで `referencingNoteId` がクリアされる
- [ ] 既存 NoteMetaPanel / NoteActions / FilterBar の他機能が retrograde していない
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test` が pass

# 動作確認計画 — Issue #230: Front Matter エディタを固定プロパティ前提から「あれば表示」モデルに改める（tags は除外）

**Issue:** #230
**作成日:** 2026-05-27

---

## 確認環境

このIssueの変更は以下に閉じる:

- フロントエンド: `app/components/note/editor/FrontMatterEditor.tsx`, `editorState.ts`, `NoteEditor.tsx`, `app/components/note/detail/FrontMatterPanel.tsx`
- spec ドキュメント: `spec/domains/note.md`, `spec/pages/index.md`, `spec/scenario/organize.md`, `spec/manual-tests/organize.md`

ドメイン層・アダプター層・アプリケーション層への変更はないため、DB マイグレーションは不要。

### 検証環境の起動

```bash
# 開発サーバーを起動（Cloudflare Workers + D1 ローカル）
pnpm dev
```

初回または schema 変更後は事前に:

```bash
pnpm db:migrate   # wrangler d1 migrations apply hollow-local-d1 --local
```

### デプロイ方法

検証環境（ローカル dev サーバー）のみで動作確認可能。ステージング・本番へのデプロイは本 Issue の単独確認には不要（含めるなら以下）:

```bash
pnpm deploy:staging        # ステージング Worker
pnpm db:apply:staging      # ステージング D1 マイグレーション（schema 変更がある場合のみ。本 Issue はなし）
```

### 自動検証コマンド

```bash
# 型・lint・format
pnpm typecheck
pnpm lint:fix
pnpm format

# 単体テスト（editorState / FrontMatterEditor）
pnpm test:unit

# 統合テストの note / ingestion 関連
pnpm test:integration
```

## 確認項目

### 1. 既存任意キーの後方互換（mood などの未知キー）

- **目的:** Issue 完了条件「既存ノートとの後方互換（既に書かれている任意キーが消えない）」を満たすこと
- **手順:**
  1. シード or 手動で `frontMatter: { mood: "tired", project: "alpha" }` を持つノートを 1 件用意
  2. P12 エディタ画面でそのノートを開く
  3. FrontMatter パネルに `mood` / `project` 行が表示されることを確認
  4. `mood` の値を `"focused"` に書き換える → autosave が走り保存される
  5. ページをリロード → 値が `focused` で残る
  6. raw JSON モードに切り替え → JSON に `mood: "focused"`, `project: "alpha"` が両方含まれる
- **期待結果:** 任意キーがエディタの構造モードで表示・編集・保存でき、リロード後も保持される
- **確認ポイント:** キーの並び順が初期ロード時の順序のまま保たれる

### 2. 既存 `frontMatter.tags` の残置と表示（ADR-002）

- **目的:** Issue 完了条件「`tags` は Front Matter からは除外」を満たしつつ、既存値は失わないこと
- **手順:**
  1. シード or 手動で `frontMatter: { tags: ["legacy", "old"] }` を持つノートを 1 件用意
  2. P12 エディタ画面でそのノートを開く
  3. FrontMatter パネルに `tags` 行が表示されることを確認（配列なので disabled バッジ + 「raw モードで編集」CTA 付き）
  4. 行末の「削除」ボタンが有効であることを確認
  5. 別の任意キー（例 `description`）を追加・編集 → autosave → リロード
  6. `frontMatter.tags: ["legacy", "old"]` が依然として残っていることを raw JSON モードで確認
  7. `P11 ノート詳細画面` で同ノートを開く → FrontMatter パネルに `tags` が他キーと同列の `<dl>` 行として表示される
- **期待結果:** 既存 `frontMatter.tags` は他キーと同列の汎用レンダリングで残り、自動削除・自動移行されない
- **確認ポイント:** タグチップ表示には `frontMatter.tags` の値は出ない（タグソースはハッシュタグ／タグチップのみ）

### 3. タグサジェストから `tags` が除外されている

- **目的:** Issue 完了条件「`tags` は Front Matter からは除外し、ハッシュタグ／タグチップに一本化」を満たすこと
- **手順:**
  1. 新規ノートを作成
  2. FrontMatter パネルで「キーを追加」を押す
  3. キー入力欄にフォーカスし、サジェスト（`<datalist>`）を表示
- **期待結果:** サジェストに `date`, `description`, `title`, `slug` のみが出る。`tags`, `aliases`, `publish` は出ない
- **確認ポイント:** 自由入力として `tags` をタイプして追加することは依然可能（自由入力の妨げにならない）

### 4. ハッシュタグからのタグ反映

- **目的:** タグソースが本文ハッシュタグに一本化されていること
- **手順:**
  1. 新規ノートで本文に `#design #review` を入力
  2. 保存 / autosave 後、タグチップに `design` / `review` が反映される
  3. FrontMatter パネルにはタグ系の行が**自動追加されない**ことを確認
- **期待結果:** タグはハッシュタグ → タグチップ経路でのみ伝播。Front Matter には書かれない

### 5. 新規キー追加 → 任意キーの編集

- **目的:** 「エディタが固定キー前提でなく、任意キーを編集できる」完了条件
- **手順:**
  1. 既存ノートを開く
  2. 「キーを追加」を押し、新規行のキー入力に `customField` と入力 → 値に `hello` と入力
  3. autosave 後にリロード → `customField: "hello"` が残る
  4. 行末の削除ボタンを押す → 行が消え、autosave で削除される
  5. raw JSON モードに切り替え → `customField` が JSON にも含まれていない
- **期待結果:** 任意キーを自由に追加・編集・削除できる

### 6. キー rename（順序保持と中間状態の保護）

- **目的:** ADR-003 で決めた「rename は専用 reducer action + ローカルバッファ + blur commit」が UX レベルで動くこと
- **手順:**
  1. `frontMatter: { a: "1", b: "2", c: "3" }` のノートを開く
  2. `b` のキー入力にフォーカスし、`xyz` に書き換える（まだフォーカスは外さない）
  3. その状態でリロードまたは別画面に遷移しない（タイプ中は autosave に巻き込まれないことを確認）
  4. 入力欄から blur（Tab or 他要素クリック）
  5. autosave が走り、`{ a: "1", xyz: "2", c: "3" }` で保存される
  6. 構造モードでキーの並び順が `a → xyz → c` のままであることを確認（末尾に飛ばない）
- **期待結果:** キー順序が保持され、中間状態（`b` → `bx` → `bxy` ...）は autosave されない

### 7. 構造モード ⇔ raw JSON モードのトグルでキー順序と複雑値が保持される

- **目的:** ADR-003 の「pending 状態でのモード切替方針」と「複雑値は raw モードで編集」を担保
- **手順:**
  1. `frontMatter: { a: "1", arr: ["x", "y"], nested: { k: 1 } }` のノートを開く
  2. 構造モードで `arr` と `nested` の行が disabled バッジ + raw モード CTA 付きで表示されることを確認
  3. raw JSON モードに切り替え → JSON テキストエリアに同じ順序・同じ構造で出る
  4. raw モードで `arr: ["x", "y", "z"]` に書き換えて構造モードに戻す
  5. 構造モードに戻った後もキーの並び順 `a → arr → nested` が保持される

### 8. 詳細画面の FrontMatter 表示（known-key 特別扱いの撤去）

- **目的:** Issue 完了条件「表示側（FrontMatterPanel）も tags の特別扱いをやめる」
- **手順:**
  1. `frontMatter: { mood: "tired", title: "T", tags: ["legacy"] }` のノートを `P11 ノート詳細画面` で開く
  2. FrontMatter `<details>` を展開
  3. キーが `mood`, `title`, `tags` のすべて 1 つの `<dl>` に並んでいる（others セクション分割なし）
- **期待結果:** known キーと others の分割が撤去され、挿入順そのままで全キーが並ぶ

## エッジケース・異常系

### 1. キー rename での重複キー reject

- **目的:** reducer の重複ガードがインライン表示で示されること
- **手順:**
  1. `frontMatter: { a: "1", b: "2" }` のノートを開く
  2. `b` のキー入力を `a` に書き換えて blur
- **期待結果:** rename は no-op、フォーム下に「キー `a` は既に存在します」相当のインライン警告が出る。`a`/`b` 両方とも元のまま残る

### 2. 新規キー追加での重複キー reject

- **手順:**
  1. `frontMatter: { foo: "x" }` のノートを開く
  2. 「キーを追加」 → 新規行に `foo` をタイプして blur
- **期待結果:** 追加は no-op、インライン警告。既存 `foo` の値は壊れない

### 3. raw JSON モードで不正な JSON 入力

- **手順:**
  1. raw JSON モードに切り替え、`{ invalid json` のような壊れた JSON を入力
- **期待結果:** 行番号付きエラーメッセージが表示され、保存はブロックされる

### 4. 配列値の行で削除ボタンを押す

- **手順:**
  1. `frontMatter: { tags: ["legacy"] }` のノートを開く
  2. `tags` 行（disabled バッジ表示）の削除ボタンを押す
- **期待結果:** `tags` キーが消え autosave される（disabled なのは値の編集だけで、削除は可能）

## 既存機能への影響確認

- **取り込み（runIngestionJob）:** 取り込んだノートの Front Matter に `tags` が**書かれない**こと。タグは `suggestedTagNames` / `tagNames` 経由でのみ反映される
- **検索インデックス（buildNoteSnapshot）:** `frontMatter.date` を基準日とする挙動が変わらないこと。`date` キーを編集 → 検索ファセットの日付に反映される
- **公開ページ・export:** Front Matter 全キーをそのまま出力する既存挙動が壊れない（`frontMatter.tags` 残置値も含めて出る）
- **autosave / dirty 管理:** 任意キー追加・編集・削除で `dirtyKeys: "frontMatter"` が正しく発火し autosave される

## 確認チェックリスト

- [ ] 既存任意キー（mood 等）が消えずに編集できる
- [ ] 既存 `frontMatter.tags` が残置され、配列 disabled 表示 + 削除ボタン有効
- [ ] サジェストに `tags`/`aliases`/`publish` が出ない
- [ ] 本文 `#hashtag` がタグチップに反映され、Front Matter に書かれない
- [ ] 新規キー追加・編集・削除が動く
- [ ] キー rename でキー順序が保たれ、blur 前は autosave に巻き込まれない
- [ ] モードトグル（構造 ⇔ raw）でキー順序・複雑値が保持される
- [ ] 詳細画面 (P11) で known/others 分割が撤去され、挿入順で全キー表示
- [ ] 重複キー rename / 追加でインライン警告
- [ ] 不正な JSON で保存ブロック
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` が全件パス
- [ ] `pnpm test:integration`（note / ingestion）が全件パス

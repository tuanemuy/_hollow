# tc-review-fix 結果

実行日時: 2026-05-28
agent-browser: 0.27.0
セッション: verify-review-fix
URL: http://localhost:3000

## サマリ

| Fix | 概要 | 判定 |
| --- | --- | --- |
| Fix-1 | DeleteDirectoryDialog の form-in-form bubble (ARCH-B-001) | **PASS** |
| Fix-2 | 矢印・キー操作のリグレッション (A11Y-W-001 / A11Y-W-004) | **PASS** |
| Fix-3 | 名前重複・禁止文字 schema-level バリデーション (ARCH-W-003) | **FAIL** |
| Fix-4 | アクティブ状態の視覚スタイル (FE-W-001) | **PASS** |

---

## Fix-1: DeleteDirectoryDialog (ConfirmDialog) の form-in-form bubble

### 操作
1. `existing@example.com` でログイン → ホーム
2. 「Foo配下の検証用ノート 1」を開く → 「編集」ボタンで `/notes/{id}/edit` へ
3. DirectoryPicker で FooRenamed2 が選択された状態のまま「削除」ボタンをクリック
4. DeleteDirectoryDialog (「FooRenamed2」を削除しますか？) が開く
5. ダイアログ内「キャンセル」をクリック

### 期待
- URL が `/notes/{id}/edit` のまま (NoteEditor の form が submit されない)
- ダイアログが閉じる

### 実際
- URL: `http://localhost:3000/notes/01938f02-0000-7000-8000-000000000101/edit` (変化なし)
- ダイアログが閉じ、編集画面はそのまま表示
- NoteEditor form は submit されておらず、ページ遷移なし

### 判定: **PASS**

スクリーンショット: `screenshots/tc-review-fix/fix1-dialog-open.png`, `fix1-after-cancel.png`

---

## Fix-2: 矢印・キー操作 (A11Y-W-001 / A11Y-W-004)

### 操作
1. サイドバーの treeitem (Bar) にフォーカス
2. ↓キー → Child1Renamed treeitem へフォーカス移動
3. ↓キー → Baz treeitem へ
4. ↑キー → Child1Renamed treeitem へ
5. 「Bar の操作」(︙) ボタンをクリック → メニュー開く
6. `document.activeElement` を確認
7. Esc キーで閉じる
8. `document.activeElement` を確認

### 期待
- 矢印キーで treeitem 間を移動できる
- メニュー開いた直後に最初の menuitem (「子ディレクトリを作成」) にフォーカス
- Esc 後、フォーカスが「Bar の操作」トリガーに戻る

### 実際
- ↓↓↑ の遷移: Bar → Child1Renamed → Baz → Child1Renamed (期待通り)
- メニュー開直後の activeElement: `{role: "menuitem", text: "子ディレクトリを作成"}` (期待通り)
- Esc 後の activeElement: `{label: "Bar の操作", text: "⋮"}` (期待通り)

### 判定: **PASS**

---

## Fix-3: 名前重複・禁止文字 schema-level バリデーション

### 操作
1. サイドバーの「Bar の操作」(︙) → メニュー「子ディレクトリを作成」
2. CreateDirectoryDialog が「作成先: Bar」で開く
3. 名前欄に `a/b` を入力 → 「作成」をクリック
4. ダイアログ内に表示されるエラーメッセージを確認

### 期待
- ダイアログ内に「使用できない文字が含まれています」相当のエラーが表示される
- 「エラーが発生しました」(汎用) ではない

### 実際
- サーバ応答: `POST /_serverFn/.../createDirectoryFn_createServerFn_handler` → **HTTP 422 (validation)**
- スキーマレベルでのバリデーションは正しく発火している
- クライアントで catch される AppServerError は `serialized.kind: "validation"`, `fieldErrors: { name: ["使用できない文字が含まれています"] }` を持っている
- ダイアログの React state にも上記が正しく格納されている (fiber 経由で確認)
- **ところが UI 表示は依然「エラーが発生しました」(unknown 扱い) のまま**

#### 原因 (実装バグの特定)
`app/components/directory/CreateDirectoryDialog.tsx:114` で
```tsx
{displayError(error)}
```
を呼んでいるが、`error` の型は既に `SerializedError` (plain object)。
`displayError` 内部の `extractSerializedError(error)` は plain object を `instanceof Error` でも `hasSerializedRemnant` でも認識できず、`serializeError` → `kind: "unknown"` に強制的に落とす。
結果として `renderErrorMessage` の `case "unknown"` 分岐に入り、"エラーが発生しました" が表示される。

直すには `displayError(error)` を `renderErrorMessage(error)` に置き換えるか、`displayError` 側で plain SerializedError も pass-through できるよう修正する必要がある。
schema 自体 (`app/components/directory/schema.ts`) の修正は正しく適用されており、サーバが返す validation エラーの中身も正しい — 唯一クライアント表示パスが壊れている。

同じパターンは他の Directory 系ダイアログ (Delete / Rename / Move) でも踏んでいる可能性が高い。

### 判定: **FAIL**

スクリーンショット: `screenshots/tc-review-fix/fix3-error.png`

---

## Fix-4: アクティブ状態の視覚スタイル (FE-W-001)

### 操作
1. サイドバーの「Bar」ディレクトリ link をクリック
2. ホーム (`?directoryId=<bar_id>`) でフィルタされた表示に遷移
3. サイドバー内の link の computed style と data-active / aria-current を確認

### 期待
- アクティブな Bar link が背景色 surface (`#f5f5f7`) + font-medium (500) でハイライト
- 非アクティブの Baz / TestRoot は背景透明 + font-normal (400)

### 実際
- URL: `http://localhost:3000/?page=1&limit=20&directoryId=01938f02-0000-7000-8000-000000000002`
- Bar link: `data-active=""`, `aria-current="page"`, bg `rgb(245, 245, 247)`, font-weight `500`
- Baz link: 属性なし, bg `rgba(0,0,0,0)`, font-weight `400`
- TestRoot link: 属性なし, bg `rgba(0,0,0,0)`, font-weight `400`

### 判定: **PASS**

スクリーンショット: `screenshots/tc-review-fix/fix4-active-bar.png`

---

## 推奨アクション

- **Fix-3 の再修正が必要**: `CreateDirectoryDialog` (および同パターンの DeleteDirectoryDialog / RenameDirectoryDialog / MoveDirectoryDialog があれば) で `displayError(error)` を `renderErrorMessage(error)` に置き換えるか、`displayError` を plain SerializedError 入力にも対応させる。
- 修正後、再度本テストの Fix-3 を実行して「使用できない文字が含まれています」が表示されることを確認すること。

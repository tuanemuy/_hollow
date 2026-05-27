# 実装計画 — Issue #230: Front Matter エディタを固定プロパティ前提から「あれば表示」モデルに改める（tags は除外）

**Issue:** #230
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

`FrontMatterEditor` を「固定既知キー(`KNOWN_KEYS`)前提の構造編集 UI」から、「既存ノートに書かれている任意キーをそのまま編集 + 新しい任意キーを追加できる汎用 key-value フォーム」へ作り直す。同時に `tags` キーを Front Matter からエディタ・表示・サジェストの全経路で外し、タグソースをハッシュタグに一本化する。

## スコープ

### 含まれるもの

- `FrontMatterEditor.tsx` を任意キー編集 UI に作り直し（`KNOWN_KEYS` 撤廃、`tags` を排除）
- `editorState.ts` の reducer に `renameFrontMatterKey` action を追加（キー順序を保持し、重複キーは reject + エラー返却）
- `FrontMatterPanel.tsx` の known/others 分割を廃止（`<details>` 折り畳み構造は本 Issue では撤去しない — 折り畳みパターンの再設計は別 Issue 候補）
- `editorState.ts` の関連 JSDoc を新モデルに合わせて更新
- `editorState.test.ts` に後方互換ケース + 順序保持ケース + rename action ケースを追加
- `FrontMatterEditor` の単体テスト新規（任意キー行・追加・削除・rename・複雑値 disabled 表示）
- spec/design ドキュメントの更新:
  - `spec/domains/note.md` の既知キー記述
  - `spec/pages/index.md` の P11/P12 説明
  - `spec/scenario/organize.md` のタグ rename 仕様（実装と乖離している記述の同時是正）と D4 関連記述
  - `spec/manual-tests/organize.md` の TC-D4-01〜04（TC-D4-05 は publish 編集 UI 仕様としてスコープ外扱い）
- `NoteEditor.tsx` のヘッダ JSDoc「Structured FrontMatter known-key UI」表記の更新（コード変更なし）
- `pnpm typecheck && pnpm lint:fix && pnpm format` で整合性確認

### 含まれないもの

- `frontMatter.tags` の既存値を Tag テーブルへ自動移行する処理（理由: ADR-002 参照）
- `runIngestionJob.ts` / `saveNote.ts` / `createNote.ts` の変更（既に `frontMatter` に `tags` を書いていないため不要）
- ドメイン層（`FrontMatter` 値オブジェクト）の変更（既に `Record<string, unknown>` で正しい）
- `publish` フラグの編集 UI 化と TC-D4-05（公開ステータス書換時注意ダイアログ）の仕様検証（実装側の状態が不明、本 Issue の意図とは独立）
- `FrontMatterPanel` の `<details>` 折り畳み UX 再設計
- 親 Issue #225 の他項目

## 実装ステップ

### 1. editorState.ts に rename / add 用の reducer action を追加

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:**
  - `renameFrontMatterKey(oldKey, newKey)` action を追加。
    - キーの**挿入順を保持**したまま rename する（`Object.entries(current)` を走査して旧キー位置で差し替え）
    - 新キーが既存と重複する場合は no-op + `frontMatterJsonError = "key already exists: {newKey}"` 相当のエラーを返却（reducer レベルで reject）
  - `addFrontMatterKey(key)` action を追加。
    - 同名キーが既に存在する場合は no-op + 同様のエラー返却
    - 新規キーは空文字値で末尾に挿入
  - 既存の `setFrontMatterField` action は無変更（プリミティブ値の更新に使用）
- **理由:** rename を「delete + add」で連続発火するとキー順序が末尾に飛ぶ + 中間状態の rawJson 上書きリスクがあるため、専用 action で 1 dispatch にまとめる（ADR-003 参照）

### 2. FrontMatterEditor を任意キー対応の汎用 key-value フォームに作り直す

- **対象ファイル:** `app/components/note/editor/FrontMatterEditor.tsx`
- **変更内容:**
  - `KNOWN_KEYS` / `KnownKey` / `fieldId` map / `asTagList` / `parseTagList` を削除
  - 構造編集モードを「`Object.entries(parsed)` を 1 行ずつ key/value ペアで表示」する形に置き換え
    - 各行: `[ key input ][ value input ][ 削除 ]` のフレックス
    - 左: キー名 `<input>` — **ローカル state にバッファし、blur / Enter で `renameFrontMatterKey` を 1 dispatch**（タイプ中の中間鍵がスナップショット候補にならないようにする）
    - 右: 値 `<input type="text">`（プリミティブ専用）。変更は `setFrontMatterField` で即時 dispatch
    - 配列・ネストオブジェクト値は disabled バッジ + 「raw モードで編集」CTA（行末の削除ボタンは引き続き使用可能 — 既存 `frontMatter.tags` を消したいユーザの救済となる）
    - 行末: 「削除」ボタン → `setFrontMatterField(key, undefined)`
  - 「キーを追加」ボタンで `addFrontMatterKey("")` を dispatch。即座に新規行の key input にフォーカス。重複キー時のエラーはフォーム下にインライン表示
  - サジェスト用 `SUGGESTED_KEYS = ["date", "description", "title", "slug"]`（**`tags`/`aliases`/`publish` を含めない**）を `<datalist>` で提供
    - `date` はアプリ側 `parseFrontMatterDate` が読む正規キー、`description`/`title`/`slug` は一般的な Markdown FrontMatter 慣習として残す
    - `aliases`/`publish` は実装側で何も読んでいないため除外（誤誘導防止）
  - スタイル: 既存 `field` / `fieldControl` / `fieldLabel` / `pillBtn` を流用。新規 CSS は追加しない
- **理由:** Issue 完了条件「任意キーを編集できる / 後方互換」を満たし、`tags` 経路を物理的に断つ

### 3. FrontMatterPanel の known-key 特別扱いを撤去

- **対象ファイル:** `app/components/note/detail/FrontMatterPanel.tsx`
- **変更内容:**
  - `KNOWN_KEY_ORDER` / `KNOWN_KEY_SET` / `knownPresent` / `others` 分割を廃止
  - `Object.keys(frontMatter)` を**挿入順そのまま**で 1 つの `<dl>` に並べる
  - `<details>` 折り畳み構造は本 Issue では撤去しない — 全キーを 1 つの `<details>` に格納し続ける（折り畳み UX の再設計は別 Issue 候補）。空オブジェクト時の表示は既存挙動を維持
  - JSDoc の「Known keys (`title`, `date`, `tags`, ...)」記述を「Renders all keys present in the FrontMatter record as a generic key/value list」に書き換え
- **理由:** 「あれば表示」モデルに UI を合わせる + `tags` の特別扱い撤去という Issue 要件を同時達成。既存 `frontMatter.tags` は他キーと同じ汎用レンダリングで表示される（情報損失なし）

### 4. editorState.ts / NoteEditor.tsx / FrontMatterEditor.tsx の JSDoc を最新モデルに合わせる

- **対象ファイル:** `app/components/note/editor/editorState.ts`, `app/components/note/editor/NoteEditor.tsx`, `app/components/note/editor/FrontMatterEditor.tsx`（ステップ 2 と同時実施）
- **変更内容:**
  - `editorState.ts` のヘッダ JSDoc 等の `tags` 言及を任意キー編集モデル前提の文へ更新
  - `NoteEditor.tsx` のヘッダ JSDoc「Structured FrontMatter known-key UI + raw-JSON toggle (`FrontMatterEditor`)」を「Generic key-value FrontMatter editor + raw-JSON toggle」へ更新
  - `FrontMatterEditor.tsx` のヘッダ JSDoc「structured editor for the known keys (`title`, `date`, `tags`, ...)」「`tags` is rendered as a comma-separated `<input>`」を「Generic key-value editor for any keys present in the FrontMatter record + raw-JSON toggle. Arrays / nested objects are shown read-only and must be edited via raw mode.」へ更新
- **理由:** コードと意図のズレを残さない

### 5. spec/domains/note.md を更新

- **対象ファイル:** `spec/domains/note.md:74-78`
- **変更内容:** 既知キーリストから `tags: string[]` を削除し、「既知キー」の概念自体を「実装側で特定の意味を持つキー（例: `date` は検索インデックスの基準日）」のような書き方に整える

### 6. spec/pages/index.md を更新

- **対象ファイル:** `spec/pages/index.md:127, 161`
- **変更内容:**
  - P11: 「FrontMatter パネル（既知キーの構造編集 / タグ操作 / ...）」→「FrontMatter パネル（ノートに書かれているキーの一覧表示）/ タグ操作は別パネル（ハッシュタグ／タグチップ）」
  - P12: 「メタデータパネル（FrontMatter 既知キー構造編集 / 生 YAML 編集 / ...）」→「メタデータパネル（FrontMatter の任意 key-value 編集 + 生 JSON 編集モード切替、タグ操作はハッシュタグ／タグチップ）」（YAML→JSON は ADR-008 で既決の事実反映）

### 7. spec/scenario/organize.md を更新

- **対象ファイル:** `spec/scenario/organize.md:50, 59-69`
- **変更内容:**
  - 50 行目: 「タグ名を変更すると本文中 `#hashtag` と FrontMatter の tags が一括更新」→「タグ名を変更すると本文中 `#hashtag` が一括更新（FrontMatter には書き戻さない）」
  - D4 セクション: 「既知キー: title / aliases / created / updated / tags / publish」→「ノート側で任意に付けたキーをそのまま編集」「既知キー」概念を撤去し、`tags` を例から外す
  - 異常系の「tags が配列でない」例は「raw JSON モードで不正な JSON 入力」「重複キーの追加」等に差し替え

### 8. spec/manual-tests/organize.md の TC-D4 系を更新

- **対象ファイル:** `spec/manual-tests/organize.md:289-326`
- **変更内容:**
  - TC-D4-01〜04 の `tags` を例にした手順を `description` などの任意キー（プリミティブ）に差し替え
  - TC-D4-02 の「生 YAML を編集」→「生 JSON を編集」（ADR-008 事実反映）
  - TC-D4-04（既知キー型違反）は「raw JSON モードで不正な JSON 入力時に保存ブロック」相当に書き換え
  - TC-D4-05（publish 編集 UI 仕様）は本 Issue スコープ外。ヘッダに「⚠️ Front Matter 経由の publish 編集 UI は未実装の可能性あり — 実装状況に応じて別 Issue で検証」のメモを残す（ファイルからは削除しない）

### 9. editorState のテストへ後方互換 / 順序保持 / rename 回帰テストを追加

- **対象ファイル:** `app/components/note/editor/__tests__/editorState.test.ts`
- **変更内容:**
  - 既存ノートの未知キー（例: `mood: "tired"`）を初期 state にロード → 任意キー追加・編集を経ても消えない / `frontMatterRawJson` にも反映される
  - 既存ノートで `frontMatter.tags: ["legacy"]` を持つ state → 他キー編集 → `snapshotForSubmit.frontMatterJson` に `tags: ["legacy"]` が保存され続ける（ADR-002 担保）
  - `renameFrontMatterKey("a", "z")` でキーの**挿入順が保持**される（位置入れ替え無し）
  - `renameFrontMatterKey("a", "b")` で `b` が既存 → no-op + エラー返却、`a` も `b` も元のまま
  - `addFrontMatterKey("foo")` で同名が既に存在 → no-op + エラー返却
  - `renameFrontMatterKey` 実行後に `frontMatterRawJson` も同期更新される（既存 `setFrontMatterField` と同じ不変条件）
  - raw JSON モード ⇔ 構造モード切替でキー順序が保たれる（`JSON.parse(JSON.stringify(x))` の順序保持依存）

### 10. FrontMatterEditor の単体テストを新規追加

- **対象ファイル:** `app/components/note/editor/__tests__/FrontMatterEditor.test.tsx`（新規）
- **変更内容:**
  - 任意キー行のレンダリング・追加・削除
  - rename 時はキー入力 blur / Enter まで dispatch されない（ローカルバッファ挙動）
  - 配列値の行が disabled バッジ + raw モード CTA 付きで表示される + 削除ボタンは有効
  - `SUGGESTED_KEYS` datalist に `tags` が含まれない

### 11. typecheck / lint / format / 単体テストで全体検証

- **コマンド:**
  - `pnpm typecheck && pnpm lint:fix && pnpm format`
  - `pnpm test:unit`（特に `editorState.test.ts`, `autosaveLogic.test.ts`）

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001:** `KNOWN_KEYS` 完全撤廃 + 最小サジェスト（`SUGGESTED_KEYS = ["date", "description", "title", "slug"]`、`tags`/`aliases`/`publish` を含めない）に切り替え
- **ADR-002:** 既存 `frontMatter.tags` は無視（残置）。マイグレーション・自動移行は行わない
- **ADR-003:** エディタ UI 形状は「縦並び行リスト + raw JSON モードのトグル」。キー rename は専用 reducer action で順序を保持し、UI はローカルバッファ → blur / Enter で commit。配列／ネスト値は raw モードで編集

## リスクと注意点

- **後方互換:** 既存ノートの任意キーが構造編集モードから消えないこと。reducer は元から任意キー対応だが、新 UI が `KNOWN_KEYS` 前提のコードパスを残さないよう注意
- **配列／ネスト値:** 構造編集モードでは編集不可。raw モードへの誘導を明示しないと「壊れた」と感じる恐れ → 「複雑な値あり — raw モードで編集」インジケータと CTA を必ず付ける。削除ボタンは引き続き有効にして既存 `frontMatter.tags` を消したいユーザの救済とする
- **キー rename:** UI の key input をローカル state にバッファし、blur / Enter で `renameFrontMatterKey` action を 1 dispatch。reducer 側で挿入順を保持し、重複キーは no-op + エラー返却（中間状態の rawJson 上書き・autosave 巻き込みを防止）
- **キー順序:** `<dl>` / raw JSON モードトグルでキー順序を保つこと。`Object.entries` ベースで描画し、reducer も順序保持。テストで明示的にカバー
- **spec と manual-test の更新漏れ:** `organize.md` の D4 系と TC-D4 系の整合性に注意。`scenario/organize.md:50` のタグ rename は実装と既に乖離している（実装は `renameInBody` 本文のみ）ので、本 Issue で同時に正す
- **`publish` キーの扱い:** Front Matter 経由の publish 編集 UI（TC-D4-05）は実装側で本当に動いているか不明。本 Issue は「publish キーを汎用 key-value として表示・編集可能にする」までで、注意ダイアログのフローは現状のまま（実装されていれば壊さない、未実装なら本 Issue でも追加しない）
- **#225 の親スコープ:** 親 Issue で他の修正項目もあるが、本 Issue は Front Matter / tags の項目のみに集中
- **タグチップ UI:** NoteEditor の `tagInput`（カンマ区切り）は既に Front Matter とは別経路の入力。変更不要。混乱を避けるためレイアウトで「タグ」セクションと「FrontMatter」セクションが明確に分かれていることを目視確認

## テスト方針

- **ユニット (vitest)**
  - `editorState.test.ts`:
    - 既存任意キーが初期化後も保持される / 未知キー追加・削除
    - `renameFrontMatterKey` でキー順序が保たれる / 重複キー時は no-op + エラー
    - `addFrontMatterKey` で重複時は no-op + エラー
    - `frontMatter.tags: ["legacy"]` を含む既存ノートを編集後も snapshot に保持
    - raw JSON モード ⇔ 構造モードでキー順序保持
  - `FrontMatterEditor.test.tsx`（新規）: 任意キー行のレンダリング・追加・削除・rename（blur で commit）・複雑値の disabled 表示・`SUGGESTED_KEYS` datalist に `tags` が含まれない
- **手動 (manual-tests/organize.md 更新後)**
  - 既存ノート（`frontMatter` に `mood: "tired"` のような未知キー）を編集 → 構造編集モードで表示・編集・削除できる
  - 既存ノート（`frontMatter.tags: ["legacy"]` が残っているもの）を編集 → エディタ UI で `tags` 行は配列のため disabled 表示だが削除ボタンで消せる / サジェストには出ない / 詳細画面では一覧に出る
  - 新規ノートで `tags` をサジェストから選べないこと、本文に `#foo` を書くとタグチップに反映されること
  - raw JSON モード ⇔ 構造モードのトグルで配列／ネスト値とキー順序が失われないこと
  - キー名を rename 中、blur するまで他キーや autosave がトリガされないこと
- **回帰:** `pnpm test:unit` 全件パス、`pnpm test:integration` のうち note / ingestion 関連が全件パス

## レビュー履歴

### 2周目（2026-05-27）

両視点とも「問題点ゼロ」で終了。以下の改善提案を取り込んで完了。

**取り込んだ改善提案**:
- [S-001（要件）] `FrontMatterEditor.tsx` 自体のヘッダ JSDoc 更新をステップ 4 に明記
- [S-001（アーキ）] `renameFrontMatterKey` 実行後の `frontMatterRawJson` 同期テストケースをステップ 9 に追加
- [S-002（アーキ）] pending（未 commit）状態でのモード切替挙動を ADR-003 で明文化（追記済み）
- [S-003（アーキ）] `FrontMatterPanel` の空オブジェクト時の挙動を「既存挙動を維持」と明記（ステップ 3 に既記載）

**確認のみ**:
- [S-002（要件）] `spec/design/` 配下に FrontMatter エディタの固定 5 フィールドを描いた図がないかは testing.md 作成時に確認する

### 1周目（2026-05-27）

**修正した点（アーキ視点）**:
- [P-001] キー rename の順序崩壊 + 中間状態リスク → 専用 reducer action `renameFrontMatterKey` / `addFrontMatterKey` を追加（ステップ 1）。UI 側はローカル state にバッファし blur / Enter で commit。ADR-003 を更新
- [P-002] `aliases`/`publish` がサジェストに含まれていた問題 → `SUGGESTED_KEYS` を `["date", "description", "title", "slug"]` に縮小（実装で読まれていないキーを除外、`tags` も除く）。ADR-001 を更新
- [P-003] TC-D4-05（publish）の扱い → スコープ外と「含まれないもの」に明記。manual-tests には「⚠️ 別 Issue で検証」メモを残す方針に変更

**取り込んだ改善提案**:
- [S-001（要件）] `NoteEditor.tsx` のヘッダ JSDoc「Structured FrontMatter known-key UI」表記更新を「含まれるもの」に追加（ステップ 4）
- [S-002（要件）] `frontMatter.tags` 残置の回帰テストを ステップ 9 に明記
- [S-001（アーキ）] 重複キーは reducer レベルで reject + インライン表示（ステップ 1）
- [S-002（アーキ）] raw ⇔ 構造モードトグルでキー順序保持テストを追加（ステップ 9）
- [S-003（アーキ）] `<details>` 撤去はスコープ外に切り出し、「全キーを 1 つの `<details>` に格納し続ける」方針に変更（ステップ 3）
- [S-004（アーキ）] `tags` 行の救済策として「disabled 表示でも削除ボタンは有効」をリスク欄に明記

**見送った提案とその理由**:
- [S-003（要件）] `plan.md` の「含まれるもの」に D6 タグリネーム同時是正の根拠 1 行追加 → 「含まれるもの」のリストに `scenario/organize.md` の更新理由として組み込み済み（実質取り込み）

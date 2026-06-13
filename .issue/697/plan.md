# 実装計画 — Issue #697: ノート編集画面: FrontMatterモードを廃止し、メタデータを下部に常設して編集できるようにする

**Issue:** #697
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ノート編集画面（`NoteEditor`）の編集モードタブから FrontMatter を廃止し、メタデータ編集領域（`FrontMatterEditor`）を本文エディタの下に常設配置する。本文編集（inline/wysiwyg/html）と並行して、常にメタデータの追加・編集・削除ができるようにする。フロントエンドのみの変更で、ドメイン/ユースケース/アダプターには影響しない。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ノート編集画面（新規・既存どちらも）の編集モードタブに「FrontMatter」が表示されない（`TABS_NEW`/`TABS_EDIT` が inline/wysiwyg/html のみ） | Issue 受け入れ条件1 | 1, 2 |
| AC-2 | 本文編集モード（inline/wysiwyg/html）に関わらず、画面下部で FrontMatter の追加・編集・削除ができる（`FrontMatterEditor` がフォーム末尾に常時マウントされる） | Issue 受け入れ条件2 | 3 |
| AC-3 | 下部領域内で構造編集 ⇔ 生編集（JSON）の切り替えができる（`frontMatterMode` トグルが下部領域内で機能） | Issue 受け入れ条件3 | 3 |
| AC-4 | FrontMatter のバリデーション（キー制約・深さ・サイズ）と保存時のシリアライズ挙動が従来どおり維持される（reducer の FrontMatter アクション群・`snapshotForSubmit`・`onSubmit` の `JSON.stringify` を変更しない） | Issue 受け入れ条件4 | 1, 3 |
| AC-5 | 未保存の変更がある状態で本文モードを切り替えても、FrontMatter の編集内容が失われない（`onModeChange` の整理後も FrontMatter 状態は保持される） | Issue 受け入れ条件5 | 1, 4 |
| AC-6 | `pnpm typecheck && pnpm lint:fix && pnpm format` がパスする | Issue 受け入れ条件6 | 全ステップ |
| AC-7 | 関連テストが更新され、パスする（`editorState.test.ts` / `autosaveLogic.test.ts` / `noteEditorModeChange.test.tsx` / 未追跡の `editorModeSwitch.test.tsx` を含む） | Issue 受け入れ条件7 | 5 |

## スコープ

### 含まれないもの

- FrontMatter のデータ構造（`FrontMatterDTO` / ドメインの `FrontMatter` value object / バリデーション制約）。本 Issue はフロントエンドの表示・配置の変更のみで、ワイヤ境界（`frontMatterJson`）もシリアライズ挙動も変えない。
- `FrontMatterEditor` の構造編集 ⇔ 生編集（JSON）トグルそのものの機能。トグルは引き続き `frontMatterMode`（structured/raw）で駆動し、配置だけ下部領域内へ移す。
- ノート詳細表示画面の `FrontMatterPanel`。
- `spec/design/pages/P12-editor.html` モックの更新（FrontMatter をタブとして描画している箇所がある）。後述の「リスクと注意点」でドキュメント乖離として記録するに留め、本 Issue では `spec-sync` 等の別作業に委ねる。
- バックエンド全レイヤー（ドメイン/ユースケース/アダプター/プレゼンテーション）。影響なし。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/NoteEditor.tsx` — オーケストレーター（**main 基準・#715 取込済み**）。`state.mode === "frontMatter"` の分岐（main 488-513 行付近）で `FrontMatterEditor` を本文エディタと排他表示している。`onModeChange`（main 192-247 行付近）が blur→dirty 再評価→confirm→**WYSIWYG 装飾消失ゲート（`surface==="edit" && nextMode==="wysiwyg"` で `detectUnsupportedTags` → `setPendingWysiwygSwitch` → `ConfirmDialog`）**→`setMode` を行う。`confirmWysiwygSwitch`（main 252-275 行付近）と `ConfirmDialog`（main 515 行付近）も #696 由来で存在する。`onMediaInsert` は `state.mode === "wysiwyg"` を見るが frontMatter は参照していない。`onSubmit` は `JSON.stringify(state.frontMatter)` を送出。**WYSIWYG ゲート関連（`detectUnsupportedTags` import・`pendingWysiwygSwitch` state・`confirmWysiwygSwitch`・`ConfirmDialog`）は本 Issue では一切変更しない。**
  - `app/components/note/editor/EditorModeSwitch.tsx` — 純粋なタブ制御。**main（#715 取込済み）時点**で `TABS_NEW`（wysiwyg/frontMatter/html）と `TABS_EDIT`（inline/wysiwyg/frontMatter/html）に `frontMatter` エントリがある。本 Issue では `frontMatter` のみ除去（WYSIWYG タブは温存）。
  - `app/components/note/editor/editorState.ts` — `EditorMode = "html" | "frontMatter" | "wysiwyg" | "inline"`（48 行）。`createInitialEditorState` は surface で `wysiwyg`/`inline` を選ぶのみで `frontMatter` を初期モードにはしない（200 行）。`setMode` は任意の `EditorMode` を受理（450-453 行）。FrontMatter 状態（`frontMatter` / `frontMatterMode` / `frontMatterRawJson` / `frontMatterJsonError`）と FrontMatter アクション群（`setFrontMatterField` / `renameFrontMatterKey` / `addFrontMatterKey` / `setFrontMatterRawJson` / `toggleFrontMatterMode` / `clearFrontMatterError`）はモードと独立。`DirtyKey` の `"frontMatter"`（75, 638 行）は **EditorMode ではなくダーティキー** なので削除対象外。
  - `app/components/note/editor/FrontMatterEditor.tsx` — 自身の `mode` prop は `FrontMatterMode`（structured/raw）であり EditorMode とは無関係。ルート要素が `mt-4 rounded-lg border ... p-5`（281 行）。`handleToggleMode`（274-278 行）が blur→`onToggleMode` を実行（構造/生 切替時の buffer commit 用）。
  - `app/components/note/editor/styles.ts` — `frontMatterRow` 等の module-scoped 文字列定数。`editorModeTabs` はタブレールのスタイル。
  - `app/components/note/editor/useAutosave.ts` — `shouldFlushAutosave` は `state.mode === "wysiwyg"` の非対応タグ ack のみ mode を見る。frontMatter モードは参照しない。FrontMatter は `snapshotForSubmit` 経由で常に送出されるため、常設化後も autosave 挙動は変わらない。`abortInFlight` は discard 時のフェッチ中断用。
  - テスト:
    - `__tests__/editorState.test.ts:272-278` — `setMode mode:"frontMatter"` を直接テスト（要更新）。
    - `__tests__/autosaveLogic.test.ts:160-169` — `setMode mode:"frontMatter"` で「FrontMatter モードでも非対応タグ未 ack で flush できる」をテスト（要更新）。
    - `__tests__/noteEditorModeChange.test.tsx` — `onModeChange` の confirm 条件・discard 時の in-flight cancel を `NoteEditor` 結合でテスト。FrontMatter タブには依存せず HTML タブで切替を起こすため、`onModeChange` を整理してもタブ存在前提が崩れなければそのまま通る見込み（要確認）。
    - `__tests__/FrontMatterEditor.test.tsx` — `FrontMatterEditor` 単体テスト。`mode="structured"`（FrontMatterMode）を渡すのみで EditorMode 非依存。ルート要素のレイアウトクラスをアサートしていない（grep で `mt-4`/`border` アサート無し）ため見た目調整の影響を受けにくい（要確認）。
    - `__tests__/editorModeSwitch.test.tsx`（**git 追跡済み**） — Issue #696 / PR #715（編集画面に WYSIWYG タブを追加）由来のタブ構成テスト。**PR #715（`c4ec3652`）は origin/main にマージ済み**（2026-06-13 確認）。本 Issue は main から切ったブランチで実装するため、main 時点の期待値は edit surface = `["ビジュアル","WYSIWYG","FrontMatter","HTML"]`、new surface = `["WYSIWYG","FrontMatter","HTML"]`。本 Issue で FrontMatter のみ除去するため期待値を更新する（WYSIWYG タブは温存）。
- あるべきアーキテクチャ:
  - CLAUDE.md「Frontend / Styling」：utility-first、`data-*` 属性による state styling、module-scoped style 定数、reducer の純粋性。
  - `editorState.ts` 冒頭 JSDoc：reducer は React 非依存・モデル状態（content/mode/autosave/dirty）に限定し、一過性のビュー UI 状態は orchestrator local state に置く（#696 ADR-002 が踏襲）。
  - FrontMatter の構造/生トグルは `FrontMatterMode`（structured/raw）として既に EditorMode と分離されており、常設化は「本文モード（EditorMode）」と「メタデータ表示（常設）」を直交させる方向で、既存の関心分離に沿う。
- 既存実装の状態:
  - 現状は FrontMatter が EditorMode の一値として本文編集と排他になっており、「メタ情報は本文に付随し常に触れたい」という要件と乖離している。本 Issue でこれを是正する。
  - `EditorMode` 型に `frontMatter` が含まれることで `setMode`・`createInitialEditorState`・タブ定義・テストが連動している。型から外すと型エラーが顕在化するため、参照箇所を網羅的に潰す（下記「リスク」参照）。
  - **#715（#696）は origin/main にマージ済み**（2026-06-13 確認、`c4ec3652`）。本 Issue は **main から切ったブランチで実装**するため、編集画面には WYSIWYG タブと装飾消失 ConfirmDialog ゲートが既に存在する。本計画はこの **main の状態を正**とし、(a) `EditorMode`/タブから `frontMatter` を除去、(b) `FrontMatterEditor` を下部常設化、(c) WYSIWYG ゲートは温存、で進める。現在の作業ブランチ（issue/692）は #715 を含まないが、実装ブランチは main から切るので混同しないこと。
- 依存関係: 変更は `app/components/note/editor/` 内に閉じる。`NoteEditor` を import する route（`/notes/$noteId/edit`・`/notes/new` 等）は props 互換のため影響なし。

## 設計

### ドメインモデルへの影響
なし。FrontMatter value object・`FrontMatterDTO`・バリデーション制約・ワイヤ境界（`frontMatterJson`）はいずれも変更しない。本 Issue はフロントエンドの表示配置のみ。

### ユースケース / アプリケーションロジック
なし。`createNote` / `saveNote` / `saveNoteDraft` の入力契約は不変。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

3 つの直交した関心に整理する:

1. **本文編集モード（EditorMode）** = `inline | wysiwyg | html` のみ。タブで切替。
2. **メタデータ編集（常設）** = `FrontMatterEditor` をフォーム末尾に常時マウント。本文モードと独立。
3. **メタデータの構造/生表示（FrontMatterMode）** = `structured | raw`。下部領域内のトグルで切替（現状の `toggleFrontMatterMode` をそのまま使う）。

`EditorMode` から `frontMatter` を除いても、FrontMatter の状態（`frontMatter` / `frontMatterMode` / `frontMatterRawJson` / `frontMatterJsonError`）と reducer アクション群はそのまま残す。これらは元々モードと独立しているため、型変更の波及は「`frontMatter` を `EditorMode` の一値として参照している箇所」（タブ定義・`state.mode === "frontMatter"` 分岐・`setMode mode:"frontMatter"` テスト）に限定される。

`onModeChange` の blur→commit ロジック（下記 ADR-001）は、常設化により「FrontMatter 入力がアンマウントされる前提」が崩れるため整理する。ただし「未保存変更時の confirm」と「discard 時の `abortInFlight`」は本文モード切替で引き続き必要なので維持する。

## 実装ステップ

内側のレイヤー（型・reducer）→ 外側（コンポーネント）→ テストの順。

### 1. `editorState.ts` — `EditorMode` から `frontMatter` を除外

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:**
  - `EditorMode` 型を `"html" | "wysiwyg" | "inline"` に変更（48 行）。
  - 冒頭 JSDoc と `EditorSurface` JSDoc の「frontMatter タブ」「全 4 モード」等の記述を inline/wysiwyg/html の 3 モードに、かつ「FrontMatter は下部常設」へ更新。**冒頭 module JSDoc 本文の「`setMode` accepts any `EditorMode` literal. All four modes are fully wired (HTML / FrontMatter / WYSIWYG / inline)...」も 3 モード（FrontMatter は本文モードから除外し下部常設）へ書き換える**（arch-risk S-003）。
  - `setMode`・`createInitialEditorState` 本体はロジック変更不要（`createInitialEditorState` は元々 `frontMatter` を初期モードにしない）。FrontMatter 状態フィールド・FrontMatter アクション群（`setFrontMatterField` 等）・`DirtyKey` の `"frontMatter"`（75, 638 行）は **変更しない**。
- **理由:** モデルの型から本文モードとしての `frontMatter` を消すことで、参照箇所を型エラーとして網羅的に可視化し、illegal state を表現不能にする（CLAUDE.md「make illegal states unrepresentable」）。

### 2. `EditorModeSwitch.tsx` — FrontMatter タブを除去

- **対象ファイル:** `app/components/note/editor/EditorModeSwitch.tsx`
- **変更内容:**
  - `TABS_NEW` から `{ mode: "frontMatter", label: "FrontMatter" }` を削除 → `wysiwyg / html`。
  - `TABS_EDIT` から同上を削除 → `inline / wysiwyg / html`（**WYSIWYG タブは #715 由来で温存**）。
  - コンポーネント冒頭 JSDoc の各 surface のタブ列挙から FrontMatter を除く（WYSIWYG の記述は残す）。
- **理由:** AC-1。本文編集モードを inline/wysiwyg/html のみにする。

### 3. `NoteEditor.tsx` — FrontMatter モード分岐を撤去し下部常設化

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - 本文エディタの `state.mode === "frontMatter"` 排他分岐（main 488-513 行付近）を削除。
  - 同じ `FrontMatterEditor` 呼び出しを、フォーム末尾の `submitError` 表示の**手前**へ移し、条件分岐なし（常時マウント）にする。props（`mode={state.frontMatterMode}` / `parsed` / `rawJson` / `parseError` / 各ハンドラ / `disabled`）はそのまま流用。
  - クラス comment の「FrontMatter は別タブ」系の記述を「下部常設」へ更新。
  - `onModeChange` を ADR-001 の方針で整理：FrontMatter アンマウント前提のコメントを「未コミット入力の確定 + dirty 鮮度」に書き換える。`document.activeElement` の blur・confirm・`abortInFlight` は維持。**WYSIWYG 装飾消失ゲート（`surface==="edit" && nextMode==="wysiwyg"` の `detectUnsupportedTags`→`setPendingWysiwygSwitch`）・`confirmWysiwygSwitch`・`ConfirmDialog`・`detectUnsupportedTags` import は一切変更しない**（#696 の責務、本 Issue スコープ外）。
  - `onMediaInsert` の分岐は frontMatter 非依存のため変更不要（確認のみ）。
- **理由:** AC-2 / AC-3 / AC-5。メタデータを本文と並行して常時編集可能にする。

### 4. レイアウト調整（`FrontMatterEditor.tsx` / `styles.ts`、必要な場合のみ）

- **対象ファイル:** `app/components/note/editor/FrontMatterEditor.tsx`, `app/components/note/editor/styles.ts`
- **変更内容:**
  - 下部常設に合わせ、`FrontMatterEditor` ルート要素のスタイル（現 `mt-4 rounded-lg border border-hairline bg-surface-elevated p-5`）が本文エディタ直下に置かれて違和感が無いか確認。`mt-4` は本文枠と FrontMatter 枠の間隔として常設でも妥当なため、基本そのままで良い見込み。見出し（例「メタデータ」ラベル）の追加は**任意（AC 外の UX 改善）**であり、必須ではない（arch-risk S-002）。新規ハンドラ追加が無い純レイアウト調整に留める。
  - 繰り返す utility 文字列が生じる場合のみ `styles.ts` に module-scoped 定数として切り出す（CLAUDE.md 規約）。`@apply`・手書き CSS は追加しない。
  - `handleToggleMode` の blur ロジック（FrontMatterEditor 内、構造/生トグル時の buffer commit）は常設化と無関係に必要なため維持。
- **理由:** AC-2 / AC-3。下部常設の見た目を成立させる。機能変更を伴わない範囲に限定。

### 5. テスト更新

- **対象ファイル:** 下記テスト群
- **変更内容:**
  - `__tests__/editorState.test.ts:272-278`：`setMode switches between html and frontMatter` を `frontMatter` を使わない形（例 html ⇄ inline ⇄ wysiwyg、既存 282 行のケースと重複しないよう調整）に書き換えるか、不要なら削除。`createInitialEditorState` の mode アサート（44-50 行）は不変。
  - `__tests__/autosaveLogic.test.ts:160-169`：`setMode mode:"frontMatter"` を別の有効モード（inline 等）に置換し、「FrontMatter は常設で本文モードに関わらず送出される」趣旨へコメント更新。
  - `__tests__/noteEditorModeChange.test.tsx`：`onModeChange` 整理後も confirm/discard/in-flight cancel・**WYSIWYG 装飾消失ゲート**が成立することを確認。タブは HTML/WYSIWYG を使うため FrontMatter タブ除去の影響は受けない見込み。下部常設の `FrontMatterEditor` が常時 DOM に居ることで `container.textContent` 系アサートや **`htmlTextareaValue()` 等の first-match textarea セレクタが FrontMatter raw textarea と衝突しないか確認**し、必要ならセレクタを局所化（arch-risk S-001）。さらに「FrontMatter 編集（dirty で confirm を通す経路含む）→ 本文モード切替で値が保持される」ケース（AC-5）を追加。フォーカス中の buffer が `onModeChange` 冒頭 blur で commit されてから dirty 判定される因果も意識する（coverage S-001 / arch-risk S-004）。
  - `__tests__/editorModeSwitch.test.tsx`（**追跡済み・main 由来**）：期待値から FrontMatter のみ除去 → `TABS_EDIT = ["ビジュアル","WYSIWYG","HTML"]` / `TABS_NEW = ["WYSIWYG","HTML"]`。WYSIWYG タブの存在を pin する元の意図は保ちつつ、FrontMatter タブ廃止（#697）の旨をコメントに追記。git add 等の新規追跡は不要（既に追跡済み）。
  - 既存 `FrontMatterEditor.test.tsx`：EditorMode 非依存のため原則変更不要。ステップ4でルート要素のレイアウトクラスを変えた場合のみ該当アサートを追従。
  - 保存ペイロード回帰（AC-4）：`snapshotForSubmit` / `onSubmit` の `frontMatterJson` シリアライズが従来どおりであることを、既存テスト（`editorState.test.ts` の `snapshotForSubmit` ケース等）でカバーできているか確認し、薄ければ FrontMatter を含む snapshot の回帰ケースを 1 つ補強（coverage S-002）。
- **理由:** AC-7。回帰防止と受け入れ基準の pin。

## 設計判断

- ADR-001: `onModeChange` の blur/commit ロジックを常設化後どう整理するか。
- ADR-002: FrontMatter の構造/生トグル状態（`frontMatterMode`）を reducer に残し、本文モード（`EditorMode`）と直交させる。
- ADR-003: 未追跡 `editorModeSwitch.test.tsx`（#696/#715 由来）の扱い。

詳細は `adr.md` を参照。

## リスクと注意点

- `EditorMode` から `frontMatter` を消すと型エラーが出る箇所を網羅すること：`EditorModeSwitch.tsx`（TABS）、`NoteEditor.tsx`（`state.mode === "frontMatter"` 分岐）、`editorState.test.ts`・`autosaveLogic.test.ts`（`setMode mode:"frontMatter"`）。`DirtyKey` の `"frontMatter"`（editorState.ts:75, 638）は EditorMode ではないので**消さない**。`onMediaInsert`（`state.mode === "wysiwyg"`）・`shouldFlushAutosave`（同）は frontMatter 非依存で影響なし。
- **WYSIWYG 装飾消失ゲート（#696/#715）を壊さないこと**：main の `onModeChange` には `surface==="edit" && nextMode==="wysiwyg"` で `detectUnsupportedTags`→`ConfirmDialog` を開くゲートがある。`confirmWysiwygSwitch`・`pendingWysiwygSwitch` state・`ConfirmDialog` レンダリング・`detectUnsupportedTags` import を含め、本 Issue では一切変更しない。`noteEditorModeChange.test.tsx` の WYSIWYG ゲート系テストが引き続き通ることを確認する。
- **実装ブランチは必ず main から切る**こと。現在の作業ブランチ（issue/692/focus-caret-only-thin-ring）は #715 を含まないため、ここを base にすると WYSIWYG タブが消え別の回帰を生む。
- `FrontMatterEditor` 常設マウントにより、autosave の FrontMatter parse エラーゲート（`saveDisabled` / `shouldFlushAutosave` の `frontMatterJsonError !== null`）が本文モードに関わらず常時効く。これは意図どおり（raw JSON が壊れていれば保存不可）だが、ユーザーが本文編集中でも JSON エラーで保存ボタンが無効化される挙動になる点を UX として認識しておく（従来も FrontMatter モードでのみ起きていたものが常時化する）。
- `spec/design/pages/P12-editor.html` モックは FrontMatter をタブとして描画しており、本 Issue 後にドキュメント乖離が生じる。本 Issue のスコープ外（`spec-sync` 等で別途追従）として記録する。

## テスト方針

- 単体（reducer）：`editorState.test.ts` で `EditorMode` が inline/wysiwyg/html のみであること、FrontMatter アクション群（setField/rename/add/setRawJson/toggle）が従来どおり動くこと（AC-4）。
- 単体（純コンポーネント）：`editorModeSwitch.test.tsx` で両 surface のタブに FrontMatter が含まれないこと（AC-1）。
- 結合（`NoteEditor`）：`noteEditorModeChange.test.tsx` で (a) 本文モード切替時の confirm/discard/in-flight cancel が成立、(b) FrontMatter 編集後に本文モードを切り替えても値が保持される（AC-5）、(c) `FrontMatterEditor` が本文モードに関わらず DOM に常設される（AC-2）。
- 単体（`FrontMatterEditor`）：`FrontMatterEditor.test.tsx` で構造 ⇔ 生（JSON）トグルが従来どおり機能（AC-3）。
- 品質ゲート：`pnpm typecheck && pnpm lint:fix && pnpm format`（AC-6）と `pnpm test` 全パス（AC-7）。
- 手動（任意）：新規・既存ノートの両編集画面で、各本文モード（inline/wysiwyg/html）に切り替えながら下部 FrontMatter の追加/編集/削除・構造/生トグル・保存後の反映を確認。

## レビュー履歴

- 1周目: 要件カバレッジ・アーキ/リスクの両視点とも**問題点ゼロ**で終了。改善提案を計画に反映済み:
  - coverage S-001 / arch-risk S-004 → ステップ5に AC-5 の dirty 経由 confirm パスと blur→commit 因果を明記
  - coverage S-002 → ステップ5に保存ペイロード（`frontMatterJson`）回帰の確認を追加
  - arch-risk S-001 → ステップ5に `htmlTextareaValue()` 等 first-match textarea セレクタと常設 raw textarea の衝突確認を追加
  - arch-risk S-002 → ステップ4のメタデータ見出しラベルを「任意（AC 外）」と明示
  - arch-risk S-003 → ステップ1に editorState.ts 冒頭 module JSDoc 本文の「All four modes...」更新を追加
- ベース確定: 実装ブランチは origin/main（PR #715 マージ済み）から切る。WYSIWYG タブ・装飾消失ゲートは温存。

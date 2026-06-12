# 実装計画 — Issue #669: エディター画面（P12）がデザインモックと不一致 ＋ 編集中にフォーカスが外れる

**Issue:** #669
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

エディター画面（P12）の見た目をデザインモック `spec/design/pages/P12-editor.html` に揃え、編集中に入力フォーカスが失われる不具合（invalidate → `staleTime: 0` loader 再実行 → エディター再初期化）を構造的に解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | フォーマットツールバーがモック `.toolbar` と一致: `sticky`（`top: calc(var(--header-height) + var(--space-2))`、`z-index: 20`）、`radius-pill`、`inline-flex`、`gap 2px`、`padding 4px`、背景 `bg`（`surface-elevated` ではない）、`shadow-xs`、下余白 `margin-bottom: var(--space-4)` 相当 | Issue本文 | 3 |
| AC-2 | タイトル入力がモック `.title-input` と一致: `padding: 4px 0` 相当、下余白がモックの `--space-5` 相当になる | Issue本文 | 4 |
| AC-3 | トップバーの保存/キャンセル群が右寄せ（`margin-left: auto` 相当）である | Issue本文 | 4（検証のみ — 既に `editorActions` に `ml-auto` あり） |
| AC-4 | ディレクトリ行がモック `.dir-row` / `.dir-pill` の見た目（コンパクトな1行 + pill、下余白 `--space-3` 相当）に近づく。Ingestion 側 (`IngestionPreviewForm`) の見た目は変えない | Issue本文 | 5 |
| AC-5 | タグ入力UIの扱い（モックのチップUI準拠 or 既存シンプル入力の踏襲）を判断し記録する | Issue本文・受け入れ条件 | adr.md ADR-001（踏襲・差分許容と判断）+ 6 |
| AC-6 | エディター本文の最小高さがモック `.editor { min-height: 480px }` 相当になる（WYSIWYG / inline / HTML の各モード） | Issue本文 | 7 |
| AC-7 | `routerInvalidate()` がエディター系ルート `/_app/notes/$noteId/edit` と `/_app/notes/new` を常時除外する（テストで pin） | コメントの合意 ① | 1 |
| AC-8 | `NoteEditor` の保存後 `routerInvalidate(router)`（NoteEditor.tsx:273）が削除されている | コメントの合意 ③ | 2 |
| AC-9 | `routerInvalidate` 経由の invalidate（AC-7 の除外）下でエディターの state・フォーカスが保持されること。あわせて「props 変化で state を再初期化しない（初回マウント時のみ seed）」契約がテストで pin されている（将来の props 再同期コードの混入による退行防止 — 生 `router.invalidate()` による RSC 再マウント経路への防御では**ない**） | コメントの合意 ② | 2 |
| AC-10 | 編集中（autosave 発火・UploadDialog 完了時を含む）にタイトル・本文・タグ入力のフォーカスが外れない（手動確認） | Issue受け入れ条件 | 8 |
| AC-11 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue受け入れ条件 | 8 |

## スコープ

### 含まれないもの

- タグ入力のチップUI化 — 既存のシンプルなカンマ区切り入力の挙動を踏襲する（adr.md ADR-001）。見た目もチップ化しない（挙動と見た目が乖離した「見せかけチップ」はかえって混乱を生むため）
- `onModeChange` の `document.activeElement.blur()`（NoteEditor.tsx:205-206）の除去 — これは Issue #230 ADR-003 / #233 ADR-004 で意図的に導入された契約（モード切替前の保留 commit 確定）。「編集中に勝手にフォーカスが外れる」症状とは別物（ユーザー操作起点）であり触らない
- ディレクトリ選択のドロップダウンUI（モック `.dir-dropdown`）の完全再現 — 既存 `DirectorySelectField` の機能（検索付き選択・リネーム・削除・新規名入力）はモックの機能スーパーセットであり、見た目の「行の佇まい」をモックに寄せるに留める（adr.md ADR-002）
- フォーカス復元フォールバックの追加 — Issue 本文の「必要なら」項。本命経路（routerInvalidate 起点の再初期化）を構造的に断つため不要
- **生 `router.invalidate()`（rule 2: directory rename/delete）経路の対策** — edit ルートは RSC loader のため、生 invalidate では RSC ツリーが差し替わりエディターが再マウントされる。この経路は AC-9 の seed-once pin（同一インスタンスへの props 更新に対する防御）では守れない。エディター内から `RenameDirectoryDialog` / `DeleteDirectoryDialog`（いずれも生 `router.invalidate()` を呼ぶ）を開けるため、「編集中にディレクトリをリネーム/削除すると未保存の編集内容が失われる」経路は本 Issue 修正後も残る。本 Issue では routerInvalidate 除外（ステップ1）を主対策とし、この残存経路は**既知の残課題**として記録する（対策を広げてスコープを肥大させない — adr.md ADR-003 参照）。現状挙動の確認はステップ8 (f) で行う
- `useAutosave` の変更 — invalidate を呼ばないことは確認済み（Issue コメント）

## 調査結果

- 関連ファイル:
  - `app/components/common/routerInvalidate.ts` — `_app` 除外を1箇所に集約するラッパー（ADR-010 of #293）。現状エディター系ルートは除外していない
  - `app/components/common/__tests__/routerInvalidate.test.ts` — フィルタ述語を pin する既存テスト。拡張先
  - `app/routes/_app/notes/$noteId/edit.tsx` / `app/routes/_app/notes/new.tsx` — どちらも `staleTime: 0`。loader は RSC（`renderServerComponent`）で `NoteEditor` を seed
  - `app/components/note/editor/NoteEditor.tsx` — オーケストレーター。`useReducer` は lazy initializer（マウント時のみ実行）で seed 済み。273行目に保存後の `routerInvalidate(router)` あり
  - `app/components/note/editor/styles.ts` — `editorToolbar`（sticky なし・`rounded-md`・`gap-1`・`p-2`・`bg-surface-elevated`）、`titleInput`（padding/margin なし）、`editorTopbar`、`editorActions`（**`ml-auto` は実装済み** — Issue 本文の指摘は古い）
  - `app/components/note/editor/WysiwygEditor.tsx:543,577` — `editorToolbar` の使用箇所と本文 `min-h-[320px]`
  - `app/components/note/editor/InlineEditor.tsx:834` — 本文 `min-h-[320px]`
  - `app/components/note/editor/HtmlEditor.tsx` — textarea は共通 `fieldTextarea`（min-height 指定はエディター固有でない）
  - `app/components/note/editor/DirectoryPicker.tsx` — `fieldset` + 共通 `field` スタイル。`IngestionPreviewForm` と共用
  - `app/components/ingestion/UploadDialog.tsx:452,887` — フォーカス喪失の本命経路となる `routerInvalidate(router)`（AppShell 常駐の `UploadDialogMount` から発火）。**ここは変更しない** — 除外をラッパー側で行うため
  - `spec/design/pages/P12-editor.html` — モック。`.toolbar` / `.title-input` / `.dir-row` / `.tags-row` / `.editor { min-height: 480px }`
  - `app/styles/index.css` `@theme inline` — `--radius-pill` / `--shadow-xs` / `--spacing-2` は bridged 済み（新トークン追加は不要）
- あるべきアーキテクチャ:
  - スタイルは utility-first。繰り返し文字列は `styles.ts` のモジュールスコープ定数に hoist（CLAUDE.md）
  - invalidate 制御は `routerInvalidate.ts` 1ファイルに集約し、不変条件をラッパーで表現する（#293 ADR-010、#299、#300 ADR-005）。「invalidate = 表示系ルートの再評価、エディターは対象外」という新しい不変条件も同じ場所で表現するのが整合的
  - 変更はすべて UI / プレゼンテーション層内。ドメイン・アプリケーション・アダプター層への影響なし
- 既存実装の状態:
  - `editorActions` の右寄せ（`ml-auto`）は既にモック準拠 — Issue 本文の差分リストのうちこの項目だけは解消済み
  - `NoteEditor` の `useReducer` は lazy initializer なので「同一コンポーネントインスタンスへの props 更新」では state は再初期化されない。フォーカス喪失は loader 再実行で RSC ツリーが差し替わりエディターが事実上再マウントされる経路。よって本命の修正は invalidate 除外（ステップ1）で、ステップ2の「seed は初回のみ」はテストで pin する防御
  - Issue 本文が引く「#233 ADR-003 = タグはシンプル入力」は実際の `.issue/233/adr.md` ADR-003（MutationObserver ロールバック方式）と一致しない（引用ズレ）。ただし `parseTagInput`（カンマ区切り）によるシンプル入力が確立済みの挙動であることは実装から確認できるため、判断は本 Issue の adr.md に独立して記録する
- 依存関係:
  - `routerInvalidate` の除外追加は **全 mutation 経路**（UploadDialog / MoveNoteDialog / BulkActionBar / ViewFormDialog ほか約25ファイル）に波及するが、影響は「エディター系ルートが invalidate されなくなる」のみ。エディタールートはアンマウント中 `staleTime: 0` で次回進入時に必ず fresh load されるため、キャッシュ腐敗は起きない（Issue コメントの結論）
  - `editorToolbar` は `WysiwygEditor` のみが使用。`DirectoryPicker` は `NoteEditor` と `IngestionPreviewForm` の2箇所が使用（後者の見た目を変えないこと）

## 設計

### ドメインモデルへの影響

なし。UI とルーター invalidate 制御のみの変更。

### ユースケース / アプリケーションロジック

なし。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

1. **invalidate 不変条件の拡張**（フォーカス喪失の本命修正）: `routerInvalidate.ts` に `EDITOR_ROUTE_IDS`（`/_app/notes/$noteId/edit`, `/_app/notes/new`）を追加し、`routerInvalidate()` のフィルタで `_app` 同様に常時除外する。「エディターは invalidate の対象外」という不変条件を1箇所で表現する（ADR-010 と同型）。`appShellInvalidate` は `_app` 厳密一致のみ通すため変更不要
2. **NoteEditor の不要 invalidate 削除と seed-once pin**: 保存後の `routerInvalidate(router)` を削除（遷移先 detail は `staleTime: 0` で必ず fresh load される）。「seed は初回マウント時のみ」（lazy `useReducer`）の契約をコンポーネントテストで pin する（将来 `useEffect` での props 再同期が紛れ込む退行の防止。生 invalidate による RSC 再マウントへの防御ではない — スコープ節参照）
3. **モック準拠のスタイル調整**: `styles.ts` の定数を中心に、ツールバー sticky/pill 化、タイトル余白、ディレクトリ行のコンパクト化、本文 min-height をモックへ寄せる。要素順序もモック準拠（`title → dir 行 → tags 行 → toolbar → editor`）に並べ替える（現実装は `title → tags → DirectoryPicker` の順 — デザイン差分として放置せずモックに合わせる）。余白はモックの margin 値を直接再現するため form の `gap` に頼らず各行の `mb-*` で指定する（後述）。モバイル（`max-sm`）の横スクロールレール挙動（#522 系の対応）は維持する

## 実装ステップ

### 1. `routerInvalidate` にエディター系ルートの常時除外を追加

- **対象ファイル:** `app/components/common/routerInvalidate.ts`, `app/components/common/__tests__/routerInvalidate.test.ts`
- **変更内容:**
  - `EDITOR_ROUTE_IDS = ["/_app/notes/$noteId/edit", "/_app/notes/new"] as const` を追加し、`routerInvalidate()` のフィルタを「`_app` でない AND エディタールートでない AND（追加 filter）」に拡張
  - モジュール JSDoc / `routerInvalidate` の JSDoc を更新: 「invalidate = 表示系ルートの再評価。エディタールートは loader が初期値 seed 専用（source of truth はローカル state）かつ `staleTime: 0` で再進入時に必ず fresh load されるため、対象から構造的に除外する」旨と本 Issue / adr.md への参照を記載
  - テスト追加: `/_app/notes/$noteId/edit` と `/_app/notes/new` が `false`、`/_app/notes` / `/_app/notes/$noteId` が `true` のまま、追加 filter との AND 合成でも除外がすり抜けないこと。`appShellInvalidate` が従来どおりであること
- **理由:** フォーカス喪失の本命経路（AppShell 常駐 `UploadDialogMount` の完了時 `routerInvalidate` → edit ルート loader 再実行 → エディター再マウント）を、呼び出し側25ファイルに散らさずラッパー1箇所の不変条件として断つ（コメント合意 ①、ADR-010 と整合）

### 2. `NoteEditor` の保存後 invalidate 削除と seed-once 契約の pin

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`, `app/components/note/editor/__tests__/`（新規 or 既存テストへ追加）
- **変更内容:**
  - `NoteEditor.tsx:273` の `await routerInvalidate(router);` を削除（import が未使用になれば import も削除）
  - `useReducer` の lazy initializer 付近に「seed は初回マウント時のみ。loader 再実行による fresh props では再初期化しない（#669）」という WHY コメントを1行追加
  - コンポーネントテスト: `NoteEditor` を `mode="edit"` でレンダー → タイトルを変更 → `initialTitle` 等の props を変えて rerender → 編集中のタイトル値が維持されることを pin（同一コンポーネントインスタンスへの props 更新に対する契約の検証。RSC 再マウントを伴う生 invalidate 経路はこのテストでは守れない — スコープ節の既知の残課題参照）
- **理由:** 保存後は detail へ遷移し `staleTime: 0` で必ず fresh load されるため invalidate は不要（コメント合意 ③）。seed-once はすでに lazy initializer で満たされているが、将来 `useEffect` での props 再同期が紛れ込む退行をテストで防ぐ（コメント合意 ②）

### 3. フォーマットツールバーのモック準拠（sticky / pill）

- **対象ファイル:** `app/components/note/editor/styles.ts`（`editorToolbar`）
- **変更内容:** モック `.toolbar` に合わせて変更:
  - `sticky top-[calc(var(--header-height)+var(--space-2))] z-20` を追加
  - `rounded-md` → `rounded-pill`、`gap-1` → `gap-[2px]`、`p-2` → `p-1`、`bg-surface-elevated` → `bg-bg`、`shadow-xs` を追加、`flex` → `inline-flex items-center`（inline-flex 化に伴い `flex-wrap` の挙動が崩れないか確認。必要なら sticky な wrapper + inline-flex pill の2要素構成にする）
  - `max-sm` の横スクロールレール（`flex-nowrap overflow-x-auto` + scrollbar 非表示 + `[&>*]:shrink-0`）は維持。`overflow-x-auto` と `sticky` が同一要素で両立しない場合は、sticky を外側 wrapper に移す
  - ツールバー下余白はモックの `margin-bottom: var(--space-4)` を `mb-4` で直接指定する（form の `gap` には頼らない — ステップ4の余白戦略）。wrapper 分離（sticky wrapper + inline-flex pill の2要素構成）を採る場合は、`mb-4` と高さは wrapper 側に持たせ、sticky 解除/発動時にレイアウトシフトが起きないことを確認する
  - ツールバーは `WysiwygEditor` 内（editor コンテナの兄弟、form の直接の子ではない）にある点に注意し、モックの要素順序（toolbar が editor の直前）と整合していることを確認する
- **理由:** 差分が最も大きい項目（AC-1）。スクロール中もツールバーが追従するモックの体験を再現する

### 4. タイトル入力・要素順序・余白戦略のモック準拠

- **対象ファイル:** `app/components/note/editor/styles.ts`（`titleInput`）, `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - **余白戦略の統一:** form の `gap-4` を外し、各行にモックの margin 値を直接 `mb-*` で指定する（タイトル `mb-5`、dir 行 `mb-3`、tags 行 `mb-5`、toolbar `mb-4`）。gap 加算方式（gap + mb の合成）はモック値が gap より小さい行（dir 行の `--space-3` = 12px < gap 16px）で破綻するため採らない
  - **要素順序の並べ替え:** `NoteEditor` の form 内を モックの順序 `title → dir 行 → tags 行 →（toolbar → editor）` に合わせる（現実装は title → tags → DirectoryPicker の順）
  - `titleInput` に `py-1`（モック `padding: 4px 0`）を追加
  - `editorActions` の `ml-auto` は実装済みであることを確認（変更なし、AC-3 は検証のみ）
- **理由:** AC-2 / AC-3。目視比較で最初に目につく順序差・余白差を、モック値を直接再現できる一貫した方式で解消する

### 5. ディレクトリ行のコンパクト化（editor 専用の見た目）

- **対象ファイル:** `app/components/note/editor/DirectoryPicker.tsx`, `app/components/note/editor/styles.ts`
- **変更内容:**
  - モック `.dir-row`（`flex items-center gap-2 mb-3`）+ `.dir-label`（12px・uppercase・tracking）+ pill 形状（高さ30px・`rounded-pill`・`bg-surface`）の見た目に寄せる: `fieldset`/`legend` の重い枠線スタイルをやめ、「ディレクトリ」ラベル + 既存 `DirectorySelectField` + リネーム/削除ボタン + 新規名入力を1行ベース（折返し許容）のコンパクトな行に再構成する
  - `IngestionPreviewForm` の見た目を変えないため、表示形を `variant?: "fieldset" | "row"`（default `"fieldset"`）の opt-in prop で分岐し、`NoteEditor` のみ `"row"` を渡す。機能（既存選択・新規名・リネーム・削除・`legendSlot`）は両 variant で同一
  - 下余白を `mb-3`（モック `--space-3`）に — ステップ4で form の `gap` を外しているため、`mb-3` がそのまま 12px になる
  - 配置はステップ4の順序どおりタイトル直後（tags 行の前）に置く
- **理由:** AC-4。共用コンポーネントのため Ingestion 側への波及を variant で遮断する（adr.md ADR-002）

### 6. タグ行の判断記録と余白調整

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`（タグ入力ブロック）, `.issue/669/adr.md`
- **変更内容:**
  - タグ入力はチップUI化せず、既存のカンマ区切りシンプル入力を踏襲する（adr.md ADR-001 に判断を記録 — AC-5 の本体）
  - 見た目の最小調整のみ: 行下の余白をモック `.tags-row` の `--space-5` 相当に `mb-5` で直接指定（ステップ4の余白戦略）。チップ風の装飾は加えない
- **理由:** AC-5。挙動（カンマ区切りテキスト）と見た目（チップ）が乖離した UI は誤操作を招く。確立済みのシンプル入力の挙動を変えないことを優先し、モックとの差分を意図的なものとして記録する

### 7. エディター本文の min-height をモック準拠に

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`, `app/components/note/editor/InlineEditor.tsx`, `app/components/note/editor/HtmlEditor.tsx`
- **変更内容:**
  - `WysiwygEditor.tsx:577` の `min-h-[320px]` → `min-h-[480px]`（内側 `[&_.ProseMirror]:min-h-[280px]` も padding 分を引いた `min-h-[440px]` 程度に整合させる）
  - `InlineEditor.tsx:834` の `min-h-[320px]` → `min-h-[480px]`
  - `HtmlEditor.tsx` の textarea に editor 固有の `min-h-[480px]` を追加（共通 `fieldTextarea` は変更しない — 他フォームに波及するため）
- **理由:** AC-6。3モードすべてが「本文エリア」としてモックの最小高さに揃う

### 8. 品質ゲートと手動検証

- **対象ファイル:** なし（検証）
- **変更内容:**
  - `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit`
  - 手動検証（`pnpm dev`）: (a) P12 とエディター画面の目視比較（要素順序、ツールバー sticky 追従・pill 形状・sticky 発動時のレイアウトシフト有無、タイトル余白、ディレクトリ行、本文高さ、モバイル幅でのツールバー横スクロール）、(b) 編集中に UploadDialog でアップロード完了 → フォーカス・編集内容が維持される、(c) autosave 発火中の入力継続、(d) 保存 → detail 遷移で最新内容が表示される（invalidate 削除の退行確認）、(e) Ingestion プレビューのディレクトリ欄が従来どおり、(f) **rule 2 経路の現状確認**: 編集中にエディター内からディレクトリをリネーム/削除（生 `router.invalidate()`）→ 編集内容・フォーカスがどうなるかを記録する（既知の残課題の現状把握 — 失われても本 Issue では不合格としない。スコープ節参照）
- **理由:** AC-10 / AC-11。フォーカス喪失はユニットテストで完全には再現できないため手動検証を必須とする

## 設計判断

- **ADR-001**: タグ入力UIはモックのチップUIに寄せず、既存のカンマ区切りシンプル入力を踏襲（差分許容）。詳細は adr.md
- **ADR-002**: ディレクトリ行のモック準拠は共用 `DirectoryPicker` への `variant` opt-in で実現し、Ingestion 側の見た目を凍結。詳細は adr.md
- **ADR-003**: エディター系ルートの invalidate 除外は呼び出し側ではなく `routerInvalidate` ラッパーの不変条件として実装（Issue コメントで合意済みの方針を記録）。詳細は adr.md

## リスクと注意点

- `sticky` + `overflow-x-auto` は同一要素で両立しない（overflow を持つ要素は sticky の包含ブロックになるだけでなく、自身の sticky が効かなくなるケースがある）。ステップ3の通り、必要なら sticky wrapper / pill 本体の2要素構成に分離する。モバイル横スクロールレールの退行（#522 系）に注意
- `inline-flex` + `flex-wrap` への変更でツールバーの折返し幅が変わる。`sm` 以上での折返し挙動を目視確認する
- form の `gap` を外して `mb-*` 統一にすると、form 内の想定外の要素（エラーメッセージ等）の余白が消える可能性がある。form 直下の全子要素を確認して余白の付け漏れがないようにする
- 生 `router.invalidate()`（rule 2）経由の編集内容喪失は本 Issue では解消しない（既知の残課題 — スコープ節・手動検証 (f) 参照）。後続 Issue 化するかは (f) の記録を見て判断する
- `routerInvalidate` の除外追加は全 mutation 経路に波及する。エディタールート以外の routeId（`/_app/notes`, `/_app/notes/$noteId` 等）が引き続き invalidate されることをテストで pin する（除外しすぎの退行防止）
- 保存後 invalidate の削除（ステップ2）: detail への遷移は `staleTime: 0` で fresh load されるが、**遷移しない他の画面**（一覧等）はもともと次回進入時に loader が走る設計。退行確認は手動検証 (d) で行う
- `DirectoryPicker` の variant 追加では、リネーム/削除ダイアログ・新規名入力の機能を落とさないこと（見た目のみの分岐に留める）
- TanStack Router の routeId 文字列（`/_app/notes/$noteId/edit`）はルートファイル移動で変わる。定数化 + テストで pin し、`routerInvalidate.ts` に集約することでリネーム追従は1ファイルで済む

## テスト方針

- `routerInvalidate.test.ts` 拡張: エディター系2ルートの除外、非エディタールートの通過、追加 filter との AND 合成下でも除外がすり抜けないこと、`appShellInvalidate` の不変
- `NoteEditor` コンポーネントテスト（新規）: `mode="edit"` で seed → ユーザー入力 → `initialTitle` / `initialContentHtml` を変えて rerender → 編集中の値が維持される（seed-once 契約の pin）
- 既存テストスイート（`editorState.test.ts`, `noteEditorModeChange.test.tsx`, `autosaveLogic.test.ts` 等）の green 維持
- スタイル変更（ステップ3-7）はユニットテスト対象外。手動検証（ステップ8）でモック比較・モバイル幅・フォーカス維持を確認

## レビュー履歴

### 1周目
**修正した点**:
- 両レビューの P-001（同一問題）への対応: AC-9 の過大主張を修正。edit ルートは RSC loader のため、生 `router.invalidate()`（rule 2: directory rename/delete 等）では RSC ツリー差し替えでエディターが再マウントされ、seed-once pin（props 更新への防御）では編集内容を守れないという事実に合わせて、AC-9 を「routerInvalidate 経由の invalidate でエディター state・フォーカスが保持される ＋ seed-once 契約は退行防止 pin」に修正。スコープ節・設計2・ステップ2・リスク節の効果主張を統一し、rule 2 経路（エディター内ディレクトリリネーム/削除）による編集内容喪失を「既知の残課題（本 Issue スコープ外）」として明記（adr.md ADR-003 にも記録）。対策追加によるスコープ肥大は避け、routerInvalidate 除外を主対策とする

**取り込んだ改善提案**:
- coverage S-001: AC-1 にモック `.toolbar` の `margin-bottom: var(--space-4)` を追記し、ステップ3で `mb-4` 直接指定として余白戦略と整合させた
- coverage S-002: ステップ8の手動検証に (f) rule 2 経路の現状確認ケース（編集中のディレクトリリネーム/削除 → 結果を記録、不合格判定にはしない）を追加
- arch S-001: モックの要素順序（title → dir → tags → toolbar → editor）と実装の順序差を設計3・ステップ4・5に明記し、モック準拠に並べ替える方針とした
- arch S-002: 余白戦略を統一。form の `gap-4` 加算方式（dir 行の `--space-3` = 12px < gap 16px で破綻）をやめ、gap を外して各行に `mb-*` を直接指定する方式にステップ4/5/6を揃えた
- arch S-003: ステップ3に sticky wrapper 分離時のレイアウトシフト注意とツールバー `mb-4` の wrapper 側への配置を追記。手動検証 (a) にも sticky 発動時のシフト確認を追加

**見送った提案とその理由**:
- arch S-004（routeId pin テストの実ルートツリー由来 match 化）: 実 match 生成のセットアップコストに対して得られる保証が小さい。routeId 文字列は定数化 + 述語ベースの既存テスト方式で pin し、リネーム追従は `routerInvalidate.ts` 1ファイルに集約済みのため文字列 pin で十分と判断

### 2周目
両視点とも問題点ゼロで終了。

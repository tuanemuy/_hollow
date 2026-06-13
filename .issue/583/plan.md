# 実装計画 — Issue #583: impl: P14 公開設定の「未保存の変更があります」警告（dirty 伝搬の設計が前提）

**Issue:** #583
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

エディタで未保存の変更があるノートについて、公開設定モーダル `PublishSettings` を開いたときにモック `.safety-check` の warning alert（「未保存の変更があります」）を表示する。本質は edit ページ → detail ページの公開設定モーダルへ dirty 状態を運ぶ伝搬経路の新設。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | dirty 伝搬方式が ADR として固定されている（案1/案2 の選択と理由） | Issue チェックリスト / コメント | adr.md（ADR-001） |
| AC-2 | エディタで本文・タイトル・FrontMatter・タグ（チップ確定 / 削除）・ディレクトリのいずれかを編集すると、そのノートの未保存フラグが立つ。**タグは draft 入力（未確定）のみでは dirty にならず、Enter / 追加で確定したとき**に立つ（`editorState.ts:setTagDraft` が dirty を積まない仕様） | Issue「dirty 供給経路」 | 1, 2 |
| AC-3 | 編集後、autosave 完了（`AutosaveIndicator` が保存済み表示になる）を待ってから公開設定を開くと警告が出ない。また手動保存（保存ボタン）して detail へ遷移し公開設定を開いても警告が出ない（過剰な警告残留を防ぐ。観測可能な外形で検証する） | 設計（過剰検知抑制） | 2 |
| AC-4 | 未保存フラグが立っているノートで `PublishSettings` を開くと、`ALERT_WARNING` の「未保存の変更があります」警告が表示される | Issue 対象機能 / モック `P14-publish-settings.html:963-973` | 3, 4 |
| AC-5 | フラグが立っていない（保存済み / 未編集）ノートでは警告が表示されない | モック準拠（条件付き描画） | 2, 4 |
| AC-6 | 警告 UI が既存 `ALERT`/`ALERT_WARNING` プリミティブ + `AlertTriangle` で構成され、`role="status"` を持つ | Issue 実装の足がかり / モック | 4 |

## スコープ

### 含まれないもの

- **edit → detail 遷移時の「破棄してよいか」確認ダイアログ（useBlocker / beforeunload）**: 本Issueは「公開設定モーダル内に警告を出す」追従であり、ナビゲーションガードの新設は別関心。現状コードにも無く、Issue も求めていない。
- **`publishedAt` vs `updatedAt` の DTO 比較（案2）**: 構造的に dirty を表せないため不採用（adr.md ADR-001 参照）。DTO / usecase / ドメインには一切手を入れない。
- **複数タブ間の dirty 同期**: 主ユースケース（同一タブでの編集 → 公開設定）の外。`sessionStorage` の単一タブ範囲で十分（adr.md トレードオフ参照）。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/editorState.ts` — `dirtyKeys: ReadonlySet<DirtyKey>` が dirty の唯一の真実。`withDirty` で各編集 setter が積み、**`dirtyKeys` を `EMPTY_DIRTY` にリセットする reducer アクションは `autosaveSuccess` ただ1つ**（L497-503）。`setTagDraft`（L487-492）は draft 入力のみでは dirty を積まない（確定は `addTag` / `removeTag`）。`createInitialEditorState` は `dirtyKeys: EMPTY_DIRTY` で初期化（L219）— 初回マウントの誤同期に注意（ステップ2）。
  - `app/components/note/editor/NoteEditor.tsx` — `editorReducer` を `useReducer` で束ねる dirty 状態の所有者（edit ルート配下）。`NoteEditorProps` は判別ユニオン `{ mode: "new" } | { mode: "edit"; noteId: string; ... }`（L78-90）で、`new` には `noteId` プロパティが**存在しない**。`const noteId = props.mode === "edit" ? props.noteId : null;`（L106）で `string | null` に正規化済み。手動保存は `onSubmit` の `mode === "edit"` 分岐で `saveNote`（L319）→ navigate（L330）だが、**`dirtyKeys` をリセットする dispatch を行わない**。
  - `app/components/note/editor/useAutosave.ts` — `dirtyKeys` 非空でデバウンス flush、成功で `autosaveSuccess` を dispatch。`shouldFlushAutosave` は `noteId === null` で全 no-op（L140）— 本件の noteId ガードもこれに揃える。
  - `app/components/note/detail/NoteActions.tsx` — `PublishSettings` の親。`noteId` を保持し props で渡せる（L258-265）。
  - `app/components/publication/PublishSettings/index.tsx` — モーダル本体。`open`・`noteId`・`initial` を受け取る client component。`selected === "public"` 時の URL preview の直後（L244-249 付近）がモックの `.safety-check` 位置。
  - `app/components/common/styles.ts` — `ALERT`/`ALERT_WARNING`/`ALERT_ICON`/`ALERT_CONTENT`/`ALERT_TITLE`/`ALERT_BODY`（L418-460）。
  - `app/components/ingestion/UploadForm.tsx:112-138` — `ALERT_WARNING` の実 JSX 前例。
  - `app/components/note/list/displayPreference.ts` — **本件の実装テンプレート**。「usecase に到達しない純クライアント UI 状態」を SSR-safe な storage ラッパで永続化する前例（Issue #650 ADR-001）。なおその module JSDoc は「home-route 専用なので `note/list/` に置き、再利用時に配置を見直せ」と明記しており、本件は最初から editor/detail の2ドメイン横断なので配置判断が異なる（ステップ1 参照）。
  - `app/components/note/` 直下には `actions.ts` / `constants.ts` / `directoryTree.ts` / `loaders.ts` / `schema.ts` 等、editor・detail・list の各サブディレクトリから共有される横断モジュールが既に置かれている。`unsavedFlag.ts` の中立な配置先候補。
  - `spec/design/pages/P14-publish-settings.html:963-973` — モック `.safety-check` の SSOT（`:964` に `role="status"`、`:969` タイトル「未保存の変更があります」、`:970` 本文）。**Issue 本文の行番号 `:717-746` は旧版／CSS 定義側の参照で、正は `:963-973`**。`:770`/`:798` は `.safety-check` の CSS 定義であって描画実体ではない。
- あるべきアーキテクチャ:
  - dirty は「純粋なクライアント UI 状態」であり、ドメイン/usecase/DTO に出す概念ではない（CLAUDE.md: ポートの内側は決定的・I/O フリー）。`displayPreference` と同じく presentation 層のクライアント境界に閉じるのが正。
  - 状態スタイルは `data-*` + Tailwind variant、繰り返しユーティリティは module-scoped 定数（CLAUDE.md Styling）。ただし本件の warning は条件付きで存在/非存在を切り替えるだけなので、既存 `ALERT*` 定数の組み合わせで足り、新規スタイルは不要。
- 既存実装の状態:
  - edit と detail は **完全に別ルート**（`$noteId/edit.tsx` と `$noteId/index.tsx`、別 server fn・別 RSC ツリー）。Issue の「独立した RSC ツリー」は実コードで確認済み。React Context は橋渡し不可。
  - `dirtyKeys` は既に整備済みで、編集系 setter と `autosaveSuccess` のリセットが揃っている。新フラグはこの既存信号にぶら下げるだけでよい（dirty 判定ロジックの新設は不要）。
- 依存関係:
  - 追加する storage ヘルパは `NoteEditor`（書き込み）と `PublishSettings`（読み取り）から参照される。両者とも client component なので SSR ガードが要る。
  - DTO / loader / usecase / domain への影響なし（adr.md ADR-001 で確認）。

## 設計

### ドメインモデルへの影響

なし。dirty は純クライアント UI 状態で、エンティティ・値オブジェクト・ポートのいずれにも属さない。`publishedAt` / `updatedAt` 比較（案2）を採らないため DTO 露出の検討も不要。

### ユースケース / アプリケーションロジック

なし。新規 usecase・既存 usecase の変更ともに無い。dirty はサーバを一切経由しない。

### アダプター / 永続化 / 外部連携

なし（DB / マイグレーション / 外部 API すべて無関係）。「永続化」は `sessionStorage`（ブラウザ）であり、アダプター層のリポジトリとは別物。

### UI / プレゼンテーション

1. **新規 storage ヘルパ**（`displayPreference.ts` 同型の SSR-safe ラッパ、配置は `app/components/note/unsavedFlag.ts`）: ノート単位の dirty フラグを `sessionStorage` に read/write/clear する純関数群。
2. **`NoteEditor`**: 2系統でフラグを駆動する（adr.md ADR-002）。(a) `dirtyKeys` のエッジ追跡 — 前回 size を `useRef` で保持し、立ち上がり（`0 → >0`）で set、立ち下がり（`>0 → 0` = autosave 成功）で clear、`0 → 0` / `>0 → >0` では何もしない。(b) 手動保存（`onSubmit` の `mode === "edit"` 成功分岐）で明示 clear。いずれも `noteId === null` を弾く。
3. **`NoteActions` → `PublishSettings`**: `noteId` は既に伝搬済み（`NoteActions.tsx:261`）。`PublishSettings` が `open` の false→true 遷移でフラグを読み、warning alert を条件付き描画。

## 実装ステップ

依存方向の都合上、内側のレイヤー変更は無いため、共有ヘルパ → 供給側（エディタ）→ 消費側（モーダル）→ 表示 の順で並べる。

### 1. dirty フラグ用 SSR-safe storage ヘルパを新設

- **対象ファイル:** `app/components/note/unsavedFlag.ts`（新規）
  - **配置の根拠（arch-risk S-002 対応）:** 書き込みは `editor/`、読み取りは `publication/PublishSettings`（detail 経由）と最初から2ドメイン横断。`editor/` 配下に置くと publication 側が editor 内部実装を import する向きの依存が生まれる。dirty は「特定コンポーネントの内部状態」ではなく「ノート単位の横断 UI 状態」なので、editor・detail・list の共通親であり既に横断モジュール（`actions.ts` / `constants.ts` / `directoryTree.ts` 等）が並ぶ `app/components/note/` 直下が中立で妥当。`displayPreference.ts` が `note/list/` に置かれているのは home-route 専用（JSDoc 明記）で性質が異なるため、その配置には倣わない。
- **変更内容:** `displayPreference.ts` を範として、以下の純関数を実装する。
  - `markNoteUnsaved(noteId: string): void` — `sessionStorage.setItem('hollow3:note:<noteId>:dirty', '1')`。
  - `clearNoteUnsaved(noteId: string): void` — 該当キーを `removeItem`。
  - `readNoteUnsaved(noteId: string): boolean` — 値が `'1'` なら true。SSR（`window` undefined）・storage 例外時は false。
  - すべて `typeof window === "undefined"` ガードと `try/catch` で囲み、storage 無効環境でも描画を壊さない（best-effort）。
  - キー生成は単一の `keyFor(noteId)` ヘルパに集約。
  - module JSDoc に「dirty は純クライアント UI 状態で usecase/DTO に出さない」「localStorage ではなく sessionStorage を選ぶ理由（揮発性=タブ閉じで消える、別タブ・翌日の誤検知回避）」「editor が書き publication が読む2ドメイン横断のため `note/` 直下に置く」を明記（adr.md ADR-001 を要約）。
- **理由:** 別ルート間で生き残る dirty 伝搬の媒体。`displayPreference` と同型にして設計の一貫性を保つ。

### 2. `NoteEditor` で dirty 変化をフラグに同期（エッジ追跡 + 手動保存の明示 clear）

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** adr.md ADR-002 の2系統で実装する。
  - **(a) エッジ追跡（自動 set/clear）:** 前回 `dirtyKeys.size` を保持する `useRef`（例 `prevDirtySizeRef`、初期値 0）を追加し、`useEffect([state.dirtyKeys])` 内で遷移を判定する。
    - 依存配列は `[state.dirtyKeys]`（size プリミティブではなく Set 参照）でよい。reducer は dirty が変化したときだけ新しい Set 参照に差し替え、`addDirty` 等は無変化なら同一参照を返すため `useEffect([state.dirtyKeys])` で過不足なく発火する（arch-risk 2周目 S-001）。
    - `prev === 0 && curr > 0`（立ち上がり）→ `markNoteUnsaved(noteId)`。
    - `prev > 0 && curr === 0`（立ち下がり = `autosaveSuccess` で空に戻った瞬間）→ `clearNoteUnsaved(noteId)`。
    - `0 → 0` / `>0 → >0` は何もしない。effect 末尾で `prevDirtySizeRef.current = curr` を更新。
    - **これにより初回マウントの誤 clear を防ぐ（arch-risk P-001 対応）:** `createInitialEditorState` は `dirtyKeys: EMPTY_DIRTY`（`editorState.ts:219`）なので初回 effect は `0 → 0` となり何もしない。未編集オープンや `detail → edit →（無編集）→ detail` の往復で、同一タブ・同一セッションに残る他経路のフラグを巻き込んで消すことがない。
  - **(b) 手動保存の明示 clear（coverage P-001 対応）:** 実コードで確認した事実 — `dirtyKeys` を空にする reducer アクションは `autosaveSuccess` だけで、手動保存（`onSubmit` の `mode === "edit"` 分岐、`saveNote`（L319）成功 → navigate（L330））は `dirtyKeys` をリセットしない。したがってエッジ追跡だけでは手動保存後に立ち下がりエッジが起きず、フラグが残って detail で誤検知する。これを防ぐため、`onSubmit` の `mode === "edit"` 成功分岐で `saveNote` の `await` 直後・`router.navigate` の前に `clearNoteUnsaved(props.noteId)` を直接呼ぶ。
  - **(c) noteId ガード（arch-risk P-002 対応）:** `mode === "new"` は判別ユニオン上 `noteId` を持たず、正規化で `const noteId = props.mode === "edit" ? props.noteId : null;`（L106）が `null` になる。(a) のエッジ追跡 effect は冒頭 `if (noteId === null) return;` で no-op（`useAutosave.ts:140` の `noteId === null` no-op に揃える）。(b) は `mode === "edit"` 分岐内なので `props.noteId` が型レベルで `string`。「仮の noteId が入る」という前の記述は誤りで、実際は型に存在しない／`null`。
- **理由:** AC-2 / AC-3。`dirtyKeys` は既に「編集で積まれ autosave 成功で空に戻る」唯一の真実なので set/立ち下がり clear はそれにミラーし、手動保存だけは reducer がリセットしないため明示 clear で補う。判定ロジックは新設せず、既存信号のエッジと保存契機に乗せるだけ。

### 3. `PublishSettings` で warning alert を条件付き描画

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`
- **変更内容:**
  - `hasUnsaved` を `useState(false)` で持つ。read のタイミングは **`open` が false→true に変わった瞬間に限定**する（arch-risk S-001 対応）。`useState` 初期値での read は不可（Dialog 自体はマウント済みで SSR 時 `window` 未定義）なので effect 経由。
  - 既存の close-reset `useEffect`（L142-149、依存 `[open, data.visibility]`、冒頭 `if (open) return;` で「閉じているときだけ各 transient state を reset」する構造）に相乗りする。具体的には早期 return を分岐に書き換え、`if (!open) { /* 既存 reset 群 */ setHasUnsaved(false); return; }` とし、その後ろ（open 側）で `setHasUnsaved(readNoteUnsaved(noteId))` を読む。`data.visibility` 変化での再 read は同じフラグを読み直すだけで無害。
  - URL preview ブロック（`selected === "public"` の三項の直後、L244-249）と「公開状態を更新」ボタン（L250-258）の間に、`hasUnsaved` が true のときだけ `.safety-check` 相当の警告を描画する。位置はモック（`:963-973` の URL preview → safety-check → apply ボタンの順）に合わせる。
  - 警告は `selected`（公開/限定公開/非公開）に依らず未保存があれば表示する（モックの safety-check は公開操作全般の前置きであり visibility に紐づかない）。
- **理由:** AC-4 / AC-5。消費側でフラグを読み、未保存時のみ警告を出す。read を open 立ち上がりに限定し、close で false に戻すことで「次 open で再読込」が成立する。

### 4. 警告 JSX を既存 `ALERT_WARNING` プリミティブで組む

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`（ステップ3 と同ファイル）
- **変更内容:** `UploadForm.tsx:112-138` を範に以下を描画する。
  - 外枠 `div`: `${ALERT} ${ALERT_WARNING}`、`role="status"`（モック準拠）、適切な margin（`mt-6` 等、URL preview と同じ間隔感）。
  - `span` `ALERT_ICON` 内に `<Icon icon={AlertTriangle} size={20} />`。
  - `div` `ALERT_CONTENT` 内に `<p className={ALERT_TITLE}>未保存の変更があります</p>` と `<p className={ALERT_BODY}>公開には最後に保存した版が使われます。最新版を反映したい場合は先にノートを保存してください。</p>`。
  - import に `AlertTriangle`（lucide-react）と `ALERT`/`ALERT_WARNING`/`ALERT_ICON`/`ALERT_CONTENT`/`ALERT_TITLE`/`ALERT_BODY` を追加。
- **理由:** AC-6。新規スタイルを足さず既存プリミティブで完結（adr.md 補足）。

### 5. テスト追加

- **対象ファイル:** `app/components/note/__tests__/unsavedFlag.test.ts`（新規）、`app/components/publication/PublishSettings/__tests__/PublishSettings.test.tsx`（既存に追記）
- **変更内容:** ステップ「テスト方針」参照。

## 設計判断

- dirty 伝搬は **案1（共有 store）を `sessionStorage` で実装**。edit/detail が別ルートのため Context（綺麗な案1）は不可能、案2（`publishedAt` vs `updatedAt`）は2つが別クロックで dirty を表せず構造的に不成立。詳細・トレードオフは `.issue/583/adr.md` ADR-001。
- フラグの set/clear トリガーは「`dirtyKeys` の立ち上がり/立ち下がりエッジ」+「手動保存成功時の明示 clear」の2系統。手動保存が `dirtyKeys` をリセットしない実コードの事実と、初回マウントの誤 clear 回避から導いた設計。詳細は `.issue/583/adr.md` ADR-002。

## リスクと注意点

- **clear 契機の取りこぼし（最重要・解消済み）**: `dirtyKeys` を空に戻す reducer アクションは `autosaveSuccess` ただ1つで、手動保存（保存ボタン）は `dirtyKeys` をリセットしない。素朴な「`size===0` で clear」ミラーだと手動保存→即 detail で誤検知が恒常的に起きる。ステップ2(b) の「手動保存成功時の明示 clear」で解消する（adr.md ADR-002）。
- **初回マウントの誤 clear（解消済み）**: `createInitialEditorState` の `dirtyKeys` は `EMPTY_DIRTY` 初期化で、素朴な effect だと未編集オープンでも clear が走り同一セッションの既存フラグを誤消去しうる。ステップ2(a) の「立ち下がりエッジ限定」で解消する（adr.md ADR-002）。
- **autosave 失敗時のフラグ残留は正しい挙動**: `autosaveError` で保存に失敗したまま放置されると `dirtyKeys` は非空のまま＝フラグ true のまま残るが、これは**実際に未保存だから true で正しい**。過剰検知ではない（誤読防止のため明記）。
- **過剰検知（保存済みでも警告残留）**: clear 前にタブが落ちると true が残る。`sessionStorage` なので次セッションで消え、かつ「未保存を見逃す」より安全側。許容する。
- **新規ノート（mode="new"）**: 判別ユニオン上 `noteId` プロパティが無く、正規化で `noteId === null`。`if (noteId === null) return;` でガードし（`useAutosave` の `noteId === null` no-op に整合）、edit ルートでのみ書き込む（ステップ2(c)）。
- **storage 無効環境**: private browsing / 設定で `sessionStorage` が throw する。全アクセスを `try/catch` + SSR ガードで囲み、失敗時は「警告なし（false）」に degrade（描画を壊さない）。
- **別タブ並行編集**: 別タブのエディタ dirty は `sessionStorage` 非共有のため detail タブに伝わらない。主ユースケース外として許容（adr.md トレードオフ）。
- **モック文言の一致**: `.safety-check` のタイトル/本文はモック `:969-970` から verbatim に転記し、ズレないようにする（Issue 本文の `:717-746` は旧版／CSS 側の参照、正は `:963-973`）。

## テスト方針

- `unsavedFlag.ts` の単体テスト（vitest + jsdom）: set → read=true、clear → read=false、未設定→false、`window` 無し→false、storage throw→例外を呑んで false。ノート単位キーの分離（noteId 違いで混線しない）。
- `PublishSettings` のコンポーネントテスト: フラグ true で open → 「未保存の変更があります」warning が `role="status"` で描画される / フラグ false で open → 警告が描画されない / close → 次 open で再読込される。
- `NoteEditor`（または dirty→flag 同期ロジック）のテスト: 編集で `dirtyKeys` が `0 → >0`（立ち上がり）→ `markNoteUnsaved` 呼出 / autosave 成功で `>0 → 0`（立ち下がり）→ `clearNoteUnsaved` 呼出 / **初回マウント（`0 → 0`）では clear を呼ばない**（誤消去回帰の防止）/ **手動保存（`saveNote` 成功）で `clearNoteUnsaved` が呼ばれる**（reducer が dirty を残すパスの明示 clear）/ `mode === "new"`（`noteId === null`）では set/clear いずれも呼ばない。タグは `setTagDraft` のみでは set されず `addTag`（確定）で set される。既存の editorState/autosave テスト構造に倣う（同期 effect が薄ければ統合テストで担保）。
- 手動確認: edit でタイトルを編集 → 保存を待たず detail へ遷移 → 公開設定を開くと警告が出る。autosave 完了（`AutosaveIndicator` が保存済み表示）を待ってから遷移すると出ない。保存ボタンで保存 → detail へ遷移 → 公開設定を開いても出ない。未編集でエディタを開いて戻っても、既存の警告が消えない（`docs/test.md` の手動検証方針に沿う）。
- 既存テスト（`PublishSettings.test.tsx`、editorState/autosave）が回帰しないこと。`pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test` を通す。

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:
- **[P-001]**（最重要）実コードで確認: `dirtyKeys` を `EMPTY_DIRTY` にリセットする reducer アクションは `autosaveSuccess` ただ1つで、手動保存（保存ボタン → `saveNote` 成功 → navigate）は `dirtyKeys` をリセットしない。素朴な「`size===0` で clear」ミラーだと手動保存→即 detail で警告が恒常的に誤残留する。ステップ2 を「(b) 手動保存の `mode === "edit"` 成功分岐で `clearNoteUnsaved` を明示呼出」に書き換え、AC-3 を「autosave 完了 / 手動保存いずれでも警告が出ない」に拡張。adr.md に ADR-002 を追加。テスト方針に手動保存→clear ケースを追加。
- **[P-002]** AC-3 を実装内部状態（「`dirtyKeys` が空に戻る」）でなく観測可能な外形（`AutosaveIndicator` が保存済み表示 / 手動保存後 detail で警告なし）で検証する文言に修正。テスト方針の手動確認に autosave 完了の待ち方を明記。

**修正した点（アーキテクチャ・リスク視点）**:
- **[P-001]** 初回マウントで `useEffect([dirtyKeys])` が必ず発火し、`createInitialEditorState` の `dirtyKeys: EMPTY_DIRTY`（`editorState.ts:219`）から既存フラグを誤 clear する問題を確認。ステップ2 を「(a) `useRef` で前回 size を保持する立ち上がり/立ち下がりエッジ限定」に書き換え、`0 → 0` では何もしないことを明示。adr.md ADR-002 に記載。
- **[P-002]** `NoteEditorProps` が判別ユニオンで `mode === "new"` は `noteId` プロパティを持たず正規化で `noteId === null`（`NoteEditor.tsx:106`）になることを確認。「仮の noteId」という誤記を「`noteId === null` ガード（`useAutosave.ts:140` に整合）」に統一。

**取り込んだ改善提案**:
- **[S-001 / coverage]** モック行番号を確認（実体は `:963-973`、`role="status"` は `:964`、文言は `:969-970`）。Issue 本文の `:717-746` は旧版／CSS 側参照である旨を調査結果とリスク欄に注記。
- **[S-002 / coverage]** AC-2 に「タグは draft 入力のみでは dirty にならず、Enter / 追加で確定したとき立つ」（`editorState.ts:setTagDraft` が dirty を積まない仕様）を明示。
- **[S-001 / arch]** ステップ3 の read タイミングを「`open` の false→true 限定」とし、既存 close-reset effect（`PublishSettings/index.tsx:142-149`、依存 `[open, data.visibility]`、`if (open) return;`）の早期 return を `if (!open) { reset...; return; }` 分岐に書き換えて open 側で read する形を具体化。
- **[S-002 / arch]** `unsavedFlag.ts` を `editor/` 配下から `app/components/note/` 直下に移動。editor が書き publication が読む2ドメイン横断のため、editor 内部への依存を避け既存横断モジュール群（`actions.ts` 等）と同階層の中立配置にした。配置根拠をステップ1 に明記。テストファイルパスも `note/__tests__/` に更新。
- **[S-003 / arch]** リスク欄に「autosave 失敗でフラグが残るのは実際に未保存だから正しい挙動（過剰検知ではない）」を明記し誤読を防止。

**見送った提案**: なし（全指摘を取り込み）。

### 2周目

両視点とも**問題点ゼロ**で終了。1周目の要修正・改善はすべて実コードに接地した形で解消済みと確認された。

**取り込んだ改善提案**:
- **[S-001 / arch]** ステップ2(a) のエッジ追跡 effect の依存配列を `[state.dirtyKeys]`（Set 参照）と明記。reducer が dirty 変化時のみ新 Set 参照に差し替える性質から過不足なく発火する旨を補足。

**見送った提案**:
- **[S-001 / coverage]** AC-4 と AC-6 の `role="status"` 描画の一部重複。AC-6 は実装手段寄りだが、警告 UI を既存プリミティブで組む検証基準として残す価値があり、明確化のため現状維持（修正必須でない旨レビュアーも明記）。

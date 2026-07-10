# 実装計画 — Issue #824: feat(note): P12 編集中のヘッダー簡略タイトル（モバイル orientation）

**Issue:** #824
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

ノート編集画面（P12 / `NoteEditor`）のモバイル表示で、編集中のノートタイトルを共有ヘッダー中央へ簡略表示（mock `.header-doc`）し、本文スクロール中に編集対象を見失わない orientation を提供する。実装には共有アプリシェルとエディタ children を跨ぐ最小限の配管（client context）を新設する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | モバイル幅（`< sm` = 640px 未満）で、既存タイトルを持つ編集画面（`/notes/$noteId/edit`）を開くと即座にそのタイトルが共有ヘッダー中央に `.header-doc` として表示され、新規ノート（`/notes/new`）ではタイトルを入力すると表示される | Issue スコープ / mock L1045 / coverage S-003 | 1,2,3,4,5,6 |
| AC-2 | ヘッダーの簡略タイトルは長文で省略記号（truncate: `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`）になり、ヘッダー幅を押し広げない（中央 `1fr` トラックが伸びない）。mock「Q2 計画 — プロダクトレビューに向けて」以上の長文でも横スクロール/押し広げが起きず末尾 ellipsis になる | mock `.header-doc` (L227-235) / arch P-001 | 4,5 |
| AC-3 | 簡略タイトルは `aria-hidden="true"` の装飾要素で、スクリーンリーダーはエディタ本文の `<input>`（label「タイトル」）のみを読み上げ、タイトルが二重に読まれない | mock L1045 / ADR-001 | 4 |
| AC-4 | デスクトップ（`sm` 以上）では全ページ（編集画面含む）でヘッダー中央は従来どおり検索ボックスのみで、簡略タイトルは表示されない | Issue スコープ「デスクトップへの影響を出さない」 | 4,5 |
| AC-5 | 編集画面以外の `/_app` 画面（モバイル・デスクトップ両方）はヘッダー中央が従来どおり server-render の検索ボックスで、視覚・挙動が従来と不変（`HeaderCenter` のラッパー div が 1 段増えるため SSR DOM は厳密には同一ではないが、無害な inert wrapper のみでフォーカス順・a11y・見た目に影響しない） | Issue スコープ「他 `/_app` 画面への影響を出さない」 / S-001 | 1,2,4,5 |
| AC-6 | 編集画面から他画面へ遷移（またはエディタ unmount）すると簡略タイトルは消え、検索ボックスに戻る（unmount クリア＝ステップ3、title=null 時の検索復帰＝ステップ4） | orientation の局所性 / リーク防止 / coverage P-001 | 1,3,4,6 |
| AC-7 | ヘッダーの簡略タイトルは mock `.header-doc` のタイポと字揃えに準拠する: `text-sm`（`--text-sm`）/ `font-medium`（`--weight-medium`）/ `text-ink`（`--color-ink`）で、text-align 指定なし＝**左寄せ**（mock は `text-center` を持たない） | mock `.header-doc` (L227-235) / coverage S-002 / arch S-002 | 5 |
| AC-8 | モバイル幅（`< sm`）で title を持つ編集画面を開いている間は、ヘッダー中央の検索ボックスが**表示されず**、タイトルが検索を**置換**する（title と検索が同時表示にならない）。title が消える（他画面へ遷移／新規ノートで未入力）と検索が再表示される。＝ mock の設計意図（P12 モバイルは検索を持たない唯一のページ）の直接検証 | mock `.header-doc` (L227-235) / ADR-002 / coverage(round-2) S-001 | 4,5 |

## スコープ

### 含まれないもの
- デスクトップ編集画面のヘッダー変更（mock でも desktop は従来ヘッダー。本 Issue は mobile orientation のみ）。
- 保存状態・保存アクションのヘッダー複製（#818 ADR-003 の下部固定保存バーが担当済み。本 Issue は orientation のみ）。
- タイトル以外のメタ情報（ディレクトリ・タグ）のヘッダー表示。
- `Icon` など共有コンポーネントの API 拡張。

## 調査結果

- 関連ファイル:
  - `app/routes/_app/route.tsx` — 全 `/_app` の共有シェル。`loadAppShell` が `Header` / `Sidebar` を `renderServerComponent` で RSC 化し、`AppShellFrame` に渡す。
  - `app/components/layout/AppShellFrame.tsx`（server）→ `AppShellDrawer.tsx`（**client**）。`AppShellDrawer` が `DrawerCtx.Provider` を持ち、`{header}`（RSC payload）と `<main>{children}</main>` を**同一 provider 配下**にレンダーする。**title 配管を差し込む唯一の場所**。
  - `app/components/layout/Header.tsx`（server）— `grid-cols-[auto_1fr_auto]`。中央列（col2）は `SEARCH_BOX_WRAPPER` の検索フォーム。左列に client island `MenuButton`。
  - `app/components/layout/MenuButton.tsx`（**client**）— **本 Issue の実装ひな型**。RSC header payload 内の client island が `useDrawer()` で `AppShellDrawer` の client context を consume する既存の実証パターン。
  - `app/components/layout/AppShellDrawer.tsx` — `DrawerCtx = createContext(...)` / `useDrawer()` / `DrawerCtx.Provider`。title context の同型テンプレート。
  - `app/components/note/editor/NoteEditor.tsx`（**client**、`renderServerComponent` 経由で RSC payload 化されるが実体は `"use client"`）— `state.title` を保持。ここからタイトルを push する。
  - `app/components/layout/styles.ts` — `APP_HEADER`（grid）/ `SEARCH_BOX_WRAPPER` 等。`HEADER_DOC` を追加する。
  - mock `spec/design/pages/mobile/P12-editor.html` — `.header-doc`（L227-235 スタイル / L1045 要素、`aria-hidden="true"`）。

- あるべきアーキテクチャ:
  - 本変更は**プレゼンテーション層に閉じる**。ドメイン / ユースケース / アダプターへの影響は**なし**（タイトルは既にエディタ client state にあり、新しいデータ取得もサーバ往復も発生しない）。
  - RSC 境界を跨がない client context で配管する（CLAUDE.md「client mutations は React 19 primitives を直接使う」/ 既存 `DrawerCtx` 準拠）。
  - スタイルは Tailwind utility-first + `data-*` 属性 + `data-[name]:` バリアント（CLAUDE.md styling / #818 ADR-004）、トークンは `tokens.css` の既存変数を利用。
  - **調査で確定した設計事実**: mobile mock 群のうち `.header-doc` を持つのは P12-editor **のみ**で、かつ P12-editor **のみ**がヘッダーに検索ボックスを持たない。他 mobile mock（P10/P11/P13…）は全て検索ボックス。→ **モバイル編集中はタイトルが検索を置き換える**のが設計意図。デスクトップは全ページ検索のまま。

- 既存実装の状態:
  - #818 でエディタ内に閉じる最適化（保存バー・メタ折りたたみ・寸法統一）は実装済み。`.header-doc` のみ ADR-001 で明示的にフォローアップへ切り出され**未実装**。
  - 共有シェルは per-route の title スロットを持たない（乖離ではなく未整備）。本 Issue で `DrawerCtx` と同型の client context を新設して埋める。既存の設計原則からの逸脱はない。

- 依存関係:
  - 変更対象は `app/components/layout/`（共有シェル）と `NoteEditor.tsx`（consumer）。共有シェル改変のため**全 `/_app` ページがレンダーパスを通る** → title が未セット（null）のとき従来と完全に同一挙動であることが回帰の要（AC-5）。

## 設計

### ドメインモデルへの影響
なし。タイトルは既存のエディタ view state であり、ドメイン概念の追加・変更は不要。

### ユースケース / アプリケーションロジック
なし。新規のデータ取得・保存・サーバ関数呼び出しは発生しない。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

**配管方式: client context（Issue 推奨 (a)）。詳細は adr.md ADR-001。**

ランタイムの React ツリー（client）:

```
AppShellDrawer (client)
└─ DrawerCtx.Provider
   └─ EditorTitleProvider           ← 新設。header と children を両方内包
      ├─ {header}  (RSC payload)
      │   └─ Header (server)
      │       └─ HeaderCenter (client island)  ← useEditorTitle() で title を read
      │           ├─ .header-doc（title 表示 / mobile-only / aria-hidden）
      │           └─ {検索フォーム}  (server children, そのまま透過)
      └─ <main>{children}</main>
          └─ … Outlet … NoteEditor (client)     ← useSetEditorTitle() で title を push
```

- `MenuButton` が `useDrawer()` を read するのと**完全に同型**（RSC header payload 内の client island が `AppShellDrawer` の client context を consume）。`NoteEditor` は `renderServerComponent` 経由でも実体が `"use client"` なので、client ツリー上は provider の子孫となり context を購読できる。SSR/初期 render では title=null なのでハイドレーション不整合は起きない。

- **churn 封じ込めの load-bearing な不変条件（"children as prop" 最適化, arch S-002）**: `EditorTitleProvider` は自前の `useState` を持ち `setTitle` で自身が再レンダーする。それでも `{header}` と `<main>{children}</main>` の巨大サブツリーがキーストロークごとに再 reconcile されないのは、これらが `AppShellDrawer` の render で生成され **`children` prop として `EditorTitleProvider` に渡る安定 element 参照**だからで、provider の自 state 再レンダーでは element 参照が変わらず React が subtree をスキップする（canonical な "children as prop" 最適化）。**この構造が唯一 churn を封じ込める仕組みであり、将来 provider 本体で `{header}`/`{children}` を inline に描くと自 state 変化で全 `/_app` ツリーが打鍵ごとに再レンダーする回帰を招く。必ず children 渡しを維持する。**

- **read/write の context 分離**（re-render churn 回避、ADR-003）:
  - `EditorTitleValueCtx`（`string | null`、キーストロークごとに変化）を read するのは軽量な `HeaderCenter` のみ。
  - `EditorTitleSetterCtx`（安定した setter、値は不変）を購読するのが `NoteEditor`。→ タイトル入力による `NoteEditor` 本体の再レンダーは自 reducer（controlled input）由来で不可避だが、分離により **context value churn が `NoteEditor` に伝播しない**（setter 参照が安定し、value 変化で本体の context 購読が発火しない／effect 再実行を title 変化時のみに抑える）。詳細は ADR-003。

- **mobile 限定 & 検索置換の保証**（純 CSS、ルート判定不要）:
  - `.header-doc`（title）: `sm:hidden`（デスクトップでは常に非表示）+ title が非空のときのみレンダー。
  - 検索フォームラッパー: `data-doc={hasTitle || undefined}` を**その要素自身**に付与し `data-[doc]:max-sm:hidden`（title があるモバイルでのみ非表示）。`data-*` を消費する要素自身に属性を置く規約（#818 ADR-004）に一致し、`group-data-*`（プロジェクト未使用）を導入しない。
  - 帰結: desktop=title 非表示/検索表示、mobile+編集(title有)=title 表示/検索非表示、mobile+非編集(title=null)=title 未レンダー/検索表示。ルート文字列での分岐は一切不要で、title の有無だけが唯一のスイッチ。

- **truncation の要: `min-w-0` は grid アイテム自身に置く**（arch P-001）:
  - `APP_HEADER` は `grid grid-cols-[auto_1fr_auto]`。CSS 仕様上 `1fr` は `minmax(auto, 1fr)` で、中央トラックの最小サイズは**中央 grid アイテムの min-content**で決まる。中央 grid アイテムは `HeaderCenter` の root（`SEARCH_BOX_WRAPPER` を移設した div）であり、`.header-doc` はその**子**で grid アイテムではない。
  - mock は `min-width:0` を**直接の grid 子**である `.header-doc` に置いている（P12-editor.html L234）が、plan は `.header-doc` を `HeaderCenter` root の一段内側にネストするため、grid アイテムに相当するのは root の方。したがって `min-w-0` を **`HeaderCenter` root（＝中央 grid アイテム）自身**に付与しないと、nowrap タイトルの min-content が中央トラックに張り付き、ヘッダーを横に押し広げる（AC-2 違反）。
  - `HEADER_DOC`（`.header-doc` 相当）側にも `min-w-0` + `truncate` は残す。**grid アイテム（外）で最小幅を 0 に解放し、内側で ellipsis させる**のが定石。両方必要。
  - 中央トラックを `minmax(0,1fr)` に変える代替は `APP_HEADER` が全 `/_app` 共有 grid のため波及があり非採用。アイテムへの `min-w-0` の方が局所的で安全。

- **title push/クリーンアップ harness の切り出し（任意, arch S-003）**: `NoteEditor` は `useServerFn` を 7 本・`useAutosave`/`useEditLock` を束ねる巨大 client コンポーネント。`useSetEditorTitle` の push（`state.title` 変化で最新値を push、unmount で null）とクリーンアップは、`NoteEditor` 本体に直書きせず薄い専用 harness（小さな hook `useEditorTitleSync(title)` もしくは effect 専用の子コンポーネント）に切り出してよい。壊れにくさ・テスト容易性（フル mount 不要で harness 単体を駆動可能）のため。

## 実装ステップ

内側（配管の土台）→ 外側（consumer）の順。

### 1. Editor title の client context を新設
- **対象ファイル:** `app/components/layout/EditorTitleContext.tsx`（新規, `"use client"`）
- **変更内容:**
  - `EditorTitleValueCtx = createContext<string | null>(null)` と `EditorTitleSetterCtx = createContext<(t: string | null) => void>(() => {})` を定義。
  - `EditorTitleProvider`: `const [title, setTitle] = useState<string | null>(null)`。`setTitle` は `useState` の setter そのままで参照安定。2 つの Provider をネストして `children` を包む。
  - `useEditorTitle(): string | null` — value を read（`HeaderCenter` 用）。
  - `useSetEditorTitle(): (t: string | null) => void` — setter を read（`NoteEditor` 用）。
  - JSDoc に「RSC 境界を跨がない client context。`DrawerCtx` と同型。orientation 用の装飾なので a11y は `aria-hidden` 側で担保」と #824 / ADR 参照を記す。
- **理由:** header と editor を疎結合のまま繋ぐ単一の配管。read/write 分離で再レンダー churn を抑える（ADR-003）。

### 2. Provider を AppShellDrawer に mount
- **対象ファイル:** `app/components/layout/AppShellDrawer.tsx`
- **変更内容:** `EditorTitleProvider` を import し、`DrawerCtx.Provider` の内側で `{header}` と `<div className={APP_LAYOUT_WITH_SIDEBAR}>…<main>{children}</main></div>` を**両方**包む（`SIDEBAR_BACKDROP` ボタン含め既存 return 全体をラップ）。
- **不変条件（arch S-002）:** `{header}` と `<main>{children}</main>` は必ず `EditorTitleProvider` の **`children` prop として渡す**（`AppShellDrawer` の render で生成した安定 element を透過）。provider 本体に inline 化してはならない — inline 化すると `setTitle` の自 state 再レンダーで全 `/_app` サブツリーが打鍵ごとに再 reconcile される回帰になる（"children as prop" 最適化が churn 封じ込めの要）。
- **理由:** header（consumer）と children（producer）を同一 provider 配下に置く唯一の client 位置。`DrawerCtx` と同じ場所・同じ構造。

### 3. NoteEditor から title を push
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`（+ 任意で `app/components/note/editor/useEditorTitleSync.ts` などの harness）
- **変更内容:**
  - push ロジックは巨大な `NoteEditor` 本体に直書きせず、薄い専用 harness に切り出すことを推奨（arch S-003）。例: `useEditorTitleSync(title: string | null)` hook を新設し、`NoteEditor` からは `useEditorTitleSync(state.title);` の 1 行呼び出しにする。
  - harness の中身:
    - `const setHeaderTitle = useSetEditorTitle();`
    - `useEffect(() => { setHeaderTitle(state.title); }, [state.title, setHeaderTitle]);` で state.title を反映。`initialTitle` を持つ編集画面では mount 時にも発火し、開いた瞬間ヘッダーへ反映される（AC-1 の edit モード初期表示）。
    - `useEffect(() => () => setHeaderTitle(null), [setHeaderTitle]);`（unmount で null に戻す＝AC-6 リーク防止）。
- **理由:** エディタが唯一のタイトル source of truth。effect は client 実行なので SSR に影響しない。setter は安定参照ゆえ effect の再実行はタイトル変化時のみ。harness 切り出しで `NoteEditor`（重い依存）への結合を最小化し、AC-1/AC-6 の検証を harness 単体（フル mount 不要）で行えるようにする。

### 4. HeaderCenter（中央列 client island）を新設
- **対象ファイル:** `app/components/layout/HeaderCenter.tsx`（新規, `"use client"`）
- **変更内容:**
  - `children`（server の検索フォーム）を受け取る `{ children: ReactNode }`。
  - `const title = useEditorTitle(); const hasTitle = title !== null && title.trim() !== "";`
  - root の `<div>` は中央 grid アイテムなので `className={\`${SEARCH_BOX_WRAPPER} min-w-0\`}`（`min-w-0` を**grid アイテム自身**に付与）。これが無いと nowrap タイトルの min-content で中央トラックが伸びる（arch P-001）。その中に:
    - `hasTitle` のとき `<div aria-hidden="true" className={HEADER_DOC}>{title}</div>`（`sm:hidden` を含む）。
    - `<div data-doc={hasTitle || undefined} className="data-[doc]:max-sm:hidden">{children}</div>`（検索を mobile+title 時に隠す）。
  - `MenuButton` を模した JSDoc（ひな型として参照）を付す。
- **理由:** 検索フォームは server children としてそのまま透過するので**検索は server-render のまま**（SSR 不変、AC-5）。title の read だけを client 化する最小 island。

### 5. Header を HeaderCenter でラップ + HEADER_DOC スタイル追加
- **対象ファイル:** `app/components/layout/Header.tsx`, `app/components/layout/styles.ts`
- **変更内容:**
  - `Header.tsx`: 現在 `<div className={SEARCH_BOX_WRAPPER}>` 直下にある検索 `<form>…</form>` を `<HeaderCenter>…</HeaderCenter>` に置き換え（`SEARCH_BOX_WRAPPER` は HeaderCenter の root へ移設、root には `min-w-0` を追加＝ステップ4）。`Header` は server のまま（`"use client"` を付けない）。
  - `styles.ts`: mock `.header-doc`（L227-235）を写す `HEADER_DOC` を追加:
    `"sm:hidden truncate text-sm font-medium text-ink min-w-0"`
    - `truncate` = overflow-hidden + text-ellipsis + whitespace-nowrap（mock の `overflow:hidden`/`text-overflow:ellipsis`/`white-space:nowrap`）。
    - `text-sm`（mock `font-size: var(--text-sm)`）/ `font-medium`（mock `font-weight: var(--weight-medium)`）/ `text-ink`（mock `color: var(--color-ink)`）。
    - `min-w-0`（mock `min-width:0`）は `.header-doc` 側にも残す（内側で ellipsis させるため）。root の grid アイテム側 `min-w-0`（ステップ4）と両方必要。
    - **`text-center` は付けない**: mock `.header-doc` は text-align 指定を持たず**左寄せ**（`P12-editor.html` L227-235）。中央寄せは mock からの逸脱であり、末尾 ellipsis とも相性が悪いため素直に左寄せで流す。mock との意図的な差分は無し（＝mock 完全準拠）。
    - `sm:hidden` は mock のコメント「mobile: 編集中はタイトルをヘッダーに簡略表示」に対応（desktop では非表示）。
- **理由:** mock 準拠のスタイルを SSOT の styles.ts に集約。`sm:hidden` で AC-4、`truncate`+（外内 2 箇所の）`min-w-0` で AC-2、mock 準拠のタイポ・左寄せで AC-7。

### 6. 動作確認と回帰チェック（下記テスト方針）
- **対象:** 手動 + ユニット。title=null で他ページが不変であること（AC-5）と unmount クリア（AC-6）を重点確認。

## 設計判断

- **ADR-001**: タイトル伝播を client context（推奨 (a)）で行い、portal (b) を採らない。
- **ADR-002**: モバイル編集中はタイトルが検索を「置換」する構成を、`HeaderCenter` が server 検索を `children` 透過しつつ title を重ねる形で実現（検索の server-render を維持、`data-[doc]:` は要素自身に付与）。
- **ADR-003**: value/setter の context を分離し、エディタ本体のタイトル入力による再レンダーを防ぐ。
- **ADR-004**: `min-w-0` を中央 grid アイテム（`HeaderCenter` root）自身に置き、descendant の `.header-doc` にも重ねて残す（外で最小幅解放・内で ellipsis）。mock を一段ネストして写す際の grid truncation の落とし穴を回避。
- **ADR-005**: title の push/クリーンアップを `NoteEditor` 本体でなく薄い `useEditorTitleSync` harness に切り出す（結合最小化・テスト容易性）。
- **ADR-006**: `EditorTitleProvider` は header+main ツリーを `children` prop として受け取る（"children as prop" 最適化）。provider 内に inline 化すると打鍵ごとに全 `/_app` ツリーが再レンダーする回帰になるため、children 渡しを load-bearing な不変条件として固定する。

詳細は `.issue/824/adr.md`。

## リスクと注意点

- **全 `/_app` 回帰**: 共有シェル（`AppShellDrawer` / `Header`）を触るため全ページがレンダーパスを通る。title=null のとき従来と DOM/挙動が同一であること（検索が server children としてそのまま出ること）を P10 一覧・設定・admin 等で目視回帰する（AC-5）。
- **SSR→hydration のちらつき**: SSR は title=null で検索を描画 → hydration 後にエディタ effect が title を push → mobile 編集画面のみ検索→タイトルに切り替わる。ハイドレーション不整合は起きない（両者 null 始まり）が、モバイル編集の初回に一瞬検索が見える。装飾要素であり許容。plan に明記。
- **新規ノート（title 空）**: `/notes/new` は初期 title が空 → `hasTitle=false` で検索が出たまま、ユーザーがタイトルを打つと切り替わる（progressive）。空タイトルでプレースホルダを出すと二重管理になるため、空時は検索 fallback とする（意図的挙動、AC-1 は「タイトルを入力すると」で担保）。
- **再レンダー churn**: title をキーストロークごとに push するため `HeaderCenter` が毎回再レンダー（軽量な 1 行のため許容）。read/setter context 分離でエディタ本体には波及させない（ADR-003）。
- **`data-[doc]:` の適用要素**: `data-doc` は変数を消費する検索ラッパー**自身**に置く（#818 ADR-004 の轍を踏まない）。`group-data-*` は導入しない。
- **RSC children 透過**: `HeaderCenter`（client）に server の検索 `<form>` を children として渡す構成が壊れないこと（`AppShellDrawer` が `{header}` を渡すのと同じ標準 RSC パターン）を typecheck / 実機で確認。
- **他エディタ経路**: title を push するのは `NoteEditor` のみ。他に `useSetEditorTitle` を呼ぶ箇所がないため、非編集画面では title=null が保たれる。

## テスト方針

- **HeaderCenter（コンポーネントテスト, 新規）**: `EditorTitleValueCtx` を provider で与え、
  - title=null → `.header-doc` 相当要素なし・検索 children が可視（隠しクラスなし）。
  - title="Q2 計画" → `aria-hidden="true"` の title 要素が描画され、検索ラッパーに `data-doc` が付く。
- **EditorTitleContext（ユニット, 新規）**: provider 経由で `useSetEditorTitle` の setter を呼ぶと `useEditorTitle` の値が更新される／setter 参照が安定（再レンダーで同一）であること。
- **title push harness（ユニット, 新規推奨）**: push/クリーンアップは `useEditorTitleSync` harness（arch S-003）を薄く駆動する形が壊れにくい。`EditorTitleContext` を差し込み、title 相当を変化させると setter が最新値で呼ばれる／unmount で `null` で呼ばれることを検証（AC-1 edit 初期表示・new 入力・AC-6）。`NoteEditor` フル mount（`useServerFn` 7 本 + TipTap + jsdom）は必須ではない。フル mount 版を既存 `noteEditorUnsavedFlag.test.tsx` に倣って足すのは任意。
- **回帰（手動 / manual-test）**:
  - DevTools を mobile 幅にして `/notes/$id/edit`（既存タイトル）を開くと即座にヘッダー中央へ左寄せ truncate 表示、`/notes/new` はタイトル入力で表示（AC-1）。他画面（P10 等）へ遷移で検索に戻る（AC-6）。desktop 幅では全ページ検索のまま（AC-4）。
  - **検索置換（AC-8）**: mobile 幅で title を持つ編集画面を開いている間、ヘッダー中央に検索ボックスが**同時表示されない**（タイトルのみ）ことを目視。`/notes/new` で未入力（title 空）のときは検索が出て、入力すると検索がタイトルに置き換わることを確認。HeaderCenter テストでは title 非空時に検索ラッパーへ `data-doc` が付くことで機構を担保。
  - **長文タイトル truncation（AC-2）**: mock「Q2 計画 — プロダクトレビューに向けて」以上の長さを入力し、ヘッダーが横スクロール/押し広げを起こさず末尾 ellipsis になることを目視（root/`.header-doc` 両方の `min-w-0` が効いているかの確認）。
  - **タイポ・字揃え（AC-7）**: 簡略タイトルが `text-sm`/`font-medium`/`text-ink`・左寄せ（中央寄せでない）で mock と一致することを目視。
  - `pnpm typecheck && pnpm lint:fix && pnpm format` を最後に実行。

## レビュー履歴

### 1周目
**修正した点**:
- coverage P-001: AC-6 の「対応ステップ」を `1,6` → `1,3,4,6` に修正。unmount クリア機構はステップ3（`NoteEditor`/harness の cleanup effect）、title=null 時の検索復帰はステップ4（`HeaderCenter` の `hasTitle` 分岐）が担う旨を AC-6 に明記。
- coverage P-002 / arch S-002（同一問題）: `HEADER_DOC` から `text-center` を削除し mock `.header-doc`（左寄せ）へ準拠。mock 実値（`text-sm`=`--text-sm` / `font-medium`=`--weight-medium` / `text-ink`=`--color-ink` / truncate=overflow-hidden+ellipsis+nowrap / `min-w-0`）を step5 のスタイル記述に正確反映。mock からの意図的差分は無し（完全準拠）と明記。
- arch P-001: `min-w-0` を descendant の `.header-doc` だけでなく**中央 grid アイテム自身**（`HeaderCenter` root ＝移設した `SEARCH_BOX_WRAPPER` ラッパー）にも付与するよう設計・step4/5 を修正（`1fr`=`minmax(auto,1fr)` の min-content が伸びるのを防ぐ）。AC-2 に「中央 `1fr` トラックが伸びない／長文でも横スクロールせず ellipsis」の検証観点を追記。

**取り込んだ改善提案**:
- 両者 S-001: AC-5 の「SSR いずれも不変」を「視覚・挙動が従来と不変（`HeaderCenter` のラッパー div が 1 段増えるため SSR DOM は厳密には同一ではないが無害）」へ緩め、過剰主張を修正。
- coverage S-002 / arch S-002: header-doc のタイポ（`text-sm`/`font-medium`/`text-ink`）と字揃え（左寄せ）の mock 準拠を検証する **AC-7** を新設。
- coverage S-003: AC-1 を「既存タイトルを持つ編集画面を開くと即座に表示され、新規ノートでタイトルを入力すると表示される」と両ケースを含む形に修正（edit モードの mount 時初期表示を捕捉）。
- arch S-003: title の push/クリーンアップを `NoteEditor` 本体でなく薄い `useEditorTitleSync` harness に切り出す選択肢を設計・step3・テスト方針に明記（壊れにくさ・テスト容易性）。

**見送った提案とその理由**:
- なし（全取り込み）。

### 2周目
両視点とも要修正ゼロで収束。残る改善提案（S）を全反映。

**取り込んだ改善提案**:
- coverage S-001（検索置換挙動の AC 昇格）: **AC-8** を新設。「モバイル編集中はヘッダー中央の検索ボックスが表示されず、タイトルが検索を置換する（同時表示にならない）」を直接検証する基準を追加。title と検索が同時表示に壊れても AC-1/AC-4 は通過しうる隙を塞いだ（実装追加は不要、`data-[doc]:max-sm:hidden` で成立済み。検証観点の明文化のみ）。
- arch S-001（ADR-003 の churn 根拠の不正確さ）: ADR-003 Decision/Consequences と plan 設計セクションの「エディタ本体がタイトル入力で再レンダーしない」という誤った不変条件を正確化。`NoteEditor` は controlled input を持つため打鍵ごとに自 reducer で再レンダーするのは不可避であり、value/setter 分離が実際に防ぐのは (a) context value churn を本体へ伝播させない、(b) setter 参照安定で effect 再実行を title 変化時のみに抑える、の 2 点である旨に修正。
- arch S-002（churn 封じ込めの load-bearing な仕組みが未明文化）: `EditorTitleProvider` が header+main ツリーを **`children` prop として受け取る**"children as prop" 最適化を、plan 設計セクション・step2 の不変条件・**ADR-006 新設**として明記。provider 内に inline 化すると全 `/_app` ツリーが打鍵ごとに再レンダーする回帰を招く旨を固定。

**見送った提案とその理由**:
- なし（全取り込み）。

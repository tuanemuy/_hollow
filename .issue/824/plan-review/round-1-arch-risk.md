# Plan Review — Issue #824（アーキテクチャ整合性・実現可能性・リスク）

**対象:** `.issue/824/plan.md` / `.issue/824/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**レビュー日:** 2026-07-10 / Round 1

計画の中核（client context 方式・RSC 境界を跨がない consume・presentation 層への閉包・value/setter 分離）は既存コードの実証パターンと照合して**成立している**。実機コードで裏取りした結果、致命的な設計欠陥はない。ただしモック `.header-doc` を実装へ落とす際の CSS grid truncation で AC-2 を壊しうる箇所が 1 つある。

---

#### 問題点（要修正）

- **[P-001]** `min-w-0` を「grid アイテム自身（`HeaderCenter` root = 移設される `SEARCH_BOX_WRAPPER`）」ではなく descendant の `.header-doc` にだけ置いており、長文タイトルでヘッダーが横に押し広がる／オーバーフローする恐れがある（AC-2 違反リスク）。
  - 理由:
    - `APP_HEADER` は `grid grid-cols-[auto_1fr_auto]`。CSS 仕様上 `1fr` は `minmax(auto, 1fr)` であり、中央トラックの最小サイズは**中央 grid アイテムの min-content**で決まる。`minmax(0,1fr)` ではないのでトラックは content 以下に縮まない。
    - 中央の grid アイテムは `Header` の `<div className={SEARCH_BOX_WRAPPER}>`（plan では `HeaderCenter` の root へ移設）。`.header-doc` はその**子**であり grid アイテムではない。
    - `.header-doc` は `white-space:nowrap`（`truncate`）。`min-width:0` / `overflow:hidden` を「非 flex/grid-item の通常ブロック」に付けても、その要素が**親（grid アイテム）へ寄与する min-content は nowrap テキスト全幅のまま**。grid アイテム自身に `min-width:0` が無いと、自動最小サイズがテキスト全幅に張り付き、中央トラックが伸びてヘッダーを押し広げる（＝AC-2「ヘッダー幅を押し広げない」を満たさない）。
    - モックは正しく `.header-doc`（＝**直接の grid 子**）に `min-width:0` を置いている（`P12-editor.html` L234）。plan は `.header-doc` を `SEARCH_BOX_WRAPPER` の中へ**一段ネスト**したため、モックが grid アイテムに与えていた `min-width:0` が「grid アイテムでない要素」へずれてしまい、truncation が効かなくなる。既存の検索ボックスが `min-w-0` 無しで破綻しないのは `<input>` の min-content が有界（`max-w-[460px]` で頭打ち）だからで、nowrap の無限長タイトルには当てはまらない。
  - 提案:
    - `HeaderCenter` の root（`SEARCH_BOX_WRAPPER` を持つ div ＝中央 grid アイテム）に `min-w-0` を追加する。`SEARCH_BOX_WRAPPER` は Header 専用（grep で確認済み、用途はここだけ）なので `SEARCH_BOX_WRAPPER` 自体に `min-w-0` を足すか、`HeaderCenter` root で `className={\`${SEARCH_BOX_WRAPPER} min-w-0\`}` としてよい。
    - `.header-doc`（`HEADER_DOC`）側の `min-w-0` + `truncate` はそのまま残す（両方必要）。grid アイテム（外）で最小幅を 0 に解放し、内側で ellipsis させる、が定石。
    - 代替として中央トラックを `minmax(0,1fr)` にする手もあるが、`APP_HEADER` は全 `/_app` 共有 grid なので他要素への波及があり非推奨。アイテムへの `min-w-0` の方が局所的で安全。
    - 実装後、モバイル幅で意図的に長いタイトル（例: モックの「Q2 計画 — プロダクトレビューに向けて」以上の長さ）を入れ、ヘッダーが横スクロール/押し広がりを起こさず ellipsis することを目視確認する（AC-2 の検証手順に追記推奨）。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-5 の「表示・挙動・**SSR いずれも不変**」は方式(ii)では厳密には成立しない（inert な wrapper div が全ページの SSR HTML に 1 つ増える）。表現を緩めるべき。
  - 理由: 方式(ii)では検索 `<form>` を `HeaderCenter`（client）へ children 透過するため、`SEARCH_BOX_WRAPPER` 直下に `<div data-doc … className="data-[doc]:max-sm:hidden">` が挟まる。これは title=null（＝全非編集ページ）でも常に出力されるので、**全 `/_app` ページの SSR DOM に無害な div が 1 段追加**される。視覚・挙動・フォーカス順・a11y は不変だが「SSR バイト不変」ではない。検証を不可能な基準（HTML 完全一致）で縛らないよう、AC-5 を「視覚・挙動が不変（無害な wrapper 追加はある）」と明記しておくと、回帰確認の合否判定が実態に合う。なお絶対配置の検索アイコンは `SEARCH_BOX_WRAPPER`（`relative`）基準のままで、wrapper div は padding/margin 無しの全幅ブロックゆえ input 左端・アイコン位置は不変（この点は問題なし）。

- **[S-002]** `HEADER_DOC` の `text-center` はモック（`.header-doc` は text-align 指定なし＝左寄せ）から外れ、かつ ellipsis と相性が悪い。
  - 理由: モックの `.header-doc` は中央 grid セル内で左寄せ（セル自体が中央にあるため視覚的に中央寄り）。plan の `text-center` は文字を中央寄せするが、`text-overflow:ellipsis` は「中央寄せ＋オーバーフロー」時に先頭側がクリップされ得る（末尾 ellipsis と中央寄せの組み合わせは表示が不安定）。モック忠実性・truncation 安定性のいずれの観点でも `text-center` を落として素直に流す方が無難。中央寄せ表示を意図採用するなら、その旨を ADR/コメントに残す（モック差分の明示）。

- **[S-003]** `NoteEditor` のテスト追加は重い依存（TipTap / server-fn / jsdom）を抱えるため、push/クリーンアップ検証は effect 単位に切り出せると安全。
  - 理由: `NoteEditor` は `useServerFn` を 7 本、`useAutosave`/`useEditLock` を束ねる巨大 client コンポーネント。既存 `noteEditorUnsavedFlag.test.tsx` の流儀に倣うのは妥当だが、`useSetEditorTitle` push（`state.title` 変化で最新値・unmount で null）の検証だけなら、`EditorTitleContext` を差し込んだ薄い harness で `state.title` 相当を駆動する方が壊れにくい。AC-1/AC-6 のリグレッション網としては「setter が最新 title で呼ばれる／unmount で null」が本質で、`NoteEditor` フル mount は必須ではない。plan のテスト方針に選択肢として一言添えると実装時の迷いが減る。

---

#### 良い点

- **(a) client context 方式の実現可能性証明が本物**。`MenuButton`（`"use client"`、`Header` の RSC payload 内 client island）が `AppShellDrawer` の `DrawerCtx` を `useDrawer()` で consume している既存実装を実機で確認。「RSC payload 内の client island が親 client provider の context を購読できる」ことの**完全な同型証明**になっており、`HeaderCenter` × `EditorTitleValueCtx` はこれと同じ構図。RSC payload がキャッシュ（`staleTime: Infinity`）されても client 側は live に再レンダーする点も、`MenuButton` がドロワー状態を live に反映している事実で担保される。ADR-001 の主張は正確。
- **presentation 層への閉包が正しい**。ドメイン/ユースケース/アダプター無変更。タイトルは既存 `NoteEditor` の view state（`state.title`）で、新規データ取得・サーバ往復ゼロ。CLAUDE.md の依存方向・「client mutations は React 19 primitives を直接」の原則に合致。
- **value/setter context 分離（ADR-003）が churn 遮断として機能する**。`NoteEditor` は安定参照の setter のみ購読 → タイトル打鍵で本体（TipTap/FrontMatter）が再レンダーしない。`EditorTitleProvider` を `AppShellDrawer` とは別コンポーネントにして state を持たせる設計により、`{header}`/`{children}` は安定 element 参照として渡るので title 変化で深く再 reconcile されず、`ValueCtx` consumer（`HeaderCenter`）のみ更新される。分析は妥当。
- **unmount クリーンアップ（title=null）が AC-6 リーク防止として必須かつ正しい**。header は `loadAppShell` が一度だけ生成しキャッシュする永続要素なので、`NoteEditor` unmount 時に明示 null 化しないと前ページのタイトルが残る。plan は effect のクリーンアップで対処済み。
- **`data-*` を「consume する要素自身」に置く規約（#818 ADR-004）を踏襲**。`data-doc` を検索ラッパー自身に付け `group-data-*`（プロジェクト未使用）を導入しない判断は既存規約と一致。
- **no-op setter デフォルト（throw しない）の選択が装飾機能として適切**。`useDrawer` は provider 無しで throw するが、`useSetEditorTitle` は `() => {}` を既定にすることで provider 外／テストでも `NoteEditor` が安全に動く。装飾要素（`aria-hidden`）ゆえ機能欠落にならない設計判断として妥当。
- **検索を server children 透過で維持する方式(ii)の選定が堅実**。方式(i)（中央列丸ごと client 化＝検索 input の SSR 構造変化）と方式(iii)（オーバーレイ＝隠れた input がタブ可能で a11y 綻び）を退けた ADR-002 の論拠は正確。`display:none`（`hidden`）で片方を flow/フォーカス順から外すため phantom tab stop も生じない。

---

#### 総評

計画の骨格（配管方式・レイヤー閉包・再レンダー戦略・a11y 取り扱い）はプロジェクトのあるべき姿と整合し、実機の既存パターンで裏取りできる。要修正は **P-001（grid truncation の `min-w-0` 位置）** の 1 点。これはモックを一段ネストして写す過程で grid アイテムと truncate 対象がずれた典型的な落とし穴で、AC-2 を実際に壊しうるため実装前に方針を確定させたい。S-001〜S-003 は品質・検証容易性の向上提案。

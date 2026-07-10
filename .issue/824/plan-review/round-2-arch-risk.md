# Plan Review — Issue #824（アーキテクチャ整合性・実現可能性・リスク）

**対象:** `.issue/824/plan.md` / `.issue/824/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**レビュー日:** 2026-07-10 / Round 2

1周目の唯一の要修正 **P-001（grid truncation の `min-w-0` 位置）** は、実機コードで裏取りした結果 **正しく反映されている**。plan step4/5 で `HeaderCenter` root（＝中央 grid アイテム、`${SEARCH_BOX_WRAPPER} min-w-0`）と descendant `.header-doc`（`HEADER_DOC` に `min-w-0`）の**両方**に `min-w-0` を置く方針になり、ADR-004 が `1fr`=`minmax(auto,1fr)` の min-content 由来という CSS 根拠を正確に記述している。1周目の改善提案 S-001/S-002/S-003 も AC-5 緩和・AC-7 新設・harness 切り出しとして全て取り込み済み。

実機で以下を確認し、計画の中核設計事実はすべて裏付けが取れた:

- `MenuButton`（`"use client"`）が `Header` RSC payload 内の client island として `AppShellDrawer` の `DrawerCtx` を `useDrawer()` で consume している（`MenuButton.tsx` L5/L16、`AppShellDrawer.tsx` L186 `{header}` と L208 `<main>{children}</main>` が同一 `DrawerCtx.Provider` 配下）。`HeaderCenter` × `EditorTitleValueCtx` はこれと完全同型 → **実現可能**。
- `APP_HEADER` は `grid grid-cols-[auto_1fr_auto]`（`styles.ts` L6）、中央 grid アイテムは `SEARCH_BOX_WRAPPER`（`"max-w-[460px] w-full mx-auto relative"`、`min-w-0` を持たない、`Header.tsx` L29）。grep で `SEARCH_BOX_WRAPPER` は Header 専用と確認 → root への `min-w-0` 追加は局所的で波及なし。
- mock `.header-doc`（`P12-editor.html` L227-235）は `font-size:var(--text-sm)` / `font-weight:var(--weight-medium)` / `color:var(--color-ink)` / `overflow:hidden` / `text-overflow:ellipsis` / `white-space:nowrap` / `min-width:0`、**`text-align` 指定なし＝左寄せ**。plan の `HEADER_DOC = "sm:hidden truncate text-sm font-medium text-ink min-w-0"` は mock 完全準拠（AC-7）。要素は `<div class="header-doc" aria-hidden="true">…</div>`（L1045）で AC-3 の `aria-hidden` も一致。
- `NoteEditor` は `"use client"`、`state.title`（edit 時 `initialTitle`、new 時 `""`、L133）を controlled input（`value={state.title}`、L497）で保持。sr-only label「タイトル」（L491-493）。→ push の source of truth として妥当。
- `useEditorTitle`/`HeaderCenter`/`EditorTitle` の既存参照はゼロ（新規のクリーンな追加）。

---

#### 問題点（要修正）

問題点ゼロ。

1周目の P-001 は反映済みで、実機コードと照合しても新たな要修正の設計欠陥・実現不能点は見当たらない。CSS の mobile 限定・検索置換ロジック（`sm:hidden` + `data-[doc]:max-sm:hidden` を要素自身に付与）は desktop=検索/mobile編集=タイトル/mobile非編集=検索 の 3 状態を正しく満たし（ルート判定不要）、規約（#818 ADR-004、`group-data-*` 不使用）にも一致する。unmount クリーンアップ（title=null）は header がキャッシュされる永続要素である以上リーク防止に必須で、plan は effect cleanup で対処済み（AC-6）。

---

#### 改善提案（検討推奨）

- **[S-001]** ADR-003 の「エディタ本体がタイトル入力で再レンダーしない」という churn 遮断の主張は、**厳密には成立しない**（value/setter 分離の効果を過大評価している）。
  - 理由: `NoteEditor` はタイトル input を controlled（`value={state.title}`、`onChange` で自 reducer を dispatch、`NoteEditor.tsx` L497-500）で持つため、**キーストロークごとに自身の reducer state で再レンダーする**。これは context 分離の有無と無関係に発生する。したがって value/setter 分離が実際に防いでいるのは「`NoteEditor` の再レンダー」ではなく、（a）`NoteEditor` の context 購読を安定 setter のみに限定して**context value churn が `NoteEditor` に伝わらない**こと、（b）後続で value を必要とする consumer が増えても setter-only 購読者は巻き込まれないこと、の 2 点。設計自体は正しく、分離を維持する判断も妥当（低コストで標準的な read/write 分離）だが、根拠の文言が誤った不変条件（「入力で本体が再レンダーしない」）を含むと、実装者が「NoteEditor は title 変化で再レンダーしない」と誤認しかねない。ADR-003 の Consequences を「エディタ本体の再レンダーは自 reducer 由来で不可避。分離は context value churn を本体へ伝えない／setter 参照を安定させ effect の再実行を title 変化時のみに抑える意味を持つ」と正確化するとよい。

- **[S-002]** churn を実際に封じ込める load-bearing な仕組み（`EditorTitleProvider` が header+main ツリーを **`children` として受け取る**こと）が plan/ADR に明示されていない。
  - 理由: `EditorTitleProvider` は自前の `useState` を持つため、`setTitle` で自身が再レンダーする。このとき `{header}`/`<main>{children}</main>` の巨大サブツリーが再 reconcile されないのは、それらが `AppShellDrawer` の render で生成され **`children` prop として渡る安定 element 参照**だからで、`EditorTitleProvider` の自 state 再レンダーでは参照が変わらず React が subtree をスキップする（canonical な "children as prop" 最適化）。plan step2 は「既存 return 全体をラップ」と正しい構造を指示しているので実装は成立するが、**なぜ children 渡しでなければならないか**（provider 内で `{header}`/`{children}` を inline に描くと自 state 変化で全ツリーがキーストロークごとに再レンダーする）が文書化されていない。将来のリファクタで provider 本体にツリーを inline 化すると、全 `/_app` ツリーが打鍵ごとに再レンダーする回帰を招く。ADR-003（または step2）にこの不変条件を 1 行残すと堅牢。

---

#### 良い点

- **P-001 の反映が CSS 仕様レベルで正確**。ADR-004 が `1fr`=`minmax(auto,1fr)`、中央トラック最小＝中央 grid アイテムの min-content、mock は `.header-doc` が直接の grid 子だが plan は一段ネストするため grid アイテムが `HeaderCenter` root にずれる、という因果を正しく捉えている。「外（grid アイテム）で最小幅 0 解放・内（`.header-doc`）で ellipsis」の二段構えは定石通りで、両方必要という暗黙依存も AC-2 の長文目視手順で担保している。`minmax(0,1fr)` 代替を「全 `/_app` 共有 grid ゆえ波及」で退けた判断も妥当。
- **client context 方式の実現可能性が実機で完全裏取りできる**。`MenuButton`×`DrawerCtx` が「RSC payload 内 client island が親 client provider の context を購読」の同型実証。RSC payload が `staleTime:Infinity` でキャッシュされても client 側は live に再レンダーする点も `MenuButton` のドロワー状態反映で担保。ADR-001 の (a) 採用・(b) portal 却下の論拠は正確。
- **presentation 層への閉包が正しい**。ドメイン/ユースケース/アダプター無変更、新規データ取得・サーバ往復ゼロ。CLAUDE.md の依存方向・「client mutations は React 19 primitives を直接」に合致。
- **検索を server children 透過で維持する方式(ii)が堅実**。検索 `<form>` は server-render のまま `HeaderCenter` に children 透過 → SSR 構造ほぼ不変（AC-5、無害な wrapper div 1 段のみ）。絶対配置の検索アイコンは `relative` な root（＝移設した `SEARCH_BOX_WRAPPER`）基準のままで、間の `data-doc` wrapper が padding/margin 無しの全幅ブロックゆえ input 左端・アイコン位置は不変。方式(i)（検索 input の client 化）・(iii)（オーバーレイの phantom tab stop）を退けた ADR-002 も正確。
- **a11y の取り扱いが mock 準拠**。`.header-doc` は `aria-hidden="true"` の装飾要素、読み上げはエディタ本文 `<input>`（label「タイトル」）のみで二重読み上げなし（AC-3）。`sm:hidden` で desktop 非表示（AC-4）。`HEADER_DOC` は `text-center` を持たず mock（左寄せ）完全準拠（AC-7）。
- **harness 切り出し（ADR-005）が過剰でない**。`useEditorTitleSync` は任意扱いで、巨大 `NoteEditor`（`useServerFn` 7 本＋TipTap）への結合最小化とテスト容易性（フル mount 不要）の実利がある。Issue 範囲（orientation 表示）を超えた理想追求ではなく、既存 `noteEditorUnsavedFlag.test.tsx` の流儀に接続した現実的な選択。
- **リスクの棚卸しが実態に即す**。SSR→hydration の一瞬検索フラッシュ（装飾ゆえ許容）、新規ノート空タイトル時の検索 fallback（progressive）、全 `/_app` 回帰観点（title=null で従来同一挙動）をいずれも明記。過小主張・過大主張のいずれもない。

---

#### 総評

計画の骨格（配管方式・レイヤー閉包・再レンダー封じ込め・a11y・mock 準拠 CSS）はプロジェクトのあるべき姿と整合し、実機の既存パターン（`MenuButton`×`DrawerCtx`）・mock 実値・`NoteEditor` state で全面的に裏取りできる。1周目の要修正 P-001 は正しく反映され、**要修正はゼロ**。残る S-001/S-002 は ADR-003 の churn 根拠の文言精度と、churn 封じ込めを支える「children 渡し」不変条件の明文化という**ドキュメント正確性の改善**で、いずれも実装の成否・設計方針を変えるものではない。Issue 範囲を超えた理想追求（不要な抽象・スコープ膨張）も見られず、スコープは適正。実装着手して問題ない。

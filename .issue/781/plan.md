# 実装計画 — Issue #781: データ駆動 RSC ルートの roving radiogroup で連続矢印キー時にフォーカスが脱落する（#776 follow-up）

**Issue:** #781
**作成日:** 2026-06-27
**複雑度:** 中〜大規模

---

## 目的

`/tags` の並び替え軸 radiogroup（`TagListToolbar`）で、矢印キーによる選択が RSC loader の再実行・サブツリー再レンダーを引き起こした結果クライアントアイランドのフォーカスが `<body>` に脱落し、再フォーカスせずに連続して矢印キーを押すと2回目以降が無視される問題を解消する。共有プリミティブ `useRovingTablist` に「キーボード起因の選択がデータ駆動ナビゲーションで再レンダーを伴っても、確定後に選択中要素へフォーカスを復元する」オプトイン挙動を追加し、APG Radio Group の連続矢印操作を成立させる。client-only consumer（`DisplayModeSwitch` / `PublicTopControls` / `EditorModeSwitch`）の後方互換は完全に保つ。

## 前提（作業ブランチの状態に関する重要な注意）

- 本 Issue は **#776（PR #780, merge commit `15446b65`）が main にマージ済み**であることを前提とする。
- ローカルの `main`（`50bc7b18`）および現在のチェックアウト（`issue/601/...`）は **PR #780 をまだ含んでいない**。作業ツリー上の `app/components/common/useRovingTablist.ts` / `app/components/tag/TagListToolbar.tsx` は **#776 適用前の旧版**である。
- 本計画の「現状コード」はすべて **`15446b65` 時点の #776 適用後の版**を指す。実装は #776 を含む main から分岐したブランチで行うこと。作業前に `git show 15446b65:<path>` で対象ファイルが radiogroup / `useRovingTablist` 版になっていることを確認する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `/tags` で並び替え軸 radio にフォーカスがある状態で矢印キーを2回連続で押すと、再フォーカス操作なしで2回目の矢印も選択・URL（`sort`）反映を行う（フォーカスが選択中 radio に保持される） | Issue 本文「連続して矢印キーを押すと2回目以降が無視される」 | 1, 2, 3, 4 |
| AC-2 | 単発の矢印選択後、データ駆動ナビゲーション（loader 再実行 → RSC 再レンダー）が完了しても、フォーカスが選択中（= 唯一 tabbable な）radio に復元される | Issue 本文「原因」3 / 「提案」 | 1, 2, 3, 4 |
| AC-3 | `DisplayModeSwitch`（home, client-only）・`PublicTopControls` の表示形式 segmented（public, client-only）・`EditorModeSwitch`（manual activation）の挙動・ARIA 契約・キーボード操作が一切変化しない（非オプトイン consumer に観測可能な挙動差なし。デフォルト挙動は #776 と等価で、既存3 consumer のテストが無改変 PASS で検証） | Issue「後方互換を最優先」 | 1, 3 |
| AC-4 | オプトインしていない consumer は、フックに追加した復元コードパス（effect 本体）を実質的に通らない（早期 return でガード） | Issue「automatic 経路でデータ駆動を伴う consumer のみ有効化」 | 1, 3 |
| AC-5 | `TagListToolbar` の既存 ARIA 契約・単発選択・clickナビゲーション・order トグル・検索の全テストが回帰なく PASS | #776 受け入れ基準の維持 | 3 |
| AC-6 | 実ブラウザ（Chrome / Safari）で #781 の再現（連続矢印フォーカス脱落）を確認し、修正後に解消することを確認・記録 | Issue「まず実ブラウザで再現を確認すること」 | 4 |

## スコープ

### 含まれないもの

- **`EditorModeSwitch`（manual activation / APG Tabs）への復元適用** — editor モードは loaderDeps 外（client-only のモード切替）で RSC 再レンダーを伴わず、`focusedIndex` の内部 state が再レンダーをまたいで roving tabindex を保つため本 Issue の症状は出ない。manual variant にはオプションを公開しない（automatic variant 限定）。
- **`DisplayModeSwitch` / `PublicTopControls` 表示形式 segmented の挙動変更** — いずれも `display` が loaderDeps 外（client-only スワップ、`replace: true`）で再レンダーが起きず、フォーカスを失わない。オプトインしない（デフォルト off）ため一切変更しない。
- **`PublicTopControls` のソート（`SortPopover` / `useRovingMenu`）・タグ・期間フィルタ** — これらは popover/menu で `useRovingMenu` 側の `restoreFocusOnCommit`（既存）が担当済み。本 Issue の対象外。
- **`useRovingMenu` への変更** — 別プリミティブ。既に `restoreFocusOnCommit` を持ち本件と独立。
- **RSC ルートの再レンダー特性そのものの是正**（loader 再実行を避ける等のルーティング設計変更） — フォーカス脱落の根本はデータ再取得が必須な並び替え軸に内在し、回避不能。フォーカス復元で対処する（Issue が提示した方針）。

## 調査結果

- 関連ファイル（すべて `15446b65` 時点の #776 適用後を参照）:
  - `app/components/common/useRovingTablist.ts` — 共有 roving プリミティブ。automatic（Radio Group）/ manual（Tabs）の2経路を discriminated union で持つ。automatic 経路は `selectedIndex` 由来でステートレス（内部 `focusedIndex` は読まない）。`onKeyDown` が矢印で `items[next].focus()` を同期実行し `onSelect(next)` を発火。**この同期 focus が後続の RSC 再レンダーで上書き（body 脱落）される箇所が本バグの核心。**
  - `app/components/tag/TagListToolbar.tsx` — `/tags` の並び替え軸を automatic activation で利用。`onSelect` が `run({type:"setSort"})` → `useOptimistic` 即時反映 + `router.navigate`。唯一のデータ駆動（loaderDeps 内 `sort`）consumer。
  - `app/routes/_app/tags/index.tsx` — `loaderDeps: ({ search }) => search`。`sort` 変化 → loader 再実行 → `renderServerComponent(<TagManager/>)` がサブツリーごと再レンダー → `Route.useLoaderData()` が新ツリーを返し、client island のフォーカスが落ちる。
  - `app/components/note/list/DisplayModeSwitch.tsx` — automatic、**client-only**（`display` は loaderDeps 外）。再レンダーが起きずフォーカス保持。後方互換の基準点。
  - `app/components/public/PublicTopControls.tsx` — 表示形式 segmented は automatic だが **client-only**（`display` は loaderDeps 外, `replace:true`）。ソートは別途 `useRovingMenu`。
  - `app/components/note/editor/EditorModeSwitch.tsx` — `manualActivation: true`（APG Tabs）。client-only。
  - `app/components/common/useRovingMenu.ts` — **既存の `restoreFocusOnCommit` 実装（#467 系）が本件の直接の先例**。「panel が開いたまま選択をまたぐ multi-select listbox で、RSC 再レンダー後に focus が body へ落ちるのを、dep 配列なしの post-commit effect で `activeElement === body` を見て復元する」。`TagAddPopover` が `restoreFocusOnCommit: true` で利用中。
- あるべきアーキテクチャ:
  - フロントエンドの共有 UI プリミティブは `app/components/common/` に置き、複数 consumer で再利用する（#660 ADR-002 が `useRovingTablist` を新設した経緯）。
  - roving プリミティブは「フォーカス実行は `querySelectorAll` の executor、index は caller 所有（SSOT）」という規律（両フックの JSDoc に明記）。本変更もこの規律を踏襲する（復元先 index も caller 由来の `selectedIndex`）。
  - 後方互換・最小波及（#660 ADR-002: 既存 menu/listbox 利用箇所への波及ゼロを優先）を重視する文化。新挙動はオプトインで、デフォルトは既存と観測可能な挙動が等価（常時宣言の useEffect が1つ増えるが early-return でノーオペ）に保つ。
  - 「make illegal states unrepresentable」— 型レベルで automatic/manual を分けている既存 union を踏襲し、復元オプションは automatic variant にのみ生やす。
- 既存実装の状態:
  - #776 適用後の `useRovingTablist`・`TagListToolbar`・`/tags` ルートは**設計としてはあるべき姿に一致**。フォーカス脱落は「データ駆動 RSC ナビゲーション」というルート特性に内在する欠落であり、#776 のスコープ外として正しく切り出された（Issue 記載のとおり）。本 Issue で唯一不足しているのは「automatic 経路でのナビゲーション完了後のフォーカス復元」。
  - 同種問題の解は `useRovingMenu.restoreFocusOnCommit` として**既にコードベース内に確立済み**。本変更はその確立済みパターンを `useRovingTablist` の automatic 経路へ横展開するもので、新規発明ではない。
- 依存関係:
  - フック変更の影響を受けうる consumer は全3ファイル（`DisplayModeSwitch` / `PublicTopControls` / `EditorModeSwitch`）+ `TagListToolbar`。オプトイン設計により、実コード変更が必要なのは `TagListToolbar` のみ。他3つはデフォルト off で不変。
  - フックのユニットテスト専用ファイルは存在せず、consumer 側（`TagListToolbar.test.tsx` / `editorModeSwitch.test.tsx`）でカバーされている。

## 設計

### ドメインモデルへの影響

なし（フロントエンドのプレゼンテーション層のみ。ドメイン・アプリケーション・アダプターは無関係）。

### ユースケース / アプリケーションロジック

なし。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

`useRovingTablist`（automatic variant）に「キーボード起因のナビゲーションで再レンダーが起き、focus が `<body>` へ落ちたら、選択中 radio（`selectedIndex`）へフォーカスを復元する」オプトイン挙動を追加する。`useRovingMenu.restoreFocusOnCommit` の確立済みパターンを踏襲しつつ、segmented control が「常時マウント」である差分に対応するため**キーボード操作意図フラグでスコープを絞る**。

#### 復元メカニズム（実装スケッチ）

```
// automatic variant に restoreFocusOnCommit?: boolean、
// manual variant に restoreFocusOnCommit?: never を追加（union 両メンバーに存在させ分割代入可能化）
const restorePendingRef = useRef(false);

// onKeyDown 内、automatic 経路で矢印/Home/End を処理した直後（onSelect 発火と同時）:
if (restoreFocusOnCommit) restorePendingRef.current = true;

// 追加 effect（dep 配列なし = 毎コミット後に走る。useRovingMenu と同型）:
useEffect(() => {
  if (!restoreFocusOnCommit) return;          // AC-4: 非オプトインは即 return
  if (!restorePendingRef.current) return;     // キーボード起因の時だけ
  const items = containerRef.current
    ?.querySelectorAll<HTMLElement>('[role="radio"],[role="tab"]');
  if (!items || items.length === 0) return;
  const clamped = Math.min(Math.max(selectedIndex, 0), items.length - 1); // 上下限クランプ（selectedIndex<0 も防御）
  if (document.activeElement === items[clamped]) return; // 同期 focus が保持されている＝まだ脱落していない（フラグは維持）
  if (document.activeElement !== document.body) {         // ユーザーが別所へ移動 → 横取りしない
    restorePendingRef.current = false;
    return;
  }
  items[clamped]?.focus({ preventScroll: true });
  restorePendingRef.current = false;
});
```

設計上の要点:

- **`useRovingMenu` との対称性**: dep 配列なしの post-commit effect + `activeElement === document.body` ガード + `preventScroll: true` は `useRovingMenu.restoreFocusOnCommit` と同型。実装者は同フックのコメント/挙動を参照すること。
- **キーボード意図フラグが必要な理由（segmented との差分）**: `useRovingMenu` は「`open` の間だけ」復元するため open が暗黙のスコープになる。segmented は常時マウントで `open` 概念が無いため、無条件の毎コミット復元は初期ロード時等に focus を横取りしてしまう。`restorePendingRef`（矢印押下で立て、復元完了で倒す）が「キーボード操作の最中」というスコープを与える。
- **フラグを倒すタイミング**: `onKeyDown` の同期 `focus()` が commit-1 まで保持されている間（`activeElement === items[clamped]`）はフラグを倒さず維持し、後続の RSC 再レンダー commit-2 で body 脱落を検知して復元・フラグ解除する。これにより「同期 focus が一旦保持 → 再レンダーで脱落」の2コミット構造でも確実に復元できる（`useRovingMenu` が dep 配列を持たない理由と同じ）。
- **復元先 index**: caller 所有の `selectedIndex`（= optimistic 反映後の選択 = 唯一 tabbable な radio）。roving 不変条件（tabbable な要素 = focus 中の要素）と一致。`Math.min(Math.max(selectedIndex, 0), items.length - 1)` の上下限クランプは、要素集合が縮んだ場合（将来の可変 count caller）や `selectedIndex < 0`（`indexOf` が `-1` 等）への安全弁。`useRovingMenu` のクランプと同型。
- **Rules of Hooks**: `useEffect` は `manualActivation` / `restoreFocusOnCommit` の値にかかわらず常に宣言し、ガードで早期 return する（既存の `useState`/`useRef` 常時宣言の方針と同じ）。

#### オプトインの公開形

`restoreFocusOnCommit` を discriminated union の**両メンバーに存在させる**:

- `UseRovingTablistAutomatic` に `restoreFocusOnCommit?: boolean`（データ駆動 consumer がオプトインで `true` を渡す）。
- `UseRovingTablistManual` に `restoreFocusOnCommit?: never`（manual+復元の組合せを型で禁止 = illegal state unrepresentable）。

既存フック引数は `UseRovingTablistOptions`（`UseRovingTablistAutomatic | UseRovingTablistManual`）を直接分割代入している（`{ orientation, count, selectedIndex, onSelect, manualActivation }`）。union から分割代入できるのは**全メンバーに存在するプロパティのみ**なので、automatic 側だけに生やすと `restoreFocusOnCommit` が `UseRovingTablistManual` に存在せず `{ restoreFocusOnCommit = false }` が typecheck エラー（TS2339）になる。両メンバーに宣言する（automatic は `?: boolean`、manual は `?: never`）ことで分割代入が型安全になり、かつ manual で `true` を渡す組合せが型エラーになるため ADR-001 の「illegal state unrepresentable」がむしろ型レベルで厳密に担保される。`?: never` を採用（`?: false` だと `restoreFocusOnCommit: false` を明示的に渡せてしまい意味的にノイズ）。命名は `useRovingMenu` の同名オプションと揃え、API の一貫性とコントラクト（「コミットが body へ落としたフォーカスを復元する」）の共通理解を維持する。

## 実装ステップ

### 1. `useRovingTablist` に automatic 限定の `restoreFocusOnCommit` を追加

- **対象ファイル:** `app/components/common/useRovingTablist.ts`
- **変更内容:**
  - `UseRovingTablistAutomatic` 型に `restoreFocusOnCommit?: boolean` を追加し、`UseRovingTablistManual` 型に `restoreFocusOnCommit?: never` を追加（discriminated union の両メンバーに存在させて分割代入を型安全にしつつ、manual+`true` を型エラーにする）。automatic 側だけに生やすと `{ restoreFocusOnCommit = false }: UseRovingTablistOptions` が `UseRovingTablistManual` に存在しないプロパティ参照で typecheck エラー（TS2339）になるため、両メンバー宣言は必須。
  - フック引数に `restoreFocusOnCommit = false` を分割代入（既存の `{ orientation, count, selectedIndex, onSelect, manualActivation }` に追加）。`useRef`（`restorePendingRef`）と `useEffect`（dep 配列なし、上記スケッチ）を追加。`useEffect` を `react` import に追加。
  - automatic 経路の `onKeyDown` 内、矢印/Home/End 確定時（`onSelect?.(next)` 発火と同じ分岐）で `if (restoreFocusOnCommit) restorePendingRef.current = true;`。
  - JSDoc に automatic 経路の復元挙動と「`useRovingMenu.restoreFocusOnCommit` と同趣旨だが、常時マウント故にキーボード意図フラグでスコープする」旨を追記。
- **理由:** データ駆動ナビゲーション後にフォーカスが body へ脱落するのを、選択中 radio への復元で補い、連続矢印操作（roving の継続）を成立させる（AC-1/AC-2）。automatic 限定・デフォルト off で既存 consumer 不変（AC-3/AC-4）。

### 2. `TagListToolbar` を復元オプトインにする

- **対象ファイル:** `app/components/tag/TagListToolbar.tsx`
- **変更内容:** `useRovingTablist({...})` 呼び出しに `restoreFocusOnCommit: true` を追加。コメントで「`sort` は loaderDeps 内のためデータ駆動 RSC 再レンダーを伴い、矢印選択後にフォーカスが body へ落ちる。復元を有効化して連続矢印操作を保つ（#781）」を明記。
- **理由:** loaderDeps 内 `sort` を持つ唯一のデータ駆動 automatic consumer。ここだけがオプトインを必要とする。

### 3. テスト追加・回帰確認

- **対象ファイル:** `app/components/tag/__tests__/TagListToolbar.test.tsx`（happy-dom + `createRoot`、既存ハーネス流用）。加えて、フラグ分岐をピン留めするためフック直叩きの小さなユニットテストを推奨（下記）。
- **変更内容:**
  - **復元テスト（AC-1/AC-2）**: 矢印押下 → 同期 focus が target radio に乗る → `<body>` へ focus を落とし（`document.body.focus()` 等で脱落を模擬）かつ新しい `sort` prop で再レンダー（`renderToolbar` 再 render）→ effect が走った後、`document.activeElement` が選択中 radio（新 `selectedIndex`）であることを assert。さらにその状態で2回目の `ArrowRight` を発火し、`routerNavigate` が独立に呼ばれることを確認（連続操作成立）。
  - **AC-4 回帰テスト（確定タスク）**: opt-in しない automatic consumer（`restoreFocusOnCommit` 未指定）で `<body>` 脱落＋再レンダーを模擬し、焦点が radiogroup へ戻らない（横取りしない）ことを assert する。既存3 consumer のテスト（AC-3）は再レンダーを伴わず AC-4 の「body 脱落時に横取りしない」挙動を exercise しないため、AC-3 の流用では代替検証できない。この回帰は必須テストとして追加する。
  - **後方互換テスト（AC-3）**: 既存の `editorModeSwitch.test.tsx`（manual）と、`DisplayModeSwitch` / `PublicTopControls` 既存テストが無改変で PASS することを確認。
  - **フック直叩きユニットテスト（確定タスク）**: フラグ保持/解除の3分岐（(a) target 保持中はフラグ維持・横取りしない、(b) body 脱落で復元しフラグ解除、(c) 別所へ移動で復元せずフラグ解除のみ）を直接固定する小さなテストを追加し、永続フラグ化／早期解除の回帰を防止する。この順序依存ロジックは ADR-002 が「最大の落とし穴」と認めており happy-dom の consumer 経由テストでは分岐網羅が困難なため、直叩きで決定的にピン留めする（任意ではなく必須）。consumer 経由（`TagListToolbar.test.tsx`）で組みにくい分岐は直叩きで補う。`useRovingMenu` 側に同種フック直叩きテストの先例があれば流用する。
  - 既存の `TagListToolbar` 全テスト（ARIA 契約・単発矢印・click・order・検索・連続矢印 navigate）が回帰なく PASS（AC-5）。
- **理由:** バグの再発防止と後方互換のロック。AC-4 の挙動的検証を確定タスク化し、フラグ3分岐を直叩きでピン留めして決定的に回帰防止する。

### 4. 実ブラウザでの再現・修正確認

- **対象:** Chrome / Safari、`pnpm dev`、`/tags` 画面。
- **変更内容:** 修正前ブランチで「並び替え軸 radio にフォーカス → 矢印2連打で2回目が無視される（focus が body）」を再現確認。修正後ブランチで「2回目以降も選択・URL 反映され、focus が選択中 radio に保持される」ことを確認。手順・結果を `.issue/781/manual-test/report.md` に記録（先例 `.issue/776/manual-test/report.md` に倣う）。agent-browser はセッション不安定で偽陽性リスクがあるため、最終判断は実ブラウザの手動確認で行う（Issue 指示・`.issue/776/manual-test/report.md` の追跡事項参照）。
- **理由:** Issue が「まず実ブラウザで再現を確認」を明示。jsdom/happy-dom はフォーカス/再レンダーのタイミングを完全には再現しないため、ブラウザ確認が AC-6 の決め手。

## 設計判断

- 復元は **automatic variant 限定のオプトイン `restoreFocusOnCommit`**（`useRovingMenu` と同名・同趣旨）として追加し、デフォルト off でデフォルト挙動を #776 と等価（非オプトイン consumer に観測可能な挙動差なし。常時宣言の useEffect が1つ増えるが先頭で early-return しノーオペ）に保つ。型は automatic に `?: boolean`、manual に `?: never` を与え、discriminated union の両メンバーに存在させて分割代入を型安全化しつつ manual+復元を表現不能にする。詳細・代替案は `adr.md` ADR-001 を参照。
- 常時マウントの segmented では「キーボード操作意図フラグ + dep 配列なし post-commit effect + `activeElement===body` ガード」でスコープする（`useRovingMenu` の `open` ゲートの代替）。詳細は `adr.md` ADR-002 を参照。

## リスクと注意点

- **作業ブランチ前提**: 必ず #776（`15446b65`）を含む main から分岐すること。ローカル作業ツリーは #776 適用前であり、そのまま編集すると旧版（`role="tablist"`）を改変してしまう。
- **フラグ解除タイミングの誤りで「永続フラグ」化するリスク**: フラグを「`activeElement===target` 時に倒す」と、`onKeyDown` の同期 focus が乗った commit-1 で早まって倒れ、後続 RSC commit-2 の body 脱落を復元できない。スケッチのとおり「target 保持中はフラグ維持、body 脱落で復元・解除、別所移動で解除のみ」のロジックを厳守する。
- **焦点横取り回帰**: `activeElement===document.body` ガードと opt-in を外すと、ウィンドウ blur や別 island への意図的な移動時に焦点を radiogroup へ引き戻す回帰が出る。両ガードを必ず併用する。
- **テスト環境の限界**: happy-dom はフォーカス/再レンダーのタイミングを完全再現できず、復元テストは「body 脱落 + 再レンダー」を手動で組み立てる必要がある。真の検証は実ブラウザ（AC-6）。
- **`preventScroll`**: 復元 focus は楽観的ナビゲーション settle 中のスクロールと競合しうるため `focus({ preventScroll: true })`（`useRovingMenu` と同様）を用いる。
- **復元先 index の範囲外**: 復元先は `Math.min(Math.max(selectedIndex, 0), items.length - 1)` で上下限クランプする。要素集合が縮んだ commit（将来の可変 count caller）に加え、`selectedIndex < 0`（`indexOf` が `-1` 等）でも `items[-1]`（undefined → ノーオペ）に落ちないよう下限 0 もガードする。現 `TagListToolbar` では `sort` は常に妥当だが意図を型/コードで明示する。

## テスト方針

- ユニット/コンポーネント（`pnpm test:unit`）:
  - 復元: 矢印 → body 脱落 + 再レンダー → 選択中 radio に focus 復元（AC-1/AC-2）。
  - 連続操作: 復元後に2回目の矢印が独立に navigate（AC-1）。
  - 後方互換: `DisplayModeSwitch` / `PublicTopControls` / `EditorModeSwitch` の既存テストが無改変 PASS（AC-3）。
  - AC-4（確定）: opt-in しない automatic は body 脱落＋再レンダー時に焦点を横取りしない（必須回帰テスト）。
  - フック直叩き（確定）: フラグ保持/解除の3分岐（target 保持中は維持・body 脱落で復元解除・別所移動で解除のみ）を直接固定し、永続フラグ/早期解除を回帰防止。
  - 既存 `TagListToolbar` 全テスト回帰なし（AC-5）。
- 静的チェック: `pnpm typecheck && pnpm lint:fix && pnpm format`（discriminated union の両メンバーに `restoreFocusOnCommit` を宣言（automatic `?: boolean` / manual `?: never`）し、分割代入が型安全であること）。
- 手動（実ブラウザ・AC-6）: Chrome / Safari で `/tags` の連続矢印フォーカス保持を確認し記録。

## レビュー履歴

- 1周目: coverage / arch-risk の指摘を反映（型 `?: never` 追加（automatic `?: boolean` / manual `?: never` で union 両メンバーに宣言し分割代入を型安全化）、AC-4 を確定タスク化、AC-1/AC-2 の対応ステップに検証3,4を追跡、byte等価 → 観測可能な挙動等価へ言い換え、フック直叩きテストの推奨明記、復元 index の下限クランプ追加）。
- 2周目: 両視点とも問題点ゼロで収束。改善提案2件を反映（フック直叩き3分岐テストを推奨 → 確定タスクに格上げ、AC-6 の記録先を `.issue/781/manual-test/report.md` に一意化）。

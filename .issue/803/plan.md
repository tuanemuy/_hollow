# 実装計画 — Issue #803: ノート編集タグ入力: 候補パネルの viewport クランプ / 外側クリッククローズ

**Issue:** #803
**作成日:** 2026-06-28
**複雑度:** 中〜大規模

---

## 目的

ノート編集画面のタグ入力 combobox 候補パネル（`tagSuggestPanel`）について、#789 / PR #802（ADR-004）で意図的に見送った2点 ―― 縦方向の viewport はみ出し制御と明示的な外側クリッククローズ ―― を、既存の combobox a11y / IME / blur コミット挙動を壊さずに最小で補う。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 候補パネル表示時、パネル下端が viewport 下端（margin 8px）をはみ出す場合、パネルが上方向に shift され viewport 内に収まる（画面下部でフォーカスしたケース） | Issue 改善方向性 1 | 2, 3 |
| AC-2 | パネル表示中に、タグ入力コンテナ（`tagsRow`）の外側を `mousedown` するとパネルが閉じる（input の `blur` に依存しない明示的 outside-click ハンドラ） | Issue 改善方向性 2 | 4 |
| AC-3 | typing により候補件数（=パネル高さ）が変化したときも再クランプが走り、はみ出しが解消される | AC-1 の派生（動的高さ） | 2, 3 |
| AC-4 | 既存の combobox a11y（`role="combobox"`/`role="listbox"`/`aria-expanded=panelOpen`/`aria-controls`/`aria-activedescendant`）・IME ガード（`isComposing`）・キーボード操作（↑↓/Enter/`,`/Escape/Backspace）・blur での valid draft コミットがいずれも回帰しない | ADR-003 / 既存挙動保護 | 全ステップ（非回帰）, 5 |
| AC-5 | クランプの計算ロジックは DOM 非依存の純粋関数で単体テスト済みであること（happy-dom にレイアウトが無いため `getBoundingClientRect` 経由では検証できない慣習に従う）。**注: これは本 Issue の新規成果物ではなく、既存 `Popover.test.tsx` の `describe("computeShiftY")`（bottom はみ出し / top はみ出し / viewport より高い場合の4ケース）で既に充足済みの前提制約である。** したがって本 Issue で新規 math テストは追加せず、TagsInput 側の新規テストは「配線が効いているか」（AC-1/2/3 の DOM 検証）に集中する | テスト基盤の制約（既充足） | 1, 5 |

## スコープ

### 含まれないもの
- **横方向クランプ / `max-sm` 全幅化（review-002 W-001）**: パネルは `left-0 right-0` でフィールド幅に収まり横はみ出しの実害が小さい（Issue 本文明記）。本 Issue は縦方向のはみ出し体験改善が主目的のため、横方向クランプ（`computeShiftX` 適用や `max-sm` 規則追加）はスコープ外とする。
- **上方向への「反転（flip）」配置**: アンカー位置を input 上側に切り替える flip ではなく、translate による shift クランプを採る（理由は ADR-001 / ADR-002 参照）。
- **`usePopover` への全面移行**: トリガーモデルの設計衝突のため不採用（ADR-001）。
- **純粋クランプヘルパの共有モジュール切り出し（arch-risk S-001）**: `computeShiftY` / `VIEWPORT_MARGIN` を `usePopover.ts` から中立な `viewportClamp.ts` 等へ再配置する案は、現状 `usePopover.ts` からの import で機能上問題なく（共に presentation 層でレイヤー違反でもない）、本 Issue（優先度低のフォローアップ）でモジュール再構成までは行わずスコープ外とする。将来 popover 的要件が増えた時点での抽出候補に留める。
- ドメイン / ユースケース / アダプター層: 変更なし（純粋にフロントエンド UI のフォローアップ）。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/TagsInput.tsx` — 対象本体。`role="combobox"` の input ＋ inline `role="listbox"`、実フォーカスは input 固定。`open`/`activeIndex` のローカル state（ADR-001/003）。パネルは `panelOpen` のとき絶対配置 div で描画。Escape は input の `onKeyDown` で、クローズは input `onBlur` で処理。
  - `app/components/note/editor/styles.ts` — `tagSuggestPanel`（`absolute left-0 right-0 top-[calc(100%+6px)] z-30 ...`）。アンカーの `tagsRow` は既に `relative` を持つ。
  - `app/components/note/editor/tagSuggestModel.ts` — 候補フィルタ・分類・ナビ index の純粋関数群（本 Issue では原則変更不要）。
  - `app/components/common/usePopover.ts` — first-layer popover primitive（#467 ADR-001）。`computeShiftX`/`computeShiftY`（純粋・単体テスト済み・DOM 非依存）と定数 `VIEWPORT_MARGIN`(8) / `POPOVER_SHEET_BREAKPOINT`(640) を export。本体の `usePopover` フックは trigger(button)+panel モデルで、`triggerProps`（`aria-haspopup`/onClick toggle）と Escape→trigger フォーカス復帰を前提とする。
  - `app/components/common/Popover.tsx` / `DirectoryTreeSelect.tsx` — `usePopover` の既存利用例（button トリガー）。本 Issue の input トリガーとは前提が異なる比較対象。
  - `app/components/common/__tests__/Popover.test.tsx` — `computeShiftX`/`computeShiftY` の純粋関数テスト（happy-dom レイアウト無し→`getBoundingClientRect` 全ゼロのため、クランプ math は純粋関数で単体テスト、DOM 経由は `getBoundingClientRect` を spy で差し替える慣習）。
  - `app/components/note/editor/__tests__/TagsInput.test.tsx` — 既存の combobox / a11y / IME / blur テスト（非回帰の基準）。
- あるべきアーキテクチャ:
  - CLAUDE.md の styling 規約: Tailwind utility-first、`data-*` 属性による状態表現、繰り返すユーティリティ文字列は `styles.ts` に集約。新規 CSS / `@apply` は不可。
  - viewport クランプは「純粋関数（`computeShiftX`/`computeShiftY`）＋ layout effect で transform を当てる」のがアプリ全体の確立パターン（`usePopover`）。本 Issue もこの計算ロジックを再利用するのが DRY かつ「あるべき姿」。
- 既存実装の状態: ADR-004 で手書き絶対配置を採用し、(1) 外側クリッククローズ、(2) viewport クランプは未実装。本 Issue で (1)(2)（縦）を補う。`usePopover` の純粋ヘルパは再利用するが、フック本体のトリガーモデルは ADR-003 のインライン combobox と衝突するため流用しない（ADR-001）。
- 依存関係: 変更は `TagsInput.tsx` と `styles.ts`（必要なら）に限定。`tagSuggestModel.ts` / reducer / autosave / submit 経路には触れない。`computeShiftY` / 定数は `usePopover.ts` から import するのみ（既存 export の利用で同ファイルは無改変）。

## 設計

### ドメインモデルへの影響
なし。純粋なフロントエンド UI のフォローアップで、エンティティ・値オブジェクト・ポートに影響しない。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
`TagsInput.tsx` に2つの局所的な仕組みを追加する。いずれも既存の combobox state（`open`/`activeIndex`/`panelOpen`）とそのクローズ経路（`closePanel`）の上に乗せ、a11y/IME/blur ロジックには手を入れない。

1. **縦 viewport クランプ（shift 方式）**
   - パネル div に measuring 用の `ref` を付ける。
   - `useLayoutEffect` で、`panelOpen` への遷移時およびパネル高さに影響する依存（候補件数・新規作成行の有無）変化時に、パネルの `getBoundingClientRect()` を測定し、`computeShiftY(rect, window.innerHeight)`（`usePopover.ts` の純粋関数を再利用）で縦シフト量 `shiftY` を算出して state に保持。`panelOpen=false` で `shiftY=0` にリセット。
   - パネルに `style={{ transform: shiftY ? translateY(${shiftY}px) : undefined }}` を当てる（`shiftX`/transform の付け方は `usePopover` の `panelStyle` 実装に倣う）。paint 前に当てるため `useLayoutEffect`。
   - `computeShiftY` は bottom はみ出しを先に、次に top はみ出しを補正する（パネルが viewport より高い場合は head を残す）既存仕様をそのまま利用。
   - **natural（未シフト）rect への復元補正（arch-risk P-001 / 必須）**: `usePopover` の `computeShiftY` は「測定 rect は natural=未シフト位置で、各補正は絶対値」という不変条件に依存する（usePopover の元 layout effect が依存 `[open]` のみ＝**開いたまま再測定しない**ことでこの前提を満たす。reset で `shiftY=0` 直後に測るため measured rect は natural）。本 Issue は typing で候補件数＝パネル高さが変わるため**開いたまま再測定**する（依存に `candidates.length`/`isNewDraft` を含める）。その瞬間パネルには前回当てた `transform: translateY(shiftY)` が**既に適用済み**で `getBoundingClientRect()` はシフト後の rect を返すため、そのまま渡すと二重計上で誤クランプする。これを避けるため、測定 rect から現在の `shiftY` を引いて natural 位置を復元してから渡す: `computeShiftY({ top: rect.top - shiftY, bottom: rect.bottom - shiftY }, window.innerHeight)`。これに伴い `shiftY` を effect の依存に加えるが、natural 値は不変なので 2 パス目は `Object.is` 同値で React がバイルアウトし収束する（初回 `shiftY=0` では補正項ゼロで現状と等価）。`usePopover` では補正不要・本件では必要な差はこの「開いたまま再測定するか否か」に由来する。

2. **外側クリッククローズ**
   - アンカーである `tagsRow` の div に `containerRef` を付ける。
   - `panelOpen` のとき `document` に `mousedown` リスナを張り、`event.target` が `containerRef` 内に含まれなければ `closePanel()` を呼ぶ（`usePopover` の `onDocMouseDown` と同形）。cleanup でリスナ解除。
   - 既存の option クリックは `onMouseDown preventDefault`＋コンテナ内なので閉じない。outside の `mousedown` のみ閉じる。input の `onBlur`（valid draft コミット）はそのまま残す（mousedown → 既存 blur の順で発火し、コミット挙動は不変）。

`styles.ts` の `tagSuggestPanel` は原則変更しない（transform は inline style で当てる）。横方向 `max-sm` 規則の追加はスコープ外（上記スコープ参照）。

## 実装ステップ

依存方向の順（純粋ロジック確認 → コンポーネント配線 → テスト）に並べる。

### 1. 再利用する純粋ヘルパと定数の確認
- **対象ファイル:** `app/components/common/usePopover.ts`（読むのみ・無改変）
- **変更内容:** `computeShiftY`・`VIEWPORT_MARGIN` が `export` 済みで再利用可能であることを確認。`computeShiftX` は本 Issue では使わない（横スコープ外）。`POPOVER_SHEET_BREAKPOINT` による sheet スキップは `tagSuggestPanel` がボトムシート化しないため適用しない。
- **理由:** クランプ計算ロジックを再実装せず DRY に既存純粋関数を使う（あるべき姿）。

### 2. TagsInput に縦クランプの state / 測定を追加
- **対象ファイル:** `app/components/note/editor/TagsInput.tsx`
- **変更内容:** `panelRef`（パネル div 用）と `shiftY` state を追加。`useLayoutEffect` で `panelOpen`・`candidates.length`・`isNewDraft`・`shiftY` を依存に、非 open 時は `setShiftY(0)` で early return。open 時はまず `const el = panelRef.current; if (el === null) return;` で null ガードしてから（**arch-risk S-003**: `usePopover` の `const el = panelRef.current; if (el === null) return;` ガードを踏襲。SSR では `panelOpen` 初期 false でパネル未描画＝effect も早期 return するため `window`/`getBoundingClientRect` 不在は実害なし）、`getBoundingClientRect()` を測定。**測定 rect は現在の `shiftY` 分シフト済みなので natural に復元してから渡す（arch-risk P-001 / 必須）**: `computeShiftY({ top: rect.top - shiftY, bottom: rect.bottom - shiftY }, window.innerHeight)` を計算して `setShiftY`。`computeShiftY`/`VIEWPORT_MARGIN` を `@/components/common/usePopover` から import。
- **理由:** AC-1 / AC-3。動的なパネル高さに追従させるため依存に候補件数を含める（`usePopover` は静的内容前提・開いたまま再測定しない `[open]` のみだが、本パネルは typing で高さが変わるため開いたまま再測定する）。開いたまま再測定すると前回の transform が効いた rect を測ってしまうため、natural 復元補正（`rect.{top,bottom} - shiftY`）が必須。`shiftY` を依存に含めるが natural 値は不変で 2 パス目は同値バイルアウトし収束する（初回 `shiftY=0` は補正項ゼロで現状と等価）。

### 3. パネル div に ref と transform style を配線
- **対象ファイル:** `app/components/note/editor/TagsInput.tsx`
- **変更内容:** パネル `<div className={tagSuggestPanel}>` に `ref={panelRef}` と `style={shiftY ? { transform: ` + "`translateY(${shiftY}px)`" + ` } : undefined}` を付与。
- **理由:** AC-1。算出した shift を描画に反映（paint 前適用でちらつき無し）。

### 4. 外側クリッククローズの追加
- **対象ファイル:** `app/components/note/editor/TagsInput.tsx`
- **変更内容:** `tagsRow` の `<div>` に `ref={containerRef}` を付与。`useEffect`（依存 `[panelOpen]`）で `panelOpen` 時のみ `document` の `mousedown` を購読し、target が `containerRef.current` に含まれなければパネルを閉じる。cleanup でリスナ解除。
- **listener churn / exhaustive-deps 対策（arch-risk S-002）:** ハンドラ内で `closePanel`（毎レンダー再生成）を呼ぶと deps に入れた場合に draft 変化のたび listener が貼り直される churn が起き、入れない場合は biome `useExhaustiveDependencies` が指摘する。これを避けるため、ハンドラ内で**クローズ state setter を直接呼ぶ**（`setOpen(false)` / `setActiveIndex(-1)` を直接、`closePanel` を経由しない。setter は React が安定参照を保証する）か、ref 経由で読み deps を `[panelOpen]` に限定する。`usePopover` の `onDocMouseDown`（ref を読み deps を最小化）と同方針。既存ファイルが別箇所で使う `biome-ignore ... useExhaustiveDependencies` の方針とも一貫させる。
- **理由:** AC-2。input の blur 非依存の明示的 outside-click。既存の Escape（input keydown）・blur コミットは温存。

### 5. テスト追加
- **対象ファイル:** `app/components/note/editor/__tests__/TagsInput.test.tsx`
- **変更内容:**
  - 外側クリッククローズ: パネルを開いた状態で `document.body`（コンテナ外）への `mousedown` を dispatch → パネルが閉じる（listbox 非表示・`aria-expanded="false"`）こと、コンテナ内クリックでは閉じないことを検証。
  - 縦クランプ配線（初回）: `Element.prototype.getBoundingClientRect` を spy で下端はみ出す rect に差し替え、`window.innerHeight` を一時上書きして open → パネルに `transform: translateY(...)` が当たること、close で外れることを検証（`Popover.test.tsx` の clamp テスト手法に倣う）。
  - **動的高さ再クランプ（AC-3）を P-001 のバグが検出できる形で検証（必須）:** 固定 rect の spy は transform の有無で値が変わらないため、natural 復元補正の欠落（transform フィードバックによる二重計上）を**検出できず緑になってしまう**。これを是正するため、再測定パスで rect が「現在当たっている transform を反映した値」を返すようにテストを仕込む。具体的には次のいずれか:
    - (推奨) `getBoundingClientRect` spy を「`panelRef` の現在の `transform`（適用済み `shiftY`）を読んでシフト後の rect を返す」形にし、候補件数を変えて 2 回目の測定を起こす。natural 復元補正が無ければ二重計上で `shiftY` が誤った値になり、補正があれば正しい絶対値に収束することを assert する。
    - または、候補件数を変えて 2 段階で測定させ、`mockReturnValueOnce` を連ねて「1 回目 natural 値 → 2 回目はシフト後 rect 値」を返し、最終 `transform` が**natural 基準で正しく再計算された絶対値**になることを検証する。
    いずれも「固定 rect では緑になるが、補正を外すと落ちる」テストにすること（バグ検出能力を担保）。
  - 非回帰: 既存の IME ガード・↑↓/Enter/Escape・blur コミット・aria 系テストが緑のままであることを確認。
- **理由:** AC-2 / AC-3 / AC-5 / AC-4。クランプ math 自体は `computeShiftY` の既存純粋関数テスト（`Popover.test.tsx`）で担保済みのため、TagsInput 側は「配線が効いているか」と「開いたまま再測定しても natural 基準で正しく再クランプされるか（P-001）」を検証する。

### 6. 仕上げ
- **対象:** 全変更
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`（少なくとも editor 配下）を実行し緑を確認。
- **理由:** CLAUDE.md の after-changes 手順。

## 設計判断

- **(B) 純粋ヘルパ流用 ＋ 自前配線を採用**（`usePopover` 全面移行＝(A) は不採用）。トリガーが input のインライン combobox（実フォーカス input 固定・独自の aria 契約）と、`usePopover` の button トリガー前提が衝突するため。詳細は ADR-001。
- **縦は flip ではなく shift クランプ**。アプリ全体（`usePopover`）が shift 方式で統一されており、`computeShiftY` を再利用すれば DRY かつ一貫。詳細は ADR-002。
- **outside-click は document `mousedown` リスナ**（`usePopover.onDocMouseDown` と同形）を `panelOpen` 時のみ張る。詳細は ADR-003。

## リスクと注意点

- **blur コミットとの相互作用**: outside `mousedown` → `closePanel`（open=false）と、その後の input `onBlur`（valid draft コミット）が連続して発火する。発火順は mousedown→blur で、`closePanel` は open のみ変更、コミット可否は `onBlur` 側の条件に依存するため挙動は不変。テストで明示確認する。
- **開いたまま再測定での transform フィードバック誤クランプ（arch-risk P-001）**: パネルを開いたまま候補件数変化で再測定すると、`getBoundingClientRect()` は前回当てた `transform: translateY(shiftY)` を反映したシフト後 rect を返す。これを補正せず `computeShiftY` に渡すと natural 前提が崩れ二重計上で誤クランプする（具体例: viewport 633 で natural top=500/bottom=760→初回 shiftY=-135、候補減で natural bottom=720 へ変化時、補正無しだと再測定 rect が top=365/bottom=585 となり両端 in-range 判定で shiftY=0 に戻り 95px はみ出したまま残る）。対策は測定 rect から `shiftY` を引いて natural 復元（`{ top: rect.top - shiftY, bottom: rect.bottom - shiftY }`）。固定 rect spy では検出できないため、テストは transform を反映した rect を返す形で P-001 を検出できるようにする（実装ステップ2・5 参照）。
- **クランプ再測定の依存漏れ**: パネル高さは typing（候補件数 / 新規作成行）で変わる。依存に `candidates.length`・`isNewDraft` を含め忘れると古い shift が残る。AC-3 のテストで担保。
- **shift クランプのトレードオフ（受容範囲 / coverage S-001）**: 画面最下部でフォーカスしたケースでは push-up により候補パネルが入力フィールド（input/chips）の一部に被さりうる。これは flip なら避けられる差分だが、本 Issue の主目的は「パネルが viewport 内に収まり *visible* になる」ことであり、被さり（visible だが入力が一部隠れる）は**受容範囲**とする（合格条件は visible であること、被さりは「バグ」ではない）。後段レビュー/手動テストでの誤検知を避けるため明記。詳細は ADR-002 のトレードオフ参照。
- **happy-dom にレイアウトが無い**: `getBoundingClientRect` が全ゼロを返すため、DOM 経由のクランプ検証は spy 差し替えが必須（`Popover.test.tsx` と同手法）。
- **z-index / overflow**: shift で input 上に被さってもパネルは `z-30` で前面。既存どおり。
- **a11y 契約を壊さない**: `aria-expanded`/`aria-controls`/`aria-activedescendant` のロジック（ADR-003）には一切触れない。クランプ・outside-click はその外側に乗せる。

## テスト方針

- クランプ計算 math: `computeShiftY` の既存純粋関数テスト（`Popover.test.tsx`）で担保済み。本 Issue では追加不要。
- TagsInput 統合テスト（追加）: (a) 外側 `mousedown` でクローズ／内側は非クローズ、(b) `getBoundingClientRect` spy ＋ `innerHeight` 上書きで `transform: translateY` 配線確認、(c) 候補件数変化での再クランプ。
- 非回帰: 既存 `TagsInput.test.tsx`（combobox/a11y/IME/Enter/Escape/blur）を緑のまま維持。
- `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit`。

## レビュー履歴

- **1周目**: coverage / arch-risk をレビュー。**P-001（natural 復元補正: 開いたまま再測定時に `rect - shiftY` で natural 位置を復元してから `computeShiftY` に渡す）** と、そのテスト是正（固定 rect では検出不可→transform 反映 rect で P-001 を検出できる形に）、**S-002（outside-click listener churn / exhaustive-deps 対策）**・**S-003（測定 effect の null/環境ガード）**・**coverage S-001（shift トレードオフの受容範囲明記）**・**coverage S-002（AC-5 は既存 `computeShiftY` テストで既充足の制約と明記）** を反映。**arch S-001（純粋クランプヘルパの共有モジュール切り出し）は見送り**（スコープ外として明記）。
- **2周目**: coverage / arch-risk を再レビュー。両視点とも問題点ゼロ。arch-risk は `computeShiftY` 実装と照合し natural 復元（`rect - shiftY`）が数学的に正しく無限ループしないことを検証。1周目反映が全て正確と確認し終了。

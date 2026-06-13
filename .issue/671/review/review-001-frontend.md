# PR #682 レビュー（Frontend 観点）

- 対象 PR: #682（branch `issue/671/p32-filter-ui-fixes` → `main`）
- 計画: `.issue/671/plan.md` / 設計: `.issue/671/adr.md`
- 検証: `pnpm typecheck` PASS、`pnpm test:unit`（3695 tests）PASS

## Frontend

### Blockers

なし。

### Warnings

なし。

### Notes

#### RSC / client island 境界（ADR-003）

- **[N-001]** 構造再編は ADR-003 の確定 DOM に完全準拠している。`SearchFilterDrawer`（`"use client"` island）が filter-bar 行・チップ行（filter-bar の兄弟）・backdrop・drawer を 1 フラグメントで所有し、`SearchSortToggle` を `children` 経由で `FILTER_BAR_RIGHT` 内に受ける。場所: `app/components/public/SearchFilterDrawer.tsx:293-380`、`app/components/public/PublicSearch.tsx:171-179`。チップ行は楽観状態（`useOptimistic`）に依存するため island 内に保持され、portal なしでモック構造（兄弟の全幅独立行）を実現できている（AC-11）。

- **[N-002]** RSC→client のシリアライズ境界が正しい。サーバー算出値 `resultsCount`(number) / `countIsLowerBound`(boolean) はプリミティブで props 渡し（`PublicSearch.tsx:115-117` で算出 → `:172-176` で渡す）、ソートトグルは要素として `children` で渡している。`SearchSortToggle` 自身も `"use client"` であり、RSC が client コンポーネント要素を別の client island の children として渡す構成は React 19 RSC で正しく機能する。`RESULTS_COUNT` の `<strong>` インラインユーティリティも island 側へ移動済み（`SearchFilterDrawer.tsx:297-303`）で、計画の「import 所有者移動メモ」どおり。

- **[N-003]** Props 拡張（`{ facets, resultsCount, countIsLowerBound, children }`）は必要十分。`children` は `React.ReactNode`、`resultsCount`/`countIsLowerBound` は required で、`PublicSearch` が唯一の呼び出し元（`hasKeyword` 時のみ 1 つ置く）であるため optional にする必然性はなく、required の方が型安全。JSDoc（`:79-90`, `:116-135`）も責務分担を明記しており可読性が高い。

#### useOptimistic / 期間「すべて」デフォルト化（AC-1〜5）

- **[N-004]** 「すべて」デフォルト化の 4 箇所がすべて一貫実装されている。
  - navigate: `period === null || period === "all" ? undefined : period`（`SearchFilterDrawer.tsx:213-219`） → URL から `period` が落ちる（AC-1）。
  - activeCount: `periodIsActive`（`null`/`all` を除外）を加算（`:168-173`）（AC-4）。
  - チップ描画: `periodIsActive && optimistic.period !== null`（`:359`）（AC-3）。
  - ラジオ checked: `(selected ?? "all") === p`（`:707`） → period 未指定時「すべて」が checked（AC-2）。
  これらは `SearchSortToggle.reduceSortSearch`（`sort === "relevance" ? undefined`）の手本と一貫しており、楽観状態と URL 同期に齟齬はない。`navigate` は `useTransition` 内で `applyOptimistic` → `await router.navigate` を直列化しているため、period 切替時にコミット前に楽観値が baseline へ巻き戻るちらつきは構造的に回避されている（`:188-229` の JSDoc どおり）。

- **[N-005]** `selectedPeriodCount = facetByPeriod.get(optimistic.period ?? "all") ?? 0`（`:178-179`）は計画どおり簡潔化。`all` ファセットが Map に常在する前提（`countPublicSearchFacets` が 4 行返す）で、欠落時も `?? 0` でフォールバックする防御も入っている。`all` 明示選択時も未指定時も同じカウントを引け、挙動同等。

- **[N-006]** チップ描画ガード `periodIsActive && optimistic.period !== null`（`:359`）の後半 `optimistic.period !== null` は**型ナローイングのために必要**で、冗長ではない。`periodIsActive` は別の `const` に束縛された boolean なので、TypeScript の control-flow analysis は `periodIsActive === true` から `optimistic.period` の non-null を導けない。直下の `PERIOD_LABELS[optimistic.period]`（`:361`, `:363-364`）は `SearchPeriod` キーを要求するため、`optimistic.period !== null` の明示ナローイングがないと型エラーになる。論理的には `periodIsActive` が真なら `period` は必ず非 null だが、その不変条件は型に表れていないため、この二重ガードは妥当な選択。
  - 参考: もし冗長さを消したいなら `periodIsActive` を導出値 `const activePeriod = optimistic.period !== null && optimistic.period !== "all" ? optimistic.period : null;`（型 `SearchPeriod | null`）に変えると、`activePeriod !== null` 一発でナローイングでき、`activeCount` も `activePeriod !== null ? 1 : 0` に統一できる。任意改善であり現状で機能・型とも正しい。

#### スタイル / モバイル（AC-6〜10, 14, 15）

- **[N-007]** `AUTHOR_AVATAR` のサイズ分離（ADR-001 / AC-10）が完遂されている。ベースはサイズなし（`styles.ts:162-163`）、28px は `AUTHOR_AVATAR_MD`（`:165`）。全消費者がベース＋単一サイズに更新済み: `ACTIVE_CHIP_AVATAR`=16px（`:263`）、`TOKEN_AVATAR`=16px（`:306`）、`SUGGESTION_AVATAR`=20px（`:321`）、ヒット行=18px（`PublicSearch.tsx:214`）、`PublicNoteDetail.tsx:112`=`AUTHOR_AVATAR_MD`(28px)。同一プロパティ二重指定が構造的に消え、サイズ衝突は解消。

- **[N-008]** モバイル対応は既存先例（`common/styles.ts` modal/dropdown、`BulkActionBar`）と同じ `max-sm:` バリアント方式（ADR-002）。`DRAWER`（`styles.ts:279`）は `max-sm:translate-x-0 max-sm:translate-y-full max-sm:data-[open]:translate-y-0` で軸を差し替え、`max-sm:translate-x-0` で右スライド軸を無効化（リスク欄の注意点どおり）。`data-[open]:translate-x-0`（既定）と `max-sm:data-[open]:translate-y-0` の併存はソース順で後者が後勝ちし、max-sm スコープ内で正しく機能する。位置・角丸（`rounded-t-lg`）・`max-h-[88vh]`・safe-area padding（`DRAWER_FOOTER:287`）も揃う（AC-6）。`DRAWER_APPLY` の `max-sm:flex-1 max-sm:min-h-[48px]`（`:291`、AC-7）、`DRAWER_RESET` の `max-sm:min-h-[44px]`（`:289`、AC-15）も計画どおり。

- **[N-009]** チップ行の横スクロール化も揃っている。`ACTIVE_CHIPS` に `max-sm:flex-nowrap max-sm:overflow-x-auto` ＋ スクロールバー非表示の任意プロパティ記法（`:260`、AC-8）、`ACTIVE_CHIP` に `max-sm:h-8 max-sm:shrink-0 max-sm:whitespace-nowrap`（`:262`、AC-9）、`ACTIVE_CHIP_REMOVE` に `max-sm:w-[22px] max-sm:h-[22px]`（`:265`）、`ACTIVE_CHIPS_CLEAR` に `max-sm:h-8 max-sm:shrink-0 max-sm:whitespace-nowrap`（`:267`、AC-14）。横スクロール行内でチップとクリアボタンの高さ（32px）が揃い、`flex-nowrap` 下でも潰れない。

#### アクセシビリティ

- **[N-010]** 期間ラジオは `name="search-period"` + `value={p}`（ADR-004）+ ネイティブ `checked`（`SearchFilterDrawer.tsx:701-708`）で正しい。`value` 付与によりテストの曖昧一致（「すべて」が「すべて解除」「すべてリセット」に部分一致）が排除され、`isPeriodRadioChecked(html, value)` で確定的に検証できている（テスト `:62-71`）。ラベルは `<label>` でラップされ関連付け済み。

- **[N-011]** ボトムシート/ドロワーのフォーカス管理は既存実装を踏襲（変更なし）。`role="dialog"` + `aria-modal="true"` + `aria-labelledby`、open 時に close ボタンへフォーカス、Esc クローズ、Tab トラップ、close 時に前要素へ復帰、`inert={!open}` + `aria-hidden`（`:390-401`, `:237-279`）。モバイルでボトムシート化しても DOM/属性は同一で、フォーカストラップはそのまま機能する。backdrop は `aria-hidden="true"` で AT ツリー外、キーボードクローズは Esc が担保。各チップ remove ボタンは個別 `aria-label`（`:338`, `:351`, `:364`）。

#### テスト / AC カバレッジ

- **[N-012]** AC-13 のリグレッションテストが充実。デフォルト化挙動（`period:"all"` でチップ・バッジ・クリアボタンが出ない／footer は `all` カウント／「すべて」radio checked: テスト `:118-129`）、period 未指定時の checked（`:131-136`）、`30d` の従来挙動（`:104-116`、AC-5）、チップ行が filter-bar の兄弟であること（`:138-156`、AC-11）をすべてカバー。チップ行兄弟性は「sort スロット（`FILTER_BAR_RIGHT` 末尾）より後にクリアボタンが現れる」という document order で検証しており、ADR-003 確定 DOM に整合。`isPeriodRadioChecked` ヘルパで属性ベースの堅牢なアサート（arch-risk S-001 対応）。

- **[N-013]** 全 AC（AC-1〜15）が実装・テスト・静的チェックで満たされていることを確認。`pnpm typecheck` PASS（AC-12）、unit 3695 件 PASS（AC-13）。抜けは見当たらない。スコープ外（バックエンド/route schema/desktop 見た目）にも手を入れておらず、計画のスコープ境界を守っている。

## 総評

計画・ADR に厳密準拠した堅実な実装。RSC/island 境界、楽観状態と URL 同期、スタイル衝突解消、a11y、テストいずれも問題なし。`periodIsActive && optimistic.period !== null` の二重ガードは一見冗長だが TypeScript のナローイング上必要で、的を射た実装。Blocker・Warning ともになし。

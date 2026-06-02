# 実装計画 — Issue #414: 楽観的UI更新で mutation インタラクションを滑らかにする

**Issue:** #414
**作成日:** 2026-06-02
**複雑度:** 中〜大規模

---

## 目的

React 19 の `useOptimistic` を実データ mutation に適用し、成功を前提に UI を即時更新（失敗時は自動巻き戻り＋エラー表示）することで、`routerInvalidate()` の loader round-trip 待ちをユーザーから隠し、削除・複製・編集などのインタラクションを滑らかにする。

## スコープ

### 含まれるもの（高優先度・必須）

- SavedViewsList の **削除** を list-level `useOptimistic` でローカル即時除去（行を親へ引き上げ）
- SavedViewRow の **名前変更 / 既定 toggle / 修復** を row-level `useOptimistic` で即時反映
- ViewFormDialog の保存後、loader を待たず即 close（楽観反映）
- 各操作で失敗時の自動 rollback + 既存エラー表示パターンの担保
- 上記の失敗巻き戻りを component/integration テストで担保

### 含まれるもの（中優先度・軽量対応）

- IngestionJobRow の discard を row-level 楽観 dim 表示（即時の薄い表示）

### 含まれないもの（明示的にスコープ外）

- **複製（duplicate）の楽観"追加"** — server 採番 id / 既定名 / brokenConditions をクライアントで合成できず、baseline 収束時のちらつき・key 衝突の実害があるため。pending 中の視覚フィードバック（disabled / aria-busy）に留め、確定は `routerInvalidate` round-trip に任せる。
- **アップロード（UploadForm）の楽観追加** — 複製同様 list membership の追加で server 採番依存。`isPending` 表示の現状維持。
- **directory / tag 操作への展開** — Issue でも「検討」止まり。別 Issue が適切。
- **楽観的更新の共通 hook / ヘルパー抽出** — CLAUDE.md / frontend doc が「汎用ラッパーは第二の具体パターンが出るまで作らない」と明言。抽出は別 Issue。

## 実装ステップ

### 1. SavedViewsList（クライアント）に list-level 楽観削除を導入

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`（`SavedViewsList` 関数 = `'use client'`。`Page.tsx` は RSC で state を持てないため props を渡すだけ）
- **変更内容:**
  - `views` を baseline に `useOptimistic(views, reducer)` を `SavedViewsList`（client）に追加。reducer は `{ type: "remove"; id }` で `view.id !== id` に filter。
  - **フック順序の注意:** 現状 `SavedViewsList` は `if (views.length === 0) return ...` の早期 return がある。`useOptimistic` 等のフックはこの早期 return より**前**に呼び、空判定は `optimisticViews.length === 0` で行う（条件分岐後のフック呼び出しは React ルール違反）。
  - 削除の mutation 実行を `SavedViewsList`（client）へ引き上げる。`deleteSavedViewFn` を `useServerFn` し、`startTransition` 内で `applyOptimistic({type:"remove", id})` → `await remove(...)` → `await routerInvalidate(router)` を 1 transition に閉じる。
  - 行 `SavedViewRow` へは `onDelete(view.id)` / `isPending` を props で渡す。行は表示と確認ダイアログ trigger のみ担当。
  - confirm の `onConfirm` は行から親の `onDelete(view.id)` を呼ぶ形に整理。
- **理由:** 削除は list membership の変更。frontend doc 行 772-775 は「`useOptimistic` は**子からは**親所有データを変更できない（削除はこのテンプレでは invalidate 経路に委ねている）」と述べている。本 Issue はまさにその削除の即時反映を要求しているため、doc が「子では不可」とする制約を**親（`SavedViewsList`）へ list-level optimistic を引き上げる**ことで正攻法に解決する（doc がデフォルトで invalidate に委ねていた削除を、Issue 趣旨に沿って楽観化する意図的な拡張）。失敗時は transition 完了で baseline（再取得後の `views`）に snap back し自動 rollback。

### 2. 複製（duplicate）の扱い

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:** list-level optimistic では即時"追加"しない。ただし複製操作自体の即時フィードバック（ボタン disabled / `aria-busy`）は必ず実装し、確定は `routerInvalidate` に任せる。
- **理由:** スコープの「含まれないもの」記載のとおり、`duplicateSavedViewFn` は `{ ok: true }` のみ返し新 id を返さない（client での id 合成不可・key 衝突/ちらつきリスク）。受け入れ基準「主要 CRUD で即時反映」は削除・rename・既定・編集で充足する。複製の楽観"追加"は別 Issue 化を PR 説明で提案する（Issue が複製を高優先度に挙げた点への可視化）。

### 3. 名前変更 / 既定 toggle / 修復を row-level `useOptimistic` 化

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`（`SavedViewRow`）
- **変更内容:**
  - rename: `useOptimistic(view.name, (_, next) => next)`。`onSaveRename` transition 内で `applyOptimisticName(trimmed)` を先に呼び、表示名を optimistic 値に切替。`setIsEditing(false)` も transition 内で即時。
  - 既定 toggle: `useOptimistic(view.isDefault, (_, next) => next)`。transition 内で先に反転を反映。既定バッジ / ボタンラベルを optimistic 値で描画。**自行が所有する field のみ**反映（他行の既定解除は loader 再取得で収束）。
  - repair: `useOptimistic(view.brokenConditions.length > 0, ...)` で「壊れバナーを即時非表示」程度に留める。詳細は invalidate 後の値で確定。
- **理由:** 行が所有する field の変更で、`TodoItem` の completed toggle と同型。row-level `useOptimistic` が doc のあるべき形に完全一致。

### 4. エラー時の rollback / 表示の整合

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:** row-level 操作（rename / 既定 / repair）の `catch` は従来どおり行の `setError(extractSerializedError(e))`（既存 `rowError` の `role="alert"` 枠を流用）。削除は親へ引き上げるため、削除失敗時のエラーも親が所有し、対象行を該当 view の行に伝播して既存 `rowError` 枠に表示する（行再表示後に同じ枠でエラーが出る一貫性を保つ）。optimistic 値は transition 完了で baseline に戻り自動 rollback。`notFound`（既削除）等の kind 分岐は必要なら `displayError` の前に行う。
- **理由:** 失敗時の自動巻き戻り + エラー表示という受け入れ基準を満たす。削除のエラー表示主体（親が所有し行枠に出す）を明示することで既存エラー UI の一貫性を保つ。

### 5. ViewFormDialog 保存後の即 close

- **対象ファイル:** `app/components/view/ViewFormDialog.tsx`
- **変更内容:** transition 内で `await props.submit(...)` 成功直後に `onClose()` を呼び、`routerInvalidate(router)` はその後に実行。順序は `submit → onClose() → routerInvalidate(router)`。`routerInvalidate` のみの失敗は dialog が既に閉じているためエラー表示しない（try で包む）。`submit` 自体の reject では close せず `setError`（現状維持）。
- **理由:** dialog close は list 再取得を待つ必要がない。Issue「必須でないケースでは loader round-trip を待たず UI 確定（dialog close）」に直接対応。edit（`SavedViewRow` 由来）/ create（`NewViewButton` 由来）両方が同関数なので揃って改善。

### 6. IngestionJobRow の discard を row-level 楽観 dim（中優先度）

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** discard を `useOptimistic(job.status === "discarded", ...)` で即時反映する。既存の `data-discarded`（`JOB_CARD` の `data-[discarded]:opacity-60`）を optimistic 値駆動にすれば最小差分で dim 表示が効く。アクションボタン群の表示条件（現状 `job.status` 生 prop 分岐）も同じ optimistic discarded 値で隠し、「dim 済みなのにボタンが残る」一瞬を防ぐ。list からの除去は親所有のため行わず invalidate に任せる。
- **理由:** 中優先度。list 追加・除去の楽観化は高リスク低リターン。row 単位の即時 dim のみ価値が高い。UploadForm のアップロード楽観追加は見送り。

## 設計判断

詳細は `adr.md` を参照。要点:

- 削除の optimistic state は親 `SavedViewsList` に置く（doc 行 772-775 準拠）。
- 複製・アップロードの楽観"追加"は行わない（server 採番依存のちらつき・key 衝突回避）。
- rename / 既定 / repair は row-level `useOptimistic`（`TodoItem` 同型）。
- ViewFormDialog は submit 成功で即 close、invalidate は close 後に await（失敗は非表示）。
- 共通 hook は抽出しない（規約準拠）。

## リスクと注意点

- **`useOptimistic` の snap-back タイミング:** setter は必ず `startTransition` 内。transition は `await mutate` + `await routerInvalidate` を**両方含む**こと。invalidate が transition 外に出ると loader 再取得前に baseline へ戻り optimistic 値が一瞬消える（ちらつき）。FilterBar と同じく「optimistic patch + 確定処理を 1 transition に閉じる」を厳守。
- **削除を親へ引き上げる際の `ConfirmDialog` 連携:** confirm state は行に残し、delete 実行は親（`onDelete(view.id)`）に分割する。
- **既定 toggle の片側収束:** 自行を既定にすると他行の既定が server で解除されるが、他行は optimistic 対象外なので一瞬「2 つ既定」に見えうる。invalidate 後に収束する。許容範囲（自行のみ反映）。
- **3 ルール整合（調査済み・問題なし）:** サイドバー（`app/components/layout/Sidebar.tsx`）は個別の SavedView を一切列挙せず、`/views` への静的リンク 1 本と directory tree（`DirectorySidebarSection`）のみを描画する。`loadSavedViews` を呼ぶのは leaf の `Page.tsx`（`/views` ルート、`_app` 配下ではない）だけ。よって SavedView の削除/複製/rename/既定 toggle で `routerInvalidate`（`_app` 除外）を使っても**サイドバーが古くなる問題は発生しない**。3ルール例外（認証 / sidebar tree / displayName）のいずれにも該当せず、現状の `routerInvalidate` のままで正しい。
- **ViewFormDialog 即 close で invalidate 失敗時のエラー消失:** submit 成功を確定点とし invalidate 失敗は非表示で許容。

## テスト方針

既存 `app/components/ingestion/__tests__/IngestionJobRow.test.tsx` と同形（happy-dom + `createRoot` / `act` + `_test-utils/serverFnMock.ts` の `useServerFnRouter` / `serverFnChainStub` モック）で追加する。Issue の「失敗ケースの巻き戻りを integration テストで担保」はこの component test を指す（ボタン経由 mutation はブラウザ自動検証が cross-origin で弾かれるため）。

- `SavedViewsList`（新規 `__tests__/SavedViewsList.test.tsx`）:
  - 削除 click → confirm → 即座に該当行が DOM から消える（mock pending のまま assert）。
  - 削除 mock reject → transition 完了後に行が再表示（baseline 復帰）+ `role="alert"` エラー。
  - rename / 既定 toggle: optimistic 反映 → 失敗で baseline 復帰。既定 toggle は「他行の isDefault は invalidate まで baseline のまま（自行のみ反映）」も assert し ADR-003 のトレードオフ受容を検証。
- `ViewFormDialog`（`__tests__/ViewFormDialog.test.tsx`）:
  - submit 成功 → `onClose` 呼び出し（invalidate より先 or 直後）。
  - submit reject → `onClose` 非呼び出し + `role="alert"`。
- ingestion: 既存 `IngestionJobRow.test.tsx` に discard の楽観 dim 反映 / 失敗復帰の test を追加。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format`（受け入れ基準）+ `pnpm test:unit`。

## レビュー履歴

### 1周目

**修正した点**:
- [P-001] frontend doc 行 772-775 の引用が逆だった点を是正。doc は「削除は子では楽観化できず invalidate に委ねる」が原意。ステップ1・ADR-001 を「doc の制約を親へ list-level 引き上げで正攻法に解決する意図的拡張」に書き換え、「doc 完全準拠」表現を撤回。
- [P-002] `Page.tsx` は RSC で state を持てない点を明記。list-level optimistic はクライアント `SavedViewsList`（index.tsx）に置く。早期 return（空リスト）よりフックを前に呼び、空判定は `optimisticViews.length === 0` で行う旨をステップ1に追記。ADR-001 にも反映。
- [S-001/サイドバー要確認] 実コード調査で「サイドバーは SavedView を列挙せず `/views` 静的リンクのみ。`loadSavedViews` は leaf の Page.tsx だけ」と確定。リスク欄を「3ルール整合・問題なし」の断定形に更新。

**取り込んだ改善提案**:
- [P-002(要件視点)/ADR-002] 複製の高優先度落としを可視化。複製操作自体の即時フィードバックは実装し、楽観追加は別 Issue 化を PR 説明で提案する旨を追記。
- [S-002/S-004] ステップ6 を具体化。既存 `data-discarded`（`data-[discarded]:opacity-60`）を optimistic 値駆動にし、アクションボタン表示条件も同 optimistic discarded 値で隠す。
- [S-002(アーキ視点)] テスト方針に「既定 toggle 時、他行 isDefault は baseline のまま」の assert を追加。

**見送った提案とその理由**:
- [S-001(アーキ視点)/setError 順序] [S-003/closable と onClose 相互作用] — いずれも実装時の確認事項であり計画変更不要。実装ステップ内の既存記述（1 transition に閉じる / submit 成功で close）でカバー済み。

### 2周目

**結果**: 両視点とも問題点ゼロで終了。1周目の P-001（doc 引用是正）・P-002（RSC 制約・フック順序）が実コード根拠付きで正しく反映されていることを両レビュアーが確認。

**取り込んだ改善提案**:
- [S-001(アーキ視点)] 削除を親へ引き上げた際のエラー表示主体を明示（親が所有し対象行の既存 `rowError` 枠に表示）。ステップ4 に追記。

**見送った提案とその理由**:
- [S-001(要件視点)/repair の部分成功ちらつき] — 実装時にスコープ判断（楽観非表示は全条件解決前提のみ or repair は pending 表示のみ）。受け入れ基準に影響せず、ステップ3 の「壊れバナー即時非表示程度に留める」でカバー済み。
- [S-002(アーキ視点)/closable と unmount] — 実害なし（invalidate 後に state 更新がない）。実装時の確認事項。


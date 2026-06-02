# 実装計画 — Issue #423: 楽観的UI更新の残スコープ（複製/アップロードの楽観追加・directory/tag 展開・共通 hook 抽出）

**Issue:** #423
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

#414（PR #422）で確立した `useOptimistic` の 2 パターン（row-level / list-level）を、残スコープに展開してインタラクションの待ち感をさらに減らす。本 Issue は 3 パートからなり、各パートは独立して「やる / 限定的にやる / やらない」を判断する。

## スコープ

本 Issue は 3 パート。各パートの結論は以下のとおり（根拠は「設計判断」と `adr.md` 参照）。

### パート1: 複製 / アップロードの楽観"追加" — **複製のみ実施、アップロードは見送り**

#### 含まれるもの
- **複製（duplicate）の楽観追加を実施する。** `duplicateSavedView` usecase は **既に `{ view: SavedViewDTO }`（server 採番 id・確定コピー名・brokenConditions 込み）を返している**。捨てているのは `duplicateSavedViewFn` server fn の `return { ok: true }` だけ。この 1 行を `return { view }` に変えれば #414 ADR-002 が前提とした「client 合成 id / 名前 / brokenConditions」の問題は消滅し、key 衝突・ちらつきリスクなく楽観追加できる。
- list-level `useOptimistic` に `{ type: "add"; view }` reducer を追加し、複製ボタンの transition 内で `await duplicate(...)` の戻り値 `view` を `applyOptimistic({ type: "add", view })` で即時挿入 → `routerInvalidate` で baseline 収束。
- 失敗時の自動 rollback（transition 完了で baseline へ snap back）+ 既存エラー表示の担保。

#### 含まれないもの（明示的にスコープ外）
- **アップロード（UploadForm）の楽観追加 — 見送り。** ① アップロードは `pending` 状態の job を server 側で非同期処理する設計で、`uploadFileFn` は `{ jobId }` しか返さず `IngestionJobWire`（originalFileName / status / preview 等の表示フィールド）を返さない。② job リストは `IngestionQueue`（`"use client"`）が `useState` + 4 秒ポーリングで所有しており、`useOptimistic`（RSC baseline 前提）と所有モデルが異なる。③ 複数ファイル一括アップロードで途中失敗時の部分 rollback が複雑。client が表示用 wire を合成すると baseline（ポーリング）収束時にちらつく。複製と違い「契約が既に揃っている」状態ではないため、契約変更を伴う本格対応は本 Issue のスコープ外とし、現状の `isPending`（"アップロード中..."）表示を維持する。

### パート2: directory / tag 操作への `useOptimistic` 展開 — **tag を実施、directory は限定実施**

#### 含まれるもの
- **tag のリネーム（row-level）** — `TagActions` の rename は行所有 field（name）の変更で `TodoItem` と同型。`useOptimistic(name, ...)` を追加し即時反映。`#414` ADR-003 / ADR-005（`setIsEditing(false)` は transition 外）を踏襲。
- **tag の削除（list-level）** — list membership 変更。list を所有する RSC `TagManager` ではなく、client の親へ list-level optimistic を引き上げて即時除去（#414 ADR-001 と同型）。ただし下記「設計判断」のとおり、tag の親は現状 client 化されていない（`TagManager` は RSC、`TagActions` が leaf）。新たに client な list ラッパーを 1 枚挟む。
- **directory のリネーム（row-level・限定）** — `DirectoryTree` の `InlineRenameInput` は既に row 内 state を持つ。`useOptimistic(node.name, ...)` で表示名を即時切替（rename 中も新名を表示）。**ただし directory tree は `_app` 層（Sidebar）所有のため、楽観反映はリネーム中の表示名のみに留め、確定は raw `router.invalidate()`（rule 2）に委ねる**（#414 の repair の「壊れバナー即時非表示程度に留める」と同じ限定方針）。

#### 含まれないもの（明示的にスコープ外）
- **directory の移動 / 削除の楽観"反映"（tree 構造の即時変更）** — directory tree は `_app` レイアウトの Sidebar（RSC, `staleTime: Infinity`）が所有し、複数 leaf（filter / select field）と共有される再帰 forest。移動・削除はノードの位置・存在を変える構造変更で、client が `_app` 所有データを楽観的に書き換えるには tree forest 全体のローカル複製・整合が必要。#414 frontend doc「`useOptimistic` は親所有データを子から変更できない（invalidate に委ねる）」の典型に該当し、無理に楽観化するとちらつき・整合崩れの実害が大きい。移動・削除は現状の dialog + `router.invalidate()` の操作中フィードバック（`isPending` / "移動中..." / "削除中..."）を維持する。

### パート3: 共通パターン抽出 — **やらない（現時点では時期尚早と判断）**

#### 含まれないもの（明示的にスコープ外）
- **汎用 hook / ヘルパーの抽出は本 Issue では行わない。** CLAUDE.md / frontend doc は「汎用ラッパーは第二の具体パターンが出るまで作らない」方針。本 Issue で 3 例目（tag rename = row-level / tag delete = list-level / 複製 = list-level add）が出るが、いずれも #414 で確立済みの 2 パターンの**反復**であって新しい抽象を要求する第三のパターンではない。row-level は `useOptimistic(field, (_,n)=>n)`、list-level は `useOptimistic(list, reducer)` で、各 component の文脈（reducer の action 種別・transition 内の確定処理・エラー所有者）が個別に異なるため、現状の薄い反復のままが最も読みやすい。抽出は「2 パターンに収まらない第三の形」が現れたときの別 Issue とする。詳細は ADR-004。

## 実装ステップ

### 1. 複製の戻り値契約を `{ view }` に変更（パート1）

- **対象ファイル:** `app/components/view/SavedViewsList/action.ts`（`duplicateSavedViewFn`）
- **変更内容:** handler の `await module.duplicateSavedView(...)` の戻り値を受け、`return { ok: true }` を `return { view: result.view }` に変える（usecase は既に `{ view: SavedViewDTO }` を返す）。`SavedViewDTO` は `serverFn` の serialize 境界を通る plain shape（他の loader と同型）なので追加変換は不要。
- **理由:** #414 ADR-002 が「server 採番 id / 名前 / brokenConditions を client 合成できない」を理由に複製の楽観追加を見送ったが、usecase は最初からそれらを返している。server fn が値を捨てているだけ。契約をこの 1 行で揃えれば楽観追加が安全に可能になる。

### 2. SavedViewsList に list-level 楽観"追加"を導入（パート1）

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:**
  - reducer を `RemoveAction | AddAction`（`{ type: "add"; view: SavedViewDTO }`）に拡張。`add` は `[...cur, action.view]`（末尾追加。loader 収束時の並び順は server に従う）。
  - 複製の mutation 実行を行 `SavedViewRow` から親 `SavedViewsList` へ引き上げる（削除と同じく list-level 操作のため）。`onDuplicate(viewId)` を props で行へ渡す。親の transition 内で `const { view } = await duplicate({ data: { viewId } })` → `applyOptimistic({ type: "add", view })` → `await routerInvalidate(router)` を 1 transition に閉じる。
  - **key 衝突に注意:** 楽観追加した `view.id` は server 採番の確定 id なので、loader 収束後の baseline にも同一 id で現れる。`useOptimistic` は baseline が更新されると optimistic patch を破棄するため二重 key は発生しない（patch は baseline に対する一時的上乗せ）。reducer の `add` は同一 id が既に baseline にある場合は重複追加しない防御（`cur.some(v => v.id === action.view.id) ? cur : [...cur, action.view]`）を入れる。
  - 複製エラーは親が所有（削除と同様 `duplicateError` state）。複製は新規行で「失敗した対象行」が存在しないため、削除と違いリスト末尾 or 既存の duplicate 元行の `rowError` 枠に出す。**簡潔さのため、複製エラーは複製元の行（`viewId`）に紐づけて既存の `deleteErrorId`/`deleteError` と同じ「行に紐づくエラー」機構を一般化（`actionErrorId` / `actionError`）して流用する**。
- **理由:** 削除（list-level remove）が既に親にあるので、複製（list-level add）も同じ親・同じ `useOptimistic` に統合するのが #414 ADR-001 の自然な延長。

### 3. （調査メモ）tag rename は row 単体では楽観化できない

- **発見:** tag の表示名 `#{tag.name}` は `TagManager`（RSC）の `<li>` 内 `<div>#{tag.name}</div>` が描画しており、`TagActions`（client）は表示名要素を**持たない**（操作ボタン群のみ）。そのため `TagActions` 単体に `useOptimistic(name)` を置いても描画に反映する先がなく、row-level 楽観反映が成立しない。
- **結論:** rename は delete と同じく、表示名を所有する親を client 化して list-level で patch する（ステップ4 に統合）。これは「子は親所有データを変更できない」という #414 frontend doc 制約の典型例で、SavedView delete を親へ引き上げたのと同じ正攻法。
- このステップ自体に実装変更はない（ステップ4 へ反映）。

### 4. TagManager のリストを client ラッパーで包み、tag の delete / rename を list-level 楽観化（パート2）

- **対象ファイル:** 新規 `app/components/tag/TagList.tsx`（`"use client"`）、`app/components/tag/TagManager.tsx`（RSC）、`app/components/tag/TagActions.tsx`
- **変更内容:**
  - `TagManager`（RSC）は `tags`（`{ id, name, noteCount }[]` と candidates 算出に必要な all list）を `TagList`（新規 client）へ props で渡すだけにする。空状態判定・`<ul>` 描画・各行（name 表示 + `TagActions`）を `TagList` が担当。
  - `TagList` に `useOptimistic(tags, reducer)` を置く。reducer は `{type:"remove"; id}`（delete）と `{type:"rename"; id; name}`（rename）。**rename action は対象要素の `name` だけ差し替え、`noteCount` 等の他フィールドは保持する**（`cur.map(t => t.id === id ? { ...t, name } : t)`）。row（`TagActions`）の delete / rename 実行を `TagList` へ引き上げ、`onDelete(id)` / `onRename(id, name)` を props で渡す。各 transition 内で `applyOptimistic(...)` → `await mutate(...)` → `await routerInvalidate(router)`。
  - 表示名 `#{tag.name}` は `TagList` の各 `<li>` が `optimisticTags` 由来で描画（RSC から client へ引き下げ）。`TagActions` は表示と操作 trigger に専念し、name / id / noteCount / candidates / `onDelete` / `onRename` を props で受ける。
  - **件数表示の所有（S-002 で確定）:** 現状 `{tags.length} 件のタグ` は `TagManager`（RSC, `PAGE_SUBTITLE` 直下）にある。delete 即時に件数も減らすため、**件数表示要素も `TagList`（client）へ引き下げ `optimisticTags.length` で描画する**。`TagManager` 側に件数を残すと「行は即時に消えるが件数は invalidate まで古い」不整合が出るため、件数は `TagList` 所有に統一する。ページ見出し（`PAGE_SUBTITLE` 等の静的サブタイトル）は RSC 据え置きで、可変件数だけを client へ引き下げる切り出し境界とする。
  - candidates（merge 候補、`{id, name}` のみ要する）は `optimisticTags` から都度算出（delete で消えた tag は候補からも即時に外れる / rename した tag は新名で候補に出る）。merge 元 tag の `noteCount`（`MergeTagDialog` の `sourceNoteCount`）も `optimisticTags` 由来で渡るよう、reducer が `noteCount` を保持することと整合させる。
  - エラー所有: rename / delete エラーは `TagList` が `actionErrorId` / `actionError` で所有し、対象行の既存 `FORM_ERROR`（`role="alert"`）枠へ伝播（#414 ADR-006 と同型）。delete confirm の即 close も #414 ADR-006 に倣う。
  - フック順序: `useOptimistic` 等は空リスト早期 return より前に呼び、空判定は `optimisticTags.length === 0` で行う（#414 ステップ1 と同じ注意）。
- **理由:** tag list membership（delete）と親所有 name（rename）はいずれも親 client が所有すべき。#414 の SavedViewsList と完全に同型の構造に揃える。3 ルール整合: tag 操作は auth / directory tree / displayName のいずれも変えないため `routerInvalidate`（`_app` 除外）のままで正しい（現状の TagActions も `routerInvalidate` を使用）。

### 5. directory のインライン rename を row-level 楽観反映（パート2・限定）

- **対象ファイル:** `app/components/directory/DirectoryTree.tsx`（`DirectoryTreeNodeView` と `InlineRenameInput`）
- **背景（解決したい隙間）:** 現状の `InlineRenameInput` は pending 中ユーザーが打った `value` を input に表示し続けるが、commit 成功で `onDone()` が `renamingId=null` にして input を unmount する。この瞬間〜`router.invalidate()`（rule 2, raw）完了までの間、ノードは古い `node.name`（baseline）に戻って表示される。この古い名前のフラッシュが待ち感の正体。
- **変更内容:**
  - `DirectoryTreeNodeView` に `const [optimisticName, applyOptimisticName] = useOptimistic(node.name, (_cur, next: string) => next)` を置き、リンクのラベル（`<span className="truncate">{node.name}</span>`）を `optimisticName` で描画する。
  - rename の commit（`InlineRenameInput`）が成功する transition 内で、`applyOptimisticName(trimmed)` を呼ぶ。**方式は「rename 実行（`renameDirectory` + `router.invalidate()`）の transition を `DirectoryTreeNodeView` 側へ引き上げる」案に一本化する（S-001 で確定）。** `useOptimistic` の setter は所有 component（`DirectoryTreeNodeView`）の transition 内で呼ぶ必要があり、「`InlineRenameInput` の子 transition から親 setter を呼ぶ」案は React の transition セマンティクス（#414 ADR-005 で足を取られた領域）に対しグレーなため採らない。`InlineRenameInput` は値入力 + commit trigger（`onCommit(trimmed)` コールバック呼び出し）に専念させ、実 mutation・`useOptimistic` 更新・invalidate は `DirectoryTreeNodeView` が担う。
  - **引き上げに伴う配線（S-001 補足）:** 引き上げ後、`InlineRenameInput` の `disabled={isPending}` / 失敗時の input 再フォーカス effect（`errorPresent`/`isPending`）/ 単発 guard（`committedRef`）の所有を整理する。`isPending` は親 transition 由来になるため `DirectoryTreeNodeView` から `InlineRenameInput` へ props で渡す。`renameError` 表示と input 再表示（リトライ動線）は現状を維持する。
  - `useOptimistic` の baseline は `node.name` prop。invalidate 完了で新 tree が流れてくると patch が破棄され、楽観名と確定名が一致して収束する。失敗時は patch 破棄で baseline（旧名）へ snap back し、既存の `renameError` 表示と input 再表示でリトライ可能（現状動線を維持）。
  - **directory の移動・削除は対象外**（スコープ「含まれないもの」のとおり）。raw `router.invalidate()`（rule 2）は維持。
- **理由:** rename は tree 構造を変えない name field の変更で、限定的な row-level 楽観反映が成立する。表示名が `_app` 所有のため楽観反映は「commit 成功〜invalidate 収束までの表示名つなぎ」に留める。移動・削除は構造変更で親所有データの楽観化が高リスクのため見送る（#414 doc 制約準拠）。

### 6. テスト追加

- **対象ファイル:** `app/components/view/SavedViewsList/__tests__/SavedViewsList.test.tsx`（既存に複製の追加 / 失敗復帰を追加）、新規 `app/components/tag/__tests__/TagList.test.tsx`、`app/components/directory/__tests__/DirectoryTree.test.tsx`（rename 楽観表示 / 失敗復帰）
- **変更内容:** #414 と同形（happy-dom + `createRoot`/`act` + `_test-utils/serverFnMock.ts` の `useServerFnRouter`/`serverFnChainStub`）。下記「テスト方針」に観点。
- **理由:** 失敗時の rollback はブラウザ自動検証が cross-origin で弾かれるため component テストで担保（#414 と同方針）。

### 7. 仕上げ

- `pnpm typecheck && pnpm lint:fix && pnpm format` + `pnpm test:unit`。

## 設計判断

詳細は `adr.md` 参照。要点:

- **パート1（複製）はやる。** usecase が既に `{ view }` を返しており、server fn が捨てているだけ。契約変更は server fn 1 行のみ。client 合成不要で #414 ADR-002 の前提が崩れる。（ADR-001）
- **パート1（アップロード）は見送り。** `uploadFileFn` が表示用 wire を返さず、job list が `useState`+ポーリング所有で `useOptimistic` の baseline モデルと不一致。本格対応は契約変更（wire 返却）+ ポーリング所有との整合が必要でスコープ過大。（ADR-002）
- **パート2: tag は full 実施、directory は rename のみ限定実施。** tag list/name は leaf RSC 所有 → client list ラッパーへ引き上げ（SavedView と同型）。directory tree は `_app` Sidebar 所有の再帰 forest → 移動・削除の構造変更を子から楽観化するのは高リスクで見送り、rename の表示名つなぎのみ限定実施。（ADR-003）
- **パート3（共通 hook 抽出）はやらない。** 本 Issue で出る 3 例目はいずれも既存 2 パターンの反復で、新しい抽象を要求しない。汎用化は第三の形が出たときの別 Issue。（ADR-004）

## リスクと注意点

- **複製の楽観追加と並び順:** 楽観追加は末尾挿入だが、loader 収束後の並び順は server のソートに従う。複製直後の末尾表示が invalidate 後に正しい位置へ移動して見える可能性がある。`useOptimistic` の patch 破棄で自然に収束するため実害は小さいが、testing で「ちらつき・順序ジャンプが許容範囲か」を体感確認する。**順序ジャンプが体感的に気になる場合のみ（S-004）**、reducer の `add` を「複製元 view の直後に挿入」（`cur.flatMap(v => v.id === srcId ? [v, action.view] : [v])`）へ寄せる余地がある（実装コスト小）。まずは末尾挿入で実装し、testing 結果次第で判断する。
- **複製エラーの表示主体:** 複製は「失敗した新規行」が存在しないため、エラーは複製**元**の行へ紐づけて出す。削除の `deleteErrorId` 機構を `actionErrorId` に一般化して流用するが、削除・複製のエラーが同時に起きるケースは UI 上発生しない（1 transition）ので単一 state で足りる。
- **tag list を client へ引き上げる影響:** `TagManager`（RSC）が持っていた空状態・件数表示（`{tags.length} 件のタグ`）の一部を `TagList` へ移すと、optimistic 件数と表示件数の整合に注意。件数表示は baseline（`tags.length`）のままにするか、optimistic 件数にするかを決める（推奨: 件数表示も `optimisticTags.length` にして delete 即時に減らす）。
- **directory rename の `_app` invalidate:** rename は rule 2（sidebar tree 改変）で raw `router.invalidate()` を維持。楽観表示名は invalidate 収束まで。`useOptimistic` の baseline は `node.name` prop なので、再帰描画でノードが再生成されても prop 更新で patch が破棄され収束する。tree が深い場合のキー安定性（`node.id` key）は既存どおり。
- **directory rename が複数箇所に表示される:** 同一 directory は sidebar tree のみ（filter / select field は別コンポーネントで rename UI を持たない）。rename 楽観反映は `DirectoryTree` 内の該当ノードのみで、他の参照箇所は invalidate 後に収束。許容範囲。
- **`SavedViewDTO` の serialize:** 複製 server fn が `{ view }` を返す際、`SavedViewDTO` は他 loader（`loadSavedViews`）と同じ shape なので serialize 境界を問題なく通る（既存実績あり）。

## テスト方針

- **複製（SavedViewsList.test.tsx 追加）:**
  - 複製 click → mock が `{ view }` を resolve → 即座に新行がリストに現れる（mock pending のまま assert）。
  - 複製 mock reject → transition 完了後に新行が消える（baseline 復帰）+ 複製元行に `role="alert"` エラー。
  - 同一 id が baseline に既存の場合の二重追加防御（reducer の guard）。
- **tag（新規 TagList.test.tsx）:**
  - delete click → confirm → 即座に該当行が消える / reject で再表示 + エラー（#414 SavedViewsList と同型）。
  - rename → 即時に `#{newName}` 表示 + 編集モード close / reject で baseline 復帰 + エラー。
  - delete で merge 候補から即時に外れる。
- **directory（新規 DirectoryTree.test.tsx）:**
  - inline rename commit → 即時に新名表示（invalidate mock pending のまま）/ reject で input が残り baseline 名 + エラー。
  - 移動・削除は楽観化しないため対象外（既存の `isPending` 表示の回帰のみ確認）。
- **実機ブラウザ:** 成功時の即時反映の体感（複製の新行出現 / tag rename・delete / directory rename）。詳細は testing.md。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format` + `pnpm test:unit`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 自己レビュー）

**確認した点:**
- 実コード照合で「複製 usecase（`duplicateSavedView`）は既に `{ view: SavedViewDTO }` を返し、server fn が握りつぶしているだけ」を確定。#414 ADR-002 の前提（client 合成必要）が複製では誤りだったことを ADR-001 に明記。
- directory tree の所有が `_app` Sidebar（RSC, `staleTime: Infinity`、rule 2 で raw invalidate）であること、tag list/name が leaf RSC `TagManager` 所有であることを実コードで確認。directory は rename 限定 / tag は full の判断根拠とした（ADR-003）。
- アップロードが `{ jobId }` のみ返し job list が `IngestionQueue` の `useState`+ポーリング所有である（`useOptimistic` の baseline モデルと不一致）ことを確認し、見送り根拠を ADR-002 に明記。

**修正した点:**
- ステップ3（tag rename）が「`TagActions` 単体で row-level 化」と「親へ引き上げ」の間で矛盾していたため、`TagActions` が表示名要素を持たない事実（`TagManager` RSC が描画）を調査メモとして明示し、rename は delete と同じく list-level（ステップ4）へ統合する形に一本化。
- ステップ5（directory rename）の `useState`/`useOptimistic` 混在の曖昧記述を、解決したい隙間（input unmount〜invalidate 完了の旧名フラッシュ）と `useOptimistic(node.name)` による表示名つなぎ、として明確化。

**未解決事項:** なし。実装時に据わりを確認する点（directory rename の transition setter の所有 component）はステップ5 内に明記済み。

### 2周目（要件カバレッジ / アーキ・リスク 2視点並列レビュー）

**両視点とも問題点ゼロで終了。** 要修正レベルの欠陥はなく、計画の核心主張（複製 usecase は既に `{ view }` を返す・tag list/name は RSC 所有・directory tree は `_app` 所有・アップロードは `{ jobId }` のみ）はすべて実コードで裏付け確認済み。

**取り込んだ改善提案:**
- **S-001（両者）:** directory rename の transition setter 所有問題を、2案併記から「rename 実行を `DirectoryTreeNodeView` へ引き上げる」案に一本化（ステップ5）。引き上げに伴う `isPending`/`committedRef`/再フォーカス effect の配線整理も明記。
- **S-002（両者）:** tag 件数表示（`{tags.length} 件のタグ`）の所有を確定。可変件数を `TagList`（client）へ引き下げ `optimisticTags.length` で描画し、静的サブタイトルは RSC 据え置き（ステップ4）。
- **S-003:** tag reducer の `rename` action が `noteCount` を保持すること、candidates / merge 元 `sourceNoteCount` との整合を明記（ステップ4）。
- **S-004:** 複製の楽観挿入位置（末尾 vs 複製元直後）を testing 結果次第の選択肢としてリスク欄に明記。まず末尾で実装。

**見送った提案とその理由:** なし（全提案がスコープ内の明確化のため取り込み）。

**終了理由:** 両視点とも問題点ゼロ。

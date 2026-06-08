# 実装計画 — Issue #607: bug: タグ管理(P18) — デザイン未追従（フォーム/余白）＋作成/統合/並び替えが楽観的更新でない

**Issue:** #607
**作成日:** 2026-06-09
**複雑度:** 中〜大規模

---

## 目的

タグ管理ページ（P18 `/tags`）の2つの問題を解消する。

1. **デザイン未追従** — タグ作成フォームがデザイン仕様（SSOT の `spec/design/pages/P18-tags.html` / `mobile/P18-tags.html`）に存在しないにもかかわらず、デザイントークン非準拠の素朴なレイアウトでページ上部に差し込まれており、ページの縦リズム（余白）がデザイン仕様とずれている。
2. **楽観的 UI の不統一** — リネーム / 削除は `useOptimistic` + `useTransition` で楽観的更新されるが、作成 / 統合 / 並び替え / 検索は待機型（サーバー応答 or ローダー再実行待ち）で、操作後に反映ラグが出る。

ページをデザイン仕様に沿った見た目・余白に揃え、全操作を確立済みの楽観的更新パターンに統一する。

## スコープ

### 含まれるもの

- 作成フォーム（`CreateTagForm`）の意匠・配置・スペーシングをデザイントークンに準拠させ、デザイン仕様（SSOT の HTML 2枚）にも反映する（ADR-001）。
- ページ上部の縦リズム（タイトル → stats → 作成フォーム → ツールバー → 一覧）をデザイン仕様の margin（`page-header` `--space-6`、`tag-toolbar` `--space-5`）に揃える。
- **作成** を `TagList` の `useOptimistic` 投影に統合し、楽観的に新規行を即時表示する（ADR-002）。
- **統合** を楽観的更新にする（統合元タグを即時に一覧から消す。ADR-003）。
- **並び替え / 検索** を `FilterBar` 確立済みの「`useOptimistic(baseline, reducer)` + `startTransition` 内で `applyOptimistic` → `await router.navigate`、コントロールは disabled にしない」パターンに合わせる（ADR-004）。

### 含まれないもの

- 統合の進捗バナー（非同期ジョブ基盤前提。`spec/design/pages/P18-tags.html` のコメントおよび #563 / #569 で別Issue引き渡し済み）。`MergeTagDialog` の既存の同期進捗表示（`progressTrack`）はそのまま温存する。
- backend（usecase / adapter / domain / schema）の変更。本Issueはフロントエンドのみ（既存の `createTagFn` / `mergeTagsFn` / `listTags` 等をそのまま使う）。
- リネーム / 削除の挙動変更（既に楽観的。Issue本文も「あり」と整理）。`routerInvalidate` による mutation 後の全体再取得自体は全操作共通の確定経路として温存する（楽観投影 → 確定取得の二段は意図された設計）。
- 最終使用列・検索・ソート機能そのものの追加（#569 で追従済み）。本Issueはそれらの**楽観化**のみ。

## 実装ステップ

### 1. 作成フォームのデザイントークン準拠化（スタイル定義）

- **対象ファイル:** `app/components/tag/styles.ts`
- **変更内容:** 作成フォーム用のユーティリティ文字列定数を追加する。デザイン仕様にフォームが無い以上、既存の `.tag-toolbar` / `.search` / `.btn` の意匠言語に揃えた最小構成にする。具体的には:
  - フォーム行ラッパ `TAG_CREATE_FORM`（`flex items-end gap-2 flex-wrap`＋デザイン仕様の縦リズムに沿った下マージン）。
  - 入力欄 `TAG_CREATE_INPUT`（`TAG_SEARCH_INPUT` と同系の surface pill。ただし作成は submit を伴うので `TAG_RENAME_INPUT` 系の bg-bg + border 系か、ツールバー pill 系のどちらに寄せるかは ADR-001 で決定）。
  - ボタンは共通 `pillBtn` + `pillBtnPrimary`（`.btn-primary` 相当）を流用するため新規定数は最小限。
- **理由:** Issue「トークン非準拠」の指摘。`FIELD_INPUT` / `FIELD_LABEL`（admin 用 field primitive）はタグページの意匠から浮く。タグページ専用トークン（`TAG_*` / `SEGMENTED`）と同じ密度・surface 言語に揃える。

### 2. `CreateTagForm` の楽観的更新化とトークン適用

- **対象ファイル:** `app/components/tag/CreateTagForm.tsx`, `app/components/tag/TagList.tsx`
- **変更内容:**
  - 作成の楽観投影を `TagList` の `useOptimistic` に統合する（ADR-002）。`reduceTags` に `add` アクションを追加し、楽観的な新規タグ（`noteCount: 0`, `lastUsedAt: null`, クライアント生成の一時 id）を一覧へ即時追加する。
  - `CreateTagForm` は `onCreate(name: string)` コールバックを `TagList` から受け取る形に変更し、`useActionState` の待機型ロジックを `TagList` 側の `startMutation(async () => { applyOptimistic({type:'add',...}); await createTag(...); await routerInvalidate(router) })` に寄せる。入力欄は submit 後に即クリアする。
  - フォームのクラスをステップ1で定義した `TAG_CREATE_*` に差し替え、`flex gap-2 items-end mt-4` の素のレイアウトを廃する。
  - **現挙動の取りこぼし防止（S-002）**: `useActionState` 撤去で消える「空入力 early return（`name.trim().length === 0`）」「Enter 送信」「楽観 add 中の二重送信防止（連打ガード）」を `TagList` 側 `onCreate` ／フォームの submit ハンドラで担保する。
  - 作成エラーは `TagList` の既存 `actionError` 機構ではなく、フォーム直下に出す（作成行はまだ確定していないため。`FORM_ERROR` をフォーム内に保持）。エラー時は楽観追加した一時行を巻き戻す（`useOptimistic` は transition 終了で baseline へ snap back するので、追加分は自動で消える）。
  - `TagList.tsx:150` の空状態文言「上のフォームから追加できます」は、フォームを残す方針なので文言整合のみ確認（必要なら現状維持）。
- **理由:** Issue「作成が最も楽観的でない」の解消。リネーム / 削除と同じ `useOptimistic` 投影に乗せることで一貫性を担保し、count（`{n} 件のタグ`）も即時に増える。

### 3. ページ縦リズム（余白）のデザイン追従

- **対象ファイル:** `app/components/tag/TagManager.tsx`, `app/components/tag/TagList.tsx`
- **変更内容:**
  - デザイン仕様の構成は `page-header`（title + stats、`margin-bottom: --space-6`）→ `tag-toolbar`（`margin-bottom: --space-5`）→ `tag-list`。現状は `PAGE_TITLE`（`mb-2.5`）→ `PAGE_SUBTITLE`（`{n}件のタグ`、`mb-7`=`--space-7`）→ 作成フォーム → ツールバー。
  - stats 相当の `PAGE_SUBTITLE` の下マージンと、作成フォーム・ツールバー間の余白をデザイン仕様の `--space-6` / `--space-5` に合わせて調整する（フォームを追加要素として挟むぶんの縦リズムを ADR-001 の配置決定に従って整える）。
  - リスト先頭の `mt-6`（`<ul className="...mt-6">`）と空状態の `mt-6`（`EMPTY_STATE`）はツールバー（`mb-5`）との二重余白になっていないか確認し、デザイン仕様の `.tag-list { border-top }` 直結（ツールバーの margin-bottom のみ）に寄せる。
- **理由:** Issue「ページ全体の余白がデザインどおりでない」。作成フォーム後付けで崩れた縦リズムを SSOT の margin トークンに合わせる。実機確認（testing.md）で最終調整する。

### 4. 統合の楽観的更新化

- **対象ファイル:** `app/components/tag/MergeTagDialog.tsx`, `app/components/tag/TagActions.tsx`, `app/components/tag/TagList.tsx`
- **変更内容:**
  - 統合元タグは統合成功で削除される（参照ノートは統合先へ移管）。`reduceTags` に既存の `remove` アクションを再利用し、統合確定時に統合元 id を楽観的に一覧から消す。
  - **既存の `onDelete` パスと完全同型にする（S-002/S-003 確定）**: `TagList` が `onMerge(sourceTagId, targetTagId)` を `TagActions` → `MergeTagDialog` に props で流す（2案併記はやめ、コールバック方式に確定）。`MergeTagDialog` 側の `useTransition` / `useServerFn(mergeTagsFn)` / `routerInvalidate` は撤去し、サーバー呼び出しと確定取得は `TagList` の `onMerge`（= `startMutation(async () => { applyOptimistic({type:'remove', id: sourceTagId}); await mergeTags(...); await routerInvalidate(router) })`）へ移管する。`MergeTagDialog` は統合先選択 UI と `onMerge` 呼び出しだけに痩せる（`CreateTagForm` を `onCreate` 化するのと同型）。ダイアログ開閉は `TagActions` のローカル state（`isMergeOpen`）のまま（#542 ADR-004 と整合）。`runDelete` と同様、ダイアログは即時に閉じ、楽観的 remove を即反映する。
  - 統合エラーは削除と同じく `TagList` の `actionError` 機構（該当行が snap back した後に `FORM_ERROR` で表示）に乗せる。ただし統合進捗（`progressTrack`、`sourceNoteCount > 0` 時）の表示は同期処理の所要時間を示す UI なので、楽観 remove と両立するか ADR-003 で整理（楽観的に消した後はダイアログ自体が無いため、進捗バナーは出さない＝即時反映を優先）。
- **理由:** Issue「統合が待機型」の解消。削除と同型の `remove` 投影で一貫させる。

### 5. 並び替え / 検索の楽観的更新化

- **対象ファイル:** `app/components/tag/TagListToolbar.tsx`
- **変更内容:**
  - `FilterBar` 確立済みパターンに合わせる: `useOptimistic(baseline, reducer)` で `sort` / `order` の楽観 baseline を持ち、`run(action, nav)` ヘルパで `startTransition(async () => { applyOptimistic(action); await router.navigate(...) })` を実行する。
  - segmented（sort 軸）・方向トグル（order）の操作で、active 表示を**楽観 state から描画**する（URL ローダー再実行を待たずに即座に選択状態が変わる）。
  - 現状 `disabled={isPending}`（`TagListToolbar.tsx:95,111,124`）を**撤廃**する（`FilterBar` は pending 中もコントロールを enabled に保ち rapid 操作を落とさない）。`aria-busy` をツールバーに付ける。
  - **検索（q）は楽観化対象から外す（P-002 確定）**: 検索入力は現状 uncontrolled（`defaultValue` + `key={query ?? ""}`）で、`key` には**確定済み `query`（props）を据え置く**。`q` を `useOptimistic` baseline に乗せて `key` に使うと submit 直後に入力が即再マウントされ打鍵値が `defaultValue` で上書きされる干渉が起きる。加えてタグツールバーの検索には「適用済みクエリ」を示すチップ等の可視表示が無く、楽観化しても即時フィードバックの対象が実質存在しない。よって検索は **uncontrolled + submit 時 navigate のまま維持し、`disabled` 撤廃のみ**を適用する（IME 入力保護も兼ねる）。楽観 state は `sort` / `order` のみが対象。
  - **クライアント側即時並び替えの可否（Issue の検討要請）**: 一覧は全件クライアント保持（`TagList` が `optimisticTags` を持つ）だが、ソート結果は backend の集約（`lastUsedAt` = `MAX(notes.updatedAt)` 等、#569 ADR-001）に依存し、クライアントは `noteCount` / `lastUsedAt` を持つため `name` / `noteCount` / `lastUsedAt` はクライアント比較可能。一方 `createdAt` はクライアントに供給されていない（`Tag` DTO に無い）。検索（部分一致 LIKE）も backend ロジック。**結論: サーバーラウンドトリップは温存し、楽観化は「コントロールの選択状態の即時反映」に留める**（ADR-004）。一覧の即時並び替えまで踏み込むと `createdAt` 供給追加 = backend 変更となりスコープ外。
- **理由:** Issue「並び替え/検索が待機型」の解消と「全件クライアント保持時にサーバーラウンドトリップを避けられないか」の技術検討。`FilterBar` と同じ「選択状態は楽観即時・データは loader 確定」の二段で UX を統一する。

### 6. デザイン仕様（SSOT）への作成フォーム反映

- **対象ファイル:** `spec/design/pages/P18-tags.html`, `spec/design/pages/mobile/P18-tags.html`
- **変更内容:** デスクトップ / モバイル両方の HTML に、ステップ1で確定した意匠の作成フォームを `page-header` と `tag-toolbar` の間（または ADR-001 で決めた配置）に追記する。既存トークン（`.search` / `.btn` / `.btn-primary`）のみで構成し、ページ固有スタイルの上書きは避ける（HTML 冒頭コメントの方針に従う）。フォーム周辺の margin もコードと一致させる。
- **理由:** Issue「作成フォームを残すなら必要に応じてデザイン仕様側にも反映する」。SSOT である HTML に存在しない要素が実装にあると、以後のデザイン追従監査（spec-sync 等）で再び乖離扱いになる。コードと SSOT を一致させる。

### 7. 関連テストの追従

- **対象ファイル:** `app/components/tag/__tests__/TagListToolbar.test.tsx`, `app/components/tag/__tests__/TagList.test.tsx`, `reduceTags` の単体テスト
- **変更内容:**
  - `reduceTags` に `add` を足すので、その単体テスト（追加 / 既存維持 / 楽観 add 後に baseline へ snap back して重複しないこと）を拡充する。
  - **P-001 確定（必須）**: `TagListToolbar.test.tsx` の `disables sort buttons while navigation is pending`（L267 付近）と `disables order toggle while navigation is pending`（L362 付近）の2テストは `disabled` 撤廃で必ず失敗する。これらを**削除し、pending 中もコントロールが `disabled === false` を保ち、ツールバーに `aria-busy` が立つことを検証するテストへ反転・改名する**（`note/list/__tests__/FilterBar.test.tsx` の pending 中 enabled 検証の作法に倣う）。
  - **S-001（統合の楽観テスト）**: `TagList.test.tsx`（`mergeMock` モック済み）に、統合成功で統合元行が即時に一覧から消えることを検証するテストを追加する。
  - `CreateTagForm` の楽観化（`onCreate` 化・空入力 early return・二重送信防止）に伴う既存テストがあれば追従させる。
- **理由:** 楽観投影は UI の正しさの要。reducer は純関数なので単体テストで固定する（`note/list/FilterBar.test.tsx` が先例）。`disabled` 撤廃は既存アサーションと正面衝突するため、テスト反転を計画段階で確定させる。

## 設計判断

- **ADR-001**: 作成フォームを残し、デザイントークン準拠 + SSOT 反映する（撤去や別ページ化はしない）。配置は `page-header` 直下・ツールバー上。
- **ADR-002**: 作成の楽観投影を `TagList` の `useOptimistic` / `reduceTags` に `add` アクションとして統合する（`CreateTagForm` 内で独立 state を持たない）。
- **ADR-003**: 統合は削除と同じ `remove` 投影で楽観化し、楽観反映時は進捗バナーを出さない（即時反映優先）。
- **ADR-004**: 並び替え / 検索は `FilterBar` パターンで「コントロール選択状態のみ楽観即時・一覧データは loader 確定」とし、クライアント側即時並び替えには踏み込まない（`createdAt` 未供給＝backend 変更がスコープ外のため）。

詳細は `.issue/607/adr.md` を参照。

## リスクと注意点

- **楽観 add の一時 id 衝突**: クライアント生成 id（`crypto.randomUUID()` など）が確定 id と重複しないこと、`key` 安定性に注意。snap back 時に確定行へ置き換わるため、transition 中だけ存在する一時 id で十分。
- **楽観 add の一時行が重複表示されないこと（S-001）**: `reduceTags` の `Tag` 型は全プロパティ必須なので `add` の型成立自体は素直（`exactOptionalPropertyTypes` の影響は実質なし）。本当の注意点は「一時 id の `key` 安定性」と「transition 終了 → baseline 復帰で楽観行が消え、loader 確定で本物行が現れる二段が一度きりで収束し、楽観行と確定行が同時表示されないこと」。テストで snap back の収束を固定する。
- **`MergeTagDialog` の親子間状態リフト**: 統合の楽観投影を親へ持ち上げる際、`TagActions` のローカル状態（`isMergeOpen` 等）と干渉しないこと。#542 ADR-004（編集状態を `TagList` へリフトしない方針）と整合を取る — 統合は「行を消す」操作なので削除と同じく親投影が妥当だが、ダイアログの開閉はローカルのまま。
- **`useActionState` 撤去の影響**: `CreateTagForm` の form `action` 連携を撤去し onClick / onSubmit 駆動へ変える際、Enter 送信・二重送信防止（楽観 add 中の連打）を担保する。
- **余白調整の実機依存**: 縦リズムはコード上の margin 値だけでなく `clamp()` ベースの token と相互作用するため、testing.md の実機確認で最終決定する。デスクトップ / モバイル両方を確認。
- **検索の uncontrolled 維持**: 検索入力を楽観 state に乗せすぎると IME 入力（日本語タグ名）が壊れる恐れ。submit 型を維持し、打鍵自体は uncontrolled のままにする（ADR-004）。
- **SSOT 反映の最小性**: デザイン HTML への追記は既存トークンのみ・ページ固有上書き無しに留める（HTML 冒頭の方針コメント遵守）。
- **楽観 add と active な検索 / ソートの相互作用**: 検索 `q` が適用中に作成すると、`q` に一致しない新規タグが楽観的に末尾追加された直後、loader 確定で一覧から消える（or 一致すればソート位置へ移動する）。これは server truth への snap back として正しい挙動だが、UX 上の「作成したのに消えた」誤解を避けるため、作成は通常「検索適用なし」の状態で行われる想定であることを前提とする。必要なら作成時に `q` をクリアする選択肢も検討（ただしスコープ最小化のため第一案は snap back 容認）。
- **`createdAt` がクライアント未供給（確認済み）**: `TagDTO`（`app/core/application/dto/tag.ts`）に `createdAt` は無く、`TagList` の `Tag` 型も `id/name/noteCount/lastUsedAt` のみ。よって `createdAt` ソートはクライアント不能で、一覧の即時クライアント並び替えは backend 変更（DTO 拡張）を伴う＝スコープ外（ADR-004 の根拠）。

## テスト方針

- `reduceTags` の `add` / `remove`（統合）/ `rename` 純関数テスト。
- 実機（`pnpm dev`）で P18 を開き、作成 / 統合 / 並び替え / 検索の即時反映、余白のデザイン一致、デスクトップ / モバイル両表示を確認（詳細は `.issue/607/testing.md`）。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

委譲用 Task ツールが当環境で利用不可のため、要件カバレッジ視点とアーキテクチャ整合性・リスク視点の2観点をプランナー自身が実施した。

**要件カバレッジ視点**:
- Issue の全要件（フォームのトークン準拠 / 余白追従 / 作成・統合・並び替え・検索の楽観化 / クライアント即時並び替えの技術検討 / SSOT 反映）が実装ステップ1〜7と ADR-001〜004 で網羅されていることを確認。
- スコープ外（統合進捗バナー = #563、backend 変更、リネーム/削除の挙動変更）が「含まれないもの」で明示され、混入していないことを確認。問題点ゼロ。

**アーキテクチャ整合性・リスク視点**:
- 楽観化が `note/list/FilterBar.tsx`（`useOptimistic`+`startTransition`、pending 中も enabled）という確立済みパターンに準拠していることを確認。`reduceTags` への `add`/`remove` 統合がリネーム/削除と同型で一貫。
- `createdAt` がクライアント未供給であることを `app/core/application/dto/tag.ts` で実コード確認し、ADR-004「クライアント即時並び替えに踏み込まない」根拠を裏付けた。
- 既存テスト（`__tests__/TagList.test.tsx` / `TagListToolbar.test.tsx`）が `createMock`/`mergeMock`/`routerNavigate` を既にモック済みで、楽観化の方向と整合することを確認（ステップ7で追従）。
- 追加リスク（楽観 add × active 検索/ソートの snap back、`createdAt` 未供給の確認）を「リスクと注意点」へ反映。問題点ゼロ。

### 2周目: 2視点並列レビュー（要件カバレッジ / アーキ・リスク）→ 修正反映

オーケストレータが2サブエージェントを並列起動して実施。両視点が **P-001** で一致、アーキ視点が **P-002** と S-001〜S-003 を追加指摘した。

**修正した点**:
- **[P-001]**（両視点）: `disabled={isPending}` 撤廃で `TagListToolbar.test.tsx` の `disables sort buttons while navigation is pending` / `disables order toggle while navigation is pending` の2テストが確実に失敗する点を、ステップ7に「削除し pending 中 enabled + `aria-busy` 検証へ反転・改名」と具体名で明記。
- **[P-002]**（アーキ視点）: 検索 uncontrolled（`key={query ?? ""}`）と楽観 `q` の `key` 再マウント干渉、かつ可視フィードバック対象が無いことを踏まえ、**検索は楽観化対象から外し `disabled` 撤廃のみ**に確定。ステップ5・ADR-004 を更新（楽観 baseline は `sort` / `order` のみ）。

**取り込んだ改善提案**:
- **[S-001]**: 統合の楽観 remove を `TagList.test.tsx`（`mergeMock` モック済み）で結線テストする旨をステップ7に追加。楽観 add の snap back 収束（重複表示なし）をリスク欄へ明確化。
- **[S-002]**: `useActionState` 撤去で消える「空入力 early return / Enter 送信 / 二重送信防止」をステップ2に明記。
- **[S-003]**: 統合のサーバー呼び出し（`useServerFn(mergeTagsFn)` / `routerInvalidate`）を `TagList.onMerge` へ移管し、`MergeTagDialog` を選択 UI + `onMerge` 呼び出しに痩せる方針をステップ4に確定（2案併記を解消）。

**見送った提案とその理由**:
- なし（指摘はすべて要件・アーキ整合の範囲内で取り込み）。

### 3周目: 両視点とも問題点ゼロで終了（2周目修正で全指摘解消）

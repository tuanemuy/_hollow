# 実装計画 — Issue #670: loader データを初期値にするフォームが invalidate 起因の再マウントで編集内容を失う（prompts / views / ingestion preview）

**Issue:** #670
**作成日:** 2026-06-13
**複雑度:** 中（Step 0 の実証結果に依存。再マウントが起きなければ小規模）

---

## ⚑ Step 0 実証結果（2026-06-13・確定）— 防御機構は不採用

実機検証（`.issue/670/step0-results.md` / adr.md ADR-003）の結論:
- **再マウント・編集内容(value)喪失はどのルートでも再現しなかった**（mount プローブ "1" のまま・value 保持・DOM ノード同一）。本 Issue・本 plan・ADR-001 が想定した「invalidate 起因の再マウントで編集内容を失う」前提は**不成立**。
- → 防御機構 (a)/(b)/(c) は**実装しない**（plan が最大リスクとした「Step 0 を飛ばした過剰設計」回避）。**本 Issue は no-repro / 影響なしとしてクローズ提案**。成果物は Step 0 実証記録のみ（コード変更なし）。
- 別症状「invalidate でフォーカスが外れる（入力内容は残る）」が実在。再マウント/state 喪失とは別原因で (a)/(b)/(c) では直せないため、**別 Issue で追跡**（ユーザー判断によりスコープ外）。

以下の「実装ステップ」以降は Step 0 が「影響あり」に倒れた場合の条件付き計画であり、実証結果により**発動しなかった**。記録として残す。

---

## 目的

#669 で修正したエディター画面と同じ「loader データ → ローカル state の seed」構造を持つフォームについて、**まず invalidate 起因の再マウントが実際に起きるかを実機（または忠実な再現）で実証**し、影響が実証された箇所のみを最小機構で堅牢化する。影響が実証されない箇所は「影響なし」として根拠を記録し対象から外す（Issue 受け入れ条件「影響なしと判明したらクローズ可」に従う）。

## 前提（#669 成果物の確認結果）

**事実:** #669 は PR #676（`f8226edb`）で origin/main にマージ済みで、その成果物（`.issue/669/`・`noteEditorSeedOnce.test.tsx`・`routerInvalidate.ts` 改修）は origin/main に実在する。
**手順（Step 0 冒頭ゲート）:** 本 Issue のブランチは **#676 を含む origin/main から切る**こと。切るまでワークツリーに `.issue/669/` は現れないため、AC-1 の前提確認の前にブランチ分岐を済ませる（coverage round-2 P-001 / arch round-2 S-001）。

以下を一次情報（マージ済みツリー）として確認した:

- `.issue/669/adr.md` ADR-003 + 末尾「実測による前提の補正（TC-009, PR #676 Round 1 N-001）」: エディタールートのルート除外は「正当な invalidate ケースが構造的に存在しない」ことを根拠にした**予防的整理（precaution）**であり、「生 invalidate が NoteEditor サブツリーを remount して state を破壊することを実測した」結果ではない。さらに **TC-009 の実測では rule 2 の生 invalidate 後も未保存編集が維持され、loader 再実行は同一インスタンスへの props 更新で済み seed-once が効いた**と記録されている。
- `.issue/669/manual-test/results/analysis.md`: TC-007 で実測されたフォーカス喪失の真因は **InlineEditor 内部の `host.replaceChildren()` による DOM 全再構築**であり、「autosave / invalidate ではない」と明記。
- `app/components/note/editor/__tests__/noteEditorSeedOnce.test.tsx`: seed-once 契約の pin テスト。冒頭コメントに「**生 `router.invalidate()` がエディターを remount する経路はカバーしない（できない）**」と明記。
- `app/components/common/routerInvalidate.ts` + `__tests__/routerInvalidate.test.ts`: `_app` とエディタールートを除外。本 Issue の対象3ルートは除外対象外。

**結論（前提の更新）**: 「invalidate → RSC ツリー差し替え → 再マウント → state 喪失」は #669 では**実証されていない命題**である。TanStack Start の RSC loader 再実行が leaf サブツリーを reconcile するか remount するかは要素の type/key 同一性次第で、自明に remount とは言えない（同型・同位置なら reconcile されうる）。よって本計画は再マウントを**断定せず、Step 0 の実証ゲートを通してから機構を確定**する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | Step 0 の再マウント実証結果が記録され、影響を受ける箇所／受けない箇所が**実測根拠**付きで確定している（mount 回数の観測・入力/フォーカス/編集モードの保持有無）。**判定の一次根拠は本番相当 invalidate の agent-browser 観測**（mount カウンタ増加）とし、ユニット再現は補助。「影響なし」判定も本番ブラウザ経路で最低1回確認する（coverage round-2 S-001 / arch round-2 S-002） | Issue 本文 Step 0 / 受け入れ条件 | Step 0 |
| AC-2 | `/_app/settings/prompts` の「分析の指示」(text) を編集中に本番相当の invalidate（UploadDialog 完了）が起きても、**Step 0 で影響ありと実証された場合に限り**入力内容とフォーカスが失われない。影響なしと実証されたら本基準は「対象外（根拠記録）」で充足 | Issue 受け入れ条件 | Step 0 → 該当ステップ |
| AC-3 | `/admin/prompts` の text / variables を編集中に invalidate が起きても、影響ありと実証された場合に限り入力内容とフォーカスが失われない | Issue 受け入れ条件 | Step 0 → 該当ステップ |
| AC-4 | `/_app/views` の inline rename 中・ViewFormDialog（編集）編集中に invalidate が起きても、影響ありと実証された場合に限り入力内容とフォーカスが失われない。**新規 ViewFormDialog（NewViewButton）は Step 0 結果に応じて対象/対象外を明記**する（coverage round-2 S-002。ADR-002 に準拠し安定 id を持たないため固定 key 共有は不可） | Issue 受け入れ条件 | Step 0 → 該当ステップ |
| AC-5 | 各フォームの「自分の保存 → invalidate → 最新値の再表示」挙動が維持される（可能な限り `editing=false` で seed 追従する宣言的不変条件で担保） | Issue 受け入れ条件 | 該当ステップ + テスト |
| AC-6 | 本番 invalidate 経路（別タブ/別操作で UploadDialog 完了）での手動/ブラウザ検証が、影響ありとした各箇所について緑である。**「影響なし」と判定した箇所も本番ブラウザ経路で最低1回確認**する（coverage round-2 S-001） | coverage S-001 / arch S-001 | Step 0 + 検証ステップ |
| AC-7 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue 受け入れ条件 | 最終ステップ |

## スコープ

### 含まれないもの（確定）
- **IngestionPreviewForm**: `preview` は `UploadDialog` の client state 由来でルート loader RSC ではなく、UploadDialog は `_app` 常駐＝invalidate 除外のため再マウントされない。変更しない。根拠は adr.md ADR-002。
- **PreviewPanel の `sample` 入力**: loader 由来ではないユーザー入力であり、IngestionPreviewForm をスコープ外にした論理と同じ理由で**スコープ外**に確定（一貫性のため text のみ対象）。arch S-002 / coverage S-002 を反映。
- **UploadDialog の invalidate 自体の変更**: 他ページの最新化のために正当。触らない。
- prompts / views のデザイン・機能変更。

### 条件付き（Step 0 の実証結果に依存）
- prompts 個人 / prompts 管理 / views（inline rename・編集ダイアログ・新規ダイアログ）への防御機構の追加は、**Step 0 で再マウント＆state 喪失が実証された箇所のみ**。全箇所で影響なしと実証されたら、本 Issue は「影響なし」としてクローズ提案する。

## 調査結果

- 関連ファイル:
  - `app/components/identity/PromptsForm/index.tsx`（`PromptRow` が `useState(override?.text ?? "")`、L139）
  - `app/components/admin/PromptsForm/index.tsx`（`PromptCard` が `useState(current.text...)`、L108-111）
  - `app/components/view/SavedViewsList/index.tsx`（inline rename `useState(view.name)` L241、行は既に `key={view.id}` L197）
  - `app/components/view/ViewFormDialog.tsx`（編集モードで約10個の state を `editView?.*` で seed、L95-123。常時マウントで `open` は可視性のみ）
  - `app/components/view/SavedViewsList/NewViewButton.tsx`（新規ダイアログ。`editView === null` で loader seed なし）
  - `app/components/ingestion/IngestionPreviewForm.tsx`（影響なし）
  - ルート: `app/routes/_app/settings/prompts.tsx`（本番 `staleTime: Infinity`、`DEV ? 0 : Infinity`、L19）, `app/routes/admin/prompts.tsx`（`staleTime: 0`）, `app/routes/_app/views/index.tsx`（`staleTime: 0`）。いずれも `renderServerComponent(...)` の RSC ペイロードを `Route.useLoaderData()` で描画。
  - `app/components/common/routerInvalidate.ts`（`_app` とエディタールートのみ除外。上記3ルートは除外対象外）。
  - `app/components/ingestion/UploadDialog.tsx`（L452, L887 で無フィルタ `routerInvalidate(router)`）。

- **staleTime の非対称性（arch S-001 を反映）**:
  - 個人 prompts は本番 `staleTime: Infinity`。invalidate 対象に入っても cache が fresh とみなされ loader が再実行されない可能性が高い（#293/#300 の AppShell `staleTime: Infinity` 維持と同型）。再実行されなければ再マウントもなく **AC-2 は本番で影響なし**になりうる。
  - 管理 prompts / views は `staleTime: 0` で、invalidate で loader が再実行される。
  - → 3ルートを一律「影響あり」とはせず、Step 0 で **staleTime 差を区別して実測観測**する（個人 prompts は本番設定 `Infinity` での挙動を観測すること。DEV の `0` での観測は本番と非等価なので分けて記録）。

- **あるべきアーキテクチャ（CLAUDE.md / #669 ADR）**:
  - invalidate は「表示系ルートの再評価」。loader が表示の source of truth であるルートは invalidate されるべき（prompts / views が該当）。ルート除外は #669 のような「loader が seed 専用」ルートにのみ正当。本 Issue の3ルートはルート除外不可（保存後の最新値再表示が受け入れ条件）。
  - フォームの編集 state は seed-once（マウント時のみ初期化）。
  - seed-once（lazy initializer）は **再レンダー** には強いが **再マウント** には無力。ただし #669 実測（ADR-003 末尾）は「invalidate が同一インスタンスへの props 更新で済み seed-once が効いた」ケースを示しており、本 Issue でも再マウントが起きない可能性が十分にある。**だからこそ Step 0 で実証してから機構を選ぶ。**

## 実装ステップ

### Step 0（ハードゲート）— 再マウントの実証

**これは推論ではなく実測で確定する必須ゲート。本ステップの結果なしに防御機構を実装してはならない。**

- **対象ファイル:** `.issue/670/plan.md`（調査結果）, `.issue/670/adr.md`（ADR-002）, 検証用の一時テスト/ブラウザ手順
- **目的:** 3フォーム（個人 prompts / 管理 prompts / views inline rename・編集ダイアログ・新規ダイアログ）それぞれを編集中に invalidate を発火させ、(a) 入力値・フォーカス・編集モードが失われるか、(b) コンポーネントが**実際に再マウントされるか**（`useEffect(()=>{...},[])` の mount カウンタ ref / `console`／test spy で mount 回数増加を観測）を判定する。
- **invalidate の再現経路（具体的に記録すること）:**
  1. **本番相当のブラウザ検証**: agent-browser で対象ルートを開き、フォーム編集中に**別タブまたは別操作で UploadDialog のアップロードを完了させ** `routerInvalidate(router)` を発火させる。UploadDialog は `_app` 常駐なので、別ルートに居ても発火する。これが本命経路。
  2. **ユニット再現**: UploadDialog 完了が呼ぶ `routerInvalidate` を忠実に再現するため、対象ルートの leaf loader 再実行 → `Route.useLoaderData()` の RSC ペイロード差し替えを模した親要素の再レンダー／差し替えを起こし、mount カウンタで remount か reconcile かを判定する。`renderServerComponent` の戻りが要素の type/key を変えるかを確認する。
  - **staleTime 差を必ず区別**: 個人 prompts は本番 `Infinity`、管理 prompts / views は `0`。それぞれの設定で別々に観測し記録する（S-001）。
- **判定と分岐:**
  - **再マウント＆state 喪失が再現する箇所のみ** → 防御機構を入れる（機構選択は下記「機構の確定」へ）。喪失する具体的な粒度（どのコンポーネントから新インスタンスになるか）を記録し、防御範囲を最小化する。
  - **再現しない箇所** → 「影響なし」として実測根拠（mount 回数が増えない／入力・フォーカスが保持される）を adr.md に記録し、対象から外す。
  - **全箇所で再現しない** → 本 Issue は影響なしとしてクローズ提案する（防御機構・新ユーティリティは不要）。
- **理由:** AC-1 / AC-6。coverage P-001・arch P-001。#669 で実証されたのは InlineEditor 内部の DOM 再構築であり、ルート除外は予防的措置。本 Issue の3フォームが invalidate で実際に再マウントするかは未実証のため、ここで断定する。

### 機構の確定（Step 0 で再マウントが実証された場合のみ）

Step 0 で再マウントが実証された箇所について、**最も単純で副作用の小さい機構**を、以下の代替を比較して選ぶ。採用方式は「実証された再マウント境界がどこか」に依存するため Step 0 結果を見てから確定する。**plan と adr の方式記述は必ず一致させる。**

- **(a) state を再マウント境界の外側にある安定コンポーネントへ引き上げる**（最も React 的・リーク無し・第一候補）: 再マウントされるのが leaf RSC サブツリーなら、編集 state（draft 値と `isEditing`/`open` の可視状態）を、再マウント境界の外＝`_app` レイアウト配下の常駐要素や、leaf より上位の安定コンポーネントへ持ち上げる。境界の外なので再マウントの影響を受けず、命令的 reset 漏れの心配もない。
- **(b) entity-id keyed な Context provider を境界外にマウント**: (a) を Context で実現する形。境界の外に provider を置き、entity id をキーに draft を保持する。
- **(c) module-scope draft store**（最終手段）: 採るなら CLAUDE.md「mutable state は単一外部リソースをカプセル化する adapter に限る」と整合させ、「単一の draft 退避リソースをカプセル化する client-only adapter」として実装する。必須対策を設計・テストで pin する:
  - **client-only 保証**: `"use client"` 境界に置き、サーバ実行で import・値積みされない（SSR/RSC のモジュールはリクエスト間共有されうるため、サーバ側にエントリが残るとユーザー間で draft が漏れる致命的リスク）。
  - **key 衝突回避**: `purpose` や `"new-view"` のような短い固定文字列はグローバル store では衝突源。名前空間を切る。
  - **確実な GC**: unmount-when-not-editing / reset / 保存成功で必ず破棄。
  - sessionStorage 退避（プロセス共有されず、リロード耐性も付く）も (c) の比較対象として検討。

**選定理由を adr.md ADR-001 に記録し、plan の本節と一致させること。**

### 可視状態（isEditing / open）の扱い（実証ベース・最小限）

`isEditing` / dialog `open` の cross-remount 退避は、**Step 0 でそれが必要（再マウントで編集 UI が消える）と実証された場合のみ**行う。安易に open を store 復元すると「invalidate のたびに勝手にダイアログが復活する」「別閲覧で固定 key を踏んで前回の開状態が復活する」新種の退行を招く。実証された場合は、可視状態も **再マウント境界の外側の安定コンポーネントが所有**する形（機構 (a)/(b)）にし、module-scope の固定文字列 key 共有は避ける。新規ダイアログの固定 key `"new-view"`（複数同時新規・タブ間で衝突）は採らない。arch P-003 を反映。

### AC-5 の宣言的担保（arch S-003）

「保存 → 最新値再表示」は命令的 reset 依存ではなく、可能なら **`editing=false` に戻れば seed 追従**という宣言的不変条件で担保する API 形状を優先する。reset 漏れ＝最新値が見えない退行を構造的に避ける。prompts は明示的 editing ボタンがないため、editing の定義（draft が seed と異なる間を editing とみなす等）を機構確定時に ADR で確定する。

### 各コンポーネントの適用（影響ありと実証された箇所のみ）

- **PromptRow（個人 prompts, AC-2）**: Step 0 で本番 `staleTime: Infinity` 下の挙動を確認したうえで、影響ありなら text のみ防御。
- **PromptCard（管理 prompts, AC-3）**: text / variables を防御（draft オブジェクト `{text, variables}`）。
- **SavedViewsRow inline rename（AC-4）**: rename 入力＋必要なら `isEditing` を防御。`key/識別子 = view.id`。
- **ViewFormDialog 編集（AC-4）**: 約10個の state を1 draft にまとめて防御。識別子 `= view.id`。
- **NewViewButton の新規ダイアログ**: 安定 id がないため固定文字列 key の共有は避け、可視性・draft は (a) の上位安定要素が所有する。

### 検証ステップ

- **対象ファイル:** 影響ありとした各コンポーネントのテスト + `pnpm typecheck && pnpm lint:fix && pnpm format`
- **変更内容:**
  - 単体: 「再マウントをまたいで編集内容・フォーカス・編集モード保持」「保存成功 → 最新値表示（できれば editing=false で seed 追従）」「複数同時編集の独立性」を pin（#669 の `noteEditorSeedOnce.test.tsx` に倣う）。テストは必ず**親コンポーネントの再マウント**を再現する（再レンダーだけでは本番の RSC 差し替えと非等価）。
  - 手動/ブラウザ（AC-6）: 各画面で編集中に**別タブから UploadDialog 完了 → invalidate** → 編集内容・フォーカス保持、保存後は最新値表示。検証手順は testing.md に落とせる形で記録（invalidate 再現経路を含む）。
- **理由:** AC-5, AC-6, AC-7。

## 設計判断

- ADR-001: ルート除外不可の制約下での防御は、**Step 0 で再マウントが実証された場合に限り**、代替 (a)（境界外への引き上げ）/ (b)（境界外 Context）/ (c)（module-scope adapter、最終手段）から最小機構を選ぶ。採用方式は実証された再マウント境界に依存。plan と方式一致。
- ADR-002: IngestionPreviewForm と PreviewPanel sample・新規ダイアログの扱い（影響なし／スコープ外）。
- 詳細は `.issue/670/adr.md`。

## リスクと注意点

- **Step 0 を飛ばして機構を作る過剰設計**: 最大のリスク。#669 実測は invalidate が必ずしも remount を起こさないことを示している。Step 0 で再マウントが観測されなければ機構は不要。
- **再マウント vs 再レンダーの取り違え**: テストは必ず親再マウントを再現する。再レンダーだけ通しても本番の RSC 差し替えで失われる。
- **module-scope store のリーク/取り違え/サーバ漏洩**: (c) を採る場合のみ。client-only・key 名前空間・確実な GC を pin。
- **可視状態の安易な store 復元による新種退行**: 「勝手にダイアログ復活」「固定 key 衝突」。可視状態退避は実証ベースで最小限、境界外所有で。
- **AC-5 の reset 漏れ**: 命令的 reset 依存を避け、editing=false で seed 追従する宣言的形を優先。

## テスト方針

- 機構（採用したもの）の単体: 再マウントまたぎ復元 / editing=false での seed 追従 / 終了時の破棄。
- 各コンポーネント: 親再マウントを挟んだ編集内容・editing 状態の保持、保存成功後の最新値表示、複数同時編集の独立性。
- 既存テスト（`ViewFormDialog.test.tsx`, `IngestionPreviewForm.test.tsx` 等）が緑のまま。
- 手動/ブラウザ検証（testing.md）: 別タブからのアップロード完了 invalidate での保持・最新値表示。staleTime 差を区別して記録。

## レビュー履歴

### 1周目: coverage / arch-risk の指摘反映

- **[P-001 両レビュアー]** 受け入れ・反映。Step 0 を「実機（または UploadDialog 完了 invalidate の忠実再現）での再マウント実証」ハードゲートに格上げ。#669 の真因は InlineEditor 内部 DOM 再構築であり、ルート除外は予防的措置、TC-009 実測では生 invalidate でも remount しなかったことを前提として明記。再マウント断定を撤回し、機構選択を Step 0 結果依存に変更。
- **[coverage P-002]** 受け入れ・反映。#669 成果物が実在することを確認し、引用先を実在ファイル（`.issue/669/adr.md` ADR-003 + 実測補正、`analysis.md`、`noteEditorSeedOnce.test.tsx`、`routerInvalidate.ts`）に更新。「成果物が存在しない」前提を解消。
- **[arch P-002 / coverage P-001]** 受け入れ・反映。plan の module-scope Map 方式と adr の seed-once+key 方式の矛盾を解消し、機構を一本化。代替 (a)/(b)/(c) を比較対象として明記、module-scope は最終手段かつ CLAUDE.md 整合（client-only adapter・key 名前空間・GC）。plan と adr の方式記述を一致させる旨を明記。
- **[arch P-003]** 受け入れ・反映。可視状態（isEditing/open）の cross-remount 退避は Step 0 で必要と実証された場合のみ、かつ境界外所有で。固定 key `"new-view"` の衝突回避を明記。
- **[coverage S-002 / arch S-002]** 受け入れ・反映。PreviewPanel `sample` 保持はスコープ外に確定（text のみ対象）。
- **[coverage S-001 / arch S-001]** 受け入れ・反映。AC-6 を追加し本番 invalidate 経路の手動/ブラウザ検証を受け入れ基準に紐づけ。staleTime 非対称性（個人 prompts=本番 Infinity / 管理・views=0）を Step 0 で区別観測する旨を明記。
- **[arch S-003]** 受け入れ・反映。AC-5 を命令的 reset 依存でなく editing=false で seed 追従する宣言的 API 形状で担保する旨を設計に反映。

### 2周目: coverage / arch-risk の指摘反映

- **[coverage P-001]** 受け入れ・反映。前提節を「事実（#669 は PR #676 でマージ済み・origin/main に実在）」と「手順（#670 ブランチは #676 を含む origin/main から切る）」に分離。事実先取りの記述を解消し、Step 0 冒頭ゲートに分岐確認を追加。
- **[coverage S-001 / arch S-002]** 受け入れ・反映。Step 0 判定の主従を AC-1 に明記（一次根拠＝本番 invalidate の agent-browser 観測、ユニット再現は補助）。AC-6 に「影響なし」判定も本番ブラウザ経路で最低1回確認する旨を追加。ユニット親 remount のみで影響なし早期クローズする誤判定を防ぐ。
- **[coverage S-002]** 受け入れ・反映。AC-4 に新規 ViewFormDialog（NewViewButton）を Step 0 結果に応じて対象/対象外明記する旨を追加。
- **[arch round-2]** 問題点ゼロ。round-1 の全指摘が適切に反映済みと確認。
- **収束:** arch-risk は問題点ゼロ。coverage の P-001 は前提記述ズレの軽微修正で反映済み、残りは改善提案2件も反映済み。2周で実質収束したためレビューループを終了する。

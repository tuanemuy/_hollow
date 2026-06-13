# 実装計画 — Issue #680: 編集中フォームが routerInvalidate でフォーカスを失う（入力値は保持／再マウントではない）

**Issue:** #680
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

編集中フォーム（`/_app/views` inline rename・`/admin/prompts`・`/_app/settings/prompts` DEV）の入力に focus した状態で `routerInvalidate(router)`（本命: AppShell 常駐 UploadDialog 完了）が発火しても、focus と caret/選択範囲が失われないようにする。入力 value は既に保持されている（#670 Step 0 で実証済み）ので、本 Issue は **focus/selection の喪失のみ**を対象とする。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 「なぜ同一 DOM ノードが RSC コミットで detach され focus が落ちるか」を React/TanStack Start RSC の挙動として特定し、根拠（#670 Step 0 実測 + 既存前例 `useRovingMenu.restoreFocusOnCommit`）を計画/ADR に記録する。実機でも修正前に focus → body を再現して特定を裏付ける | Issue 本文「まず…特定してから対処方針を決める」 | 1, 2, 7 |
| AC-2 | `/_app/views` の inline rename `<input>` に focus・caret 配置した状態で本命相当 invalidate が発火しても、focus と caret 位置が保持される | Issue 本文 | 4, 7 |
| AC-3 | `/admin/prompts` の text `<textarea>`・variables `<input type="text">` の**両フィールドそれぞれ**で、focus・caret 配置した状態で本命相当 invalidate が発火しても、focus と caret 位置が保持される | Issue 本文 | 5, 7 |
| AC-4 | `/_app/settings/prompts`（DEV, `staleTime:0`）の text `<textarea>` に focus・caret 配置した状態で本命相当 invalidate が発火しても、focus と caret 位置が保持される（同ファイルの `PreviewPanel.sample` は対象外） | Issue 本文 | 6, 7 |
| AC-5 | 上記復元は UploadDialog 由来に限らず、コミットで focus が `<body>` に落ちる invalidate 経路全般に効く（発生源非依存）。検証は views inline `<input>` を代表に raw `router.invalidate()` で確認 | Issue 本文「UploadDialog 以外の invalidate でも」 | 3, 7 |
| AC-6 | 各フォームの「自分の保存 → invalidate → 最新値再表示」既存挙動は退行しない（invalidate 経路を変えないこと） | #670 ADR-003 / AC-5 | 4, 5, 6 |
| AC-7 | 入力 value の保持は維持される（#670 で実証済みの挙動を壊さない） | #670 Step 0 | 4, 5, 6, 7 |
| AC-8 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue 慣行 | 8 |

## スコープ

### 含まれないもの
- **`identity/PromptsForm` の `PreviewPanel.sample` `<textarea>`（L362）**: settings/prompts と同一ファイルに同居する別 `<textarea>`（`useState("")`・ユーザーがプレビュー用に入力する loader 非由来のテキスト）。#680 が実機で focus 喪失を観測した3箇所＝loader 表示系フォーム入力に含まれず、#670 ADR-002 でもスコープ外整理済み。本フックは配線しない（誤配線防止のため明示）。
- **`ViewFormDialog` / `IngestionPreviewForm` の focus 保持**: これらは `<Dialog>`（`app/components/common/Dialog.tsx`）の focus-trap/restore 文脈内でレンダーされ、#680 が実機で focus 喪失を観測した3箇所（views inline / admin prompts / settings prompts）には含まれない。#670 ADR-002 でも IngestionPreviewForm は invalidate 源（UploadDialog の client state 由来でルート loader 非依存）で再マウントされないと整理済み。Dialog は別の描画構造（portal + focus-trap）なので本フックの対象外とし、必要なら別途観測してからとする。
- **入力 value の再マウント耐性**: #670 で no-repro 確定済み。守る state も防ぐ remount も無いため対象外（#670 ADR-003）。
- **invalidate 経路の抑制 / ルート除外**: 最新値再表示（AC-6）を壊すため採らない（#670 ADR-003 で確定）。
- **#669 の InlineEditor 内部 DOM 再構築によるフォーカス喪失**: 別経路で #669 にて対処済み（`.issue/669/manual-test/results/analysis.md`）。本 Issue とは無関係。
- **描画構造の見直し（RSC コミットで subtree を detach させない）**: ADR-001 でフォールバック残課題として記録するが、第一選択は復元フック。フックで解決すれば実施しない。

## 調査結果

- **関連ファイル:**
  - `app/components/common/routerInvalidate.ts` — `routerInvalidate` ラッパー。`_app` とエディタールートを除外。対象3ルートはエディタールート非該当のため通常 invalidate される。
  - `app/components/ingestion/UploadDialog.tsx:452` — 本命経路。複数ファイル upload 完了後 `await routerInvalidate(router)`。AppShell 常駐（`AppShellFrame.tsx:37` の `UploadDialogMount`）。
  - `app/routes/_app/views/index.tsx` / `app/routes/admin/prompts.tsx` / `app/routes/_app/settings/prompts.tsx` — いずれも `component` が `Route.useLoaderData()`（`renderServerComponent(...)` の RSC ペイロード）を返す。`views`/`admin` は `staleTime: 0`、`settings/prompts` は `DEV ? 0 : Infinity`。
  - `app/components/view/SavedViewsList/index.tsx`（`"use client"`）— inline rename の `<input value={draft}>`（L341 付近、`autoFocus` 付き）。`SavedViewRow` 内。
  - `app/components/admin/PromptsForm/index.tsx` — 1カード2フィールド構成: text は `<textarea>`（L189）、variables は `<input type="text">`（L211、カンマ区切りプレースホルダ）。いずれも `useState` seed。新規フックは `<input>`/`<textarea>` 双方対応なので両フィールドに同一フックを配線する。
  - `app/components/identity/PromptsForm/index.tsx` — text は `<textarea>`（L224、`useState(override?.text ?? "")`）。**同ファイルの `PreviewPanel.sample`（L362 の別 `<textarea>`、`useState("")`・ユーザー入力・loader 非由来）は配線対象外**（#680 が実機で focus 喪失を観測した3箇所＝loader 表示系フォーム入力に含まれない／#670 ADR-002 でスコープ外整理済み）。
  - `app/components/common/useRovingMenu.ts` — **本 Issue の解法の前例**。`restoreFocusOnCommit`（L93-121）が「RSC コミットで focus 中ノードが swap され focus が `<body>` に落ちる」同一機序を明文化し、コミット後 `activeElement === document.body` ガード + refocus で解決済み。`app/components/note/list/FilterBar.tsx:496` が consumer。
- **あるべきアーキテクチャ:** CLAUDE.md フロントエンド規約 — TanStack Start / React 19 RSC、cross-cutting concern はフック/ポートに集約、`data-*` state styles、ステートレス志向。focus 復元はブラウザ副作用なので state lift（#670 の (a)/(b)/(c)）ではなくコミット後復元が正攻法（ADR-001）。共通フックは `app/components/common/` に既存の `useRovingMenu` / `routerInvalidate` と並べて配置する。
- **既存実装の状態:** focus 喪失は main 由来の既存挙動（#670 Step 0 で実機観測）。3フォームに復元機構は無い。`useRovingMenu` が roving menu 向けに同型解法を持つが、フォーム入力（selection 復元が必要）には流用できないため一般化が要る。
- **依存関係:** 新規フックを `app/components/common/` に追加し、3フォームの client component が consume する。invalidate 経路（UploadDialog / routerInvalidate）には一切触れない（発生源非依存で復元するため）。

## 設計

レイヤーは全てフロントエンド（presentation 配下のクライアントコンポーネント + 共通フック）。ドメイン/ユースケース/アダプター/永続化への影響は **なし**（focus はブラウザ副作用でビジネスロジックではない）。

### ドメインモデルへの影響
なし。focus/selection はブラウザの一時的副作用で、ドメイン概念ではない。

### ユースケース / アプリケーションロジック
なし。サーバ関数・loader・invalidate のセマンティクスは一切変更しない（AC-6 退行防止のため意図的に不変）。

### アダプター / 永続化 / 外部連携
なし。

- 新規共通フック `useRestoreFieldFocusOnCommit`（`app/components/common/`）を追加。`HTMLInputElement | HTMLTextAreaElement` の ref を受け取り、`<input>`・`<textarea>` 双方に対応する。
- **caret/selection スナップショットを「focus を失う前に継続保持」する設計（P-002 の核心）**: invalidate コミット後に走る `useEffect` の時点では既に focus が `<body>` に落ちており、そこから `activeElement` の selection を読もうとしても遅い（退避ソースが空になる）。よって focus 中は常に最新の selection を ref へスナップショットし続け、復元時はその保持済みスナップショットを使う。
  - 当該要素が focus を持っている間、`onSelect` / `onKeyUp` / `onMouseUp` / `onInput` 等のユーザー操作イベントで `selectionStart` / `selectionEnd` / `selectionDirection` を ref に随時記録する。さらに **`focusout`/`blur` 直前の最終退避を必須**とする（focus を失う直前の最後の状態を必ず1回退避し、イベント駆動退避の捕捉漏れの保険とする）。これにより「コミットで focus が落ちる瞬間」より前のスナップショットが常に手元にある。
  - **スナップショット未取得時のフォールバック（arch-risk S-001）**: `autoFocus` で開いた直後に1文字も操作せず invalidate が重なる等で、どのイベントも発火せずスナップショットが初期値（null）のままになりうる。この場合は caret を末尾/先頭にジャンプさせず、**focus のみ復元し `setSelectionRange` は呼ばない**にフォールバックする。スナップショットが無い状態で caret を強制設定しないことをフックの仕様とする。
  - 復元は毎コミット後の `useEffect`（dep なし）で「`activeElement === document.body` かつ直前に当該要素が focus を持っていた」ときだけ、保持済みスナップショットを使って `el.focus({ preventScroll: true })` + `el.setSelectionRange(start, end, direction)` を行う（スナップショット無しなら focus のみ）。退避と復元を「同一 effect 内で同時に」やらない点が `useRovingMenu` との差（roving menu は selection 概念がなく index だけで足りた）。
- 3フォームの該当入力に ref とイベントハンドラを配線し、フックを呼ぶ。invalidate 源（UploadDialog）側は変更しない（ADR-001: フックは focus を失う当事者側に置く）。

## 実装ステップ

依存方向の順（共通フック → 各 consumer → 検証）に並べる。

### 1. 原因の最終確定（コードリーディング）と方針記録

- **対象ファイル:** `.issue/680/adr.md`（作成済み）、本 plan
- **変更内容:** #670 Step 0 実測（focus → body、再マウント無し、DOM ノード同一）と `useRovingMenu.restoreFocusOnCommit` の既存コメント（同一機序を明文化）を突き合わせ、「RSC ペイロードコミット時に focus 中 subtree が一時 detach→再 attach され browser が focus を落とす」を AC-1 の特定結果として確定。ADR-001 に記録済み。
- **理由:** Issue が「まず原因を特定してから対処方針を決める」と要求。前例があるため確度高だが、復元タイミングの不確実性は ADR-003 で実機検証に委ねる。

### 2. 共通フック `useRestoreFieldFocusOnCommit` の新設

- **対象ファイル:** `app/components/common/useRestoreFieldFocusOnCommit.ts`（新規、`"use client"`）
- **変更内容:**
  - `HTMLInputElement | HTMLTextAreaElement` の ref を受け取る（または ref を返す）フックを実装。`<input>`・`<textarea>` 双方対応。
  - **selection スナップショットの継続保持（P-002 核心）**: 当該要素が focus を持っている間、`onSelect` / `onKeyUp` / `onMouseUp` / `onInput` などのユーザー操作イベントで `selectionStart` / `selectionEnd` / `selectionDirection` を ref へ随時記録する。focus を失う前に最新スナップショットを手元に保持しておくのが目的（コミット後 effect の時点では既に `activeElement` が body に落ちており、そこから selection を読むのは遅いため）。**`focusout`/`blur` 直前の最終退避は必須**とし（focus を失う直前の最後の状態を必ず1回退避し、捕捉漏れの保険にする）、併用ではなく仕様に組み込む（arch-risk S-001）。「直前まで当該要素が focus を持っていたか」のフラグも同経路で更新する。
  - **スナップショット未取得時のフォールバック（arch-risk S-001）**: `autoFocus` で開いた直後に未操作のまま invalidate が重なる等、どのイベントも発火せずスナップショットが初期値（null）のままになりうるケースでは、caret を末尾/先頭にジャンプさせず **focus のみ復元し `setSelectionRange` を呼ばない**。スナップショットが無いとき caret を強制設定しないことをフックの仕様として明記する。
  - 復元は毎コミット後に走る `useEffect`（依存配列なし）で: `activeElement === document.body` かつ「直前まで当該要素が focus を持っていた」場合のみ、保持済みスナップショットを使って `el.focus({ preventScroll: true })` + `el.setSelectionRange(start, end, direction)` で復元する（スナップショット無しなら focus のみ）。退避と復元を同一 effect 内に同居させない（退避はイベント駆動、復元はコミット後 effect）。
  - selection は input/textarea のみが持つので型で絞り、`el.isConnected` を確認してから操作する。
  - **IME（composition）ガード**: composition 中（`compositionstart`〜`compositionend`）は `setSelectionRange` で変換セッションを破壊しうるため、composition 中は復元を抑制する（`compositionend` まで保留、または早期 return で復元スキップ）。方針はステップ2の設計時点で確定する（S-003）。
  - library-level JSDoc に WHY を記述する: RSC コミットで focus 中 subtree が detach され focus が `<body>` に落ちる／`useRovingMenu.restoreFocusOnCommit` と同機序だが selection 復元を追加／`preventScroll: true` の根拠（復元がユーザースクロールと競合してリストが飛ぶのを防ぐ。`useRovingMenu` L116-120 の前例を引き継ぐ）／clamped index の知見（roving menu 固有だがコミットで対象集合が変わりうる前提を共有）。
- **理由:** ADR-002。focus 復元を1箇所に集約し3フォームで再利用。`useRovingMenu` の前例パターン（コミット後 `activeElement === body` ガード + refocus）を text field 向けに一般化しつつ、selection スナップショットの継続保持を追加する。

### 3. フックの単体テスト

- **対象ファイル:** `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx`（新規）
- **変更内容:**
  - `activeElement === document.body` かつ直前 focus ありで再レンダー → focus と、**事前にイベントで記録した selection スナップショット**が復元される。
  - ユーザーが別要素へ focus を移した場合（`activeElement` が別要素）→ 復元しない（focus を奪わない）。
  - 当該要素がそもそも focus を持っていなかった場合 → 復元しない。
  - `el.isConnected === false` の場合 → 何もしない（クラッシュしない）。
  - **スナップショット未取得（操作前に invalidate）の場合 → focus のみ復元し `setSelectionRange` を呼ばない**（arch-risk S-001 フォールバック）。
  - window blur（タブ切替）相当: `activeElement` が当該要素のまま（body にならない）ケース → 復元しない（`useRovingMenu` L101-103 と同じガード挙動。jsdom では忠実再現困難なので可能な範囲で pin、限界は ADR に記録）。
- **理由:** AC-5 の発生源非依存と「focus を奪わない」ガードをユニットで pin。jsdom では RSC コミットの detach は忠実再現できないため、統合挙動はステップ7の実機で見る（ADR-003）。

### 4. `/_app/views` inline rename への適用

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:** `SavedViewRow` の inline rename `<input>`（`value={draft}`、L360）に ref と selection 記録用イベントハンドラ（`onSelect`/`onKeyUp`/`onMouseUp` 等）を付け、`useRestoreFieldFocusOnCommit` を呼ぶ。既存の `autoFocus`（オープン時の初期 focus）はそのまま維持。`onChange`/value/invalidate ロジックは変更しない。
- **理由:** AC-2。focus を失う当事者側にフックを置く（ADR-001）。

### 5. `/admin/prompts` への適用

- **対象ファイル:** `app/components/admin/PromptsForm/index.tsx`
- **変更内容:** `PromptCard` の text `<textarea>`（L189）と variables `<input type="text">`（L211）の**2フィールドそれぞれ**に ref と selection 記録用イベントハンドラを付け、`useRestoreFieldFocusOnCommit` を呼ぶ（フックは `<input>`/`<textarea>` 双方対応）。`useState` seed・onChange・save/reset・invalidate は変更しない。
- **理由:** AC-3（text・variables 両フィールドで保持）。

### 6. `/_app/settings/prompts` への適用

- **対象ファイル:** `app/components/identity/PromptsForm/index.tsx`
- **変更内容:** text `<textarea>`（L224）にのみ ref と selection 記録用イベントハンドラを付け、`useRestoreFieldFocusOnCommit` を呼ぶ。**同ファイルの `PreviewPanel.sample` `<textarea>`（L362）には配線しない**（スコープ外）。本番は `staleTime: Infinity` で loader 再実行されず実害は無いが、フックは無害（focus を持っていなければ何もしない）なので DEV/本番一律で適用してよい。
- **理由:** AC-4。3フォーム横断で一貫した防御。

### 7. 実機での原因確定 + 復元挙動の再検証（必須ゲート）

- **対象ファイル:** 検証のみ（`.issue/680/testing.md` に手順記録、必要なら一時プローブ）
- **変更内容:** #670 Step 0 と同手法で `pnpm dev`（空きポート）+ agent-browser + local D1（`seed:dev-admin`）。各フォーム入力に focus + caret 配置 → `window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })`（本命 `routerInvalidate` を忠実再現、focus を動かさず eval 発火）→ focus と caret 位置の保持を観測。
  - 修正前（フック無し）で focus → body / caret 喪失を再現（AC-1 の実機確証）。
  - 修正後（フック有り）で focus と caret 位置が保持されることを3フォームで確認（AC-2/3/4）。admin は text `<textarea>`・variables `<input>` の**両フィールド**で個別に確認する（片方だけの取りこぼし防止）。
  - **caret スナップショットが復元ソースとして実際に保持されたかを観測（S-001）**: 「復元は走ったが caret は退避できておらず末尾に飛んだ」ケースを成功と誤判定しないよう、退避値の有無・復元後の `selectionStart`/`selectionEnd` を before/after で実測し testing.md に記録する（#670 Step 0 の観測精度に倣う）。
  - UploadDialog 以外（raw `router.invalidate()`）でも復元が効くことを、**views inline `<input>` を代表**に1ケース確認（AC-5）。
  - **文中 caret での invalidate（arch-risk S-002）**: タイピング途中で caret を文中（末尾以外）に置いた状態で invalidate を発火し、caret が打鍵位置に留まり末尾へ飛ばないことを1ケース確認する（`setSelectionRange` の clamp が reconcile 後の最新 value と整合していることの裏取り）。
  - 自分の保存 → invalidate → 最新値再表示が維持されることを `/_app/views`（最も配線が単純な inline input）で確認（AC-6）、入力 value 保持を確認（AC-7）。value 保持は views を代表に確認するが、**admin（onChange と新規イベントハンドラが同居する新規配線箇所）でも、追加したハンドラが既存 onChange と干渉せず value が保持されることを軽く確認**する（coverage S-001）。
  - IME 変換中に invalidate が重なった場合に未確定文字が壊れないことを軽く確認（S-003 のガードが効いているか）。
  - **フォールバック発火条件（arch-risk S-003）**: 実機ゲートの判定を主観に流さないため、観測値で一意化する。3フォームのいずれかで (a)「復元後に focus が当該要素へ戻らない」、または (b)「focus は戻るが、スナップショットが存在したのに `setSelectionRange` 後の `selectionStart` が退避値と一致しない」のいずれかが1つでも起きたら、ADR-001 フォールバック（描画構造見直し）を起票する。S-001 で追加した before/after 実測（退避値の有無・復元後 selectionStart/End）をこの閾値判定に流用する。
- **理由:** ADR-003。コミット後復元が detach サイクルに対し確実に後に走るかはコードだけで断定できないため、実機ゲートで担保。万一フックで復元しきれなければ上記の観測値条件で ADR-001 フォールバック（描画構造見直し）を起票。

### 8. 品質ゲート

- **対象ファイル:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。一時プローブ（あれば）を削除。
- **理由:** AC-8。

## 設計判断

- **復元 vs 描画構造見直し:** 復元フックを採用（ADR-001）。framework 挙動に踏み込まず、既存前例 `useRovingMenu.restoreFocusOnCommit` と同型。描画構造見直しはフォールバック残課題。
- **フックの置き場所:** invalidate トリガー（UploadDialog）側ではなく focus を失う当事者（各フォーム）側（ADR-001）。コミットは全コンポーネントに届くため発生源非依存で局所復元でき、「トリガーが遠い」問題を回避。
- **共通フック化:** 3フォーム + 将来分のために `app/components/common/useRestoreFieldFocusOnCommit` に切り出し（ADR-002）。`useRovingMenu` と異なり selection（caret）も復元する。
- 詳細は `.issue/680/adr.md` を参照。

## リスクと注意点

- **復元タイミングの不確実性:** コミット後 `useEffect` が RSC の detach→再 attach サイクルに対し確実に後に走るかはコードだけで断定不可。`useRovingMenu` の実働前例で確度は高いが、ステップ7の実機検証で確定する（解決しなければ ADR-001 フォールバックへ）。
- **focus を意図せず奪うリスク:** ユーザーが invalidate と同時に focus を意図的に外した場合、`activeElement === body` 条件にたまたま合致すると復元が走りうる。`<body>` 限定 + 直前 focus ガードで実害は小さい（別要素へ移れば activeElement はその要素で復元されない）が、検証で確認する。
- **Dialog 系（ViewFormDialog / IngestionPreviewForm）:** 本 Issue ではスコープ外。Dialog の focus-trap が RSC コミットに対し focus を保持するかは別途観測が必要（必要時に別 Issue）。
- **selection 復元と IME（S-003 で格上げ）:** 日本語入力が主言語の本プロジェクトでは、IME 変換中（`compositionstart`〜`compositionend`）に `focus()` + `setSelectionRange()` を呼ぶと変換セッションが中断され未確定文字が確定/消失する実害があり得る。設計段階（ステップ2）で composition 中は復元を抑制するガードを必須検討項目とし、「IME 中は復元しない（早期 return）か、`compositionend` まで保留して復元するか」を確定する。実機（ステップ7）でも IME 重畳ケースを確認する。
- **テスト環境の限界:** jsdom では RSC コミットの detach を忠実再現できないため、ユニットは復元ロジック単体に留め、統合挙動は実機（ステップ7）で担保する。

## テスト方針

- **ユニット**（`pnpm test:unit`）: `useRestoreFieldFocusOnCommit` の復元/非復元分岐（ステップ3）。`activeElement === body` + 直前 focus ありで復元、別要素 focus / 未 focus / 切断ノードで非復元。
- **実機/ブラウザ**（ステップ7、`.issue/680/testing.md`）: #670 Step 0 同手法で3フォーム × 本命相当 invalidate の focus + caret 保持、raw invalidate での発生源非依存、最新値再表示・value 保持の非退行。修正前で症状を再現してから修正後で解消を確認（before/after）。
- **品質ゲート:** `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目

**修正した点**:
- arch-risk [P-001]: `/admin/prompts` のフィールド型誤認を実コードで確認の上修正。実体は text=`<textarea>`（`admin/PromptsForm/index.tsx` L189）、variables=`<input type="text">`（L211）の2フィールド構成。調査結果・AC-3・ステップ5を「textarea + input の2フィールド」に訂正し、新規フックが `HTMLInputElement | HTMLTextAreaElement` 双方対応である点を計画各所に明記。
- arch-risk [P-002]（核心の設計確定）: invalidate コミット後の `useEffect` 時点では既に focus が body に落ちており、そこから selection を読むのは遅い、という退避タイミングのリスクを解消する設計を確定。focus 中は `onSelect`/`onKeyUp`/`onMouseUp`/`onInput` 等で selection を ref へ継続スナップショットし、復元時はその保持済みスナップショットを使う方式（退避=イベント駆動／復元=コミット後 effect で分離）に変更。設計セクション・ステップ2に反映。`useRovingMenu` は selection 概念がなく index 保持で足りた点との差も明記。
- coverage [P-001]: settings/prompts と同一ファイルの別 `<textarea>`（`identity/PromptsForm` L362 の `PreviewPanel.sample`、loader 非由来のユーザー入力）を明示的にスコープ外と記載。調査結果・スコープ「含まれないもの」・ステップ6・AC-4 に配線対象外を明記し誤配線を防止。

**取り込んだ改善提案**:
- coverage [S-001]: AC-3 の検証単位を admin の text・variables 両フィールドに明示。ステップ7でも両フィールド個別確認を記載。
- coverage [S-002]: AC-5 の raw invalidate 検証を views inline `<input>` を代表に行うと指定。AC-6 確認フォームも views と明記。
- coverage [S-003]: AC-1 の対応ステップにステップ7（実機 before での focus 喪失再現）を追加。
- arch-risk [S-001]: ステップ7に「caret スナップショットが復元ソースとして実際に保持されたか」を before/after で実測する観測項目を追加。
- arch-risk [S-002]: `preventScroll: true` の WHY と clamped index の知見をフック JSDoc 根拠として引き継ぐ旨をステップ2・ADR-002 に記載。
- arch-risk [S-003]: IME（composition）中の `setSelectionRange` リスクを「軽く確認」から設計段階の必須検討項目に格上げ。composition 中は復元抑制（早期 return か保留）をステップ2で確定する方針を明記。
- arch-risk [S-004]: window blur（タブ切替）時に `activeElement` が要素のまま body にならないケースのガード扱いを ADR-001 Consequences に明記、ステップ3のユニットにも追加。

**見送った提案とその理由**:
- なし（指摘・提案をすべて取り込み）。

### 2周目

両視点とも問題点ゼロ。改善提案4件を反映して終了。

**取り込んだ改善提案**:
- coverage [S-001]: AC-7 value 保持の検証を views 代表に加え、admin（onChange と新規イベントハンドラが同居する新規配線箇所）でも軽く確認する旨をステップ7に追記。
- arch-risk [S-001]: イベント駆動退避の捕捉漏れ（フォーカス直後・未操作で invalidate）対処を明文化。スナップショット未取得時は focus のみ復元（`setSelectionRange` しない）にフォールバック、`focusout`/`blur` 直前の最終退避を必須に格上げ。設計セクション・ステップ2・ステップ3ユニット・ADR-001/002 に反映。
- arch-risk [S-002]: ステップ7に「文中 caret で invalidate しても末尾に飛ばない（`setSelectionRange` の clamp が value と整合）」検証ケースを1件追加。
- arch-risk [S-003]: ステップ7の実機ゲートのフォールバック発火条件を観測値（focus が戻らない／スナップショット有なのに selectionStart 不一致）で一意化し、ADR-001（ADR-003）のフォールバック遷移を主観に流さない旨を記載。

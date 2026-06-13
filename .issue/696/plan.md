# 実装計画 — Issue #696: ノート編集画面に WYSIWYG モードを追加（切り替え時に装飾消失の警告ダイアログ）

**Issue:** #696
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ノート編集画面（`mode="edit"`）にも WYSIWYG モードのタブを追加し、既存 HTML に WYSIWYG 非対応タグが含まれる場合は切り替え操作の時点で警告ダイアログを表示して明示的な同意を得てから切り替える。新規作成画面の挙動は変えない。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 編集画面（`mode="edit"`）のモード切り替えに「WYSIWYG」タブが表示され、押すと WYSIWYG モードに切り替えられる | Issue 本文「やりたいこと 1」 | 2, 3 |
| AC-2 | 現在のコンテンツ HTML に WYSIWYG 非対応タグが含まれる場合、WYSIWYG への切り替え前に警告ダイアログが表示され、同意するまで切り替わらない | Issue 本文「やりたいこと 2/3」「受け入れ条件」 | 1, 3 |
| AC-3 | 非対応タグが無い場合は警告ダイアログ無しでそのまま WYSIWYG へ切り替わる | Issue 本文「受け入れ条件」 | 3 |
| AC-4 | ダイアログでキャンセルした場合、元のモード・コンテンツが維持される（装飾が破壊されない） | Issue 本文「受け入れ条件」 | 3 |
| AC-5 | 警告ダイアログで失われる要素（タグ名）が一覧で確認できる | Issue 本文「受け入れ条件」 | 1, 3 |
| AC-6 | 新規作成画面（`mode="new"`）のタブ構成・切り替え挙動は変わらない。装飾消失ゲートは `surface === "edit"` 限定で、新規作成画面では HTML タブで非対応タグを入力してから WYSIWYG へ切り替えても**事前ダイアログを出さず**（従来どおりペイン内バナーのみが警告を担う） | Issue 本文「受け入れ条件」 | 2, 3 |
| AC-7 | 未保存 + 非対応タグの両方がある場合、`window.confirm`（未保存）→ `ConfirmDialog`（装飾）の順で発火し、装飾喪失について二重に同意を求めない（`wysiwygUnsupportedAck` 併発でペイン内バナーが再同意を要求しない） | Issue 本文「実装方針（案）」 | 3 |
| AC-8 | WYSIWYG への切り替え自体は `contentHtml` を変更せず、既存の in-flight `saveDraft` cancel テストが green のまま（自動保存と齟齬が出ない） | Issue 本文「実装方針（案）」 | 3, 4 |

## スコープ

### 含まれないもの

- 非対応タグを WYSIWYG に**保持**する仕組み（TipTap スキーマ拡張・カスタムノード）。本 Issue は「失う前に同意を得る」ことが目的であり、装飾の保全は対象外。
- `mode="edit"` の初期モードを WYSIWYG に変える変更。初期モードは現状どおり `inline` を維持する（仕様 C2 / Issue #233 ADR-001）。
- 新規作成画面（`mode="new"`）の UI・挙動変更（AC-6 で「変えない」ことを保証するのみ）。
- WysiwygEditor 内の既存「非対応タグ警告バナー」自体の撤去・再設計。挙動の整合（後述 ADR-002）以外は触らない。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/NoteEditor.tsx` — オーケストレーター。`onModeChange`（現状 `window.confirm` で未保存確認）、`surface` の決定、各モードペインのレンダリングを持つ。本 Issue の主変更点。
  - `app/components/note/editor/EditorModeSwitch.tsx` — 純粋なタブコントロール。`surface` で表示タブを出し分け（`TABS_NEW` / `TABS_EDIT`）。`TABS_EDIT` に `wysiwyg` を追加する。
  - `app/components/note/editor/editorState.ts` — React 非依存の reducer。`EditorMode` に `wysiwyg` は既にある。`setMode` は任意モードを受け付ける。状態追加が必要かはここで判断（後述「設計」）。
  - `app/components/note/editor/WysiwygEditor.tsx` — TipTap ペイン。`onCreate` で `detectUnsupportedTags(value)` を実行し、`onUnsupportedTagsDetected` で reducer に latch する既存の「ペイン内警告バナー」を持つ。
  - `app/components/note/editor/InlineEditor.tsx` — 編集画面の既定ペイン。非対応タグを含む構造を保全。本 Issue では変更しない。
  - `app/components/note/editor/wysiwygUnsupportedTags.ts` — `WYSIWYG_SUPPORTED_TAGS` / `detectUnsupportedTags()`。SSR/Worker でも動く純関数。**切り替え前判定にそのまま再利用する**。
  - `app/components/common/ConfirmDialog.tsx` — 既存の確認ダイアログ（`role="alertdialog"`）。**注意**: 現状の全呼び出し元は破壊的操作専用で、確認ボタンは danger パレット固定、`subject` を渡すと「削除対象」ラベル＋`Trash2` アイコンが**ハードコード**で出る。本 Issue の「装飾消失警告」は破壊的操作ではないため、`subject` は使わず `description` に失われる要素一覧を構造的に描画する（ADR-001）。
- あるべきアーキテクチャ:
  - これはフロントエンドのみの変更。ドメイン / ユースケース / アダプターには影響しない。
  - `spec/pages/index.md` P12 は「WYSIWYG モード（新規 + 既存）」と明記しており、編集画面への WYSIWYG 追加は**仕様が元々想定していた姿**。本 Issue は新規作成限定だった暫定状態（Issue #233 ADR-001 で `wysiwyg` を new 専用にしていた）を仕様に合わせて埋める。
  - styling は Tailwind utility-first、`data-*` 属性 + `data-[name]:` variant、tokens 経由（`warning` / `warning-surface` 等は token 化済み）。新規 CSS は書かない。
  - reducer はピュアで vitest で全遷移を検証可能に保つ。orchestrator はビュー結線のみ。状態は editorState に置く。
- 既存実装の状態:
  - `EditorMode` 型・`setMode` reducer・`WysiwygEditor` は既に WYSIWYG を完全サポートしており、`mode="edit"` で `state.mode === "wysiwyg"` になればそのままペインがレンダリングされる（`NoteEditor.tsx` の `state.mode === "wysiwyg"` 分岐は surface 非依存）。**つまりレンダリング側は追加実装ほぼ不要**で、欠けているのは「タブの提示」と「切り替え前の同意ゲート」のみ。これは仕様（あるべき姿）と一致しており、乖離の補修ではなく機能の解禁。
  - 既存の未保存確認は `window.confirm`。本 Issue では「装飾消失警告」を `ConfirmDialog` で出す。両者の関係は ADR-002 で整理（順序を確定、二重ダイアログを回避）。
- 依存関係:
  - `EditorModeSwitch` は `NoteEditor` からのみ使用。タブ追加の影響は閉じている。
  - `noteEditorModeChange.test.tsx`（既存）が `onModeChange` の confirm 条件を `tabByLabel("HTML")` 経由で pin している。WYSIWYG タブ追加・ダイアログ導入で既存テストが壊れないことを確認し、必要なら WYSIWYG 経路のケースを追加する。

## 設計

### ドメインモデルへの影響

なし。フロントエンドのコンポーネント / クライアント状態のみの変更で、エンティティ・値オブジェクト・ポートに影響しない。

### ユースケース / アプリケーションロジック

なし。`saveNote` / `saveNoteDraft` などの既存サーバー関数はそのまま使う。送信ペイロード（`contentHtml`）の意味も変わらない。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

変更は 3 コンポーネント + 1 reducer に閉じる。

1. **`EditorModeSwitch`**: `TABS_EDIT` に `{ mode: "wysiwyg", label: "WYSIWYG" }` を追加する。タブ位置・ラベルは ADR-003 で確定（`ビジュアル`(inline) と並べる）。JSDoc の「`wysiwyg` is reserved for the new-note surface」記述を実態に合わせて更新する。

2. **切り替え前ゲートの状態管理（`NoteEditor` ローカル state）**: 「WYSIWYG への切り替え保留」を表す状態を `NoteEditor` の `useState` で持つ（`pendingWysiwygSwitch: { lostTags: readonly string[] } | null` など）。
   - reducer（editorState）には**追加しない**。理由: このゲートはビュー固有の一過性 UI 状態（ダイアログの開閉と保留中の遷移）であり、保存対象でも遷移グラフの一部でもない。reducer はモデル状態（content / mode / autosave / dirty）に限定するという既存方針（editorState 冒頭 JSDoc）に従う。`pendingDirectoryName` のような「保存に絡む保留」とは性質が異なるため reducer ではなく orchestrator の `useState` が適切（ADR-002）。

3. **`NoteEditor.onModeChange` の分岐拡張**:
   - 既存の「未保存確認（`window.confirm`）→ `abortInFlight` → `dispatch(setMode)`」の順序は維持する。
   - `surface === "edit" && nextMode === "wysiwyg"` のときのみ、未保存確認を通過した**後**に `detectUnsupportedTags(stateRef.current.contentHtml)` を実行する。装飾消失ゲートは編集画面限定とし、新規作成画面（`surface === "new"`）は従来どおりゲートを通さない（AC-6 厳守、ADR-005）。判定対象は「最後にコミットされた `state.contentHtml`（= `stateRef.current.contentHtml`）」であり、InlineEditor の `onChange` debounce（`ONCHANGE_DEBOUNCE_MS = 50`）が未フラッシュの分は含まれ得ない。`blur()`（focusout）は emit を同期フラッシュしないため、blur で stateRef の鮮度を担保することはできない（P-001 参照）。非対応タグ集合は通常のテキスト編集では変化しないため、debounce 未フラッシュによる判定ズレは実用上無視できると割り切る。InlineEditor への同期 flush 追加はスコープ外。なお `detectUnsupportedTags` はサニタイズ済み HTML 前提（regex ベースで `<script>` 等を素通し）であり、「HTML タブで生入力した直後に WYSIWYG へ切替」というパスでは未サニタイズ HTML が判定対象になりうるが、実害は警告精度のみ（保存時にサーバーで再サニタイズされるため XSS にはならない）。
     - 非対応タグが 0 件: そのまま `dispatch(setMode "wysiwyg")`（AC-3）。
     - 非対応タグが 1 件以上: `setMode` を**まだ dispatch せず**、`pendingWysiwygSwitch` に lostTags をセットして `ConfirmDialog` を開く（AC-2）。実際の `setMode` は確認ダイアログの `onConfirm` で行う。
   - 確認ダイアログの `onConfirm`: `dispatch(setMode "wysiwyg")` し、保留状態をクリアする。WysiwygEditor 側の重複警告を避けるため、切り替え直後に `dispatch({ type: "wysiwygUnsupportedAck" })` を併せて発行する（ADR-002：ペイン内バナーで二重に同意させない）。
   - 確認ダイアログの `onClose`（キャンセル）: 保留状態をクリアするだけで `setMode` しない → 元のモード・コンテンツを維持（AC-4）。

4. **`ConfirmDialog` の利用**:
   - `title`: 「WYSIWYG モードに切り替えますか？」
   - `description`: 「次の要素は WYSIWYG モードでは保持されません」+ `lostTags` を `<code>{`<${tag}>`}</code>` のリストで構造的に提示（AC-5）。`WysiwygEditor` の既存バナーと同じ描画パターン（`<code>` 連結）を踏襲。
   - `confirmLabel`: 「切り替える」。
   - `subject` は**使わない**（「削除対象」ラベルが不適切なため）。`confirmIcon` も付けない。
   - confirm ボタンが danger 固定である点は ADR-001 で許容（「失われる」操作なので破壊的トーンは妥当）。

5. **自動保存との整合**: WYSIWYG 切り替え自体は `setMode` のみで `contentHtml` を書き換えない（書き換えるのは TipTap マウント後のユーザー編集 = 既存の `onUpdate` 経路）。未保存変更がある場合の `abortInFlight` は既存の未保存確認分岐で処理済み。したがって新たな autosave 配慮は不要だが、回帰テストで担保する（AC-8）。

## 実装ステップ

UI のみのため依存方向の制約は薄い。reducer → 純粋コンポーネント → orchestrator の順で進める。

### 1. 切り替え前判定ロジックの確認（実装変更なし）

- **対象ファイル:** `app/components/note/editor/wysiwygUnsupportedTags.ts`
- **変更内容:** 変更しない。`detectUnsupportedTags()` を `NoteEditor` から切り替え前判定にそのまま再利用することを確認する。
- **理由:** 既存の純関数で AC-2/AC-3/AC-5 の判定要件を満たせるため、新規ロジックを作らない（DRY）。

### 2. EditorModeSwitch に WYSIWYG タブを追加

- **対象ファイル:** `app/components/note/editor/EditorModeSwitch.tsx`
- **変更内容:** `TABS_EDIT` に `{ mode: "wysiwyg", label: "WYSIWYG" }` を追加（位置は ADR-003 に従う）。コンポーネント先頭 JSDoc の「`wysiwyg` is reserved for the new-note surface」「`inline` because…」の記述を、編集画面でも WYSIWYG が選べる実態に合わせて更新する。
- **理由:** AC-1 のタブ提示。`surface === "new"` 分岐は触らないので AC-6 は自動的に保たれる。

### 3. NoteEditor に切り替え前同意ゲートを実装

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - `pendingWysiwygSwitch` の `useState` を追加。
  - `onModeChange` を拡張: 未保存確認通過後、`surface === "edit"` かつ `nextMode === "wysiwyg"` かつ `detectUnsupportedTags(stateRef.current.contentHtml).length > 0` のときはダイアログを開く（`setMode` を保留）。それ以外（新規作成画面を含む）は従来どおり即 `setMode`。`useCallback` の依存配列に `surface` を含める。
  - `ConfirmDialog` を `<form>` 内にレンダリング（`ConfirmDialog` は内部 `<form>` の submit を `stopPropagation` するため外側フォーム送信は誘発しない＝既存契約）。`onConfirm` で `setMode "wysiwyg"` + `wysiwygUnsupportedAck` dispatch + 保留クリア、`onClose` で保留クリアのみ。
- **理由:** AC-2/AC-3/AC-4/AC-5/AC-7/AC-8。状態の置き場所（reducer ではなく orchestrator local state）は ADR-002 の判断による。

### 4. テスト追加・既存テスト整合

- **対象ファイル:** `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`（拡張）、必要なら `EditorModeSwitch` 用の新規テスト
- **変更内容:** 下記「テスト方針」のケースを追加。既存の `tabByLabel("HTML")` ベースのテストが WYSIWYG タブ追加・ダイアログ導入後も green であることを確認する。
- **理由:** 受け入れ基準を回帰可能な形で固定する。

## 設計判断

- **ADR-001**: 非破壊的な警告に `ConfirmDialog` を使う際、`subject`（「削除対象」固定ラベル）は使わず `description` で失われる要素を提示する。confirm ボタンの danger パレット固定は本件のトーンとして許容する。
- **ADR-002**: 「未保存変更確認」と「装飾消失警告」の順序・統合方針、および切り替えゲート状態の置き場所（orchestrator local state）と、ペイン内既存バナーとの二重同意回避（切り替え同意時に `wysiwygUnsupportedAck` を併発）。
- **ADR-003**: 編集画面の WYSIWYG タブの位置・ラベル。

詳細は `.issue/696/adr.md` を参照。

## リスクと注意点

- **二重ダイアログ / 二重同意**: 未保存確認（`window.confirm`）→ 装飾消失警告（`ConfirmDialog`）が連続し得る。ADR-002 で「未保存確認 → 装飾警告」の順を固定し、装飾警告の同意時に `wysiwygUnsupportedAck` を発行してペイン内バナーの再同意を抑止する。順序を誤ると同じ装飾喪失について 2 回同意を求めることになる。
- **`stateRef` の鮮度（割り切り）**: 判定対象の `contentHtml` は `onModeChange` クロージャの古い `state` ではなく `stateRef.current` から読む（既存の `dirtyKeys` 読み取りと同じ理由）。ただし InlineEditor の `onChange` は `ONCHANGE_DEBOUNCE_MS = 50` の debounce で emit され、`blur()`（focusout）では同期フラッシュされない（focusout ハンドラは `<pre>` 再ハイライトのみで debounce タイマーに触れない）。よって「blur 強制で stateRef の鮮度を担保できる」という保証は成立しない。判定対象は「最後にコミットされた `state.contentHtml`（debounce 未フラッシュ分は含まれ得ない）」と割り切る。非対応タグ集合は通常のテキスト編集では変化しないため、未フラッシュによる判定ズレは実用上無視できる。InlineEditor 改修（同期 flush 追加）はスコープ外。
- **既存テストの破壊**: `noteEditorModeChange.test.tsx` が `onModeChange` の confirm 経路を pin している。HTML タブ経路（非 WYSIWYG）にはダイアログを挟まないため壊れないはずだが、要確認。
- **`ConfirmDialog` のレンダリング位置**: 外側 `<form>` 内に置く。`ConfirmDialog` は submit を `stopPropagation` する既存契約があるため誤送信は起きないが、配置を誤ると保存フォームが誤発火し得る。confirm ボタンは danger 色（パレット）固定になる（「失われる」操作のトーンとして許容、ADR-001）。
- **`detectUnsupportedTags` の対象（サニタイズ前提）**: 「現在のコンテンツ HTML」= `state.contentHtml`（コミット済み）。これは保存済み（サーバーサニタイズ済み）または編集中の HTML で、`detectUnsupportedTags` のサニタイズ済み入力前提を満たす範囲。例外として「HTML タブで生入力した直後に WYSIWYG へ切替」では未サニタイズ HTML が判定対象になりうるが、`detectUnsupportedTags` は regex ベースで `<script>` 等を素通しするため誤判定の余地は理論上ある。実害は警告精度のみ（保存時にサーバー再サニタイズ＝XSS にはならない）。スコープ拡大は不要。

## テスト方針

- **EditorModeSwitch（純粋コンポーネント）**: `surface="edit"` で WYSIWYG タブがレンダリングされること、`surface="new"` のタブ構成が不変であること（AC-1 / AC-6）。
- **NoteEditor.onModeChange（happy-dom 結合）**:
  - 非対応タグを含む `initialContentHtml`（例: `<section><p>x</p></section>`）で WYSIWYG タブ押下 → ダイアログが開き、`setMode` されない（`role="alertdialog"` 出現・ペイン未切替）。ダイアログに失われる要素（`<section>`）が表示される（AC-2 / AC-5）。
  - 対応タグのみ（例: `<p>x</p>`）で WYSIWYG タブ押下 → ダイアログ無しで WYSIWYG ペインに切り替わる（AC-3）。
  - ダイアログでキャンセル → モード・コンテンツ維持（AC-4）。
  - ダイアログで同意 → WYSIWYG に切り替わり、ペイン内バナーが再同意を要求しない（`wysiwygUnsupportedAck` 反映）（AC-7）。
  - 未保存変更あり + 非対応タグあり: `window.confirm`（未保存）の後に `ConfirmDialog`（装飾）が出る順序・二重にならないこと（AC-7）。
  - WYSIWYG 切り替えが autosave を破壊しない（既存の in-flight cancel テストと整合）（AC-8）。
- **dispatch 順序・latch 依存の pin**: 同意時は `setMode "wysiwyg"` と `wysiwygUnsupportedAck` を 1 ハンドラ内でまとめて発行し、ack=true でマウントさせる。テストで「同意 → WYSIWYG マウント → バナーが ack 済み（控えめ表示・再同意ボタン無し）」を pin し、その意図（`ConfirmDialog` で見せた lostTags と onCreate 再検出が同一集合である＝latch 維持に依存する暗黙結合）をテストコメントに残す。
- **ダイアログ本文文言**: 実装時、`description` のラベル文言（「次の要素は WYSIWYG モードでは保持されません」等）とテストの期待文字列を一致させること。
- **回帰**: 既存 `noteEditorModeChange.test.tsx` の全ケースが green。
- 変更後に `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit`。

## レビュー履歴

### 1周目

**修正した点**:
- arch-risk **P-001**（要修正）: InlineEditor の `onChange` は `ONCHANGE_DEBOUNCE_MS = 50` の debounce で emit され、`blur()`（focusout）では同期フラッシュされない（focusout ハンドラは `<pre>` 再ハイライトのみ）という実コードの事実に合わせ、計画「設計3」・リスク欄「`stateRef` の鮮度」「`detectUnsupportedTags` の対象」・ADR-002 の「blur 強制で stateRef の鮮度を担保できる」という過剰な保証記述を訂正。判定対象を「最後にコミットされた `state.contentHtml`（debounce 未フラッシュ分は含まれ得ない）」と割り切る方針に書き換え、「非対応タグ集合は通常のテキスト編集では変化しないため判定ズレは実用上無視できる」「InlineEditor 改修（同期 flush 追加）はスコープ外」を明記。

**取り込んだ改善提案**:
- coverage **S-001**: AC-7 を ADR-002 の確定事項に揃え、「未保存 + 非対応タグの両方がある場合、`window.confirm`（未保存）→ `ConfirmDialog`（装飾）の順で発火し、装飾喪失について二重に同意を求めない」と同時/連続の曖昧さを解消する文言に書き換え。
- coverage **S-002**: AC-8 の「齟齬が出ない」を観測可能な合格条件（「WYSIWYG への切り替え自体は `contentHtml` を変更せず、既存の in-flight `saveDraft` cancel テストが green のまま」）に言い換え。
- arch-risk **S-004**: `detectUnsupportedTags` がサニタイズ済み HTML 前提（regex ベースで `<script>` 等を素通し）である制約と、「HTML タブで生入力直後に WYSIWYG 切替」パスでの誤判定余地（実害は警告精度のみ＝保存時サーバー再サニタイズ）を判定対象の注記に追記。
- arch-risk **S-001**: confirm ボタンが danger 色固定になる旨を計画リスク欄（`ConfirmDialog` のレンダリング位置）にも 1 行反映（ADR-001 既記載の再掲）。
- arch-risk **S-002 / S-003**: 同意時の dispatch 順序（`setMode` + `wysiwygUnsupportedAck` をまとめて発行、ack=true でマウント）と、latch 依存の暗黙結合（ダイアログの lostTags と onCreate 再検出が同一集合である前提）をテストで pin する意図をテスト方針に追記。
- coverage **S-003**: ダイアログ本文文言を実装時にテスト期待文字列と一致させる注意をテスト方針に追記。

**見送った提案とその理由**:
- なし（P-001 の対案2「InlineEditor に blur/unmount 時の同期フラッシュを追加」はレビュアー自身が「スコープ拡大・別コンポーネント改修のため非推奨」としており、推奨の対案1=割り切りを採用したため見送りには当たらない）。

### 2周目

2周目: 両視点とも問題点ゼロで終了。1周目の P-001 訂正・S-001〜S-004 反映がいずれも実コードと整合し、新たな矛盾・漏れ・スコープ膨張なしと確認された（arch-risk の S-001 は「latch 依存の暗黙結合を実装時にテストで確実に pin する」念押しで、計画修正は不要）。

## レビュー履歴（PR #715 Round 2）

### Frontend W-001 / Test W-001 対応（2 周目）

**修正した点**:
- frontend **W-001**（装飾消失ゲートが surface 非依存で AC-6 と食い違う）: ユーザー判断により、ゲート条件を `surface === "edit" && nextMode === "wysiwyg"` に限定（`NoteEditor.tsx`）。`useCallback` の依存配列に `surface` を追加。新規作成画面（`mode="new"`）では HTML タブで非対応タグを入力 → WYSIWYG 切替でも事前ダイアログを出さず、従来どおりペイン内バナーのみで警告する（AC-6 厳守）。ゲートの why コメントも edit 限定である旨に整合。AC-6 の受け入れ基準文言・設計記述（設計3 / 実装ステップ3）を edit 限定に訂正し、ADR-005 を追記。
- test（新規画面 AC-6 の pin）: `noteEditorModeChange.test.tsx` の new-surface describe に「HTML タブで `<section>` を生入力 → WYSIWYG 切替でも装飾消失ダイアログ（`role="alertdialog"`）が出ずにそのまま WYSIWYG へ切り替わる」回帰テストを追加。
- test **W-001**（AC-8 確認経路の tautology 解消）: WYSIWYG 同意切替後にいったん HTML タブへ戻し、`htmlTextareaValue()`（= live `state.contentHtml`）が原文 `<section>` markup から不変であることを実観測する assertion に置き換え。in-flight `saveDraft` の abort 契約 pin は維持。

# 実装計画 — Issue #464: 公開設定画面（P14）のスタイリングを実装する

**Issue:** #464
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

機能ロジックは完成済みだが無スタイルの素 HTML のままになっている公開設定画面（P14, `/notes/$noteId/publish`）を、プロジェクトの utility-first Tailwind 規約・デザイントークン・既存共通定数に沿ってスタイリングし、`spec/design/pages/P14-publish-settings.html` の視覚言語に準拠させる。あわせてルートを `_app` レイアウトグループ配下へ移し、他の内部画面と同じアプリシェル（ヘッダー／サイドバー／`<main>` ラッパ）を適用する。

## スコープ

### 含まれるもの
- `app/components/publication/PublishSettings/index.tsx` — ラジオ群（公開ステータス）・限定公開リンク発行フォーム・リンク一覧（ShareLinkList / ShareLinkRow）のスタイリング
- `app/components/publication/PublishSettings/PublishSettingsPage.tsx` — ページラッパ。`<main>` → `<section>` 化＋本文幅ラッパ
- `app/routes/notes/$noteId/publish.tsx` → `app/routes/_app/notes/$noteId/publish.tsx` — `_app` 配下へ移動、`errorComponent`/`notFoundComponent` のスタイル整合
- `app/components/publication/styles.ts`（新規）— P14 固有の繰り返しユーティリティ定数

### 含まれないもの
- ロジック変更（server function 呼び出し `changeVisibilityFn`/`issueShareLinkFn`/`revokeShareLinkFn`/`setShareLinkPasswordFn`、バリデーション、エラー表示、`useActionState`/`useTransition`）— すべて実装済みで不変
- デザインモック限定でロジック未実装の機能（URL プレビュー固定値、safety-check、bulk-mode 一括適用、コピー/QR/再発行ボタン、最終アクセス表示）
- モックの radio-desc に書かれた**説明文の新規書き起こし**（既存ラベル文言「非公開」「限定公開（リンクを知っている人のみ）」「公開」をそのまま使う。コピー追加はビジュアル層を超えるためスコープ外）
- `head` ヘルパの書き換え（`internalRouteHead` は `buildHead(noIndex:true)` と等価のため維持）
- `requireCurrentUser()` の防御的ガード（`_app` 前段 auth はあるが、他リーフと同じ fail-safe 慣習として維持）
- 姉妹リーフ（`_app/notes/$noteId/index.tsx`・`edit.tsx`）の無スタイル errorComponent の改修（別Issue。本Issueは publish のみ対象）

## 実装ステップ

### 1. ルートを `_app` 配下へ移動

- **対象ファイル:** `app/routes/notes/$noteId/publish.tsx` → `app/routes/_app/notes/$noteId/publish.tsx`
- **変更内容:** ファイルを物理移動し、`createFileRoute("/notes/$noteId/publish")` を `createFileRoute("/_app/notes/$noteId/publish")` に変更。`routeTree.gen.ts` は codegen で再生成（手動編集しない）。あわせて移動先ファイルの `import "@/components/publication/PublishSettings/action"`（副作用 import）は**削除**する — `_app/route.tsx:31` が既に同 import を登録済みで、`_app` 配下の全リーフを賄うため、leaf 側に残すと冗長な二重登録になる。
- **理由:** `_app` は pathless layout group のため公開 URL `/notes/$noteId/publish` は不変（NoteActions からの導線維持）。`_app` 配下に入ることでアプリシェルと auth gate が適用される。本Issue要件の中核。

### 2. `errorComponent` / `notFoundComponent` のスタイル整合

- **対象ファイル:** 同ルート
- **変更内容:** 無スタイル `<div role="alert"><h1>…</h1><pre>…</pre></div>` に、`_app` 配下の視覚トーンに合わせた最小スタイルを当てる。`<div role="alert" className="p-6">` + `<h1 className="text-xl font-semibold mb-3">` + `<pre className="text-sm text-ink-secondary whitespace-pre-wrap">`（`AppErrorFallback` のトーンに準拠。retry ボタンは付けない）。`notFoundComponent` は `<div className="p-6 text-ink-secondary">ノートが見つかりません</div>`。
- **理由:** Issue が対象範囲に「errorComponent/notFoundComponent のスタイル」を明示しているため最小限スタイルを当てる。なお同階層の姉妹リーフ（`index.tsx`/`edit.tsx`）の errorComponent は現状無スタイルだが、それらの改修は本Issueスコープ外（別Issue）。publish のみ `_app` トーンに揃える。`sanitizeRouteError`/`role="alert"` のロジックは不変。

### 3. ページラッパのスタイル＋二重 `<main>` 解消

- **対象ファイル:** `app/components/publication/PublishSettings/PublishSettingsPage.tsx`
- **変更内容:** `<main>` を `<section>` に変更し、本文幅ラッパ（`PUBLISH_BODY = "max-w-[640px]"`、ステップ4で styles.ts に定数化）を与える。
- **理由:** `_app` 配下では `AppShellDrawer` が唯一の `<main className={APP_MAIN}>` を所有する（`AppShellDrawer.tsx:185`、`APP_MAIN = "px-6 pt-8 pb-20 max-w-[1100px] mx-auto w-full min-w-0"`）。`NoteDetail`（`max-w-[760px]`）同様リーフは `<main>` を出さない慣習。残すと二重 `<main>` でa11y回帰。フォーム中心の画面なので読みやすい狭め幅（640px、モックの modal 幅 560px と NoteDetail の 760px の中間）に絞る。
- **見出しの扱い:** ページ見出しは `index.tsx` 既存の `<h2 id>公開設定</h2>`（`PublishSettings` 内・`aria-labelledby` の参照先）が担う。`_app` 配下のリーフは最上位見出しを 1 つ持つ慣習（`NoteDetail` は `<h1>`）に合わせ、この見出しを最上位（`<h1>`）に格上げして `PAGE_TITLE` を当てる。格上げに伴い `aria-labelledby`/`id` の対応は維持する。`PublishSettingsPage` 側には見出しを新設せず二重見出しを避ける。

### 4. P14 固有スタイル定数の新設

- **対象ファイル:** `app/components/publication/styles.ts`（新規）
- **変更内容:** radio-card（枠線カード＋`has-[input:checked]:` で accent 枠＋`bg-accent-surface`）、link-row（モノスペース URL ＋ ellipsis カード行）、本文幅ラッパ `PUBLISH_BODY = "max-w-[640px]"`、発行済み URL ボックス、status-dot（`STATUS_DOT`）等、P14 固有で繰り返すユーティリティを `SCREAMING_SNAKE_CASE` 定数として括り出す。`public`/`layout`/`auth`/`directory` のドメイン別 `styles.ts` の前例に倣う。
  - **status-dot:** `NoteActions` の `VISIBILITY_DOT` は **module-private（非 export）** のため直接 import できない。`NoteActions.tsx` を触るのは本Issueのスコープ（3ファイルのビジュアル層）外なので、文字列リテラルの複製も NoteActions の export 化もせず、`publication/styles.ts` に `VISIBILITY_DOT` と**同じトークン語彙の value-match variant** で `STATUS_DOT` を新規定義する: `"inline-block w-2 h-2 rounded-full data-[visibility=private]:bg-status-private data-[visibility=unlisted]:bg-status-link data-[visibility=public]:bg-status-public"`。`unlisted`→`status-link` の対応はトークン定義（`--color-status-link` 実在、`status-unlisted` は不在）と一致。将来的な `VISIBILITY_DOT` との SSOT 統合（共通定数への移設）はフォロー候補として `progress.md` に残す。
- **理由:** 繰り返し＆ドメイン固有ユーティリティの SSOT 化（CLAUDE.md Styling 規約準拠）。汎用プリミティブ（`field`/`fieldLabel`/`fieldControl`/`formError`/`radioRow`/`chip`/`pillBtn*`）は `common/styles.ts` から、`PAGE_TITLE`/`PAGE_SUBTITLE`/`EMPTY_STATE`/`CHIP_*` は `layout/styles.ts` から流用し重複定義しない。

### 5. `index.tsx` の各ブロックをスタイリング

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`
- **変更内容:**
  - **公開ステータス（fieldset/legend + radio群）:** 各 `<label>` を radio-card 化。選択カードの accent 強調は **`has-[input:checked]:` variant**（ネイティブ radio の checked に CSS の `:has` で追従）を主軸にする。これにより submit 前にユーザーがラジオを選び直した時点でカード強調が切り替わる（`data-selected={v === visibility}` だと `visibility` state がサーバ確定値＝submit 成功後にしか更新されず「選んだのに見た目が変わらない」UX 不整合が起きるため採用しない）。`<input type="radio">` は `[&_input]:sr-only` で視覚隠し（操作・キーボード・`defaultChecked`・`disabled` ロジックは不変）。フォーカスリングはカード側 `focus-within:` で補う。status-dot は `publication/styles.ts` に新規定義する `STATUS_DOT`（ステップ4参照。`data-visibility={v}` を付与して value-match variant で色分け）を使う — visibility 値 `unlisted` はトークン名 `status-link` に対応する点に注意（語彙ズレ防止）。タイトル＋既存ラベル文言の二層（説明文の新規書き起こしはしない）。`legend` は `fieldLabel` 相当。
  - **「公開状態を更新」ボタン:** `${pillBtn} ${pillBtnPrimary}` + `data-primary=""`。
  - **限定公開リンクの見出し:** ページ最上位見出しを `<h1>` に格上げするのに伴い、現状 `<h3>限定公開リンク</h3>` は `<h2>` に繰り上げて階層ジャンプ（h1→h3）を避ける。スタイルは `text-md font-medium text-ink`。`isPrivate` 時の注意文は `text-sm text-ink-secondary`。
  - **リンク発行フォーム:** `<label>`/`<span>` を `field`/`fieldLabel`、`<input type="password">` を `fieldControl`、発行ボタンを `${pillBtn} ${pillBtnPrimary}`、`role="alert"` を `formError`。発行済み URL（`<code>`）はモックの url-preview 風ボックス（`bg-surface rounded-md p-3.5` ＋ `font-mono`）。
  - **ShareLinkList:** 空表示を `EMPTY_STATE` 相当、`<ul>` を `flex flex-col gap-2`。
  - **ShareLinkRow:** `<li>` を link-row カード化。`<code>{link.url}</code>` をモノスペース ellipsis、status バッジを `CHIP`（base）+ 状態別: 有効=`CHIP_SUCCESS`、失効済み=`CHIP_PRIVATE`（surface/ink-tertiary のミュート）、パスワード設定中=`CHIP`（base のニュートラル）。操作ボタン（パスワード設定／解除／失効）を `${pillBtn} ${pillBtnSm}`（失効・解除は `pillBtnGhostDanger` + `data-ghost-danger="" data-sm=""`）。`<input>` を `fieldControl`、`role="alert"` を `formError`。
- **理由:** モック視覚言語の Tailwind 翻訳。a11y 構造（fieldset/legend/label-input 関連付け/role=alert）は維持。

## 設計判断

詳細は `adr.md` 参照。要点:
- styles.ts は新設する（P14 固有定数を `app/components/publication/styles.ts` へ）。汎用は既存定数を流用。
- ルート移動は pathless group を使い公開 URL を不変に保つ。
- 二重 `<main>` 回避のためページラッパを `<section>` 化。
- モックの modal シェルは採用せず、視覚言語のみページ本文へ翻訳。
- 状態表現は conditional class 文字列でなく `data-*` 属性 + `data-[…]:` variant（ADR-003 準拠）。

## リスクと注意点

- **`routeTree.gen.ts` 再生成:** 手動編集せず codegen に任せる。型チェック／ビルドで参照整合を確認。
- **二重 `<main>` の見落とし:** 移動とページラッパ `<section>` 化は必ずセットで行う。
- **radio の視覚隠し:** `[&_input]:sr-only` 採用時、キーボードフォーカス可視性とラベルクリック選択が維持されることを確認。フォーカスリングはカード側 `focus-within:` で補う（過剰実装は避け最小限）。
- **`pillBtnGhostDanger`/`pillBtnSm` の data-* 変種:** `data-ghost-danger="" data-sm=""` を必ず併記（generated-CSS order 依存で付け忘れると効かない）。
- **背景色トークン:** モックの `#fff` は `bg-bg`（白）を優先採用（将来のダークモード安全側）。

## テスト方針

- **型・ビルド:** `routeTree.gen.ts` 再生成後、`pnpm typecheck` / `pnpm build` が通ること。
- **既存テスト:** `pnpm test:unit`。ロジック未変更のため publication の action/loader 系・シェル系テストが緑のまま。
- **手動/ブラウザ確認:** `/notes/$noteId/publish` 直アクセス＆ NoteActions 導線の双方でアプリシェルが付くこと。ラジオカード選択時に accent 枠＋ドット色が切り替わること。リンク発行→URL ボックス表示、リンク一覧のステータスバッジ／操作ボタンの見た目と disabled 状態。エラー時 `formError` 表示。errorComponent/notFoundComponent のスタイル。モバイル幅でのタップターゲット／ドロワー。
- **a11y:** `<main>` が 1 つだけ（シェル所有）、最上位見出しが 1 つ（`<h1>`）、`fieldset/legend`・label-input 関連付け・`role="alert"` が維持されていること。

## レビュー履歴

### 1周目（2視点並列: 要件カバレッジ / アーキ・リスク）
**修正した点**:
- アクション副作用 import の二重登録（要件S-001 / アーキP-001）: スコープ除外から外し、ステップ1に「移動先 leaf の `import "...action"` を削除（`_app/route.tsx:31` がカバー）」を明記。
- errorComponent 整合先の記述ズレ（要件P-001）: 「`AppErrorFallback` と整合」を「`_app` トーンの最小スタイルを当てる」に修正。姉妹リーフが無スタイルである事実と、その改修が別Issueである旨を明記。
- 既存見出しの扱い欠落（アーキP-002）: ステップ3に見出し方針を追加（`index.tsx` の `<h2>公開設定</h2>` を `<h1>` に格上げ＋ `PAGE_TITLE`、`PublishSettingsPage` 側に見出し新設しない、`aria-labelledby`/`id` 維持）。
- status-dot のトークン語彙ズレ（アーキS-001）: `unlisted`→`status-link` の対応を明記し、`VISIBILITY_DOT` 定数の再利用を採用（ADR-001 更新）。
- radio 選択追従の不整合（アーキS-002）: `data-selected`（サーバstate連動）を撤回し `has-[input:checked]:`（native checked 追従）を主軸に変更（ADR-004 追加）。
- 本文幅のリテラル値（アーキS-003）: `PUBLISH_BODY = "max-w-[640px]"` として styles.ts に定数化。

**取り込んだ改善提案**:
- 説明文の新規書き起こしをスコープ外と明記（要件S-002）— 既存ラベル文言のみ使用。

**見送った提案とその理由**:
- なし（指摘はすべて反映 or 明確化）。

### 2周目（2視点並列）
**要件カバレッジ視点**: 問題点ゼロ。3対象範囲すべてカバー、スコープ逸脱なし。改善提案（CHIP マッピング明示・トーン整合のブラウザ確認）を反映/許容。

**アーキ・リスク視点**: [P-001] `VISIBILITY_DOT` が非 export で「物理再利用」が不成立 → 反映: `publication/styles.ts` に同語彙の `STATUS_DOT` を新規定義する方針へ訂正（ADR-001 補足更新）。NoteActions を触らずスコープを 3 ファイル＋新設 styles.ts に維持。SSOT 統合は progress.md のフォロー候補に。

**取り込んだ改善提案**:
- 見出し階層: `<h1>` 格上げに伴い `<h3>限定公開リンク</h3>` を `<h2>` に繰り上げ（階層ジャンプ回避、S-001）。
- ShareLinkRow の CHIP マッピングを状態別に明示（S-003）: 有効=`CHIP_SUCCESS`／失効済み=`CHIP_PRIVATE`／パスワード設定中=`CHIP`。

**見送った提案とその理由**:
- `aria-labelledby` の region landmark 化（S-002）: `<h1>` 格上げ後も id 関連付けは機能上問題なく、`<section>` 構造の変更は最小変更原則から見送り。実害なし。

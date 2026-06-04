# 実装計画 — Issue #477: refactor(ui): ノート公開設定を独立ページからインコンテキストUI（モーダル等）へ作り変える

**Issue:** #477
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

ノート公開設定を独立フルページ `/notes/$noteId/publish`（戻る導線なしの行き止まり）から、ノート詳細上でその場で開く**モーダル（Dialog）** に作り変える。閉じる/戻る手段を常に確保し、現状ほぼ無スタイルのフォームをプロジェクトのスタイリング規約に沿って整える。

## スコープ

### 含まれるもの
- UI形式を **A-1（既存 `Dialog` / `BulkVisibilityDialog` 流用）** に決定し実装
- ルート `/notes/$noteId/publish` の **廃止** とその波及対応（route ファイル削除・routeTree 再生成・遷移元リンクの差し替え）
- `PublishSettings`（公開ステータスラジオ + 限定公開リンクの発行/パスワード/失効/一覧）を Dialog body として再利用できる形に書き直し、`styles.ts` の作法（`dialogTitle`/`field`/`fieldLabel`/`radioRow`/`dialogActions`/`pillBtn` 等）に揃える
- `NoteActions` の「公開設定」ピルを `<Link>` から open state を立てる `<button>` に変更し、Dialog を開く
- NoteDetail が既に保持する `publishState`（`{ visibility, publishedAt, links }`）と `appUrl` を NoteActions → モーダルへ引き回し（再フェッチ回避）
- 閉じる/戻る手段（× / Esc / キャンセル）と pending 中の closable 制御
- スタイリング

### 含まれないもの
- 設定画面全般のスタイリング（#463 のスコープ）
- ノート一覧の公開状態フィルタ再検討（#476 のスコープ）
- 公開設定のドメイン/ユースケース/アダプター層の変更（既存 server-fn を流用）
- `PublishSettingsPage.tsx` / `loader.ts` の振る舞い変更（廃止に伴う削除のみ。後述）

## 既存実装の状態（あるべき姿との対比）

> **重要（2026-06-04 再調査）**: 計画初稿は古いブランチ（issue/461）時点の状態で調査していたが、その後 **Issue #464（PR #472）が origin/main にマージ済み**で前提が変わった。本セクション以降は現在の origin/main を正とする。

- **スタイリングは #464 で完了済み**。`PublishSettings/index.tsx` は radio-card / link-row / URL preview / status バッジ / 操作ボタンまで `publication/styles.ts`（`RADIO_CARD`/`LINK_ROW`/`URL_PREVIEW`/`STATUS_DOT` 等）+ `common/styles.ts` + `layout/styles.ts`（`PAGE_TITLE`/`EMPTY_STATE`/`CHIP_*`）でフルスタイリング済み。**本Issueはゼロからのスタイリングではなく、既に整ったページ内容をモーダル body に適合させる作業**。既存の P14 スタイルを剥がさず流用する。
- **デザインモックは既に存在**: `spec/design/pages/P14-publish-settings.html` は**もともとモーダル設計**（背後にフェードした note-detail + `.modal-backdrop`/`.modal`(role=dialog)/`.modal-header`(title + close)/`.modal-body`/`.modal-footer`(キャンセル/適用)、modal max-width 560px）。#464 はこのモックの body 部分をページとしてスタイリングし、#477 が実際のモーダル化を行う。**ただしモックには現実装にない機能（QR コード・safety-check 警告・last-access・再発行・bulk-mode サマリ）が含まれており、それらは #477 のスコープ外**（モーダルの外枠 = header/body/footer 構造のみ参照する）。
- **ルート位置は #464 で `_app` 配下へ移動済み**: 現在のルートファイルは `app/routes/_app/notes/$noteId/publish.tsx`（path `/_app/notes/$noteId/publish`、URL は `/notes/$noteId/publish`）。`notes/$noteId/`（`_app` 外）には `export.tsx` のみ残る。**初稿の `app/routes/notes/$noteId/publish.tsx` というパス記述は誤りで、`_app` 配下が正**。
- **`PublishSettingsPage.tsx` は #464 で `<section className={PUBLISH_BODY}>` を返す形に変更済み**（`<main>` 二重化回避）。`../styles` の `PUBLISH_BODY` を import している。ルート廃止で本ファイルは削除対象。
- **`loader.ts` の JSDoc は既に "the modal" を前提に書かれている**。インコンテキスト化は元から想定された方向。
- **`NoteDetail` は既に `loadPublishStateForNote` で `{ visibility, publishedAt, links }` を取得済み**（`loader.ts` の `loadPublishState` と同形）。現状 `visibility` と `publicShareUrl` のみ `NoteActions` に渡している。モーダル化により `publishState` 全体を渡せば再フェッチ不要。
- **`appUrl` は発行直後の一回限り表示URL（`/share/<token>`）の組み立てにのみ必要**。`issueShareLinkFn` は `{ shareLinkId, urlToken }` しか返さず、`ShareLinkDTO.url`（一覧表示用）は既にサーバ側で `appUrl` から組み立て済み。
- **`action.ts` は削除不可**: `bulkChangeVisibilityFn` を `BulkVisibilityDialog` が import している。server-fn 群はそのまま流用する。
- **action の RSC 登録**: `_app/route.tsx` が `import "@/components/publication/PublishSettings/action"` で副作用登録済み（#464 で leaf 側の重複 import は削除済み）。`publish.tsx` を削除しても server-fn は引き続き有効。

## 設計判断

詳細は `.issue/477/adr.md` 参照。要点:

- **ADR-001: UI形式は A-1（モーダル/Dialog）**。既存 `Dialog`/`BulkVisibilityDialog` 資産をそのまま流用でき実装コスト最小。情報量（ラジオ + リンク管理）は `dialog` の `max-h-[90vh] overflow-y-auto` で吸収可能。
- **ADR-002: ルート `/notes/$noteId/publish` は廃止**。直リンク互換（intercepting route 等）は TanStack Start に既存実装パターンがなく、行き止まり解消というIssueの目的に対して過剰。外部からの直リンク需要も低い。
- **ADR-003: `appUrl` は note detail route handler → NoteDetail → NoteActions → Dialog で props 引き回し**。NoteDetail を server-fn 内で `getContainer().config.appUrl` から解決して渡す。

## 実装ステップ

### 1. `PublishSettings` を Dialog でラップしてモーダル body 化する

**前提**: #464 で既にフルスタイリング済み。**既存の P14 スタイル（`RADIO_CARD`/`LINK_ROW`/`URL_PREVIEW`/`STATUS_DOT`/`CHIP_*`/`EMPTY_STATE` 等）はそのまま流用し、剥がさない**。やるのは「ページ → Dialog body」への外枠適合のみ。

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`
- **変更内容:**
  - Props に `open: boolean` / `onClose: () => void` を追加（`{ noteId, appUrl, initial }` は維持・再フェッチしない）。
  - 返り値全体を `Dialog` でラップする（`BulkVisibilityDialog` 作法）: `<Dialog open={open} onClose={onClose} ariaLabelledBy={titleId} closable={!anyPending} showCloseButton>`。
  - **見出しの格下げ（モーダル文脈）**: 現状 `<h1 className={PAGE_TITLE}>公開設定</h1>` → `<h2 id={titleId} className={dialogTitle}>公開設定</h2>`（モーダルタイトル。note 詳細の h1 と階層衝突しないよう h2）。サブ見出し `<h2 className={PUBLISH_SECTION_TITLE}>限定公開リンク</h2>` → `<h3 className={PUBLISH_SECTION_TITLE}>`。`PAGE_TITLE` import が他で未使用になれば除去。
  - **最下部フッター**: モックの `.modal-footer` に倣い、`dialogActions` で「閉じる」`pillBtn` を置く（× / Esc に加えた明示的閉じ手段）。
  - **pending 集約 → closable**: `useActionState` ベースの2フォーム（`visibilityPending`/`issuePending`）は親で取れる。`ShareLinkRow` の `useTransition` は子ローカルなので、親が観測するには `onPendingChange` コールバックで持ち上げて集約する（または「行操作中は closable に反映しない」割り切り）。`anyPending = visibilityPending || issuePending || rowPending` を `closable={!anyPending}` に渡す。`BulkVisibilityDialog` 同様、× ボタンは `closable=false` 時に自動 disabled。
  - **props/state 二重管理の注意**: 現 `useState(data.visibility)` は初期値コピーのため `routerInvalidate` 後に props が変わっても再評価されない。`changeVisibility` 成功時の `setVisibility(next)` 自前更新ロジックを維持すれば実害なし。リンク一覧（`data.links`）は props 直描画で invalidate 後に更新される点と挙動が異なることを認識して実装する。**モーダルを閉じて再度開いた際に最新 state が反映されるよう、`Dialog` は `open=false` で unmount される（`Dialog` 実装が `!open` で null を返す）ため、再オープン時は最新 props で再初期化される**点を確認する。
  - ロジック（server-fn 呼び出し・`routerInvalidate`・エラー表示）は現状維持。
  - 発行直後の一回限りURL表示（`URL_PREVIEW`）は現状維持。コピーボタン化はモックにあるが**任意**（現状の `<code>` 表示でも完了条件は満たす）。やる場合も `UrlCopyButton` など既存資産のみ使用。
- **理由:** Issue の「閉じる/戻る手段が必ず存在」「インコンテキスト化」を満たす中核。スタイリングは #464 完了済みなので流用に徹する。

### 2. `NoteActions` の「公開設定」ピルを Dialog トリガー化

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:**
  - `OpenDialog` 型を `"move" | "publish" | null` に拡張。
  - 「公開設定」を `<Link to="/notes/$noteId/publish">` から `<button type="button" onClick={() => setOpen("publish")}>` に変更（`VISIBILITY_DOT` / `Globe` / ラベル表示はそのまま、`pillBtn` 維持）。
  - `PublishSettings` をインポートし、`open={open === "publish"}` / `onClose={() => setOpen(null)}` で描画。
  - Props に `publishState`（`{ visibility, publishedAt, links }`）と `appUrl` を追加。`visibility` は `publishState.visibility` と二重になるため、ピル表示・コピーURL判定とも `publishState.visibility` に集約し、`visibility` prop は撤去する（単一の真実）。`publicShareUrl` は NoteDetail で `links` から算出した派生値なので prop として残す。`NoteActionsProps` の型変更は下流テストにも反映する。
- **理由:** 遷移元をインコンテキストUIに切り替え、NoteDetail 既存データを再利用する。

### 3. `NoteDetail` から `publishState` 全体と `appUrl` を `NoteActions` に渡す

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - `NoteDetailProps` に `appUrl: string` を追加。
  - `NoteActions` 呼び出しを `publishState={publishState}` / `appUrl={appUrl}` / `publicShareUrl={publicShareUrl}` に更新し、`visibility` prop は撤去（ステップ2の集約に合わせる）。`tree`/`status`/`noteId` は据え置き。
- **理由:** 再フェッチを避け、モーダルの初期表示データをサーバ取得済みの値で賄う。

### 4. note detail route handler で `appUrl` を解決して `NoteDetail` に渡す

- **対象ファイル:** `app/routes/_app/notes/$noteId/index.tsx`
- **変更内容:**
  - `renderNoteDetail` ハンドラ内で `getContainer()` を import し、`container.config.appUrl` を取得して `<NoteDetail appUrl={...} />` に渡す（廃止前 `publish.tsx` の `getContainer` 利用パターンに準拠）。
- **理由:** server component に `appUrl` を供給する正規ルート。

### 5. ルート `/notes/$noteId/publish` の廃止

- **対象ファイル:**
  - 削除: `app/routes/_app/notes/$noteId/publish.tsx`（#464 で `_app` 配下へ移動済み。**初稿の `app/routes/notes/$noteId/publish.tsx` は誤り**）
  - 削除: `app/components/publication/PublishSettings/PublishSettingsPage.tsx`
  - 削除: `app/components/publication/PublishSettings/loader.ts`
- **変更内容:**
  - 上記3ファイルを削除。`loader.ts` の `loadPublishStateOrNotFound`/`loadPublishState` は `PublishSettingsPage` のみが使用しており、ルート廃止で参照ゼロになる（実装前に grep 再確認）。
  - `app/routeTree.gen.ts` を `pnpm dev`/`build` の codegen で再生成（手編集しない）。`AppNotesNoteIdPublishRoute` 相当の生成エントリが消える。
  - `action.ts` は削除しない（`bulkChangeVisibilityFn` を `BulkVisibilityDialog` が使用、`_app/route.tsx` が RSC 登録）。
  - **削除範囲の注意**: 削除する `publish.tsx` は `_app/notes/$noteId/` 配下。同階層に `edit.tsx`/`index.tsx`/`history/` が残るため空ディレクトリ化しない。ディレクトリ単位で消さず、3ファイルのみ削除する。`notes/$noteId/`（`_app` 外）の `export.tsx` は無関係。
  - **routeTree 再生成**: codegen は `tanstackStart` Vite プラグイン（`vite.config.cloudflare.ts`）が `pnpm dev` 起動 or `pnpm build` で生成する。独立 codegen スクリプトはない。`routeTree.gen.ts` は git 追跡対象なので、再生成後の差分をコミットに含める（手動削除・手編集はしない）。
  - **head 波及なし**: `publish.tsx` の import（`internalRouteHead` / `sanitizeRouteError` / `validateInput` 等）は他ルートも使う共有ヘルパー。削除されるのは publish 固有の `internalRouteHead(..., "公開設定", ...)` 呼び出しのみで、共有ヘルパー自体は無傷。
- **理由:** 行き止まりルートを除去。Issue 完了条件「ルート扱いの決定（廃止）」を満たす。

### 6. テスト更新

- **対象ファイル:**
  - `app/components/note/detail/__tests__/NoteActions.test.tsx`
  - `app/components/note/detail/__tests__/NoteDetail.test.tsx`
- **変更内容:**
  - `NoteActions.test.tsx`: `renderActions` の props を `publishState`（`{ visibility, publishedAt, links }`）/ `appUrl` / `publicShareUrl` に更新し、`visibility` 直渡しを撤去。`PublishSettings` を `vi.mock` でスタブ（`MoveNoteDialog` と同様）。「公開設定」が `<button>`（`<a>` でなく）になりクリックで開く経路を必要に応じて確認。既存の編集ピル/オーバーフローメニュー検証は維持。
  - `NoteDetail.test.tsx`: `NoteDetail({ user, noteId, appUrl })` の呼び出しに `appUrl` を追加。`NoteActions` は引き続き mock。
- **理由:** props シグネチャ変更とリンク→ボタン化に追随。

## リスクと注意点

- **`routeTree.gen.ts` は生成物**: 手編集せず codegen で再生成する。生成タイミング（`pnpm dev` 起動 or `pnpm build`）を testing.md に明記。
- **`appUrl` の引き回し漏れ**: route handler → NoteDetail → NoteActions → PublishSettings の4段。型に `appUrl` を必須で通し、`tsgo` で漏れを検出する。
- **pending 中の closable**: 複数フォーム（visibility/issue/各リンク行）の pending を1つの真偽値に集約しないと、操作中に Esc/×/キャンセルでモーダルを閉じてしまい中途半端な状態になる。`BulkVisibilityDialog` 同様 `closable={!anyPending}`。
- **`loadPublishStateForNote`（NoteDetail 用）と `loadPublishState`（loader.ts）の重複**: 後者は削除されるため、NoteDetail 側 `loadPublishStateForNote` が唯一の取得経路になる。両者の戻り値が同形であることは確認済み。
- **外部直リンク互換の喪失**: `/notes/$noteId/publish` をブックマーク/共有している利用者は 404 になる。Issue で「廃止 or 直リンク互換」を決定事項としており、行き止まり解消が主目的のため廃止を選択（ADR-002）。
- **発行直後URL表示の扱い**: `issueShareLinkFn` は token を一度だけ返す。モーダルを閉じると再表示できない仕様は現状踏襲（UX上の劣化なし）。
- **`#463`（設定画面スタイリング）との重複なし**: 本Issueはノート詳細上の公開設定モーダルに閉じており、`/settings` 系には触れない。`styles.ts` の共有プリミティブを使う点のみ共通だが競合しない。
- **`#476`（一覧の公開状態フィルタ）との重複なし**: 一覧側の `BulkVisibilityDialog` には触れない。

## テスト方針

- 自動: `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`（更新した NoteActions/NoteDetail テスト）。
- 手動（`testing.md` 参照）: ノート詳細でピルからモーダルが開く / ステータス変更・リンク発行・パスワード設定/解除・失効が機能する / ×・Esc・キャンセルで閉じる / pending 中は閉じられない / `/notes/$noteId/publish` 直アクセスが 404 になる / スタイリングが他ダイアログと整合。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 自己レビュー）
**修正した点**:
- `visibility` prop の二重管理を解消（NoteActions は `publishState.visibility` に集約し `visibility` prop を撤去）。ステップ2/3/6に反映。
- `loadPublishStateOrNotFound` / `loadPublishState`(loader.ts) の参照を grep で検証し、`PublishSettingsPage` のみが利用 → ルート廃止で安全に削除できることを確認・明記。
- action の RSC 登録が `_app/route.tsx` 側にも存在することを確認し、`publish.tsx` 削除後も server-fn が有効である点を明記。

**確認した整合性**:
- 完了条件4項目（UI形式=A-1 / ルート廃止 / 閉じる・戻る手段 / 実装・スタイリング）すべて計画に含まれる。
- ドメイン/ユースケース/アダプター層は無改修（既存 server-fn 流用）でレイヤー越境なし。
- スタイリングは utility-first・`styles.ts` 共有プリミティブ・`data-*` variant 規約に準拠。
- #463（設定画面）/#476（一覧フィルタ）とスコープ重複なし。

### 2周目（2視点並列レビュー: 要件カバレッジ / アーキ・リスク）
**両視点とも問題点ゼロで終了**。grep 裏取り（参照は PublishSettingsPage / loader.ts 定義元 / NoteActions のリンク1箇所のみ）、action の RSC 登録が `_app/route.tsx` にあること、`PublishSettings` 専用テスト不在、appUrl 4段引き回しの実現性、すべて実コードで確認済み。

**取り込んだ改善提案**:
- [arch S-003] `ShareLinkRow` の pending は子ローカル `useTransition` なので、closable 集約には `onPendingChange` での持ち上げが要る点をステップ1に明記。
- [arch S-004] `useState(data.visibility)` の初期値コピーと props 更新の二重管理の注意をステップ1に明記。
- [arch S-001] `publish.tsx` 削除後も同階層 `export.tsx` が残り空ディレクトリ化しない点をステップ5に明記。
- [arch S-002] routeTree 再生成は Vite プラグイン由来（`pnpm dev`/`build`）で生成物はコミット対象、head 波及なし、をステップ5に明記。

**見送った提案**:
- [req S-001/S-002] #476 との共有スタイル留意・発行直後URLの `<code>` 維持選択肢 — いずれも現計画で実害なし。発行直後URLのコピー化は「任意（UX向上）」のまま実装時判断とする。

### 3周目（Phase 2 着手時の origin/main 再調査）
ブランチを origin/main から切った時点で、**初稿が古いブランチ（issue/461）状態で調査していた**ことが判明。その後マージされた **#464（PR #472）** により前提が変化していたため計画を補正:
- スタイリングは #464 で完了済み → #477 はゼロスタイリングではなく「既存スタイルの Dialog body 適合」に修正（ステップ1全面改訂）。
- ルートは `_app/notes/$noteId/publish.tsx` へ移動済み → ステップ5のパス記述を補正。
- `PublishSettingsPage.tsx` は `<section className={PUBLISH_BODY}>` 形に変化済み（削除対象なので影響軽微）。
- デザインモック `spec/design/pages/P14-publish-settings.html` がもともとモーダル設計であることを確認。header/body/footer 構造を参照（モック固有の未実装機能=QR/safety-check/再発行等はスコープ外）。
- 見出し階層（h1 PAGE_TITLE → h2 dialogTitle、h2 section → h3）の調整をステップ1に追加。

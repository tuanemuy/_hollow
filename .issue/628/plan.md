# 実装計画 — Issue #628: ヘッダー（グローバル）UIのデザインモック見直し

**Issue:** #628
**作成日:** 2026-06-10
**複雑度:** 中〜大規模

> **スコープ判断（ユーザー決定済み）**: Issue 本文は「モック見直しが主スコープ、実装は別Issue」と明記しているが、ユーザーが「モック＋実装まで一気通貫」と決定した。よって本計画は (A) デザインモック(HTML)の複数案作成・比較確定 と (B) 確定案の実装の両方を含む。
> **方向性決定（ユーザー決定済み）**: 課題1〜4それぞれで複数案を作成・比較し、ユーザーが方向性を選ぶ。

---

## 目的

グローバルヘッダーの構造（検索の物理中央化）・CTA序列（アップロードを主役化）・モバイル方針（検索+アップロードをヘッダー常時表示、下部固定CTA廃止）を、まずデスクトップ/モバイルのモック複数案で再設計・比較確定し、その後 `Header.tsx` / `layout/styles.ts` / `BottomCtaBar` / `BottomActionBar` / `APP_MAIN` へ反映する。#588 ADR-001 のモバイルCTA退避方針を本Issueで明示的に上書きする。

### 課題（Issue 本文より）
- **課題1**: 検索入力がビューポート中央に来ない（`grid-cols-[auto_1fr_auto]` の中央列が左右非対称で物理中央からズレる）
- **課題2**: 「新規作成」が `pillBtnPrimary` で最も目立つが、本来の主役は「アップロード」。視覚的優先度と操作重要度が逆転 → アップロードを主役に
- **課題3**: モバイルのヘッダー右がアバターのみで、検索・アップロードが下部固定CTA(`cta-bar`)へ退避。モバイルでも検索+アップロードをヘッダー常時表示すべき
- **課題4**: モバイルの下部固定CTAバー（フッター）を廃止。主要導線をヘッダーへ集約。#588 ADR-001 の方針を上書き

## スコープ

> **Phase 1.5 で確定した設計（ユーザー選択済み）** — 詳細は `adr.md`:
> - 課題1 検索: 物理中央化（grid 構造変更）は**やらない**。既存モック通り（中央列 `max-w-[460px] mx-auto` + focus glow）を維持。ズレは実装側の問題（ADR-002）。
> - 課題2 CTA序列: **案2-B**（アップロード=accent ピル先頭 / 新規作成=テキストのみ格下げ）。
> - 課題3 モバイル: アップロード+新規作成を**両方アイコンのみ**でヘッダー表示（accent / surface）。
> - 追加: **ユーザーメニュー（アバター/UserMenu）をヘッダーから外しサイドバー下部へ移設**（ヘッダー右の2CTA分の幅を確保。ADR-003）。
> - 追加: ボタン高さは**検索inputに揃えて小さく**（desktop/mobile とも 36（h-9））。
> - 追加: **44px タップターゲット床の撤廃は「グローバルヘッダーの操作行」に限定**（pillBtn 基底や他画面の床は維持。ヘッダーCTA/検索/メニューのみ 36px に局所上書き。index.md §7.1 は例外として文書化。ADR-004）。

### 含まれるもの
- デスクトップ/モバイルのヘッダーモック（`spec/design/pages/P10-home.html` / `spec/design/pages/mobile/P10-home.html`）の確定案への更新（複数案比較ドラフトは `spec/design/pages/drafts/`）
- 確定案の実装: `Header.tsx`（CTA入替・UserMenu撤去）/ `layout/styles.ts`（CTA text バリアント・ボタン高さ・モバイル表示）/ `Sidebar.tsx`・`UserMenu.tsx`（ユーザー行をサイドバー下部へ移設）/ `BottomCtaBar`・`BottomActionBar` の廃止 / `APP_MAIN` 余白見直し / `BulkActionBar` の排他前提更新
- `NoteListToolbar.tsx` の #588 ADR-001 由来コメント・`max-lg:hidden` の整合（ステップ7b）
- `mobile/P13-upload.html` の `.cta-bar` 除去（本Issueが廃止する下部固定CTA）
- `spec/design/index.md` §7.1 の 44px タップターゲット指針撤廃、各モックのグローバル `min-height:44px` ルール撤去
- #588 ADR-001 の Supersede 記録

### 含まれないもの
- #626（ヘッダー⇔ツールバーのCTA重複整理。デスクトップで Header と Toolbar の両方に CTA が出る件）— 本Issueはヘッダー内序列に集中
- `mobile/P15-export.html`（`キャンセル`+`エクスポート実行`）・`mobile/P20-views.html`（`新しいビュー`）の下部バー — これらは**画面固有のアクションバー**であって本Issueが廃止する「グローバルヘッダーCTAの下部退避フッター」ではないため対象外
- P10/P13 以外のモック画面ヘッダーへの一括追従（後述の通り #620 は CLOSED 済み。Phase 4 で新規フォローアップIssueを起票して追跡する）
- `BulkActionBar` 本体ロジック（`useSelection`/`data-selected`）の変更

## 調査結果

### 関連ファイル（役割）
- `app/components/layout/Header.tsx` — グローバルヘッダー本体。`grid-cols-[auto_1fr_auto]`（左=Menu+Brand / 中央=検索form / 右=新規作成(`pillBtnPrimary`)+アップロード+UserMenu）。新規作成/アップロードは `max-lg:hidden` でモバイル時に退避。
- `app/components/layout/styles.ts` — `APP_HEADER`(grid)、`APP_HEADER_LEFT/RIGHT`、`SEARCH_BOX_WRAPPER`(`max-w-[460px] w-full mx-auto relative`)、`BOTTOM_ACTION_BAR`、`CTA_BAR_PRIMARY`、`CTA_BAR_UPLOAD`、`APP_MAIN`(`pb-20`)。
- `app/components/note/list/BottomCtaBar.tsx` — P10専用の下部固定CTA（新規作成+アップロード）。`useSelection` で選択0件時のみ描画。
- `app/components/layout/BottomActionBar.tsx` — 下部固定CTAの共有フレーム（`fixed/lg:hidden/blur/safe-area`）。
- `app/components/note/list/BulkActionBar.tsx` — **存続させる別物**。一括操作バー（選択モード時、z-45）。下部固定CTA(z-40)と `useSelection` の選択件数で排他表示。`max-sm:` でフルワイドシート、`sm:` で sticky中央ピル。本Issueの廃止対象ではない。
- `app/components/note/list/NoteList.tsx:122-124` — `<SelectionProvider>` 内に `<BulkActionBar/>` の直後で `<BottomCtaBar/>` をマウント。
- `app/components/layout/AppShell.tsx` — `<Header/>` を全認証画面で描画するシェル。
- `app/components/ingestion/UploadButton.tsx` — `#upload` hash を開く `<Link>`。`data-active`/`aria-current` 対応。Header と BottomCtaBar の両方で使用。
- `app/components/common/styles.ts` — `pillBtn` / `pillBtnPrimary` / `pillBtnIcon`(`data-icon` で `w-9 px-0`＋44pxタッチ床) / `pillBtnSm` / `pillBtnTall`。
- モック: `spec/design/pages/P10-home.html`（デスクトップ）/ `spec/design/pages/mobile/P10-home.html`（モバイル）。ヘッダーは plain HTML で各画面に逐語コピーされる方針（index.md §3）。

### あるべきアーキテクチャ / トークン / 規約
- スタイルは utility-first のみ。繰り返す class は module-scoped 定数へ（`layout/styles.ts` 等）。新規 CSS / `@apply` 禁止。
- レスポンシブは CSS variant（`max-lg:` / `max-sm:` / `sm:`）。JS ビューポート分岐は導入しない（#588 ADR-002）。
- 状態は `data-*` 属性 + `data-[x]:` variant（`data-x={value || undefined}`）。
- モバイルタッチ床は 44px（`max-sm:min-h-[44px]` / `pillBtnIcon` の `max-sm:min-w-[44px]`）。index.md §7.1。
- トークン: `--header-height:64px`、`--space-2/4/5/6/20`、`--radius-pill`/`--radius-full`、`lg=1024 / sm=640`。
- アイコン+ラベル方針（index.md §7.1/§7.2）: 主要は既定アイコン+ラベル。密度差は primary=アイコン+ラベル / secondary=テキストのみ。**アイコンのみとアイコン+ラベルを混在させない**。
- design-guide方針: spec/design のトークン・方針が正。実装とズレている場合は実装を正とする。本Issueはモック自体を更新するので確定モックが新SSOT。

### 既存実装の状態
- 現状の実装はモック（特に #588 ADR-001 のモバイルCTA退避）に**忠実に一致**。「実装とモックの乖離」ではなく、**モックの方針自体が課題1〜4の観点で見直し対象**。よってモックを更新 → 実装を追従、という順序。
- 課題1（検索中央ズレ）は構造起因の事実。課題2は実装事実（新規作成=`pillBtnPrimary`、アップロード=plain `pillBtn`）。

### 依存関係（波及範囲）
- `Header` は `AppShell` 経由で**全認証ページ**に描画される。ヘッダー変更は全認証画面に波及。
- `SEARCH_BOX_*` / `APP_HEADER*` は Header のみ消費。`CTA_BAR_PRIMARY`/`CTA_BAR_UPLOAD` は `BottomCtaBar` のみ消費。`BOTTOM_ACTION_BAR` は `BottomActionBar` のみ消費。`BottomActionBar` は `BottomCtaBar` のみ消費 → 廃止時の連鎖削除が辿りやすい。
- `NoteListToolbar.tsx:118-135` は #588 ADR-001 由来で同じ2CTA（新規作成 `pillBtnPrimary max-lg:hidden` / アップロード `max-lg:hidden`）を持ち、コメントで ADR-001 を明示参照している。Header の `max-lg:hidden` を外す本Issueの操作で、この退避理由付けが陳腐化する（ステップ7bで整合）。
- ヘッダー markup は index.md §9.3「共通要素は画面ごとに同じマークアップを貼る」方針により多数のモックページ（`header-right` grep で56ファイル）に逐語コピーされている。`Header.tsx` 変更で P10/P13 以外のモックヘッダーが乖離する → Phase 4 の新規フォローアップIssueで追跡（design-guide 方針「実装を正とする」によりブロッカーではない）。
- `BulkActionBar` は cta-bar の z-40 と排他（z-45）。廃止後、排他前提の JSDoc/挙動を見直す必要。
- `APP_MAIN` の `pb-20`（80px）はデスクトップ基準。モバイルモックの `.main` は cta-bar 分の追加余白。フッター廃止でこの追加余白は不要。

### #588 ADR-001 の現状
- 記録場所: `.issue/588/adr.md` ADR-001（Status: Proposed）。
- 内容: `BottomActionBar` frame を P10限定で配置。Header の新規作成/アップロードに `max-lg:hidden`。モバイルでは `BottomCtaBar` の下部固定CTAへ退避。`CTA_BAR_PRIMARY`/`CTA_BAR_UPLOAD` を追加。
- 本Issueはこの方針を**上書き**。ADR-001 を Superseded とし、本Issueで新ADRを `.issue/628/adr.md` に記録。

## デザイン案の選択肢（課題ごと）

### 課題1: 検索の物理中央化
- **案1-A: グリッド左右対称化**（`grid-cols-[1fr_auto_1fr]`）。左=`1fr`(始端)、中央=`auto`(検索 `max-w-[460px]`)、右=`1fr`(終端)。検索を物理中央に固定。
  - ◎ フレックス的に素直、左右の中身が変わっても中央が動かない。既存トークンのみ。
  - △ 左右要素が広い時 460px が衝突しうる（`min-w-0` で吸収）。狭幅で `1fr` 配分が痩せる。
- **案1-B: 絶対配置で中央固定**（`absolute left-1/2 -translate-x-1/2`）。
  - ◎ 完全な物理中央、左右と完全独立。
  - △ 左右要素と重なるリスク、狭幅破綻。CSS variant主義/illegal state不可視化と相性が悪い。**非推奨寄り**。
- 推奨: 案1-A が既存パターンと最も整合。

### 課題2: CTA序列（アップロード主役化）
- **案2-A: 色の入れ替え**（アップロード=`pillBtnPrimary` / 新規作成=plain `pillBtn`）。並び順もアップロードを先頭。
  - ◎ 最小変更で序列逆転。アイコン+ラベル方針を両者維持。
  - △ 新規作成の扱い（残す/格下げ）は別判断。
- **案2-B: 密度差**（アップロード=primaryアイコン+ラベル、新規作成=テキストのみへ格下げ。§7.2準拠）。
  - ◎ 視覚優先度の差がより明確。序列表現規約に厳密準拠。
  - △ 新規作成をアイコンのみにすると §7.1（混在禁止）に抵触 → テキストのみ格下げが規約整合的。
- 補足: #626（ヘッダー⇔ツールバー重複）と関連。本Issueはヘッダー内序列に集中。

### 課題3: モバイルのヘッダーに検索+アップロード常時表示
- **案3-A: アップロードをアイコンのみ常時表示**（`pillBtnIcon` の `data-icon`）。新規作成はモバイルではヘッダーから外す。
  - ◎ 44px床を満たしつつ省スペース。検索幅を最大確保。
  - △ モバイルで新規作成がヘッダーから消える（Issue必須は「検索+アップロード+メニュー+アバター」、新規作成は必須でない）。
- **案3-B: アップロード+新規作成 両方アイコンのみ**。
  - ◎ 両CTA到達可能。
  - △ 狭幅(320px)で overflow リスク、検索幅が痩せる。
- 検索のモバイル省スペース化はモック準拠（高さ短縮/placeholder「検索」/`min-w-0`）。

### 課題4: 下部固定CTA（フッター）廃止
- **案4-A: 完全削除**（`BottomCtaBar`/`BottomActionBar`/`BOTTOM_ACTION_BAR`/`CTA_BAR_PRIMARY`/`CTA_BAR_UPLOAD` 削除、NoteList から除去、モックから `.cta-bar` 除去、余白撤回、Header の `max-lg:hidden` を外す）。
  - ◎ デッドコードを残さず方針転換が完結。連鎖が辿りやすく安全。
  - △ BulkActionBar の排他前提の見直しが必要。
- **案4-B: フレームだけ残す** → dead constant を残すのはプロジェクト方針に反する。**非推奨**。

## 実装ステップ

### フェーズA: モックの再設計と比較（主スコープ前半）

#### 1. デスクトップ `P10-home.html` の複数案モック作成
- **対象ファイル:** `spec/design/pages/P10-home.html`（比較用に別名複製してよい）
- **変更内容:** 課題1（grid `1fr auto 1fr` vs 絶対配置）、課題2（アップロードを主役化・順序入替、新規作成格下げ）を反映した2案程度。
- **理由:** ユーザーが方向性を選ぶための比較材料。

#### 2. モバイル `mobile/P10-home.html` の複数案モック作成
- **対象ファイル:** `spec/design/pages/mobile/P10-home.html`
- **変更内容:** `.header-right` にアップロード追加、`.cta-bar` 除去、`.main` の余白から cta-bar 分を撤回。検索は省スペース維持。案3-A/3-B の比較。
- **理由:** 課題3・4 を実体化し、44px床・320〜430px overflow=0 を確認。

#### 2b. モバイル `mobile/P13-upload.html` の `.cta-bar` 除去
- **対象ファイル:** `spec/design/pages/mobile/P13-upload.html`
- **変更内容:** P10 と同一の「新規作成+アップロード」下部固定CTA（＝本Issueが廃止する footer）を除去し、ヘッダーへ集約する確定案の方針を反映。`.main` の余白も同様に撤回。
- **理由:** ゴール#1(4)「`cta-bar` をモックから除去」は P10 限定ではない。同一 footer パターンを持つ P13 を残すとモック間で方針が矛盾する。P15/P20 の下部バーは画面固有アクションバーのため対象外（スコープ参照）。

#### 3. ユーザーに案を提示・確定
- 確定方針を `.issue/628/adr.md` に記録（ADR-001 Supersede 含む）。

### フェーズB: 確定案の実フロントエンド実装（主スコープ後半）

#### 4. ヘッダーのレイアウト定数を更新
- **対象ファイル:** `app/components/layout/styles.ts`
- **変更内容:** `APP_HEADER` の grid は **既存 `auto 1fr auto` のまま**（ADR-002: 物理中央化はしない）。`SEARCH_BOX_*` の glow・`max-w-[460px] mx-auto` は変えない。CTA 用に **text バリアント**（枠なし・`bg-transparent`・`text-ink-secondary`）を追加。ボタン高さを検索 input に揃える（desktop/mobile とも 36（h-9））。モバイルでヘッダー右に2つのアイコンのみボタンが収まるよう調整。
- **理由:** 課題2の序列表現と、検索の見た目維持（ADR-002/003）。

#### 5. `Header.tsx` の CTA序列・モバイル表示・UserMenu 撤去
- **対象ファイル:** `app/components/layout/Header.tsx`
- **変更内容:** アップロード=`pillBtnPrimary`（accent・アイコン+ラベル・先頭）、新規作成=text バリアントへ格下げ。`max-lg:hidden` を外し、モバイルでは両方アイコンのみ（ラベル `max-sm:hidden` 等）で表示。`<UserMenu>` をヘッダーから**撤去**。退避コメント（#588 ADR-001 参照）を削除/新ADR参照へ。
- **理由:** 課題2・3、ADR-003。

#### 5b. ユーザーメニューをサイドバー下部へ移設
- **対象ファイル:** `app/components/layout/Sidebar.tsx`（下部にユーザー行を追加・下部アンカー）、`app/components/layout/UserMenu.tsx`（サイドバー文脈で使えるよう trigger/パネル配置を調整）、必要に応じて `AppShell`/Sidebar コンテナのレイアウト（`flex-col` + `mt-auto` 等で下部固定）と `styles.ts`（ユーザー行スタイル）。
- **変更内容:** サイドバー最下部にユーザー行（アバター + 表示名 + メール + caret）を置き、クリックで従来の `<Menu>` ドロップダウン（設定 / ログアウト）を開く。デスクトップ常時表示、モバイルはドロワー内。
- **理由:** ADR-003。ヘッダー右の2CTA分の幅を確保し、主要導線をヘッダーに集約。

#### 5c. 44px タップターゲット床の撤廃（ヘッダー局所のみ）
- **対象ファイル:** `app/components/layout/styles.ts`（ヘッダー用 `ICON_BTN`/`MENU_BTN`/`SEARCH_BOX_INPUT` と新設のヘッダーCTA上書き）、`Header.tsx`、`spec/design/index.md` §7.1、各モバイルモックのヘッダー局所CSS。
- **変更内容:** **`pillBtn` 基底の `max-sm:min-h-[44px]` や他画面の床は変えない**。ヘッダーのCTAに `max-sm:min-h-9!`（床を打ち消し36pxに揃える）の局所上書きを当てる。`ICON_BTN`/`MENU_BTN`（ヘッダー/レイアウト専用）の床を外し36px化（h-9）。index.md §7.1 は「一般は≈44px維持、グローバルヘッダーの操作行は検索inputに揃えて36pxの例外」と文書化。モックは**グローバル44pxルールを復活**させ、ヘッダーのみ局所36px上書き。
- **理由:** ADR-004。ヘッダー再設計の枠に収め、アプリ全体のa11y床は維持。

#### 6. 下部固定CTAの廃止
- **対象ファイル:** `NoteList.tsx`（`<BottomCtaBar/>`除去）、`BottomCtaBar.tsx`（削除）、`BottomActionBar.tsx`（削除）、`layout/styles.ts`（3定数削除）。
- **理由:** 課題4。消費箇所が一意なため安全に連鎖削除。

#### 7. BulkActionBar の排他前提を更新
- **対象ファイル:** `app/components/note/list/BulkActionBar.tsx`
- **変更内容:** cta-bar(z-40) 排他前提の JSDoc を更新。`max-sm:not-data-[selected]:hidden` の **CSS 自体は維持**（選択0件時にモバイルで空バーを出さないのは依然望ましい）し、理由付けのみ「cta-barへ床を譲る」→「未選択時に空バーを出さない」へ書き換える。z-45 は cta-bar(z-40) が消えて他に z-45 が無ければ z-40 へ戻して dead な bump を残さない。選択モードのフルワイドシート挙動は不変。
- **理由:** 課題4の副作用整合。

#### 7b. NoteListToolbar の ADR-001 由来コメント整合
- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:** `:118-135` の「#588 ADR-001 によりモバイルでヘッダーCTAが BottomCtaBar へ退避するため Toolbar の同CTAを `max-lg:hidden` で隠す」というコメントは、ADR-001 を Supersede し cta-bar を廃止する本Issueで陳腐化する。**Toolbar 側の `max-lg:hidden` は維持**（モバイルではヘッダーがCTAを担い、Toolbar の重複コピーは引き続き隠す）した上で、死んだ ADR-001 参照コメントを新ADR（#628）参照に書き換える。デスクトップで Header と Toolbar の両方にCTAが出る重複そのものの整理は #626 のスコープなので本Issueでは触れない。
- **理由:** 廃止した ADR を参照する死んだ理由付けをコードに残さない（プロジェクトの comment/ADR 整合方針）。

#### 8. レイアウト下部余白の見直し
- **対象ファイル:** `spec/design/pages/mobile/P10-home.html`・`mobile/P13-upload.html`（モック `.main`）。実装側 `app/components/layout/styles.ts` の `APP_MAIN` は cta-bar 専用の `pb` variant を持たず `pb-20` 単一値なので**維持で良い**。
- **変更内容:** 撤回対象はモック HTML 側の `.main` に入っている cta-bar 分の追加 `padding-bottom`（`calc(--space-20 + 64px)` 相当）。`pb-20`（80px）基準でモバイルでも過剰余白・見切れが出ないことを確認する。
- **理由:** フッター消失でデッドスペースを残さない。実装側に存在しない variant を探さないよう撤回対象を明示。

#### 9. 検証
- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`（NoteList系の非回帰）。

## 設計判断

- **#588 ADR-001 上書き**: ADR-001 は `Proposed`。本Issueで `.issue/628/adr.md` に新ADRを起こし、ADR-001 を **Superseded by #628** と明記。`.issue/588/adr.md` は履歴として残す。
- **検索中央化は grid対称化（案1-A）を第一候補**: 絶対配置は狭幅破綻・重なりリスク。最終はユーザー選択。
- **CTA序列**: 色入替（案2-A）を基線、密度差（案2-B）は §7.2準拠の上位案。アイコンのみ混在禁止（§7.1）を守り、新規作成格下げはテキストのみが安全。
- **dead constant を残さない**: `BottomActionBar` フレームを将来用に残す案は不採用。
- **モバイルで新規作成をヘッダーに出すかは要選択**: Issue必須は「検索+アップロード+メニュー+アバター」。案3-A を基線、案3-B を比較提示。

## リスクと注意点

- **グローバル波及**: ヘッダーは全認証ページに出る。grid列構造変更は設定系・ノート系すべてに影響。全認証ルートで表示確認が必要。
- **44pxタッチ床**: モバイルでアイコンのみにする場合 `pillBtnIcon` で44×44確保。MenuButton/avatar も維持。
- **狭幅overflow**: 320px で menu+検索+CTA+アバターが収まるか。検索 `min-w-0` 必須。案3-A が安全。
- **フッター廃止の余白**: cta-bar 分の `padding-bottom` を消し忘れると下端に空白、消しすぎると最終行が見切れる（フッター無くなるので `pb-20` で十分）。
- **BulkActionBar 非回帰**: 排他前提変更で選択モードのフルワイドシート挙動を壊さない。本体ロジックは不変。
- **モック逐語コピー方針**: ヘッダー markup は56ファイルに逐語コピーされている（index.md §9.3）。主検証画面は P10、同一footerの P13 も本Issueで対応。残る他モック画面のヘッダー追従は **#620 が CLOSED 済みのため deferral 先にできない** → Phase 4 で新規フォローアップIssueを起票して追跡する。design-guide 方針「実装を正とする」によりブロッカーではないが、放置すると次回 spec-sync/design-flow で偽陽性差分を生むため追跡は必須。

## テスト方針

- **デスクトップ（≥lg）**: 検索が左右要素幅に依存せず物理中央に来るか。アップロードが主役、新規作成が従に見えるか。
- **モバイル（320/390/430px）**: ヘッダーに 検索+アップロード+メニュー+アバター が常時表示・overflow=0。下部固定CTAが消えている。最終行が見切れず下端に過剰余白なし。44px床。
- **選択モード（モバイル）**: BulkActionBar が従来通りフルワイドシートで出る。選択0件↔1件以上の切替で破綻なし。
- **回帰**: `pnpm test`（NoteList系）。`pnpm typecheck`（定数削除の参照漏れ）。manual-test で P10 デスクトップ/モバイル確認。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク の2視点並列）
**修正した点**:
- [P-001/両視点] `NoteListToolbar.tsx` の #588 ADR-001 由来 CTA（`max-lg:hidden`＋退避コメント）の扱いが欠落 → スコープとステップ7bに追加。`max-lg:hidden` は維持しつつ死んだADR参照コメントを #628 参照へ書き換える方針を明記。
- [P-002/アーキ] deferral 先 #620 が CLOSED → リスク・スコープから #620 指名を削除し、Phase 4 で新規フォローアップIssue起票へ変更。
- [P-001/要件・S-001/アーキ] `mobile/P13-upload.html` の `.cta-bar`（同一の新規作成+アップロード footer）が漏れ → ステップ2b で除去対象に追加。P15/P20 は画面固有バーのため対象外と明記。
- [P-003/アーキ] グローバルHeader変更による56モックページのヘッダー乖離の追跡未確定 → 依存関係・リスクに明記し Phase 4 追跡へ。
- [S-002/アーキ] 案1-A の物理中央は左右列の実幅対称が前提 → ステップ4に `min-w-0`＋検索 `max-w` 維持の具体策を追記。
- [S-003/アーキ] BulkActionBar は CSS 維持・コメント理由のみ書き換え・z-45→z-40 整理可 → ステップ7に明記。

**見送った提案**: なし（要修正・改善提案ともスコープ内で反映）。

### 2周目
両視点とも問題点ゼロで終了（下記参照）。

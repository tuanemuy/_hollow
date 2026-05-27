# 実装計画 — Issue #220: アップロードはページ遷移せずモーダル／ドロワーで完結させる

**Issue:** #220
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

ヘッダー／サイドバー／ノート一覧ツールバーの「アップロード」ボタンを押すと、現在の画面の上にモーダルが開いてその場でアップロードが完結する動線にする。元の画面のコンテキスト（ノート一覧の絞り込みやスクロール位置）が保たれ、アップロード完了後はリストへ即反映される。モーダルの開閉状態は URL に反映し、リロード・共有でも復元可能とする。

## スコープ

### 含まれるもの

- ヘッダー（`Header.tsx`）・サイドバー（`Sidebar.tsx`）・ノート一覧ツールバー（`NoteListToolbar.tsx`）のアップロード CTA をモーダル起動方式に変更
- 既存 `Dialog` primitive を利用した `UploadDialog` の新規追加（`UploadForm` を内包）
- URL hash（`#upload`）でモーダル開閉状態を表現し、リロード／共有で復元できるようにする
- アップロード完了後の楽観的反映：`router.invalidate()` で現在ルートのローダーを再実行（既存 `UploadForm` の挙動を流用）
- 既存の `/upload` 専用ページはフォールバックとして維持（直リンク・ブックマーク用、取り込みキュー全件表示）
- `spec/pages/index.md` の P13 節と関連節（ヘッダー機能）に新動線を反映

### 含まれないもの

- ドロワー（サイドシート）primitive の新規追加 — モーダルで完結させる（ADR-001 参照）
- 進捗インジケータをヘッダーに常時表示する仕組み — モーダル内で完結し、詳細は `/upload` ページに任せる
- `/upload` ページ自体の UI 改修 — Issue #217 と重複するため別 Issue 範囲
- 取り込みキューのリアルタイム更新（WebSocket／polling）— 既存挙動を維持

## 実装ステップ

### 1. `UploadDialog` コンポーネント新規作成

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`（新規）
- **変更内容:**
  - `"use client"` クライアントコンポーネント
  - 既存 `Dialog` primitive を使用（`closeOnBackdropClick={true}`、`showCloseButton={true}`、`ariaLabel="アップロード"`）
  - body に `UploadForm` を配置
  - フッターに「取り込みキューを見る」リンク（`<Link to="/upload" onClick={onClose}>`）を置き、進捗確認の動線を残す
    - `onClick={onClose}` で hash も明示的にクリアし、`/upload` ページにモーダルが残らない挙動を確実にする
  - props: `{ open: boolean; onClose: () => void }`
- **理由:** Issue の主要 UI。既存 `UploadForm` をそのまま再利用することで、アップロード時の状態管理・エラー表示・楽観的更新ロジックを変更なしで使い回す。

### 2. `UploadDialogMount` コンポーネント新規作成（URL ↔ ダイアログのブリッジ）

- **対象ファイル:** `app/components/ingestion/UploadDialogMount.tsx`（新規）
- **変更内容:**
  - `"use client"` クライアントコンポーネント
  - `useRouterState({ select: (s) => s.location.hash })` で hash を購読
  - `useLocation({ select: (l) => l.pathname })` で現在パスを購読
  - hash が `"upload"` **かつ** pathname が `"/upload"` 以外の時に `UploadDialog` を `open` する（`/upload` フォールバックページではモーダルを抑止して二重 UI を回避）
  - `onClose`: `router.navigate({ to: ".", hash: () => "", replace: true })` で hash をクリア（履歴を汚さない）
    - `hash: () => ""` の Updater 形式を使う。`hash: ""` で URL バーに `#` だけ残る環境への保険として、navigate 後に `window.location.hash !== ""` ならば `window.history.replaceState(null, "", window.location.pathname + window.location.search)` のフォールバックも実行する
  - 内部に `UploadDialog` のみ含む（ロジック専用）
- **理由:** URL hash を SSOT としてダイアログ開閉状態を管理する（ADR-002 参照）。`AppShell` に一度マウントすれば、全ページから hash 経由で開閉可能。`/upload` ページでは UploadForm がページ本体にあるため、モーダルを重ねず動線を一本化する。

### 3. `UploadButton` コンポーネント新規作成（共通の起動ボタン）

- **対象ファイル:** `app/components/ingestion/UploadButton.tsx`（新規）
- **変更内容:**
  - `"use client"` クライアントコンポーネント
  - `<Link to="." hash="upload">` を内部で使い、現在ルートを保持したまま hash を `upload` に切り替える
  - **`replace` は付けない**（オープン時は履歴に積み、ブラウザ「戻る」でモーダルを閉じる挙動も自然に動く）
  - props: `{ className?: string; children: ReactNode }` のみ。callee 側がスタイル文字列を渡す（既存の `PILL_BTN`／`NAV_ITEM` を保つため）
- **理由:** 3 箇所（Header/Sidebar/NoteListToolbar）に同じ動作を散らさず、1 つのクライアント部品に集約する。サーバーコンポーネントからも呼べる。`replace` をクローズ側のみに限定するのは ADR-002 で改めて明記する。

### 4. `AppShell` に `UploadDialogMount` をマウント + RSC manifest 登録を同居

- **対象ファイル:** `app/components/layout/AppShell.tsx`
- **変更内容:**
  - 末尾に `<UploadDialogMount />` を追加
  - ファイル先頭に `import "@/components/ingestion/actions";` を追加（side-effect import）
- **理由:** 認証済みレイアウト配下の全ページでモーダルを起動できるようにする。RSC manifest 登録を `AppShell` に集約することで、各ルート個別に side-effect import を撒く必要がなくなり、将来新ルートを追加しても漏れにくい。

### 5. `Header.tsx` のアップロード CTA をモーダル起動に変更

- **対象ファイル:** `app/components/layout/Header.tsx`
- **変更内容:**
  - `<Link to="/upload" className={PILL_BTN}>アップロード</Link>` を `<UploadButton className={PILL_BTN}>アップロード</UploadButton>` に置換
- **理由:** ヘッダーが主動線。Issue 完了条件①「ヘッダーのアップロードボタンでページ遷移せずモーダル／ドロワーが開く」。

### 6. `Sidebar.tsx` のアップロード CTA をモーダル起動に変更

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **変更内容:**
  - 「管理」セクション内の `<Link to="/upload" ...>` を `<UploadButton className={NAV_ITEM}>アップロード</UploadButton>` に置換
  - `activeProps` 相当の active 表示は不要（hash 状態に応じた active は今回スコープ外、必要なら追加検討）
- **理由:** サイドバー導線も主動線の一部。一貫性を保つ。

### 7. `NoteListToolbar.tsx` のアップロード CTA をモーダル起動に変更

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:**
  - `<Link to="/upload" className={pillBtn}>アップロード</Link>` を `<UploadButton className={pillBtn}>アップロード</UploadButton>` に置換
- **理由:** ノート一覧画面からの追加導線も同じ挙動にする。

### 8. RSC manifest 登録（ステップ4で AppShell に集約）

ステップ4で `AppShell` に `import "@/components/ingestion/actions";` を入れたため、本ステップは不要。`app/routes/index.tsx` 既存の同 import は冗長になるが、削除しても害はない（残しても問題ないので変更しない方針）。

- 確認のみ: `pnpm typecheck && pnpm dev` でホーム以外のルート（`/tags`、`/views` 等）から `UploadButton` でモーダルを開き、ファイルをアップロードして `uploadFileFn` が解決されることを動作確認する。

### 9. spec/pages/index.md の更新

- **対象ファイル:** `spec/pages/index.md`
- **変更内容:**
  - グローバルヘッダーの記述（L18 周辺）の「アップロード CTA」に「モーダル起動」と追記
  - P13 アップロード（取り込み）画面の節に「主動線はモーダル（`UploadDialog`）／本画面は直リンク・ブックマーク用フォールバックおよび取り込みキュー全件表示」と追記
  - 「モーダル状態は URL hash（`#upload`）で表現し、リロード／共有で復元可能」と明記
- **理由:** Issue 完了条件④「spec/design 配下のデザインモック・ページ設計に新しい動線を反映」。

### 10. spec/design/pages/P13-upload.html の方針確認

- **対象ファイル:** `spec/design/pages/P13-upload.html`（変更しない方針）
- **変更内容:**
  - 既存 HTML モックは「フォールバックページ」のデザインとして残す（編集なし）
  - モーダル UI は `Dialog` primitive と既存 tokens に沿って実装し、別途モックは新規作成しない（軽量な dropzone + 直近キュー + フッターリンクの単純構成）
- **理由:** 既存ページのデザインはフォールバック先として有効。モーダル UI は最小構成かつ tokens 準拠で実装すれば、新規モックを追加するコストよりプロジェクトの一貫性が保てる（既存 `MoveNoteDialog` 等と同じパターン）。

## 設計判断

主要な技術判断は `.issue/220/adr.md` に記録する：

- ADR-001: 起動 UI として「モーダル」を選択（ドロワー新規 primitive を追加しない）
- ADR-002: URL 状態の表現に「URL hash」を採用（各ルートの `validateSearch` を改変しない）
- ADR-003: 既存 `/upload` ページはフォールバックとして維持

## リスクと注意点

- **`router.navigate({ to: ".", hash: () => "" })` の互換性**: TanStack Router での hash クリア挙動を実装時に確認する。`""` を直接渡すと URL バーに `#` だけ残る環境がある可能性があるため、本計画では Updater 形式（`hash: () => ""`）を採用しつつ、navigate 後に `window.location.hash !== ""` であれば `window.history.replaceState(null, "", window.location.pathname + window.location.search)` のフォールバックを最初から組み込む。
- **`<Link to="." hash="upload">`**: `to="."` が現在ルートを保持する挙動を確認。動かなければ `useLocation` で現在パスを取得し `useNavigate` で hash のみ更新する方式に切り替える。
- **`UploadDialogMount` のサーバー側無描画**: SSR 時には hash を取得できないため、初回は閉じた状態でレンダー → hydration 後に hash を読んで開く挙動になる。リロード時のチラつきは許容範囲だが、必要なら最初の paint で `Dialog` 未マウントから `mounted` 後に open する流れが既存 Dialog の SSR ガードと整合するか確認する。
- **アップロード完了後の `router.invalidate()`**: 既存 `UploadForm` はそのまま使う。ホーム画面で開けば一覧が更新され、他ルート（例: `/tags`、`/views`）で開いた場合はそのルートのローダーが再実行される（多くは無害）。
- **Issue #217 との重複範囲**: 取り込みキュー見出し削除・グローバル/ページヘッダーのアップロードボタン重複削除は #217 のスコープ。本 Issue では `/upload` ページ自体には触らない方針で衝突を避ける。
- **アクセシビリティ**: 既存 `Dialog` は focus trap・Esc クローズ・aria-modal 対応済み。`UploadDialog` は `ariaLabel="アップロード"` を渡して名前を与える。

## テスト方針

- 自動テスト: 既存ユニットテスト・integration テストの非リグレッションを確認（`pnpm test`）
- 手動テスト: `.issue/220/testing.md` 参照
- 型チェック・lint: `pnpm typecheck && pnpm lint:fix && pnpm format`

## レビュー履歴

### 1周目（要件カバレッジ視点・アーキ視点 並列）

**修正した点:**
- **[P-001 (アーキ視点)]** `UploadButton` の `<Link>` から `replace` を外した（オープン時は履歴に積む、クローズ時のみ replace）。あわせて ADR-002 に「履歴ポリシー」を明記する旨を adr.md にも反映。
- **[P-002 (アーキ視点)]** `router.navigate({ hash: "" })` を Updater 形式 `hash: () => ""` に変更し、`window.history.replaceState` フォールバックを最初から組み込む方針として plan.md「ステップ2」「リスクと注意点」に反映。
- **[P-003 (アーキ視点)]** `UploadDialogMount` の open 条件に `pathname !== "/upload"` を追加し、フォールバックページとモーダルの二重表示を抑止。

**取り込んだ改善提案:**
- **[S-001 (両視点)]** RSC manifest 登録を `AppShell` に集約（`import "@/components/ingestion/actions";` を AppShell に追加）。ステップ8は「確認のみ」に簡素化。
- **[S-002 (アーキ視点)]** ADR-002 に「履歴ポリシー（open は履歴に積む、close は replace）」セクションを追記する方針を反映（adr.md 側で実施）。
- **[S-003 (アーキ視点)]** `UploadDialog` フッターリンクで `onClick={onClose}` を呼ぶよう明記。

**見送った提案:**
- 特になし（要件カバレッジ視点は問題点ゼロ、改善提案も主にドキュメント表現の精緻化で軽微）
- testing.md の表現改善（[S-003 要件視点]）は本周で testing.md 側を併せて整える

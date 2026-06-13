# 動作確認計画 — Issue #650: 表示モード（リスト/タイル/カレンダー）の前回値を永続化し、切り替え操作自体を減らす

**Issue:** #650
**作成日:** 2026-06-13

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
# D1 マイグレーション適用（ローカル）
pnpm db:apply:local

# 認証付きルート（ホーム P10）を踏むための dev 管理ユーザー + セッションを投入
pnpm seed:dev-admin

# 開発サーバー起動（Vite + Cloudflare 開発モード）
pnpm dev
```

ブラウザで `http://localhost:3000`（dev サーバーが表示する URL）を開く。`seed:dev-admin` が発行するセッション Cookie（token `dev-admin-session-token`）でログイン状態にすると、ホーム（P10）の認証済み一覧が表示される。

> 本Issueの変更は home route のクライアントコンポーネント（`DisplayModeSwitch` / `NoteListViews`）と localStorage のみで完結し、サーバー・loader・DB スキーマには一切影響しない。よって追加のマイグレーションやシード（ノートデータ）は表示モード切替の確認には必須ではないが、各ビュー（リスト/タイル/カレンダー）のレイアウト差を体感するにはノートが数件あると分かりやすい。

### デプロイ方法

```bash
# ステージング dry-run（実際には反映しない検証）
pnpm deploy:staging:dry

# ステージング適用（必要時のみ、ユーザー確認後）
pnpm deploy:staging
```

---

## 確認項目

### 1. 表示モードの選択が localStorage に永続化される

- **対応する受け入れ基準:** AC-1
- **目的:** segmented で選んだモードが `localStorage["hollow3:noteList:display"]` に保存されることを確認する。
- **手順:**
  1. ホーム（`http://localhost:3000/`、`?display=` なし）を開く。
  2. DevTools コンソールで `localStorage.getItem("hollow3:noteList:display")` を実行し、初期状態（`null` か既存値）を控える。
  3. ツールバー右端の表示モード segmented で「タイル」をクリックする。
  4. 再度 `localStorage.getItem("hollow3:noteList:display")` を実行する。
  5. 続けて「カレンダー」「リスト」をそれぞれクリックし、都度値を確認する。
- **期待結果:** 各クリック後、値がそれぞれ `"tile"` / `"calendar"` / `"list"` に更新される。
- **確認ポイント:** 不正な値や JSON 化された値ではなく、`"list" | "tile" | "calendar"` の素の文字列で保存されること。

### 2. 永続値があれば初期表示に適用される（URL/SavedView 無指定時）

- **対応する受け入れ基準:** AC-2
- **目的:** URL に `?display=` も `viewId` も無いホーム初期表示で、前回値が復元されることを確認する。
- **手順:**
  1. 確認項目 1 で「カレンダー」を選んだ状態（localStorage が `"calendar"`）にする。
  2. アドレスバーに `http://localhost:3000/`（クエリなし）を入力して再読込する。
  3. 一覧の表示と、segmented のアクティブ表示を確認する。
- **期待結果:** 一覧がカレンダー表示で描画され、segmented も「カレンダー」がアクティブ。
- **確認ポイント:** segmented の active 表示（実効モード）と実際の一覧描画が一致していること（ズレが無いこと）。

### 3. URL `?display=` 明示指定は永続値より優先される

- **対応する受け入れ基準:** AC-3
- **目的:** 共有リンク・ブックマークの意図（URL 明示指定）が永続値で上書きされないことを確認する。
- **手順:**
  1. localStorage を `"calendar"` にしておく（確認項目 1 の手順で「カレンダー」を選ぶ）。
  2. アドレスバーに `http://localhost:3000/?display=tile` を入力して開く。
  3. 一覧表示と segmented のアクティブ表示を確認する。
- **期待結果:** 永続値が calendar でも、一覧はタイル表示・segmented は「タイル」がアクティブ。
- **確認ポイント:** URL の `?display=tile` が消えない／書き換わらないこと。`localStorage` の値（`"calendar"`）はこの操作では変化しないこと（URL 由来は永続化しない）。

### 4. SavedView 適用時は view の displayMode が永続値より優先される

- **対応する受け入れ基準:** AC-4
- **目的:** SavedView を開いたとき、保存された displayMode が前回値より優先されることを確認する（既存 redirect 経路で成立）。
- **前提:** displayMode を指定した SavedView が 1 件以上保存されていること（無ければ、任意のモードに切替後「ビューとして保存」で作成する）。
- **手順:**
  1. localStorage を、保存ビューの displayMode とは異なる値にしておく（例: ビューが list 保存なら localStorage を `"calendar"` に）。
  2. サイドバー「保存したビュー」または見出しのビュー切替から、対象の SavedView を選ぶ。
  3. URL とビュー表示を確認する。
- **期待結果:** URL が `?viewId=...&display={view.displayMode}` に正規化（redirect）され、一覧は view の displayMode で表示される（永続値は適用されない）。
- **確認ポイント:** 「ビューとして保存」で作成した SavedView の displayMode が、その時点の URL の display（＝永続値オーバーレイではなく URL 素直値）を反映していること（永続値が焼き付かないこと）。

### 5. 切替・永続値復元のいずれも loader を再実行しない（#219 維持）

- **対応する受け入れ基準:** AC-5
- **目的:** 表示モード切替がデータ再取得（loader 再実行）を起こさないことを確認する。
- **手順:**
  1. DevTools の Network タブを開き、ホームを表示する。
  2. segmented でリスト→タイル→カレンダーを順に切り替える。
  3. URL 無指定で再読込し、永続値が復元される様子を見る。
- **期待結果:** 切替操作でサーバーへの追加リクエスト（RSC ストリーム／server fn 呼び出し）が発生しない。切替は即座（1 レンダーパス）に完了する。
- **確認ポイント:** 一覧データそのものは再取得されず、表示レイアウトだけが切り替わること。

## エッジケース・異常系

### 1. localStorage 利用不可・不正値でもクラッシュしない

- **対応する受け入れ基準:** AC-6 / AC-7
- **目的:** localStorage が throw する環境や不正値が入っていても既定 list にフォールバックすることを確認する。
- **手順:**
  1. DevTools コンソールで `localStorage.setItem("hollow3:noteList:display", "bogus")` を実行する。
  2. `http://localhost:3000/`（クエリなし）を再読込する。
  3. （任意）プライベートブラウジング／localStorage を無効化したコンテキストでもホームを開く。
- **期待結果:** 不正値は無視され、一覧はリスト表示（既定）。画面はクラッシュせず、コンソールに致命的エラーが出ない。
- **確認ポイント:** React の hydration mismatch 警告がコンソールに出ないこと（AC-6）。永続値が list 以外のときの初期 1 フレームのちらつき（list→永続値）の体感も併せて確認する。

## 既存機能への影響確認

- **表示モード切替の基本動作（#219 / #626）:** リスト/タイル/カレンダーの切替自体が従来どおり動くこと。segmented の aria（`role="tablist"`/`role="tab"`/`aria-selected`/`aria-label`）が維持されていること。
- **SavedView 保存（`SaveViewDialog`）:** 「ビューとして保存」で保存される displayMode が URL 素直値（永続値オーバーレイ非適用）であること。
- **検索・フィルタ navigation:** 検索やフィルタ適用時の一覧更新（dim 表示含む）が従来どおり動き、表示モードが維持されること。

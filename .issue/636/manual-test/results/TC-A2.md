# TC-A2: ハイドレーション停止の再現確認と原因切り分け（dev サーバー再起動後）

- 実行日: 2026-06-11
- 環境: dev サーバー http://localhost:3000（再起動済み）、branch issue/635/loading-ux-assets-pending
- セッション: agent-browser `verify-dbg`（認証あり）、`verify-dbg-login`（未認証）
- 認証: `agent-browser --session verify-dbg cookies set __Host-session dev-admin-session-token --url http://localhost:3000 --secure --path /`（TC-A の方法を踏襲、有効）

## 結論

- **再現する**（dev サーバー再起動では解消しない）。
- **#636 の Suspense 分割起因の可能性が高い**。TC-A で「/login も再現するためアプリ全体の事象」と判断されていたが、**これは誤り**。/login はフォーム・入力・ボタンまで完全にハイドレートされており正常。壊れているのは Suspense 分割された認証後ルートのみ。

## 再現確認（手順 1）

| 確認 | 結果 |
|------|------|
| ホーム `/` ロード後の fiber 付与 | 35 / 1230 要素（シェルのみ）。8 秒以上追加待機しても増えない |
| 「選択モード」ボタン クリック | 無反応（checkbox 0 個のまま、BulkActionBar 出ず） |
| 表示形式タブ「タイル」クリック | 無反応（aria-selected は「リスト」のまま） |
| console error / network | TC-A 同様なし（全 200）。router state は idle |

スクリーンショット: `.issue/636/manual-test/screenshots/tc-a2/01-home-noninteractive.png`

## 切り分け（手順 2）

### (b) /login は再現しない → アプリ全体の事象ではない

未認証の新規セッションで `/login` を開いた結果:

- fiber 数は 58 / 980 だが、**ログインフォームの `<form>` / `<input>` / `<button type=submit>` すべてに React fiber が付与されている**。58 fiber はログイン画面の React ツリー全体をカバーしており（残り ~920 要素は vite/devtools 注入や SVG 内部など React 管理外）、ハイドレーションは完了している。
- `app/routes/login` 系は `SectionErrorBoundary` / `<Suspense>` を使っていない（`grep -rl SectionErrorBoundary` のヒットは認証後画面のコンポーネントのみ）。
- → TC-A の「/login も fiber 58/980 で同様」という記録は fiber の絶対数だけを見た誤判定。**Suspense 分割の有無と症状の有無が正確に相関している。**

### (a) 静的観点 + DOM 観察による仮説

観察事実:

1. SSR HTML 内の Suspense コメントマーカーはすべて `<!--$-->`（= サーバー側で解決済みとして flush）。`$?`（pending）や `$!`（client-render fallback）は 1 つもない。サーバーストリーミング自体は正常完結している。
2. ホームで fiber が付くのは `body > button`（シェル）、`<aside>`、`<main>` のコンテナ要素まで。**`<main>` / `<aside>` の第一子以下は一切付かない。`<Suspense>` 境界の外にある同期描画の `<h1>`（HomePage.tsx:62）にも fiber が付かない。**
3. fiber が付いているシェルのボタン（サイドバートグル `aria-label="メニューを閉じる"`）をクリックしても状態変化なし → ルートのハイドレーションが suspend したまま commit されていない状態と整合。

仮説（コード読解: `app/components/note/HomePage.tsx`, `app/components/layout/Sidebar.tsx`, `app/components/common/SectionErrorBoundary.tsx`）:

- `SectionErrorBoundary` 自体は純粋なクラス境界＋`useTransition` のフォールバックで、useEffect での throw 等の問題パターンはない。コンポーネント単体の不備ではない。
- 症状は「個々の `<Suspense>` 境界が dehydrated のまま」ではなく「**ルートマッチのコンテンツ全体（`<main>` 配下、Suspense 外の h1 含む）のハイドレーションが suspend したまま再開しない**」形。これは TanStack Start の RSC ストリーミングで、クライアント側 flight consumer がルートコンテンツの RSC payload（async server component セクション = `ToolbarSection` / `FilterSection` / `NotesSection`、Sidebar 側も同様）の解決を待ったまま resolve しない、という枠組み（フレームワーク側の SSR-resolved Suspense + RSC resume の組合せ）に起因する可能性が高い。
- Sidebar（`_app` シェル）も #636 で Suspense 分割されているため、`<aside>` 配下も同様に止まる。認証後の全ページに Suspense 分割が入っている（HomePage / NoteDetail / TagManager / TrashList / 管理画面群）ため「全ページ非インタラクティブ」に見える。
- console error なし・network 全 200・router idle のまま静かに止まる点も「クライアントで永久 pending の promise を待っている」仮説と整合（エラーではなく未解決）。

### 判断

- **#636 起因（Suspense 分割 × TanStack Start RSC ハイドレーションの相互作用）の可能性が高い**。根拠: (1) Suspense 分割のない /login は正常ハイドレート、(2) 分割された全ルートで再現、(3) dev サーバー再起動でも再現（サーバー状態劣化説は棄却）、(4) SSR 出力・ネットワーク・ルーター状態はすべて正常で、止まっているのはクライアントの hydration resume のみ。
- 残る切り分け候補: `pnpm build && pnpm start`（本番ビルド）での再現確認（dev 専用の vite/RSC dev トランスフォーム起因かの判別）。本 TC では未実施（時間制約）。

## テスト項目サマリ

| 項目 | 結果 |
|------|------|
| ハイドレーション停止の再現（再起動後） | 再現 = FAIL（ブロッカー継続） |
| タグトグル / タブ切替 / 選択モード → BulkActionBar | FAIL（すべて無反応、ブロッカーによる） |
| 検索・フィルタ時のスケルトン巻き戻り | 検証不能（クライアント操作不成立。native form submit 経由の検索フルロードでは巻き戻りなし — TC-A と同様） |
| /login のハイドレーション | PASS（正常 — 切り分けの決め手） |

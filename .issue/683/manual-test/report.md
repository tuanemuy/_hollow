# ブラウザ検証レポート — Issue #683

**実行日:** 2026-06-13
**テストソース:** `.issue/683/testing.md`
**サーバー:** `pnpm build`（本番ビルド / DEV=false）→ `pnpm start`（wrangler dev）→ http://localhost:8787
**シード:** `pnpm db:apply:local`（適用済み）/ `pnpm seed:dev-admin`（dev-admin@example.com）

> [!NOTE]
> 本 Issue は `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` パターンで、
> フラッシュ解消は**本番ビルド（DEV=false）でのみ観測可能**。そのため検証は
> `pnpm build && pnpm start`（:8787）の本番ビルド配信に対して実施した。

## 検証方法の限界（正直な記録）

「一瞬コンテンツ → スケルトン → 再描画」というサブ秒の視覚的フラッシュそのものは、
agent-browser の離散 snapshot（DOM が落ち着いてから返る）では**確定的に捕捉できない**。
そこで本検証は次の代理シグナルで判定した:

1. 本番ビルドが成功し、対象ルートが正常配信されること（新規 `gcTime` import・リテラル変更がビルドを壊さない）
2. 再訪（ブラウザバック / アプリ内ナビゲーション往復）後の snapshot で**コンテンツが即座に存在**し、スケルトンで固まっていないこと
3. 本番ビルド（staleTime: Infinity）で mutation 後に最新化されること = `routerInvalidate()` が唯一の更新経路として機能していること（これが効かなければ count は更新されない）

## テスト結果サマリー

| TC | 確認項目 | AC | 結果 | 備考 |
|----|---------|-----|------|------|
| TC-1 | (A) 認証済みルート再訪（ホーム） | AC-1 | PASS | home→ノート詳細→戻る で再訪時にコンテンツ即時表示（22件のノート・見出し）。スケルトン固着なし |
| TC-2 | mutation 後の即時最新化 | AC-4 | PASS（強） | タグ追加で 15→16、削除で 16→15 が即時反映。本番ビルドの staleTime:Infinity 下では `routerInvalidate()` 以外に更新経路が無いため強い裏付け |
| TC-3 | ホーム SavedView リダイレクト | AC-5 | 非ブラウザ（テストで担保） | 既存ユニットテスト（`shouldRedirectForSavedView`）green。ブラウザでは未実施 |
| TC-4 | (B) 公開ルート再訪 + gcTime import | AC-2/AC-6/AC-11 | PASS | /search・/u/dev-admin が本番ビルドで正常レンダリング（`PUBLIC_ROUTE_GC_TIME` import 動作）。/search→/about→戻る で検索結果（10件）即時表示 |
| TC-5 | (C) 静的 legal ルート再訪 | AC-3 | PASS | /about が「hollow について」見出しで正常表示 |
| TC-6 | ライブ要件ルートの非回帰 | AC-7 | 非回帰（差分ゼロ） | ⛔据え置きルートは diff ゼロ。構造的に非回帰 |
| — | DEV モード鮮度維持 | AC-8 | コード検証 | diff で `import.meta.env.DEV ? 0 : ...` パターンを確認。dev サーバーでの個別検証は未実施 |
| — | 型/lint/テスト | AC-10 | PASS | `pnpm typecheck` 通過 / `pnpm test:unit` 3697件全 PASS |

**合計:** 主要 6 項目（ブラウザ検証 PASS: 4 / テスト・コードで担保: 2）。FAIL: 0。

## 詳細ログ

### TC-1: (A) 認証済みホーム再訪（AC-1）
- セッション cookie（`__Host-session` = `dev-admin-session-token`）注入後、`/` が「22 件のノート」「すべてのノート」見出し・サイドバー・ツールバー込みでフル表示。スケルトン固着なし。
- `/`（e38: 検証ノートA改 (コピー)）→ `/notes/019e9549-...`（詳細「検証ノートA改 (コピー)」見出し表示）→ `back` で `/` へ。
- 戻り直後の snapshot で「22 件のノート」「すべてのノート — ビューを切り替え」見出しが即座に存在。キャッシュ再利用でコンテンツ settled = 背景再検証による再 suspend が起きていない挙動。

### TC-2: mutation 即時最新化（AC-4）
- `/tags`（初期「15 件のタグ」）で「新しいタグ」に `z683verify` 入力 → 「追加」クリック → 即時「16 件のタグ」。
- 確認ダイアログ経由で `#z683verify` を削除 → 即時「15 件のタグ」に復帰（テストデータ掃除も完了）。
- 本番ビルド（DEV=false → staleTime: Infinity）では loader の自動再取得が止まっているため、count 更新は mutation 後の `routerInvalidate()` がトリガーした再検証によるもの。AC-4 を強く裏付ける。

### TC-4: (B) 公開ルート（AC-2/AC-6/AC-11）
- `/search?q=hollow671` → 「公開ノートを検索」「10 件」結果表示。
- `/u/dev-admin` → 「Dev Admin」「@dev-admin」「公開ノート」表示。
- いずれも `PUBLIC_ROUTE_GC_TIME` を import する (B) 群ルート。本番ビルドで import 解決・配信が成功している＝ AC-11 の定数共有がビルドを通る。
- `/search` → `/about` → `back` で `/search` の検索結果（10件）即時再表示（gcTime 内再訪のキャッシュ再利用）。

### TC-5: (C) 静的 legal（AC-3）
- `/about` → 「hollow について」「サービス概要」見出しで正常表示。コンテンツはビルド時固定。

## 既存機能への影響
- `pnpm typecheck`: エラーなし。
- `pnpm test:unit`: 231 ファイル / 3697 テスト全 PASS（ルートテスト・SavedView リダイレクトテスト含む）。
- 本番ビルド（`pnpm build`）: exit 0。新規 `app/components/public/routeCache.ts` の import を含め成功。

## 起票した Issue
なし（FAIL ゼロ）。

## 未検証として残した項目（スコープ/手法上の限界）
- サブ秒の視覚的フラッシュそのものの確定的捕捉（離散 snapshot の原理的限界）。代理シグナルで PASS 判定。
- AC-5（SavedView リダイレクト）のブラウザ実地確認。ユニットテストで担保済み。
- AC-8（DEV モードでの staleTime:0 維持）の dev サーバー実地確認。diff のリテラルで担保。
- 初回フルロード（F5）のスケルトン残存有無の精密観察（本変更スコープ外。残れば別 Issue 化）。

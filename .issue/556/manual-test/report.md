# ブラウザ検証レポート — Issue #556

**実行日時:** 2026-06-08
**Issue:** #556 wikilink/hashtag 表示レンダリングの横展開とタグ導線
**テストソース:** .issue/556/testing.md
**サーバー:** http://localhost:3000（dev / ローカル D1）
**ブラウザ:** agent-browser 0.27.1

## 結果概要

5 テストケース実行、#556 スコープ内はすべて PASS。

- **TC-001 PASS** — 公開ノート詳細で `[[wikilink]]` が surface ピル + `/notes/public/$id` リンク、`#hashtag` が非リンク `<span class="hashtag">`。生トークン残存なし。
- **TC-002 PASS（#556 スコープ）** — 公開ノートの private 解決先 wikilink は `/notes/public/$id` リンクとして出るが、踏むとノートC の存在・内容が一切露出しない（ADR-004 のセキュリティ目的達成）。※画面が NotFound でなく汎用 500 になる点は #556 と無関係の既存ルート不具合（後述）。
- **TC-003 PASS** — auth ノート詳細で `#hashtag` が `<a class="hashtag" href="/?tagNames=%5B%22design%22%5D">` リンク。クリックで home に遷移し**実際に design タグで1件に絞り込まれる**（フィルタチップ active）。レビュー P-001 で確定した配列エンコード形式の正しさを実証。
- **TC-004 PASS** — 過去版閲覧で `[[ノートB]]` が解決リンク、`[[古い参照]]`（現行 refs に無い）が `<span class="wikilink" data-unresolved>` に degrade、`#design` がリンク。誤ったノートへ飛ばない安全な degrade を確認。
- **TC-005a PASS** — 公開・過去版とも `<pre><code>` 内の `#include` / `[[notlink]]` が生のまま無変換。`CodeHighlight` 干渉なし。

## 既存不具合（#556 スコープ外・起票候補）

**公開ノート詳細ルートが NotFound を汎用 500 として描画する。**
- 症状: 存在しない / 非公開の公開ノートを開くと「予期しないエラーが発生しました」（汎用 500）が表示され、NotFound 専用画面にならない。
- 切り分け: 存在しない公開ノート id（`...ffff`）でも同様に 500。`#556` の変更（`getPublicNote` に `renderedContentHtml` を追加・ノート取得成功後にのみ実行、`PublicNoteDetail` の描画ソース差し替え）は NotFound 経路に一切触れていないため、**本 Issue の変更とは無関係の既存問題**。
- 影響: セキュリティ（private ノートの存在・内容の非露出）は満たすが、ユーザー体験として 404 が 500 に見える。
- 推測原因: 公開ノート詳細ルートに `notFoundComponent` が未配線、または RSC コンポーネント本体で投げた `notFound()` が notFound 境界に捕捉されず汎用エラー境界に落ちている。

## 付随対応（シードの誤り・実装バグではない）

検証中、シード SQL の tag id が UUID 不正（`...t1` の `t` が16進外）で `tagRepository` が `SystemError` を throw し公開ノートA の描画が 500 になっていた。tag id を有効な16進 `...d1` に修正して解消（`/tmp/seed556.sql` とローカル D1 の両方）。

## 成果物

- サマリー: .issue/556/manual-test/results/summary.md
- シードデータ: .issue/556/manual-test/seed-data.md
- スクリーンショット: .issue/556/manual-test/screenshots/（tc-001 / tc-002 / tc-003 / tc-004 / tc-005）

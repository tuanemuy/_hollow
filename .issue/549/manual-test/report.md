# ブラウザ検証レポート — Issue #549

**実行日:** 2026-06-07
**対象:** P11 ノート詳細の backend 拡張（バックリンクのディレクトリパス + wikilink/hashtag レンダリング）
**サーバー:** `pnpm dev`（http://localhost:5180、ローカル D1）
**認証:** `pnpm seed:dev-admin` の dev-admin + `__Host-session` cookie 注入

## 結論

**6 / 6 テストケース PASS。FAIL なし。起票 Issue なし。**

実装は確定モック（main `spec/design/pages/P11-note-detail.html`）に忠実で、系統A（backlink-meta）・系統B（wikilink/hashtag レンダリング）とも期待どおり動作。

## 検証ハイライト

### 系統A: バックリンクのディレクトリパス
- 多階層配下の referrer（Research/書籍要約）→ カードに `RESEARCH / 書籍要約`（uppercase, 11px, ink-tertiary）の meta 行が出る。モック `.backlink-meta` と一致。
- root 直下の referrer（朝の散歩）→ meta 行なし（空 segments 非表示）。

### 系統B: wikilink / hashtag レンダリング
- 解決済み `[[...|表示]]` → `<a class="wikilink" href="/notes/...">`。surface ピル + アクセントドット、下線なし（既存 `.note-detail-content a` を打ち消し）。クリックでリンク先へ。
- 未解決 `[[未解決ノート]]` → `<span class="wikilink" data-unresolved>`（非リンク）。
- `#design` `#essay` → `<span class="hashtag">`、`--color-accent`（このテーマはモノクロ accent でモック準拠）。
- コードブロック `<pre><code>` 内の `#include` / `[[notlink]]` → 変換されず素のまま。`CodeHighlight` とも干渉なし。

## 既存機能への影響
- 保存 `content_html` は verbatim のまま（DB の本文に `[[...]]`/`#...` がリテラル保持されていることを seed/表示で確認）。表示変換は read path 専用。
- 自動テスト緑: `pnpm test:unit`（3317）/ `pnpm test:integration`（582）/ `pnpm typecheck`。

## 成果物
- `seed.sql` / `seed-data.md` — 投入データ
- `results/summary.md` — TC サマリー + DOM/computed-style 証跡
- `screenshots/` — note-body / backlinks / full

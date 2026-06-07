# テスト実行サマリー — Issue #549

**実行日時:** 2026-06-07
**テストソース:** `.issue/549/testing.md`
**サーバー:** http://localhost:5180（`pnpm dev`、ローカル D1）
**検証ノート:** `/notes/019e9900-0000-7000-8000-000000000001`（静かなインターフェース）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | wikilink のピル表示とリンク遷移（解決済み） | 正常系 | PASS | - |
| TC-002 | hashtag の accent 表示 | 正常系 | PASS | - |
| TC-003 | バックリンクカードのディレクトリパス meta 行（多階層） | 正常系 | PASS | - |
| TC-004 | バックリンク root 直下 referrer は meta 行なし | 正常系 | PASS | - |
| TC-005 | コードブロック内の誤変換なし | エッジ | PASS | - |
| TC-006 | 未解決 wikilink は非リンク | エッジ | PASS | - |

**合計:** 6 件（PASS: 6 / FAIL: 0）

## 証跡（DOM / computed style）

- 本文 `.note-detail-content` innerHTML:
  - `<a class="wikilink" href="/notes/019e9900-...0002">A Pattern Language を読みながら</a>`（解決済み = リンク）
  - `<span class="wikilink" data-unresolved="">未解決ノート</span>`（未解決 = 非リンク）
  - `<span class="hashtag">#design</span> <span class="hashtag">#essay</span>`
  - `<pre><code>#include &lt;stdio.h&gt;\nconst x = [[notlink]];</code></pre>`（変換なし）
- computed style:
  - `a.wikilink`: text-decoration: none / background rgb(245,245,247)（surface） / border-radius 980px（pill） / padding 1px 10px
  - `a.wikilink::before`: content "" / 4px 円（アクセントドット）
  - `span.hashtag`: color oklch(37.1% 0 0) = `--color-accent`（この "静かな" テーマはモノクロ accent。モック準拠）
  - backlink-meta（多階層）: SPAN `text-[11px] uppercase tracking-[0.06em] text-ink-tertiary`、text="Research / 書籍要約"（CSS で大文字表示）
  - root 直下 referrer（朝の散歩）: meta span なし（childCount=1）

## スクリーンショット
- `screenshots/note-detail-full.png`
- `screenshots/note-body.png`（hashtag + コードブロック + backlink-meta）
- `screenshots/backlinks.png`

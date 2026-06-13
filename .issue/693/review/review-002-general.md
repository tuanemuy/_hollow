# General Review — PR #699 (Issue #693) Round 2

対象: `app/styles/index.css` の `.note-detail-content` ブロックに GFM テーブル用スタイル（table / th,td / thead th）を追加（CSS のみ、+28行）。前ラウンド W-001（AC-4文面と ADR-001 の整合）の解消確認を含むゼロベース再レビュー。

## Blockers

なし。

## Warnings

なし。

## Notes

- **[N-001]** 前ラウンド W-001 は解消済み。`.issue/693/plan.md:20` の AC-4 が「枠線色・余白・ヘッダ背景がデザイントークン（…）を使い、既存 admin テーブルと統一されている（外枠の角丸は ADR-001 によりラッパー不在のため不採用）」に更新され、`adr.md` ADR-001（角丸・横スクロールラッパー不採用、Accepted）と完全に整合。AC-4 から「角丸」要件が外れ、ADR の決定（選択肢 C）と矛盾しなくなった。

- **[N-002]** 使用トークンは全て実在・適切（`app/styles/tokens.css` で確認）。`--color-hairline`(rgba(60,60,67,0.12), L18) / `--color-surface-elevated`(#fbfbfd, L14) / `--color-ink-secondary`(#6e6e73, L16) / `--weight-medium`(500, L64) / `--text-sm`(L53) / `--space-2`(8px, L80) / `--space-3`(12px, L81)。生の色・px の直書きは無く、CLAUDE.md のトークン SSOT 規約および ADR-002 例外領域への追記方針に準拠。

- **[N-003]** P47 admin テーブルとのデザイン整合は良好。`border-collapse: collapse`・`--color-hairline` 罫線・`--color-surface-elevated` ヘッダ背景・`--color-ink-secondary` ヘッダ文字色・`font-weight: var(--weight-medium)`・`font-size: var(--text-sm)` が `spec/design/pages/P47-admin-metrics.html` のテーブルデザイン言語と一致（`spec/design/tokens.md` と同値）。差分は (a) P47 は `.table-wrap` で外枠 border+radius＋本体横罫線のみ、本 PR は全 th/td に border を付ける格子線、(b) P47 ヘッダは uppercase。これらは「ラッパーを差し込めない `dangerouslySetInnerHTML` 本文」という制約（ADR-001）と本文可読性を踏まえた妥当な適応で、Issue が求める「セル境界の罫線」を満たす。

- **[N-004]** 既存 `.note-detail-content` 要素との一貫性あり。`img` 規則の直後（`app/styles/index.css:405-432`）、`@layer components` 内・ADR-002 例外領域に WHY コメント付きで追加。上下マージンは既存の `> * + *`（`margin-top:1.1em`, L197-199）に委ね重複定義なし。罫線色 `--color-hairline` は既存 h2 下線（L237）と同一で視覚的に統一。`font-size: var(--text-sm)` は本文 16px より小さくテーブルの情報密度向上の意図として妥当。

- **[N-005]** セレクタの過剰一致リスクは低い。追加セレクタは `table` / `th,td` / `thead th` で全て `.note-detail-content` 配下にスコープ。同コンテナ内の table はサニタイザ済み markdown 由来の GFM テーブルのみ（他に table 注入経路なし）。既存の p/h/code/pre/blockquote/ul/ol/li/img/wikilink/hashtag 規則とのセレクタ衝突なし。`thead th` は `th,td` の border 規則を継承するため罫線が連続し整合的。AC-5（既存要素無影響）も担保。

- **[N-006]** テスト根拠が妥当。WYSIWYG にテーブル入力 UI が無い制約下で、(1) 同一 markdown-it 設定での変換構造確認＋サニタイザ許可確認、(2) agent-browser による実 `.note-detail-content` 上の computed style 実測（border 1px / hairline 色 / thead 背景 #fbfbfd / weight 500）で AC-1/AC-2/AC-4 を end-to-end 確証（`.issue/693/.manual-test/results/summary.md`）。AC-3 は `.note-detail-content` 共有による構造的担保。

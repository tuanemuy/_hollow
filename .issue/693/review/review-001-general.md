# General Review — PR #699 (Issue #693)

対象: `app/styles/index.css` の `.note-detail-content` ブロックに GFM テーブル用スタイルを追加（CSS のみ、+29 行）。ドキュメント（plan / adr / testing / manual-test summary）が同梱。

## Blockers

なし。

## Warnings

- **[W-001]** AC-4 の「角丸」要件が満たされていない（ただし ADR で正当化済み）
  - 場所: `app/styles/index.css:414-418`（`.note-detail-content table` に `border-radius` なし）／`.issue/693/plan.md:20`（AC-4 が「角丸…がデザイントークンを使い」と明記）
  - 理由: 受け入れ基準 AC-4 は「枠線色・余白・**角丸**がデザイントークンを使い、既存 admin テーブルと統一」と書かれているが、実装は角丸を付けていない。文面どおりだと AC-4 は未充足に見える。
  - 提案: 実装自体は妥当（`adr.md` ADR-001 で「ラッパー無しの `border-collapse: collapse` では角丸が綺麗に効かない」ため角丸不採用を Accepted 判断として記録済み）。修正不要だが、AC-4 の文面が ADR と矛盾したまま残るのは将来の混乱の元。AC-4 から「角丸」を除く、もしくは「角丸は ADR-001 によりスコープ外」と plan.md に追記して整合を取ることを推奨。Blocker にしない理由は、設計判断が ADR に明示的に記録され Issue の主目的（罫線・ヘッダ区別）は完全に満たすため。

## Notes

- **[N-001]** トークン使用は全て実在・適切。`--color-hairline`(rgba(60,60,67,0.12)) / `--color-surface-elevated`(#fbfbfd) / `--color-ink-secondary`(#6e6e73) / `--weight-medium`(500) / `--text-sm` / `--space-2`(8px) / `--space-3`(12px) を `tokens.css` で確認。生の色・px の直書きは無く、CLAUDE.md のトークン SSOT 規約・ADR-002 例外領域への追記方針に完全準拠。
- **[N-002]** P47 admin テーブルとのデザイン整合は良好。罫線色（`--color-hairline`）・ヘッダ背景（`--color-surface-elevated`）・ヘッダ文字色（`--color-ink-secondary`）・`font-weight: var(--weight-medium)`・`border-collapse: collapse`・`font-size: var(--text-sm)` が P47 (`spec/design/pages/P47-admin-metrics.html:406-441`) と一致。差分は (a) P47 は `.table-wrap` で外枠 border+radius を持ち本体は横罫線（`tbody tr` の `border-top`）のみ、本 PR は全 th/td に `border` を付ける格子線。(b) P47 ヘッダは `text-xs` の uppercase。これらは「ラッパーを差し込めない本文 HTML」という制約（ADR-001）と本文可読性を踏まえた妥当な適応で、Issue が求める「セル境界の罫線」を満たす。
- **[N-003]** 既存要素への影響なし。追加セレクタは `table` / `th,td` / `thead th` で、いずれも `.note-detail-content` 配下のみにスコープ。`.note-detail-content` 内の table はサニタイザ済み markdown 由来の GFM テーブルだけで、他に table を注入する経路は無いため過剰一致リスクは低い。既存の p/h/code/pre/blockquote/ul/ol/img 規則とセレクタ衝突なし（grep で確認）。`thead th` は `th,td` の border 規則も継承し罫線が連続するため整合的。
- **[N-004]** 配置・スタイル方針が既存ブロックと一貫。`img` 規則の直後（ブロック末尾）に追加、`@layer components` 内・ADR-002 例外領域、WHY を説明する block コメント付き。上下マージンは既存の `> * + *`（margin-top:1.1em）に委ねており重複定義なし。`font-size: var(--text-sm)`（≒12-13px）は本文 16px より小さく、テーブルの情報密度を上げる意図として妥当。
- **[N-005]** スコープ管理が適切。テーブル編集機能・横スクロールラッパーは plan.md でスコープ外と明記され、ADR-001 で横スクロール非対応のトレードオフ（通常 2〜4 カラムで実用上問題なし＋将来 NoteBodyRenderer 側でラッパー拡張可）も記録済み。CSS のみの最小変更で Issue の主目的を過不足なく解決している。
- **[N-006]** テスト根拠が妥当。WYSIWYG にテーブル入力 UI が無い制約下で、(1) 同一 markdown-it 設定での変換構造確認 + サニタイザ許可確認、(2) agent-browser による実 `.note-detail-content` 上の computed style 実測（border 1px / hairline 色 / thead 背景 #fbfbfd / weight 500）で AC-1/AC-2/AC-4 を end-to-end 確証。`.issue/693/.manual-test/results/summary.md` 参照。

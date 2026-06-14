# Issue #644 設計判断 (ADR)

## ADR-001: メール詰まりの根本原因は inline span による ellipsis 不発。`display: flex; flex-direction: column` で縦積みを復元する

### 背景

Issue #644 は `.sidebar-user` 行のメールアドレスが「サイドバー右端に接して詰まり気味（クリップ寸前）」と報告し、対処として「`min-width:0` + `text-overflow:ellipsis` 等の余白調整余地」を示唆していた。

### 調査で判明したこと

ブラウザ実測（agent-browser, P10-home）で、示唆された方向（余白調整）だけでは症状が解消しないことが分かった:

- `.user-name` / `.user-sub` の computed `display` は **inline**。
- `text-overflow: ellipsis` / `overflow: hidden` は block / inline-block 要素にしか効かないため、両 span では**無効**だった。
- 結果、氏名「山田 一郎」とメール「yumenaut@gmail.com」が**横一列**に並び（両 span の top がほぼ同一）、メールが `.user-meta` ボックス（右端 211px）をはみ出して **234px まで伸び、caret（左端 221px）に重なって**いた。
- `.user-meta` に `padding-right` を足してもボックス幅が縮むだけで、inline 子要素の overflow は clip されず、はみ出しは解消しなかった。

CSS の構造（氏名 14px・メール 11px tertiary の 2 span が各々 nowrap+ellipsis を持つ）から、本来は**縦積み（氏名の下にメール）**が意図されていたと判断できる。inline のままだったのは確定形 (#628) 由来の見落とし。

### 決定

`.user-meta` に `display: flex; flex-direction: column;` を追加する。

- 子 span が flex item として blockify され、本来意図された**縦積み**が復元される。
- cross 軸 stretch により各 span が `.user-meta` の幅にフィットし、`text-overflow: ellipsis` が**有効化**される。長いメールは省略され、caret に被らない。
- あわせて `padding-right: var(--space-2)` を残し、省略位置と caret の間に余白を確保（Issue の「余白調整」示唆を尊重）。

### 代替案と却下理由

- **padding-right だけ（Issue の文面どおり）**: inline span の overflow が clip されないため症状が直らない。却下。
- **markup に `display:block` をインラインで付与 / 各 span の CSS を個別編集**: 33 ファイル × 2 セレクタの編集で diff が増え、確定形の単一ブロックを崩す。`.user-meta` 1 行の追加で同一効果が得られるため却下。
- **`.user-meta` に `overflow:hidden` を付与**: 横一列のまま clip されるだけで、意図された縦積みにはならない。却下。

### スコープ

`.sidebar-user` 行のみ。同じ "YK" を持つ `P21` の `avatar-large`（プロフィール編集フォーム・表示名「柏木 結衣」）、`P45` の `user-avatar`（別人「森崎 結」@yk_morisaki）は別文脈のため変更しない。

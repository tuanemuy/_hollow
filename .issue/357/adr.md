# ADR — Issue #357: サイドバー/左ナビ整理

## ADR-001: タグ件数バグの修正方式比較 → read-time 集計（Option B）で別Issue #365 へ切り出し

### Status
Accepted（実装は #365）

### Context
タグの `note_count` が常に 0 と表示されるバグについて、調査の結果「件数列を更新する `Tag.incrementNoteCount`/`decrementNoteCount` の呼び出しが `mergeTags.ts` の1箇所しか無く、ノート保存系 usecase に配線されていない」ことが根本原因と判明した。`note_tags` 行は正しく書かれており真実源は存在するが、非正規化キャッシュ列 `tags.note_count` に反映されていない。

修正方式を3案で多観点比較した:

- **A 維持列（現 spec 設計）:** note保存系 usecase でデルタ更新＋backfill。`spec/domains/tag.md:22`「保持・イベント駆動」に忠実だが、create/save/duplicate/restoreRevision/purge/merge の全 write path への配線が必要で、新規タグの pending 読み取り・OCC のタグ単位save・mergeTags のセマンティクス整合・`>=0` アンダーフローなど脆さが多い（今回のバグ自体がこの設計の配線漏れの結果）。
- **B read-time 集計:** `tagRepository.findByOwner` で `note_tags` を LEFT JOIN + GROUP BY COUNT し都度算出。単一真実源・ドリフト不可能・migration不要で既存データも即修正。`note_count` 列とソート索引は死蔵化。
- **C 独立 read-model（outbox projection）:** 件数を Tag 集約から分離した read-model に射影し outbox で維持。責務分離は最良だがテーブル新設＋eventual consistency。

観点別の要点:
- **単一真実源/ドリフト耐性:** B が構造的に最強（算出のため原理的にズレない）。A は二重化でドリフト。
- **責務分離:** 件数は read の関心。B（listTags が算出）が素直。A は Tag 集約に他集約の集計を状態として持たせ越境。C は分離最良。
- **並行性:** A は人気タグ行が write hotspot（個人領域なので実害小）。B/C は無し。
- **進化耐性:** 定義変更（trashed 除外等）が B はクエリ1本、A は再導出＋再backfill＋再配線。
- **インフラコスト（Cloudflare D1: rows read/written 課金）:** 読み >> 書きのため、集計を書き側に寄せる A/C は読み取りが O(タグ数) で安く総 rows read を抑える（spec の維持列＋ソート索引はこのコスト最適化として筋が通る）。B は高頻度の listTags 毎に owner の note_tags を read 増幅。ただし**現規模（個人領域・タグ数十〜数百・note_tags 数千/ユーザー）では B の追加コストは絶対額で誤差**。B が高くつくのは多ユーザー×高頻度閲覧で大規模化してから。

### Decision
**現在の規模では Option B（read-time 集計）を採用**する。真実源を `note_tags` に一本化し、件数セマンティクスは active（非 trashed）ノート基準に統一する。元 Issue #357 はサイドバー整理（フロント）が主旨でバックエンド・データ整合の本件とは関心が異なるため、**別 Issue #365 に切り出して対応**する。将来マルチユーザー共有タグや大規模化で読み取りコストが問題化する場合は C（独立 read-model）への移行を再検討する。

### Consequences
- 良い点: 単一真実源で配線漏れ・ドリフト・`>=0` アンダーフローが構造的に消滅。migration 無しで既存データも即正しく表示。件数定義の変更が容易。
- トレードオフ: `note_count` 列と `idx_tags_owner_note_count` 索引が死蔵化（撤去要否は #365 で判断）。大規模化時は読み取りコストが増えるため C への移行余地を残す。

---

## ADR-002: ディレクトリツリーのハイライト統一手段（Tailwind :has() バリアント）

### Status
Proposed

### Context
treeitem のホバーハイライトは行ラッパー `TREE_ITEM_ROW` 全体に、選択ハイライトは `flex-1` の `TREE_ITEM_LINK`（Link）のみに適用されており、caret 列・action 列を含む/含まないでハイライト幅が一致しない。TanStack Router の `activeProps` は Link にしか付かないため、選択状態を行ラッパーへ素直に渡せない。

### Decision
Tailwind の `:has()` バリアントを使い、行ラッパー `TREE_ITEM_ROW` が子 Link の選択状態（`a[data-active]` / `a[aria-current=page]`）を検知してホバーと同じ `bg-surface` を行全体に塗る。`TREE_ITEM_LINK` 側からは背景の選択スタイルを外し、太字等の文字装飾のみ残す。`has-[a[...]]` のタグ修飾で disclosure button の `data-open` 等を誤検知しないようにする。

### Consequences
- 良い点: DOM や状態を増やさず、ホバーと選択で同一の行ボックスを塗れる。CLAUDE.md の `data-*`＋variant 方針に沿う。Tailwind v4 でネイティブ対応。
- トレードオフ: rename 中は Link が非表示になり行ハイライトも消える（編集中は選択ハイライト不要なので許容）。`:has()` を避ける方針が出た場合は、`DirectoryTree.tsx` 行 div に算出済み active フラグを `data-active` で渡し `data-[active]:bg-surface` を行側に置く代替へ切替。

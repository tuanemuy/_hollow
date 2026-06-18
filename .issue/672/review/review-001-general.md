# General Review — PR #709 (Issue #672)

対象: ノート詳細パンくずの起点「すべてのノート」を廃止する
レビュー観点: General Review（正確性 / アクセシビリティ / スタイル規約 / テスト / JSDoc / スコープ）

## 受け入れ基準の検証

| AC | 内容 | 判定 | 根拠 |
|----|------|------|------|
| AC-1 | パンくずに「すべてのノート」リンクが出ない | 満たす | `<Link to="/" search={HOME_SEARCH}>すべてのノート</Link>` を削除（NoteBreadcrumb.tsx）。テスト 2 件（非ルート/ルート直下）で `textContent` に含まれないことを検証。 |
| AC-2 | 非ルートで `seg › seg › title`、先頭区切りなし | 満たす | セグメント先頭は `index > 0 && <Separator />`、タイトル前は `segments.length > 0 && <Separator />`。3 要素→区切り 2 個。テストで順序・区切り数・先頭span内に区切りなしを検証。 |
| AC-3 | ルート直下はタイトルのみ・区切りなし | 満たす | `segments` 空時は map が空、`segments.length > 0` が false で末尾区切りも出ない。`aria-current="page"` のタイトルのみ。テストで区切り 0 / リンク 0 を検証。 |
| AC-4 | 各セグメントは `directoryId` 絞り込みリンク | 満たす | `search={{ ...HOME_SEARCH, directoryId: segment.id }}` 維持。テストで `data-to="/"` と `directoryId` を検証。 |
| AC-5 | JSDoc が新仕様に整合 | 満たす | 「すべてのノート」起点の記述を削除し、「要素間のみ区切り・先頭なし・ルート直下はタイトルのみ」に更新。ADR-002 参照も保持。 |
| AC-6 | 表示仕様を検証する自動テストがある | 満たす | 新規 `NoteBreadcrumb.test.tsx`（5 ケース）。`NoteDetail.test.tsx` が `NoteBreadcrumb` をモックする実態を踏まえ専用テストを新設しており妥当。 |

すべての AC が実装・テストの両面で満たされている。

## Blockers

なし

## Warnings

なし

## Notes

- **[N-001]** 区切りロジックの正確性は二重に担保できている — NoteBreadcrumb.tsx:49,60。先頭抑止（`index > 0`）と末尾区切りのガード（`segments.length > 0`）が独立しており、ルート直下（segments 空）では map・末尾区切りともに描画されず先頭区切りの取りこぼし／二重区切りの懸念はない。`Separator` を関数コンポーネントに抽出したことで重複描画も解消されており、リスク欄の懸念（先頭区切り取りこぼし/二重区切り）はテスト AC-2/AC-3 でガードされている。

- **[N-002]** テストの区切りカウント手法は健全 — NoteBreadcrumb.test.tsx:452-456。`span[aria-hidden="true"]` を区切り数の代理にしているが、`Separator` のラッパ `<span aria-hidden>` だけが該当する。セグメントラッパ span（`flex items-center gap-1.5`）と `aria-current` span は aria-hidden を持たず、`Icon` が生成する装飾 SVG は `svg[aria-hidden]` であって `span` ではないため選択子に掛からない。カウントは正確。

- **[N-003]** アクセシビリティは規約・WAI 慣行に整合 — `nav aria-label="パンくず"` を維持、末尾タイトルは `aria-current="page"` の非リンク、区切りは `aria-hidden="true"` で支援技術から除外。ルート直下で nav の情報量がタイトルのみになる点・h1 とタイトルが二重になる点は plan.md「リスクと注意点」でユーザー確認済みの決定であり、本変更で新規に生じた問題ではない。

- **[N-004]** スタイル規約準拠 — utility-first を維持し新規 CSS / `@apply` なし。反復ユーティリティは `SEP` / `CRUMB_LINK` の module-scoped 定数で従来どおり。コメントは「Cumulative id path is unique...」の WHY コメントのみで最小主義に沿う。`HOME_SEARCH` import はセグメントリンクで引き続き使用されており未使用 import ではない（plan の見直し方針どおり）。

- **[N-005]** スコープは逸脱なし — 変更は `NoteBreadcrumb.tsx` と新規テストのみ（加えて `.issue/672/` 配下の計画・検証ドキュメント）。`NoteMetaPanel.tsx` の「すべてのノート」フォールバックや中間セグメントのリンク粒度（ADR-002 で別Issue化済み）には手を付けておらず、ドメイン/ユースケース/アダプター層への波及もない。`NoteDetail.tsx` も props 形不変で未変更。ルート直下＝タイトルのみという決定は ADR-002（ルートディレクトリ id を `directoryId` フィルタに渡さない）とも整合。

## Verdict

APPROVED

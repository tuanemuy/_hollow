# PR Review #002 — feat(#605): 公開面の published_at 基準の並び替え・期間集計

**PR:** #611
**Date:** 2026-06-09
**Round:** 2回目（review-001 の B-001/W-001 修正後の再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（意図的挙動の確認のみ）
- Verdict: **APPROVED**

---

## B-001 修正の再レビュー（date 窓の surface 別 basis 化）

**判定: 解消（Blocker 0 / Warning 0）**

- 公開 facet 経路も published_at 化を確認: `countPublicSearchFacets`（`dateBasis: 'published_at'`）→ `SearchService.countFacets`（query を forward）→ `searchIndex.countByDateRanges` で `q.dateBasis` を読み `buildDateRangeClause(range, basis)` が `ps.published_at` を選択、`joinPublication` も同述語。port シグネチャを変えず query 経由で basis 伝播。
- `query`/`countByDateRanges` × MATCH/LIKE の 4 経路すべてで basis 分岐が一貫。列選択が `buildDateRangeClause` 1 箇所に集約。
- private own-notes（publication_states 行なし）が `date_for_calendar` 窓で脱落しないことを新規 integration テスト（MATCH/LIKE 両経路、out-of-window 除外も assert＝no-op でない）で固定。
- `dateBasis` デフォルト `date_for_calendar` で後方互換維持。集約境界（published_at=publication / date_for_calendar=note projection）保持。
- Notes: public で `published_at IS NULL` の行が published_at 窓から除外されるのは「公開日未設定は公開日窓に出さない」意味として正しい（意図的）。W-002（SSOT 化）は basis 比較が単一定数・列選択1箇所に集約され実質解消。

## W-001 修正の再レビュー（タグ候補の host-var 安全化）

**判定: 解消（Blocker 0 / Warning 0）**

- チャンク分割（`selectInChunks` / `SAFE_CHUNK_SIZE=90`）で host-var 上限を確実に回避。
- in-memory ソートが SQL 版 `listSortedAll` と同順序: published_at desc/asc + note_id 昇順 tie-break（order 非依存）が SQL の `ORDER BY` と完全一致。published_at は固定幅 ISO-8601 文字列保存のため辞書順＝時系列順。
- total と page が同一 merged 配列由来で `page.length ≤ total`・窓と total 独立（#30）を担保。
- 候補経路で `notes.status='active'` JOIN を省いた判断は正当: 候補は `findByOwner({status:'active', tagIds})` 由来＝active 限定で trashed 混入なし。さらに usecase の `findByIds(...).filter(status==='active')` で二重防御。
- no-candidate 経路は active JOIN 維持で P-002（trashed-but-public の total 膨張防止）を継続。
- 集約境界保持（adapter は publication_states ＋ active ゲート用 notes のみ、note_tags 非 JOIN）。
- 新規テスト（候補120件 >90）でクロスチャンク順序・total(120)・ページ境界・候補交差を実値照合。

---

## Design Decisions

- ADR-006（W-001: チャンク＋in-memory 合成）、ADR-007（B-001: `SearchQuery.dateBasis` で surface 別 basis 明示）を `.issue/605/adr.md` に追記済み。ADR-007 は ADR-005 項3 の surface-blind な gate を是正。

## 完了判定

review-002 にて **Blocker 0 件・Warning 0 件**。1ラウンドクリーンで Phase 3 レビュー完了。**APPROVED** → Ready for review に切替。

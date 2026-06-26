# Plan Review (Round 2) — アーキテクチャ整合性・実現可能性・リスク

**対象:** Issue #779 / `.issue/779/plan.md` / `.issue/779/adr.md`
**観点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**結論:** 1周目の指摘（P-001, S-001〜S-003）はすべて正しく反映されており、実ファイルで行番号・波及範囲を再検証した結果も整合。反映後の plan に新たな矛盾・見落とし・副作用は検出されなかった。**問題点ゼロ**。

---

## 1周目指摘の反映確認（実ファイル再検証）

- **[P-001 反映確認 — OK]** テストフィクスチャ4箇所の `SearchTitle.create` → `SearchHighlightedTitle.create` 置換が依存関係(plan L53-57)とステップ6(plan L120-124)に明記された。実ファイルで行番号を再確認し、すべて正確:
  - `app/core/application/dto/__tests__/search.test.ts:17` ✓（`title: SearchTitle.create("hit")`）
  - `app/core/application/search/__tests__/searchOwnNotes.test.ts:111` ✓
  - `app/core/application/search/__tests__/searchPublicNotes.test.ts:86` ✓
  - `app/core/domain/search/__tests__/service.test.ts:105` ✓
  - 追加検証: 4ファイルとも `SearchTitle` の用途は当該 `SearchHit.title` 構築の1箇所のみ（他に `SearchTitle` 使用なし）。よって plan の「import も差し替える」（追加でなく置換）が正確。`service.test.ts` の `SearchDocument` は `fromSnapshot` 経由で `SearchTitle` を直接使わないため影響なし。
  - 波及網羅性: `SearchHit.title` を直接構築する全サイトを grep で再確認。アダプター `searchIndex.ts:447`（`toHit`、ステップ2で対応）＋上記テスト4箇所が**全件**。`entity.ts:95/123` は `SearchDocument.title`（保存用、`SearchTitle` 据え置きで正しく不変）、`valueObject.test.ts` は `SearchTitle` VO 自体のテストで無関係。**他に残存する直接構築箇所なし。**
- **[S-001 反映確認 — OK]** `SEARCH_HIT_MARK` JSDoc のタイトル適用更新がステップ5(plan L115)に追加された。
- **[S-002 反映確認 — OK]** `searchUserPublicNotes` の描画コンシューマ不在を「確認済み・既定 true で確定」と closed 化（plan L72/L138, ADR-002 Consequences L68）。未決事項として残っていない。
- **[S-003 反映確認 — OK]** `SearchHighlightedTitle` cap 超過の `DataIntegrityError` 経路が実質到達不能である旨と再導出根拠（trigram 最小一致3文字→最悪区間≈50→overhead≈650→合計≈850<1024）を VO JSDoc に明記する方針がステップ1(plan L95)と ADR-001 Consequences(L37)に追記された。

## 反映後の新規確認（矛盾・副作用なし）

- **P32 モック行番号引用の正確性**: AC 表の引用を実ファイルで照合。L511 `.result-title mark, .result-snippet mark` ✓ / L928 タイトル `<mark>Outbox</mark>`（AC-1 根拠）✓ / L984 タイトル無マーク "Cloudflare Workers + D1 のパフォーマンス計測"・L985 スニペット `<mark>Outbox</mark>`（AC-3 根拠）✓。すべて正確で、反映時に誤った行番号を混入していない。
- **AC↔ステップ紐づけ（1周目修正の維持）**: AC-1=1,2,5,6 / AC-5=1,2,3,4,7 が維持され、ステップ3（自ノート opt-out）が AC-5 側に正しく置かれている。反映で再反転していない。
- **テスト import 置換の安全性**: 上記の通り4ファイルとも `SearchTitle` 単一用途のため置換が non-breaking。reflection が新たな typecheck 破壊を生まない。
- **層責務・後方互換・LIKE フォールバック**: 1周目で裏付け済みの論点（FTS col0=title、`highlight()` 全文返却、cap 1024、`SearchQuery.highlight` 既定 true、`runLikeQuery` プレーン）は plan 本文で変更されておらず、整合は維持。

---

#### 問題点（要修正）

問題点ゼロ。

#### 改善提案（検討推奨）

なし（1周目の S-001〜S-003 はすべて反映済み。新規提案なし）。

#### 良い点

- 1周目 P-001 の反映が「列挙＋行番号＋import 置換方針」まで具体化され、実ファイルと完全一致。波及網羅性（直接構築サイトが toHit＋テスト4件で全件）も裏取りできる粒度で記述されている。
- S-002 の closed 化により `searchUserPublicNotes` の扱いが「実装時判断不要」と確定し、実装フェーズの曖昧さが排除された。
- VO cap の到達不能根拠（S-003）を JSDoc に残す方針が `LIKE_SNIPPET_CHARS` の caveat コメント精度と揃え、将来の cap 変更者への配慮が一貫している。
- 反映作業がスコープを広げず、既存の妥当な設計判断（ADR-001/002）に手を入れていない。over-engineering なし。

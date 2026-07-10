# Plan Review — Issue #818（Round 2 / アーキテクチャ整合性・実現可能性・リスク）

**対象:** `.issue/818/plan.md` / `.issue/818/adr.md`
**視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク（1周目指摘の解消確認）
**日付:** 2026-07-10

Round 1 の指摘（P-001 と S-001〜S-007）が計画・ADR に反映されているかを、参照ファイルを実際に開いて再検証した。特に最重要だった **P-001（data-open 参照バグ）の修正が Tailwind 仕様・既存規約と整合し、実際に開閉が効くか**をコードで裏取りした。結論として全指摘が適切に解消されており、新規の要修正は無い。

---

#### 問題点（要修正）

**問題点ゼロ。**

Round 1 の全指摘が反映済みで、修正内容はいずれもコード上正しい。以下、主要点の裏取り結果:

- **P-001（data-open 参照先）— 解消かつ実装可能性を確認。** 計画は `data-open` を `data-[open]:` バリアントを消費する **`metaBody` 自身**に置く方式へ修正済み（plan L102/L135-136/L178、ADR-004）。実コードで既存規約を全数確認した: `data-open` 属性の出現箇所は `AppShellDrawer.tsx`(L192 backdrop / L200 aside)・`NoteActionsMenu.tsx`(L50)・`DirectoryActionsMenu.tsx`(L66)・`SearchFilterDrawer.tsx`(L386/L393)・`TagActions.tsx`(L186) の全てで、**`data-[open]:` を持つ要素自身**に付与されている。`group-data-*` の使用はリポジトリ全体で**皆無**。Tailwind の `data-[open]:` は `&[data-open]` にコンパイルされるため、`metaBody` 自身に置く本方式は開閉が確実に効く。加えて `metaBody = max-sm:hidden data-[open]:max-sm:block sm:block` は、`data-[open]:max-sm:block`（`.class[data-open]` = 属性セレクタ 1 個ぶん詳細度が高い）が `max-sm:hidden` にソース順非依存で勝つため、開時 block／閉時 hidden／`sm`+ は常時 block（デスクトップ不変）と、意図どおり動く。container（`metaDisclosure`）を枠/surface のみ・開閉非依存とする判断も正しい。→ **修正は妥当、実装着手可。**
- **S-001（キャレットのタップ領域）— 解消。** 縦方向のみ拡大・`TOUCH_TARGET_SQUARE` 非適用・行側（`dirTreeItem max-sm:min-h-[44px]`）でタップ床担保が plan S6(L150-151)・UI 設計(L103)・リスク(L186)・テスト(L198) に反映済み。`absolute left:${indent}` と `paddingLeft: indent+22` の整合を崩さない旨も明記。
- **S-002（min-h の source-order 依存）— 解消。** `min-h-[52vh] sm:min-h-[480px]`（モバイルファースト順、`sm:` min-width が base を確実に上書き）へ反転済み。plan S7(L158-161)・UI 設計(L104) で 3 ファイル統一を明記し、テスト項目(L200) も追加。`HEADER_CTA_COLLAPSE` の source-order 前例も引用済みで、判断根拠が正確。
- **S-003（z-40 保存バーによる候補パネル遮蔽）— 解消。** リスク項(L189)に z 遮蔽を新設し、テスト項目(L199)に「メタ展開中に候補を開いたとき末尾が保存バーに隠れないこと」を追加。ボトムシート化（`popoverSheetPanel`）の退避策も併記。
- **S-004（filterChipRemove を import しない）— 解消。** 流用プリミティブ節(L52)・S1(L116) に「濃色チップ専用ゆえ import せず寸法のみ参照、色/箱はタグ文脈で独立」と明記。
- **S-005（タグ × にタップ床を適用しない意図）— 解消。** S5(L144) に明文化。mock `.tag-chip .x`（`min-height:auto`）とモック方針との整合も記述。
- **S-006（aria-controls）— 解消。** S4(L135/L137) で `metaBody` に `id="editor-meta-body"`・summary に `aria-controls` を付与。
- **S-007（パス解決の重複）— 解消。** `resolveDirectoryPath(tree, id)` 相当の純関数抽出を UI 設計(L102)・S4(L138) に明記し、trigger と preview で共有。

新規リスクの追加確認: 固定保存バーは修正後も `editorTopbar`（`flex … max-sm:flex-col`）→ `form`（`flex flex-col max-sm:pb-…`）配下に残るが、いずれも transform/filter/backdrop-filter を持たないため viewport 基準の含有ブロックが保たれる（Round 1 の `main` 祖先検証を、より内側の直接祖先まで延長して確認）。`max-sm:fixed` 化で editorActions がフローから外れても、topbar のカラム積み上げ・`max-sm:ml-0` による `ml-auto` 相殺は破綻しない。新たな破綻要因は無い。

---

#### 改善提案（検討推奨）

- **[S-001]** `metaDisclosure` / `metaBody` の styles.ts 定数に「なぜ `data-open` を body 自身に置くか（container/group ではない）」の why コメントを付す / 理由: P-001 は「container に戻す」誤修正で再発しやすい。本リポジトリは `directory/styles.ts` L18 で disclosure の `data-open` 取り違え防止コメントを持つ前例があり、同種の一文（例: 「`data-open` は `data-[open]:` を消費する body 自身に付く。container/group ではない — ADR-004」）を残すと、将来の回帰を機械的に防げる。低コストで規約と整合する堅牢化。

---

#### 良い点

- **P-001 修正の裏取りが規約レベルで完結している。** ADR-004 が「group-data はリポジトリで皆無、既存は要素自身に data-open」という調査結果を根拠に (a) を採用しており、この主張は実コード全数（6 コンポーネント）と一致。修正が「効く」ことがコンパイル後セレクタの詳細度まで含めて追える。
- **モックとの意図的差分の扱いが一貫。** タグ × の裸グリフ維持・save-status 非複製・保存/キャンセルの mobile 等幅化を「モックは触らず差分を計画に明記」する方針で統一し、後続実装者が差分を欠陥と誤認しない設計になっている。
- **リスク認識が Round 1 で網羅され、Round 2 で追加破綻が出ない。** 含有ブロック・z 遮蔽・source-order・二重 aria-live・保存状態の可視性トレードオフまで、想定される落とし穴が漏れなくリスク項/テスト項目に落ちている。プレゼンテーション層に閉じたスコープ、既存プリミティブ流用、SSOT 尊重（トークン追加不要）も一貫して健全。
- **ADR の粒度が適切。** ADR-001〜004 が「なぜこの選択肢か／トレードオフ／引き継ぎ」を簡潔に押さえ、特に ADR-004 が Round 1 の学びを設計判断として恒久化できている。

---

#### 総評

Round 1 の要修正 P-001 と全改善提案 S-001〜S-007 が適切に反映され、修正内容はいずれもコード・Tailwind 仕様・既存規約と整合する。data-open 開閉方式は実コードで裏取り済みで確実に機能する。**要修正ゼロ。** 残る改善提案（本 round S-001）は回帰防止コメントの任意追加のみで、実装着手を妨げない。**APPROVED。**

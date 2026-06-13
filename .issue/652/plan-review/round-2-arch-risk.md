# Plan Review — Issue #652 (Round 2, アーキテクチャ整合性・実現可能性・リスク)

レビュー視点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**
対象: `.issue/652/plan.md` / `.issue/652/adr.md`
照合した実コード: `usePopover.ts`, `Popover.test.tsx`（実ファイル）, `translateX(` / `clampToViewport` の全 grep
1周目指摘の反映確認: round-1-arch-risk.md（P-001 / S-001 / S-002 / 補足ステップ連番）

---

#### 問題点（要修正）

問題点ゼロ。

1周目で「実装で確実に踏む地雷」とした P-001（既存 `applies a translateX clamp` テストの破壊）は、2周目で計画の複数箇所に正しく織り込まれている。実コードとの突き合わせでも矛盾は無かった。

- 既存テストの実体を確認: `Popover.test.tsx:305` は `expect(panel()?.style.transform).toContain("translateX(")` で、まさに 1周目で指摘した `translateX(` 文字列マッチ。計画 (C) で `translate(${shiftX}px, ${shiftY}px)` に変わると `translateX(` 部分文字列を含まなくなり確実に失敗する、という因果は実コードで裏取りできた。
- 計画の反映状況:
  - 実装ステップ4 冒頭に「**既存テストの更新（必須）**」として `Popover.test.tsx:305` を名指しし、`translateX(8px)` → `translate(8px, 0px)` で文字列が変わる旨と更新後の期待値（`toContain("translate(")` または `translate(<shiftX>px, 0px)` 完全一致）まで明記。
  - 「リスクと注意点」先頭に同趣旨を再掲し、AC-2「回帰なし」への影響を明示。
  - 「テスト方針」にも「既存の `applies a translateX clamp` テストのアサーションを新 transform 形式に更新（必須）」を記載。
  - 受け入れ基準 AC-2 の対応ステップにも反映。
- 1周目 S-001（`translateX(` の grep 影響範囲）も計画リスク欄に「`translateX(` の参照は `usePopover.ts` 本体とこのテスト1箇所のみ」と取り込み済み。本レビューで grep を再実行し、ソース上の `translateX(` は `usePopover.ts:154`（変更対象本体）と `Popover.test.tsx:305`（更新対象）の2箇所のみであることを独立に確認した（`BrandLogo.tsx` の `translate(` は SVG 属性で無関係）。計画の主張は正確。
- 1周目 S-002（`computeShiftY` JSDoc の natural rect 前提明記）も実装ステップ1/(A) に「JSDoc は `computeShiftX`（`usePopover.ts:52-59`）と対称に natural（unshifted）rect 前提を明記」として反映済み。

#### 改善提案（検討推奨）

- **[S-001]** 既存テスト更新の「完全一致」案を採る場合、shiftX の符号に注意する旨を一言添えると親切（軽微）
  - 理由: 既存 DOM スタブテスト（`Popover.test.tsx:283-314`）は `left:800, right:1080, innerWidth:1000` をスタブしており、`computeShiftX` の出力は `1000 - 8 - 1080 = -88`（負シフト）。計画が完全一致を選ぶなら期待値は `translate(-88px, 0px)`（縦は 0、`top/bottom` がスタブで 0 のため `computeShiftY` も 0）になる。計画は `translate(<shiftX>px, 0px)` と一般形で書いており誤りではないが、`<shiftX>` が負値（`-88px`）になる具体値を実装者が取り違えないよう、`toContain("translate(")` の緩い方を第一候補に据える方が破綻しにくい。これは round-1 で既に指摘済みの範囲内で、計画にも両案併記があるため実害はほぼ無い。

#### 良い点

- **1周目の核心指摘（P-001）が、ステップ・リスク欄・テスト方針・受け入れ基準の4箇所に一貫して反映**されており、実装者が見落とす導線が塞がれている。単に「対応した」だけでなく、変更前後の文字列（`translateX(8px)` → `translate(8px, 0px)`）と更新後の期待値の選択肢まで具体化しており、計画段階で地雷を固定できている。
- **核心ロジック（rect 一回取得→両軸同時算出、再計測ループなし、`translate(x,y)` 合成）の実現可能性は再確認しても妥当**。実コード `usePopover.ts:136-151` の既存 layout effect は依存 `[open, clampToViewport]` で state を含まず、effect 内で `shiftX`/`shiftY` はリセット済み 0 → `getBoundingClientRect()` は natural rect を返す。同一 rect から両軸を算出するだけなので再計測ループは構造的に起きない。計画 ADR-002・リスク欄の記述と実コードが一致。
- **狭幅スキップの #588 ADR-003 整合は再確認しても正しい**。既存 `window.innerWidth < POPOVER_SHEET_BREAKPOINT` 早期 return（`usePopover.ts:145`）が垂直クランプもゲートする設計で、`max-sm:fixed max-sm:bottom-0` ボトムシートに translateY が乗らない。AC-4 とユニット（狭幅でシフト無し）/手動（実機視覚確認 S-001）の二段で固定しており十分。
- **縦長パネル（パネル高 > ビューポート高）の上端優先挙動**が、スコープ節・リスク欄・ADR-001 Consequences・テスト方針（上端優先ユニット1ケース）の全てで一貫して水平 `computeShiftX`（右端→左端で左端＝先頭が勝つ）と対称に説明されており、将来の `max-height` 対応との境界も回帰テストで固定する計画になっている。1周目 coverage 指摘も含め死角が無い。
- **副作用（outside-mousedown / `containerRef.contains` / トリガー重なり）は 1周目で検証済みで本周も変化なし**。CSS transform は描画位置を動かすが DOM 包含関係を動かさないため `containerRef.contains` 判定は不変、というのが本修正の主目的（末尾項目を画面内へ戻す）と整合。新たな見落とし副作用は検出されなかった。
- スコープは presentation 層のプリミティブ1ファイル（+テスト）に閉じ、domain/application/adapter 層への影響なし。Issue が「ロジック・ルーティング・バックエンドは健全＝無変更」とした範囲と一致。

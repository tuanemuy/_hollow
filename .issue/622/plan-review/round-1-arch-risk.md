# Plan Review — Issue #622 / Round 1（アーキテクチャ・リスク視点）

レビュー対象: `.issue/622/plan.md` / `.issue/622/adr.md`
レビュー観点: アーキテクチャ整合性・Tailwind/トークン規約準拠・実現可能性・依存関係・エッジケース・設計判断の妥当性

## 検証メモ（事実確認の結果）

- モック `spec/design/pages/P31-public-note.html` を実際に確認した。計画の行参照はすべて正確:
  `.bottom-meta`（435-448, `gap:16px` / `mt:64px` / `pt:24px` / `font-size:13px` リテラル）、
  `.author-mini:hover`（268, `transition: var(--transition-bg)` は 265 行のベース側）、
  メタ行タグ `<a class="tag" href="#">`（588-590）、末尾メタタグ `<span class="tag">`（687-689）、
  `.section-title { letter-spacing: 0.06em }`（460）、`.backlink-text { font-size:14px }`（475）、
  `.related-title { font-size:14px }`（500）、`.pub-pill { font-size: var(--text-xs) }`（310）。
- 計画が指摘する「Issue 本文の『末尾メタもリンク』はモックと食い違う」は正しい。Issue が引用する行番号（682-684）は古く、実モックの 687-689 は `<span class="tag">`。モックを正とする AC-4 の判断は妥当。
- `app/routes/u/$username/index.tsx` の `validateSearch` に `tags: z.array(z.string().min(1).max(64)).max(8).optional().catch(undefined)` が存在することを確認。`<Link search={{ tags: [t] }}>` は型・スキーマともに成立する（タグ名はドメイン制約上 64 文字以内なので zod の `max(64)` にも収まる）。
- `app/styles/index.css` の `@theme inline` に `--text-xs` ブリッジ済み（45行）。`PUB_PILL` の `text-xs` 化は規約通り。`--tracking-*` ブリッジに 0.06em 相当は無いため `tracking-[0.06em]` の任意値も規約（トークンに無い値のみ任意値）に合致。
- `styles.ts` の変更対象定数（`NOTE_BOTTOM_META` / `AUTHOR_MINI` / `SECTION_TITLE` / `BACKLINK_TEXT` / `RELATED_TITLE` / `PUB_PILL`）の使用箇所を確認。すべて `PublicNoteDetail.tsx` のみが参照しており、計画の「他ページへの波及なし」は正しい（P30 タイルは別定数 `TILE_*`、P32 の `ACTIVE_CHIP_AVATAR` 等が参照するのは `AUTHOR_AVATAR` であって `AUTHOR_MINI` ではない）。
- モックの `@media (max-width: 640px)` ブロック（534-540）に bottom-meta / author-mini / section-title 系の上書きは無い。レスポンシブ分岐を増やさない計画は正しい。
- `AUTHOR_MINI` の現行 padding（`py-1.5 pr-3 pl-1.5`）はモック `padding: 6px 12px 6px 6px` と一致しており、hover/transition の追加だけで足りるという計画の前提も正しい。

## 問題点（要修正）

- **[P-001]** テスト方針の新規アサーション「メタ行のタグが `/u/{username}?tags=...` への `<a>` として描画される」は、既存テストの `Link` モックのままでは成立しない
  - 理由: `app/components/public/__tests__/PublicNoteDetail.test.tsx` の `vi.mock("@tanstack/react-router")` 内 `Link` モック（38-61行）は `to` / `params` / `children` / `className` しか受け取らず、`search` prop を無視して href を組み立てる。タグを `<Link search={{ tags: [t] }}>` 化した後にレンダリングされる href は `/u/tuanemuy` 止まりで、クエリ文字列は現れない。計画ステップ5は「アサーションがタグ表記をしている場合は追従修正」と既存アサーション側のリスクのみ言及しており、**新規に書くアサーションを成立させるためのモック拡張**（`search` を受けてクエリへシリアライズする、あるいは `data-search` 属性等で検証可能にする）が計画から漏れている。
  - 提案: ステップ5（またはテスト方針）に「`Link` モックに `search` prop の処理を追加し、`?tags=` 相当が検証可能な形で出力されるようにする」を明記する。なお実ルーターのデフォルト search シリアライズは JSON ベース（`?tags=%5B%22cloudflare%22%5D`）であり、モックで厳密に再現する必要はない — 「`search` が `{ tags: ["cloudflare"] }` で渡ったこと」が検証できれば十分、というレベル感も書いておくと実装がぶれない。

## 改善提案（検討推奨）

- **[S-001]** タグ 0 件時の bottom-meta 日付寄せは「実装時の判断に委ねる」ではなく計画で確定させる
  - 理由: 計画リスク欄が正しく指摘する通り、`justify-between` でタグ div が無いと日付が左寄せになる。タグ無し公開ノートは現実に起こり得る通常ケース（エッジではない）で、AC-1 の「タグ左・日付右」という受け入れ基準の解釈がタグ 0 件時に曖昧なまま実装に渡ると、レビューで再燃しやすい。`ml-auto` 1 ユーティリティで右寄せ固定できることまで計画が突き止めているのだから、どちらかに決めて AC か実装ステップに書き切るべき。モックの视覚意図（日付＝右端）に従い日付 div へ `ml-auto` を付ける案を推奨する（タグ有り時は `justify-between` と競合せず無害）。
- **[S-002]** AC-2 / ステップ2 の transition 対象を一言補足すると安全
  - 理由: モックの `.author-mini` は `transition: var(--transition-bg)`（background のみ）だが、計画の `transition-colors` は color / border-color 等も含む。AUTHOR_MINI 内のテキスト色は hover で変化しないため実害ゼロで、`CHIP` 等の公開面既存パターンとも揃っており選択自体は正しい。ただ「モックは transition-bg だが、公開面の確立パターン（transition-colors）に寄せる」と一行書いておくと、後続のモック照合レビューで差分として誤検出されない。
- **[S-003]** `testing.md` の P31 確認手順に「タグ無しノート」の bottom-meta 表示確認を 1 行足す
  - 理由: S-001 の判断がどちらに転んでも、タグ 0 件時のレイアウトは既存テスト・モック双方に対応物が無い唯一の状態。ブラウザ確認リスト（計画のテスト方針 5 項目）はタグ有りケースしかカバーしていない。

## 良い点

- **モックと Issue 本文の食い違いを一次資料で裁定している。** Issue は「末尾メタもリンク」と読める記述だが、計画はモック実体（`<span class="tag">`）を確認して AC-4 として明文化し、ADR の Context に記録した。スコープの過剰拡大を防ぐ正しい姿勢。
- **ADR-001 の遷移先選定が既存アーキテクチャに完全に乗っている。** P30 の `validateSearch`（`tags` AND フィルタ）を実機コードで確認したが、ルート追加・スキーマ変更ゼロで型安全に成立する。`/search?tags=...` 案の却下理由（空キーワード検索への着地・著者文脈の喪失・P30 フィルタの再発明）も具体的で説得力がある。グローバル探索が必要になった際の切り替え余地を Consequences に残している点も良い。
- **トークン解釈の使い分けが CLAUDE.md 規約に正確に沿っている。** ブリッジ済みトークンに存在する値はユーティリティ（`text-xs`）、トークンに無い値のみ任意値（`tracking-[0.06em]`, `text-[14px]`）という方針が AC-5〜7 で一貫しており、`PUB_PILL` の `text-[11px]` → `text-xs` は「任意値をトークンに戻す」方向の修正で特に好ましい。
- **bottom-meta の font-size をスコープ外とした判断に根拠がある。** モックはリテラル 13px、実装は `text-sm`（clamp 上限 13px）で、Issue が列挙する 4 乖離にも含まれない。「完全一致」の名目で不要な任意値化（`text-[13px]`）に走らなかったのはトークン規約上正しい。
- **styles.ts 定数の共有状況を調査済み。** 変更対象 6 定数がすべて P31 専用であることを検証した（本レビューでも追認）。`hover` への `motion-reduce:transition-none` 併記も公開面の確立パターンに整合。
- **マークアップ構造を変えずレイアウトだけ差し替える方針**（タグ群 div + 日付 div の流用）は diff 最小で、既存テストへの影響面も最小化されている。

## 総評

計画は実現可能で、アーキテクチャ・スタイリング規約への準拠度が高い。要修正は P-001（テストの `Link` モック拡張の明記）のみ。S-001（タグ 0 件時の寄せ方の確定）は実装前に decision を一行足すだけで済む。

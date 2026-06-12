# PR #661 レビュー（Issue #622）— Frontend

レビュー対象: `gh pr diff 661`（app 変更は `PublicNoteDetail.tsx` / `public/styles.ts` / `PublicNoteDetail.test.tsx` の 3 ファイル）
照合資料: `.issue/622/plan.md`（AC-1〜AC-8）、`.issue/622/adr.md`、`spec/design/pages/P31-public-note.html`、`app/styles/tokens.css` / `index.css`

## 検証メモ（事実確認）

- AC-1: `NOTE_BOTTOM_META` が `mt-16 pt-6 border-t flex items-center justify-between gap-4 flex-wrap` に変更。モック `.bottom-meta`（435-447行: margin-top 64px / padding-top 24px / align-items: center / justify-content: space-between / gap 16px / flex-wrap）と全項目一致。タグ 0 件時の日付右寄せは日付 div への `ml-auto`（`PublicNoteDetail.tsx:177`）で計画どおり確定。
- AC-2: `AUTHOR_MINI` に `transition-colors motion-reduce:transition-none hover:bg-surface-hover` を追加。`--color-surface-hover` は `tokens.css:13` に定義済み・ブリッジ済み。`transition-colors`（モックは `transition-bg`）の差は plan ステップ2で意図が明文化済みで、hover で変化するのは背景のみなので実挙動同一。公開面の確立パターン（`CHIP` / `BACKLINK_ITEM`）とも一貫。
- AC-3/4: メタ行タグが `<Link to="/u/$username" search={{ tags: [t] }}>` に（141-149行）、末尾メタは `<span>` 維持（171行）。モック（588-590行 `<a class="tag">` / 687-689行 `<span class="tag">`）に正確に一致。P30 の `validateSearch`（`tags: z.array(...)`）に型安全に乗っており、ルート・スキーマ変更ゼロという ADR-001 の主張どおり。
- AC-5: `tracking-wider`（0.05em）→ `tracking-[0.06em]`。`index.css` の `--tracking-*` ブリッジに 0.06em 相当が無いことを確認、任意値の使用は規約に合致。
- AC-6: `BACKLINK_TEXT` / `RELATED_TITLE` を `text-[14px]` に。`--text-sm` は clamp 上限 13px のため任意値が正解。モック 475 / 500 行（リテラル 14px）一致。
- AC-7: `PUB_PILL` を `text-[11px]` → `text-xs`。モック 310 行は `var(--text-xs)`、`--text-xs` は `index.css:45` でブリッジ済み。任意値をトークンに戻す方向の修正で規約上もっとも好ましい形。
- AC-8: `pnpm vitest run app/components/public/__tests__/PublicNoteDetail.test.tsx` をローカル実行し 3 件すべて緑であることを確認。
- 波及確認: `public/styles.ts` の変更 6 定数の参照元は `PublicNoteDetail.tsx` のみ（grep で全 app を確認。identity/landing 等の `SECTION_TITLE` は別モジュールの同名定数で無関係）。
- 規約確認: 新規 CSS ファイルなし、`@apply` なし、状態スタイルなし（`data-*` 不要なケース）、ユーティリティはすべて `styles.ts` 定数か inline literal で JIT スキャン可能。

## Blockers

なし

## Warnings

- **[W-001]** タグリンクの新規アサーションがマークアップ全文一致で脆い
  / 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:153-158`
  / 理由: `toContain('<a href="/u/tuanemuy" class="text-accent mr-1" data-search="...">#cloudflare</a>')` は (a) モック内の JSX 属性記述順、(b) `className` の文字列リテラル全体、(c) `&quot;` エスケープ表現に同時に結合している。タグの見た目クラスを 1 つ足すだけ・モックの属性順を入れ替えるだけで、検証したい本質（遷移先と search ペイロード）と無関係に落ちる。plan ステップ5の意図は「`search` が `{ tags: ["cloudflare"] }` で渡ったことが検証できれば十分」であり、現実装はそれより過剰に厳密。
  / 提案: `renderToStaticMarkup` の文字列を DOM にパースし（jsdom 環境なら `document.createElement('div')` + `innerHTML`）、`querySelector('a[href="/u/tuanemuy"][data-search]')` の存在と `JSON.parse(el.getAttribute('data-search'))` が `{ tags: ["cloudflare"] }` に等しいことをアサートする形に分解する。末尾メタ側も「`#cloudflare` テキストを持つ要素のうち `<a>` 祖先を持たないものが存在する」程度の構造アサーションにすると意図が明確になる。
- **[W-002]** メタ行のタグリンクに hover アフォーダンスが無く、直下の末尾メタには見た目が同一の非リンクタグが並ぶ
  / 場所: `app/components/public/PublicNoteDetail.tsx:141-149`（リンク）と 170-174（非リンク）、いずれも `text-accent`
  / 理由: 同一ページ内に「クリックできる `#tag`（メタ行）」と「できない `#tag`（末尾メタ）」が同一ビジュアルで共存する。モック自体がこの設計（`.tag` に hover 装飾なし・末尾は span）なのでモック準拠としては正しく、Blocker にはしない。ただし本文内 `.hashtag` には `hover: underline` がある（モック 581-582 行）ため、「リンクであるタグには hover で下線」という規範はモック内に既に存在しており、メタ行タグだけが「リンクなのに hover 無反応」という中途半端な位置にいる。キーボードユーザーはグローバル `:focus-visible`（`index.css:174`）で識別できるが、マウスユーザーには発見可能性が低い。
  / 提案: 本 PR の範囲ではモック準拠を優先した判断を尊重する。フォローアップとして、モック側の `.tag`（リンク版）に `.hashtag:hover` と同じ `text-decoration: underline; text-underline-offset: 2px` を足す提案を spec/design 側に出し、実装を `hover:underline underline-offset-2` で追従させることを推奨（モックと実装を同時に直すのが筋）。

## Notes

- **[N-001]** AC-1〜AC-8 すべて充足を確認。差分は計画の実装ステップ 1〜5 と 1:1 対応しており、計画外の変更が一切混ざっていない（diff 最小主義が徹底されている）。
- **[N-002]** トークンの使い分けが模範的。ブリッジ済みトークンに存在する値はユーティリティ（`text-xs`）へ「戻し」、トークンに無い値のみ任意値（`text-[14px]` / `tracking-[0.06em]`）。CLAUDE.md Styling 規約への準拠度が高い。
- **[N-003]** ADR-001（タグ遷移先 = 著者公開トップの `tags` フィルタ）は P30 既存スキーマに乗るため型安全かつ追加実装ゼロで、`/search?tags=` 案の却下理由（空キーワード検索への着地・著者文脈の喪失）も妥当。Issue 文面とモックの食い違い（末尾メタのリンク化）をモック実体で裁定し ADR に記録した判断も正しい。
- **[N-004]** タグ 0 件時の `ml-auto` は `justify-between` と競合せず（タグ有り時は margin:auto が余白ゼロに解決）、1 ユーティリティで両ケースを満たす良い解。`flex-wrap` 折返し時に日付が右寄せになるモック微差は plan で「意図した挙動」と明文化済み。
- **[N-005]** テストの `Link` モック拡張（`search` が空でないときのみ `data-search` を付与）は、既存の `search={{}}` 利用箇所（パンくず・author-mini）を壊さない配慮が入っており、plan 2周目レビューの指摘 S-001 を正しく反映している。
- **[N-006]** ブラウザ検証（`.issue/622/manual-test/`）が AC 全件＋エッジ（タグ無し・390px 幅・ID ベース URL・P30 デグレ）をカバーし、computed style の実測値（mt 64px / pt 24px / ls ratio 0.060 / hover 後 #ececef）まで記録されている。検証証跡として十分。
- **[N-007]** `ml-auto` が `styles.ts` 定数でなく TSX インラインなのは、単一使用箇所のユーティリティとして規約（定数化は「繰り返し」のため）どおりで問題なし。

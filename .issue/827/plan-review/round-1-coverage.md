# Round 1 レビュー — 要件カバレッジ・スコープ整合性

対象: `.issue/827/plan.md` / `.issue/827/adr.md`
視点: Issue #827 の要件カバレッジ・スコープ整合性

#### 問題点（要修正）

- **[P-001]** AC-1 / AC-2 の「対応ステップ」列が step 1 のみを指しており、実際の検証を担う step 4 が欠落している
  - 理由: AC-1（`/notes` の charset/viewport/progressbar/ErrorPage が各 1）と AC-2（`/notes` が単一シェル内で notFound 表示）は本 Issue の中核要件だが、これらの充足確認は step 4 のブラウザ計測で行われる。実際 step 4 は「`/notes`（未定義 URL 例）→ charset=1, viewport=1, progressbar=1, ErrorPage(notFound)=1」を明示的に計測項目に挙げている。一方 AC-3〜AC-6 は同じ構造（step 1 で実装・step 4 で検証）なのに「1, 4」と紐づいており、AC-1/AC-2 だけ step 4 が抜けている。基準と実装ステップの紐づけが内部で不整合。
  - 提案: AC-1 と AC-2 の対応ステップを「1, 4」に修正し、最重要 AC の検証経路（step 4 の `/notes` 計測）を明示的に紐づける。

#### 改善提案（検討推奨）

- **[S-001]** Issue「影響」に列挙された「RootDocument を 2 回描画するレンダリング非効率」を直接名指しする基準がない
  - 理由: 現状は AC-1 が charset=1 / viewport=1 / progressbar=1 / ErrorPage=1 を数えることで「RootDocument が 1 個」を間接的（プロキシ）に立証している。実質カバーされてはいるが、Issue が独立した影響として明記している以上、「`/notes` で `html`/`head`/`body` シェルが単一（RootDocument 1 個）」を AC の文言に一言含めると、Issue 影響 3 項目（invalid HTML・レンダリング非効率・UX 影響なし）と AC の対応関係が読み手に完全に追跡可能になる。

#### 良い点

- Issue 本文の要件（`/notes` の RootDocument 二重描画・charset/viewport 重複の解消、機能退行なし）がすべて AC に落ちている。再現表の 3 ルート（`/notes` → AC-1、`/notes/$noteId`・`/notes/$noteId/edit` → AC-3）、影響の invalid HTML → AC-1、機能退行なし → AC-2/AC-3/AC-5/AC-6 と、対応が明確。
- Issue が明示的に求めた「ルートによって挙動が分岐する点も要調査」に対し、調査結果で `/notes` に leaf が無い（一覧は `/`＝`_app/index.tsx`）→ `globalNotFound` → Outlet が notFoundComponent を描画、という分岐原因を `Match.js` の行番号付きで確定させており、調査要件を完全に満たしている。実コード（`_app/notes/` に `index.tsx` 不在）とも一致することを確認済み。
- AC-4 で検証対象を `/notes` に限定せず「任意の未定義 URL」へ一般化し、Issue の主題を「`/notes` 個別の 404」ではなく「RootDocument 二重描画という構造欠陥の根治」として正しく捉えている。ADR-001 の却下案 B/C（notFoundComponent だけ外す／`/notes` リダイレクト）を band-aid として排除する判断も、スコープ整合性の観点で妥当。
- スコープ境界が明確。「含まれないもの」で専用ルート/リダイレクト新設・`_app`/リーフの error/notFound 構造変更・head メタ生成ロジック・RouteProgressBar 挙動を明示除外し、スコープ外作業の紛れ込みがない。「`/notes` を UX 上どこへ誘導するか」を別 Issue として切り出す判断も適切。
- 各 AC が検証可能な形（クライアント DOM での要素計数、`pnpm typecheck && pnpm lint && pnpm test` の合格）で書かれ、計測手順を `.issue/819/manual-test` に揃えて再現性を担保している。AC-5（root error 経路）は throw 誘発が必要な点まで step 4 で手当てされている。

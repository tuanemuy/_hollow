# Round 2 レビュー — 視点: Issue 要件カバレッジ・スコープ整合性

**対象:** `.issue/675/plan.md` / `.issue/675/adr.md`
**Issue:** #675 refactor(runtime): dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防ぐ
**レビュー日:** 2026-07-11
**位置づけ:** Round 1 指摘反映後の再確認

## Round 1 指摘の反映確認

| R1 指摘 | 内容 | 反映状況 | 確認箇所 |
|---|---|---|---|
| P-001 | `import.meta.env.DEV` の値の誤記（build:local で `DEV=true` としていた）が AC-7 と矛盾 | **反映済み** | 調査結果 L45 が「build:local = `--mode development` だが `NODE_ENV=production` で `import.meta.env.DEV=false`／`MODE` は `development` のまま」と訂正。AC-7（L23）が `viteDev=false`・`DEV_INLINE_RELAY` 単独駆動と、`DEV_INLINE_RELAY=false` で inline relay が止まる検証を明記。リスク節 L181・設計節 dev エントリ L117 も整合。コードで裏取り済み（package.json L11 = `NODE_ENV=production vite build --mode development`、`resolveInlineRelayGate` は `viteDev \|\| flag === "true"`）。 |
| S-001 | prod（production ビルド）経路の機能スモーク検証が AC に無い | **反映済み** | AC-9（L25）新設。ステップ8品質ゲート（L170）とテスト方針（L190）に「`pnpm build`（production）出力で通常ルート＋`/sitemap.xml` が応答」を追加。 |
| S-002 | grep キーワードが minify で消える識別子中心 | **反映済み** | ステップ7（L165）に minify 耐性のある文字列リテラル `inline-dev`／`/dev/r2/` を必須対象として追加し、識別子が minify で消え得る旨と裏取りは文字列リテラルで行う方針を明記。 |
| arch S-003 (deploy) | `deploy:staging`/`deploy:production` の mode | **反映済み** | AC-5（L21）・調査結果 L45 に「素の `vite build`＝production mode → prod エントリ」を明記。package.json L23/L37 で裏取り（両者とも `vite build` プレフィクス）。 |

Round 1 の全指摘が plan/adr に正しく落ちている。訂正が新たな矛盾を生んでいないことも確認した（AC-7 と調査結果・リスク節・設計節が `DEV=false`／`viteDev=false`／フラグ単独駆動で一貫）。

## トレーサビリティ再確認（完了条件・オーナー方針 → AC）

Round 1 のトレーサビリティ表（完了条件1-3・オーナー方針1-4 の全項目が AC/設計/ADR にマップ）は Round 2 でも維持されており、退行なし。AC-9 追加により「prod バンドルは"載らない"だけでなく"動く"」まで基準がカバーされ、むしろ Round 1 より網羅性が上がっている。スコープ「含まれないもの」（継ぎ目新設・ロジック変更・worker エントリ・`wrangler.toml main`）にスコープ外作業の混入は見当たらない。

## 問題点（要修正）

問題点ゼロ。Round 1 の全指摘が適切に反映され、要件カバレッジ・スコープ整合性の観点で新規の要修正事項は無い。

## 改善提案（検討推奨）

- **[S-001]** AC-9 のスモーク検証が「実際に prod エントリを起動する」ことを保証する起動コマンドを一意に指定するとよい / 理由: ステップ8（L170）は「`pnpm preview` もしくは production build を wrangler で起動」と2択で書くが、`pnpm start`（=`wrangler dev`）は通常 build:local 出力（＝dev エントリ選択済み）を実行するため、`pnpm build`（production）の後に何を起動すれば **prod エントリ（`createFetchHandler()` hook なし）** が実際に動くのかがやや曖昧。`pnpm preview`（`vite preview`）と wrangler 経路で走るコードパスが異なり得るため、AC-9 の主眼（prod default が既存 fetch フローと等価に動く）を確実に突くには「`pnpm build` 直後に prod 出力を起動する具体手順」を1つに確定させると、検証が確実に prod エントリを対象にできる。カバレッジ上の穴ではなく検証手順の一意化提案（実装者裁量で足りる粒度）。

## 良い点

- Round 1 指摘 3 件（P-001／S-001／S-002）に加え arch 側指摘（deploy 経路・ADR-002 代替案）まで、レビュー履歴（L195-201）に反映内容が要約され、どの節を直したか追跡可能。反映の網羅性・透明性が高い。
- P-001 の訂正が「単なる字句修正」に留まらず、AC-7 に「`DEV_INLINE_RELAY=false` で inline relay が止まることを確認」という不変条件の裏取り手順まで足しており、#663 の「待機中」再発防止という設計意図が検証可能な基準に落ちている。
- AC-9 新設により、リファクタの主対象物（prod fetch フローの factory 化）に対し「混入しない（AC-1/2）」と「壊れず動く（AC-9）」の両面が基準化され、grep クリーンだが prod が壊れる取りこぼしを閉じている。
- スコープ規律は Round 1 から維持。ロジック不変（移動するのは import 元だけ）・worker エントリ除外・`wrangler.toml main` 据え置きが明示され、スコープ膨張なし。

# General Review — Issue #597 / PR #772

対象: ヘッダーの backdrop-filter リテラル `saturate(180%) blur(20px)` を SSOT トークン `var(--header-blur)` に置換する小規模リファクタ。

## General Review

### Blockers
- なし

### Warnings
- **[W-001]** ADR-008 のトレードオフ記述が「受け入れ基準（-webkit- 版含む）を満たす」と主張するが、AuthHeader の webkit 経路は実質トークン非経由のまま残る
  - 場所: `.issue/597/adr.md:27`
  - 理由: AuthHeader は `-webkit-backdrop-filter` リテラルを持たず、webkit 描画は `backdrop-blur-xl`（= `blur(24px)`、saturate なし）が担う。(A) 採用後も Safari は `blur(24px)`、Chrome は `var(--header-blur)`（`blur(20px)` + saturate）という挙動差が「既存仕様」として残り、5箇所中ここだけ webkit が SSOT に追従しない。同値置換の枠内で回帰ゼロを優先した判断自体は妥当だが、「`--header-blur` を将来変更したとき AuthHeader の Safari 描画だけ追従しない」という SSOT 統一の主目的に対する穴が残る点は、ADR の Consequences でより明示的に「将来 `--header-blur` 変更時に AuthHeader の webkit のみ追従しない既知の負債」と書くべき。現状の記述は「既存構造を尊重」とややぼかしている。
  - 提案: ADR-008 の Consequences に「`--header-blur` 変更時、AuthHeader の Safari 描画のみ追従しない既知の負債が残る。是正は別Issue」と一文を追加し、可能なら追跡用の別Issueを起票する。コード変更は不要。
  - → 対応済み: ADR-008 Consequences を「既知の負債」「是正方針」として明示的に書き直し、追跡用の別Issue #773 を起票。コード変更なし。

### Notes
- **[N-001]** 同値置換の正当性を確認済み。`tokens.css:140` の `--header-blur: saturate(180%) blur(20px)`（スペース区切り）と、置換前の Tailwind arbitrary value `saturate(180%)_blur(20px)`（アンダースコア = Tailwind の空白エンコード）は同一 CSS に解決される。置換後はトークン参照のみとなり同値性は自明。
  - 場所: `app/styles/tokens.css:140`
- **[N-002]** 5箇所すべての置換漏れ・タイポ無しを grep で確認。`grep -rn "saturate(180%)" app/` のヒットは `tokens.css:140`（SSOT 定義、残すべき）のみ。standard / `-webkit-` 両系列とも `var(--header-blur)` 化済み。`layout/styles.ts:6`・`landing/LandingPage.tsx:23`・`public/styles.ts:11`・`routes/admin/route.tsx:27` は standard + webkit 両方、`auth/AuthHeader/index.tsx:13` は standard のみ（ADR-008 通り）。
- **[N-003]** Issue 未列挙の `routes/admin/route.tsx`（`ADMIN_HEADER_CLASS`）を含めた判断は妥当。同一リテラルを持つ5箇所目のヘッダーであり、これを除外すると「ヘッダーの backdrop-filter を SSOT 統一」という Issue タイトルの意図に対し置換漏れが残る。plan.md AC-2b で根拠が明示され、スコープ拡大として適切。
  - 場所: `app/routes/admin/route.tsx:27`
- **[N-004]** CLAUDE.md styling 規約への適合を確認。SSOT（`tokens.css` の `--header-blur` 単一定義）経由・トークン参照・ADR-005 の「always-on base + `supports-[backdrop-filter]:` で blur」パターンを全箇所で維持。`supports-[backdrop-filter]:` ガードは置換後も保たれ、CSS 構造は無改変。`@apply` や手書き CSS の新設なし、utility-first 規約に適合。

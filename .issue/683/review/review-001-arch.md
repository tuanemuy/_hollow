# Review 001 — Issue #683 / PR #685（アーキテクチャ整合性・計画カバレッジ・ADR）

**対象 PR:** #685
**実装計画:** `.issue/683/plan.md`
**設計判断:** `.issue/683/adr.md`
**レビュー視点:** アーキテクチャ整合性 / 計画カバレッジ（AC-1〜AC-12）/ ADR
**レビュー日:** 2026-06-13

---

## サマリー

- Blockers: 0
- Warnings: 0
- Notes: 3

本変更は presentation 層（TanStack Router のルート設定）のみに完全に閉じており、domain/application/adapter には一切触れていない。受け入れ基準 AC-1〜AC-12 はすべて対応する変更が PR に存在する。ADR-001/002/003 はいずれも `Status: Accepted` で、#293 の supersede 表現も「単独明示 Decision は実在しない de-facto 値の明文化＋撤回」という事実に即した記述になっており、`.issue/293/adr.md` 本体は破壊的に編集していない。要修正レベルの問題は検出されなかった。

---

### アーキテクチャ / 計画カバレッジ / ADR

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** ブラウザ検証コマンドのドキュメント間不整合（軽微）
  - 場所: `.issue/683/testing.md:26,45`（`pnpm preview`）vs `.issue/683/manual-test/report.md:5` / PR 本文 Test plan（`pnpm build && pnpm start`）
  - 内容: `testing.md` は本番ビルド配信に `pnpm preview`（= `vite preview`）を指示しているが、実際の検証レポート・PR 本文は `pnpm start`（= `wrangler dev`、Cloudflare reference runtime）で実施している。CLAUDE.md は「`pnpm dev` / `pnpm build` / `pnpm start` all target the Cloudflare runtime」とし `pnpm start` を正規の起動経路としているため、検証は適切な runtime で行われている。どちらも本番ビルド（DEV=false）を配信するので AC-1/AC-2/AC-3 の観測条件は満たされており実害はないが、テスト手順書と実施記録のコマンドが食い違う点のみ留意。提案: testing.md を `pnpm start` に揃えるか、`preview` で実施しない旨を一文添える（任意）。

- **[N-002]** ルート設定の単体アサートテストは未追加（計画上の任意項目で問題なし）
  - 場所: PR 全体（テスト追加なし）/ `.issue/683/plan.md:233`「ルート設定の単体検証（必要なら）…既存テストの粒度に合わせ、過剰なテストは追加しない」
  - 内容: 対象ルートが `import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` を持つこと・(B) 群が `gcTime === PUBLIC_ROUTE_GC_TIME` を持つことのアサートは追加されていない（`grep` で routeCache/PUBLIC_ROUTE_GC_TIME を参照するテストファイルは 0 件）。計画はこれを「必要なら」の任意項目と明記しており、変更が 1 行リテラルの swap である以上テスト追加を見送る判断は妥当。`pnpm test:unit` 3697 件全 PASS で既存ルート/SavedView テストの非回帰は担保されている。Blocker でも Warning でもなく、計画整合上の確認事項として記録。

- **[N-003]** `routeCache.ts` の命名が既存 public モジュールのドメイン語彙とやや毛色が異なる（許容範囲）
  - 場所: `app/components/public/routeCache.ts`
  - 内容: 既存の framework-free public モジュール（`searchPeriod.ts` / `publicDateRange.ts` / `formatNoteDate.ts` 等）は「period facet」「date range」のようなドメイン語彙の名前だが、`routeCache` は横断的関心事（キャッシュ方針）の名前。ただし配置（`app/components/public/`）・構造（ファイル冒頭 WHY コメント＋単一 `export const`）は既存慣習に完全一致しており、`app/lib/`（全レイヤー共有の構造プリミティブ）でなく presentation 寄りの `components/public/` に置く判断は「公開ルートの presentation 関心事」として適切。WHY コメント（匿名閲覧者に invalidate 経路が無く gcTime で陳腐化を bound、4 ルート共有で 1 箇所調整可）も的確で、CLAUDE.md「定数は 1 箇所に hoist」「WHY が非自明なときのみコメント」に沿う。命名は許容範囲で、変更不要。

---

## 受け入れ基準カバレッジ（AC-1〜AC-12）

| AC | 充足 | 根拠 |
|----|------|------|
| AC-1 | ✓ | (A) 群 15 ルートすべてが `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` に変更（`_app/index.tsx` ほか）。手動検証 TC-1 PASS。 |
| AC-2 | ✓ | (B) 4 ルートが `staleTime: Infinity` 化。`gcTime` 内再訪のキャッシュ再利用を TC-4 で確認。 |
| AC-3 | ✓ | (C) about/terms/privacy が `60_000` → `Infinity` 化。TC-5 PASS。 |
| AC-4 | ✓ | mutation 後の鮮度は既存 `routerInvalidate()` 経路を維持。TC-2 でタグ 15→16→15 即時反映を確認（Infinity 下では invalidate が唯一の更新経路という強い裏付け）。 |
| AC-5 | ✓ | `_app/index.tsx` の loader handler 内 SavedView リダイレクトは初回キャッシュミスで必ず発火。ユニットテスト green。 |
| AC-6 | ✓ | (B) に `gcTime: PUBLIC_ROUTE_GC_TIME`（60s）追加。ADR-002 に gcTime 超のクリーン再ロード方針を明記。 |
| AC-7 | ✓ | ⛔ ライブ要件ルート（admin index/jobs/metrics・exports index/$jobId・editor new/edit）はすべて `staleTime: 0` のまま未変更（実コード確認）。 |
| AC-8 | ✓ | 全置換が `import.meta.env.DEV ? 0 : ...` パターンで DEV 鮮度を維持。親 `_app/route.tsx:82`・settings 4 本と同一。 |
| AC-9 | ✓ | `.issue/683/adr.md` ADR-001 が「#293 に単独明示 Decision は実在しない de-facto 値」を明記したうえで supersede 宣言。ADR-002 に公開ルート Infinity+gcTime 方針を併記。`.issue/293/adr.md` 本体は非破壊（diff に含まれない）。3 ADR とも `Status: Accepted`。 |
| AC-10 | ✓ | レポートで `pnpm typecheck` 通過 / `pnpm test:unit` 3697 件 PASS / `pnpm build` exit 0。 |
| AC-11 | ✓ | `PUBLIC_ROUTE_GC_TIME = 60_000` を `app/components/public/routeCache.ts` に 1 箇所定義し、(B) 4 ルートで import 共有。 |
| AC-12 | ✓ | admin 5 ルート（design/llm/prompts/registration/users）すべて (A) 群に組み入れ。対応する 5 フォーム（DesignTokensForm/LLMSettingsForm/PromptsForm/RegistrationForm/UsersTable）すべてで `routerInvalidate(router)` 配線を実コード確認。 |

## スコープ確認

- 変更ファイル 28 件のうち、コード変更は route 22 件（各 1 行 staleTime swap、(B) は gcTime 行＋import 追加）＋新規 `routeCache.ts` 1 件のみ。残り 5 件は `.issue/683/` 配下のドキュメント。
- ⛔ 据え置きルート（editor/ダッシュボード/メトリクス/ジョブ進捗/エクスポート進捗）への混入なし（全件 `staleTime: 0` のまま）。
- domain/application/adapter への漏れなし。presentation 層に完全に閉じている。
- PR 本文（3 階層分類・supersede 記述・gcTime 採用理由）と実装は整合。

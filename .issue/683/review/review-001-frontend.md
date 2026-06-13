# PR #685 レビュー — Frontend / キャッシュ挙動

**対象 PR:** #685
**実装計画:** `.issue/683/plan.md`
**観点:** Frontend / キャッシュ挙動（TanStack Router の `staleTime` / `gcTime` 設定）
**レビュー日:** 2026-06-13

## サマリー

- Blockers: 0
- Warnings: 0
- Notes: 3

実装は計画どおりで、Frontend/キャッシュ観点の受け入れ基準（AC-1〜AC-8, AC-11, AC-12）はいずれも満たされている。`staleTime` リテラルは全 22 ルートで既存慣用パターンと完全一致し、`Infinity` の直リテラル混入や typo は無い。`gcTime: PUBLIC_ROUTE_GC_TIME` は (B) 公開 4 ルートにのみ正しく追加され、import パス（`@/components/public/routeCache`）も alias 解決上正しい。据え置きルート 7 本（new/edit/admin index・jobs・metrics/exports index・$jobId）には一切変更が入っておらず、すべて `staleTime: 0` のまま。

## 検証した事実

| 観点 | 結果 |
|---|---|
| (A)(B)(C) の `staleTime` リテラルが `import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` と完全一致 | 全 22 ルートで一致。bare `staleTime: Infinity` の混入ゼロ（唯一のヒットは `_app/route.tsx:45` のコメント文字列で設定値ではない） |
| 親 `_app/route.tsx:82` / `settings/profile.tsx:26` の正準リテラルと一致 | 一致（同一文字列） |
| (B) 4 ルートに `gcTime: PUBLIC_ROUTE_GC_TIME` 追加 | `search.tsx:63` / `u/$username/$noteSlug.tsx:57` / `u/$username/index.tsx:112` / `notes/public/$noteId.tsx:51` の 4 箇所のみ。他ルートに `gcTime` 混入なし |
| import パスの正しさ | 4 ルートとも `import { PUBLIC_ROUTE_GC_TIME } from "@/components/public/routeCache";`。`tsconfig.json` の `"@/*": ["./app/*"]` で `app/components/public/routeCache.ts` に解決 |
| `routeCache.ts` 新規モジュール | `export const PUBLIC_ROUTE_GC_TIME = 60_000;`（AC-11 充足、WHY コメント付き、framework-free） |
| `$revisionId.tsx` のネスト位置 | `createFileRoute(...)( { staleTime: ..., head: ..., } )` の引数オブジェクトが改行折り返しされた形。`staleTime` キーのみ置換され、`head` 等の他オプションは無傷 |
| 据え置き 7 ルート | `notes/new.tsx:36` / `notes/$noteId/edit.tsx:67` / `admin/index.tsx:15` / `admin/jobs.tsx:17` / `admin/metrics.tsx:17` / `exports/$jobId.tsx:54` / `exports/index.tsx:34` すべて `staleTime: 0` のまま（diff 対象外） |
| ルート漏れ | (A)=15 / (B)=4 / (C)=3 = 22 + 定数モジュール 1。チェックリストと完全一致 |
| `staleTime: Infinity` 化と `routerInvalidate()` の鮮度担保構造 | mutation 系コンポーネントの `routerInvalidate` 配線は本 PR で変更されておらず（routerInvalidate.ts に diff なし）、自動再取得停止後の鮮度は既存配線で担保される構造 |

## Blockers

なし。

## Warnings

なし。

## Notes

- **[N-001]** (B) 公開ルートの `gcTime: PUBLIC_ROUTE_GC_TIME` 追加は意図どおりだが、`staleTime: Infinity` 化により従来の有限 `staleTime`（`search`/`u-index` は `0`、`$noteSlug`/`notes-public` は `10_000`）が担っていた「短時間での自動再検証」は失われる。匿名閲覧者には invalidate 経路が無いため、サーバー側更新の反映遅延は最大 `gcTime`（60s）まで bound される設計で、ADR-002 と整合。挙動変更は計画の意図どおり（許容範囲）。

- **[N-002]** `routeCache.ts` は単一定数のための focused module で、命名が `searchPeriod.ts` / `publicDateRange.ts` のドメイン語彙系と毛色が異なる（横断的なキャッシュ方針名）。配置（`app/components/public/`）・WHY コメント付与の様式は既存慣習に沿っており問題なし。plan-review round-1-arch-risk[S-002] でも同旨が改善提案として挙がっていたが実害なし。

- **[N-003]** (A) 群・(C) 群には `gcTime` を追加していない（ライブラリデフォルトのまま）。(A) は `routerInvalidate()` で明示的に鮮度を担保、(C) はデプロイ単位で固定のため `gcTime` bound 不要、という計画の判断と一致しており正しい。`gcTime` を 4 公開ルートに限定したのは適切な絞り込み。

## 良い点

- 22 ルート全件で `staleTime` リテラルが親ルート・settings 系と寸分違わず一致しており、コピペ起因の typo・`Infinity` 直書き（`Number.POSITIVE_INFINITY` ではなく `Infinity`）といった事故が一切ない。
- `$revisionId.tsx` のような引数オブジェクトが改行折り返しされた特殊形でも、`staleTime` キーのみが正確に置換され、`head` ハンドラ等の周辺オプションを壊していない。
- `gcTime` の追加が (B) 公開 4 ルートに厳密に限定され、(A)/(C) や据え置きルートへの波及がない。import も 4 ルートすべてで正しい alias パスを使用。
- 据え置き 7 ルート（ライブ要件・editor）が完全に無変更で、ライブ性を壊す混入が無い。スコープ境界が厳密に守られている。

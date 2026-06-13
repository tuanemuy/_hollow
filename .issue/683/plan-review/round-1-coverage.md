# Plan Review — Issue #683 (Round 1)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/683/plan.md` / `.issue/683/adr.md`
**レビュー日:** 2026-06-13

---

## サマリー

- 問題点（要修正）: 0
- 改善提案（検討推奨）: 4

Issue #683 には本文のみでコメントは存在しない（`gh issue view 683 --json comments` で `comments: []` を確認）。したがって合意事項は Issue 本文（「対象ルートの仕分け」+ 受け入れ条件 8 項目）が全てであり、計画はこれを忠実に受け入れ基準 AC-1〜AC-12 へ落としている。**Issue 要件の漏れ・スコープ逸脱・据え置きルートへの誤った混入はゼロ**。実コードとの突き合わせでも plan.md の現状値テーブルは全 22 ルート＋3 フォーム系で完全一致した。

---

## 検証した事実（実コードとの突き合わせ）

`grep -rn "staleTime\|gcTime" app/routes/ app/` および各ファイル確認で以下を検証した。すべて plan.md / adr.md の記載と一致。

| 観点 | 計画の主張 | 実コード | 一致 |
|---|---|---|---|
| (A) 12 本（`_app/index`〜admin 5 種）の現状 | `staleTime: 0` | 全て `staleTime: 0` | ✓ |
| フォーム系 3 本（export/notes-export/upload） | `staleTime: 0` | 全て `staleTime: 0` | ✓ |
| `search.tsx` | `0`（行 61） | `staleTime: 0`（行 61） | ✓ |
| `u/$username/index.tsx` | `0`（行 110） | `staleTime: 0`（行 110） | ✓ |
| `u/$username/$noteSlug.tsx` | `10_000`（行 55） | `staleTime: 10_000`（行 55） | ✓ |
| `notes/public/$noteId.tsx` | `10_000`（行 49） | `staleTime: 10_000`（行 49） | ✓ |
| about/terms/privacy | `60_000` | 全て `60_000` | ✓ |
| ⛔ admin/index・jobs・metrics | 据え置き | `staleTime: 0`（変更対象外として正しく除外） | ✓ |
| ⛔ exports/$jobId・exports/index | 据え置き | `staleTime: 0`（除外） | ✓ |
| ⛔ notes/new・notes/$noteId/edit | 据え置き（editor 除外） | `staleTime: 0`（`EDITOR_ROUTE_IDS` に登録済み） | ✓ |
| 既存 `gcTime` 設定 | 無し（全ルート） | `grep gcTime` ヒット 0 | ✓ |
| `_app/route.tsx` 親 | `DEV ? 0 : Infinity`（行 82） | 一致 | ✓ |
| settings 系参照パターン | 4 本が同パターン採用済み | profile/prompts/security/account-delete 一致 | ✓ |
| `routeCache.ts` 新規 | 未存在 | `app/components/public/` に無し（新規で正しい） | ✓ |
| editor 除外（ADR #669-003） | 据え置き正当 | `routerInvalidate.ts` の `EDITOR_ROUTE_IDS` に edit/new 登録済み | ✓ |
| ホーム SavedView リダイレクト | loader 内 `throw redirect`、初回キャッシュミスで必ず発火 | `_app/index.tsx` 行 76-81 で確認 | ✓ |

### 受け入れ条件 8 項目 → AC マッピングの網羅性

Issue 本文「受け入れ条件」の 8 項目すべてが AC へ漏れなく対応している:

1. ホーム含む再訪フラッシュ無し → AC-1 / AC-2 / AC-3（(A)(B)(C) 群に分解）
2. mutation 後 `routerInvalidate()` 即時最新化 → AC-4
3. ホーム SavedView リダイレクト初回動作 → AC-5
4. 公開ルート `gcTime`（60s）超で反映 → AC-6
5. ライブ要件ルート従来どおり → AC-7
6. DEV で HMR 鮮度維持 → AC-8
7. ADR 更新（#293 supersede / gcTime 方針併記） → AC-9
8. `pnpm typecheck && lint:fix && format` → AC-10

加えて Issue (B) の「`PUBLIC_ROUTE_GC_TIME` を 1 箇所定義・4 ルート共有」→ AC-11、Issue (A) 末尾「admin mutation の `routerInvalidate` 配線確認」→ AC-12 として、本文に散在する追加要件も基準化している。**8 項目 + 2 付随要件が全て検証可能な AC に落ちている。漏れ無し。**

### 「対象ルートの仕分け」全ルートの基準化

Issue の (A) 12 本 / (B) 4 本 / (C) 3 本 / 🔶 3 本 / ⛔ 8 本（new・edit・admin index/jobs/metrics・exports index/$jobId）すべてが plan.md 実装チェックリストおよびスコープ節に明記され、変更対象（A/B/C/🔶=22 本）と据え置き（⛔=8 本）が一致。チェックリストの本数も実ファイルと一致した。

---

## 問題点（要修正）

問題点ゼロ。

Issue 要件のカバレッジ・スコープ整合性の観点で、要修正レベルの欠落・矛盾・スコープ逸脱は検出されなかった。

---

## 改善提案（検討推奨）

- **[S-001]** `$revisionId.tsx` の置換注意書きの表現がやや不正確
  - 計画 実装ステップ 2（plan.md 行 141）に「`$revisionId.tsx` はネスト位置（`createRoute` ラッパー内）の差異に注意してそのキーのみ置換」とある。実コードでは `createFileRoute("/_app/notes/$noteId/history/$revisionId")({ staleTime: 0, ... })` であり、別 API（`createRoute`）でも特殊なネストでもなく、ルートパスが長いため引数オブジェクトが改行で折り返されているだけ（行 41-43）。置換指示自体（`staleTime: 0` を当該キーのみ置換）は正しいので実害は無いが、「`createRoute` ラッパー内」という記述は誤解を招く。「引数が複数行に折り返されている点に注意」程度の表現が正確。
  - 理由: 要件カバレッジには影響しないが、実装者が存在しない API 差異を探す無駄を避けられる。

- **[S-002]** AC-9（ADR 更新）の検証可能性をもう一段具体化できる
  - AC-9 は「#293 の supersede 記録／公開ルート gcTime 方針の併記」を求めており、adr.md の ADR-001（#293 部分撤回・supersede 宣言、`.issue/293/adr.md` 本体は非破壊）・ADR-002（公開ルート `Infinity`+`gcTime`、有限 staleTime 不採用理由）で実体は満たされている。一方で AC 表（plan.md 行 27）の「検証可能な形」としては「adr.md に supersede 文言と gcTime 方針節が存在すること」までブレークダウンしておくと、レビュー時の合否判定が一意になる。
  - 理由: 現状でも内容は充足しているが、AC を「ファイル内に特定の記述が存在する」レベルまで落とすと受け入れ判定が機械的になる。

- **[S-003]** AC-12（admin mutation の `routerInvalidate` 配線確認）の対象に admin 全 5 種が揃っているかの明示
  - 計画は design/registration/llm/users/prompts の 5 フォームをスポットチェック済みとし（plan.md 行 87）、(A) 群の admin 5 ルートと一致している。網羅は取れているが、AC-12 表の「対応ステップ」が「2（事前確認は調査済み）」となっており、5 ルート ↔ 5 フォームの 1:1 対応が表からは追えない。調査結果節には列挙があるので実害は無いが、AC 側に「(A) admin 5 ルートそれぞれの mutation コンポーネントが配線済み」と紐付けると、admin ルート追加時の回帰チェック観点が AC に残る。
  - 理由: カバレッジは満たすが、将来 admin ルートが増えた際の「`routerInvalidate` を呼ばない mutation」混入リスク（plan.md 行 225 で言及済み）を AC で受けられる。

- **[S-004]** 🔶 フォーム系 upload の invalidate 経路の根拠を一段補える
  - ADR-003 / plan.md 行 51 は「upload は `routerInvalidate` 配線済みコンポーネントから ingest される」としてフォーム seed 鮮度を担保すると述べる。upload route の seed が profile/tags 等の安定データである点・mutation 後の更新経路が他 (A) ルートと同型である点は妥当だが、「ingest 元コンポーネントが具体的にどれか」までは未記載。Infinity 化の安全性判断（スコープ整合）は成立しているので問題ではないが、根拠ファイルを 1 つ挙げておくと判断が再現可能になる。
  - 理由: フォーム系を (A) に含める判断（ADR-003）の安全性根拠が、実装者・レビュアーから 1 ホップで辿れるようになる。

---

## 良い点

- **Issue 本文の現状値を全 22+3 ルートで実コード照合し、乖離ゼロを明記**（plan.md「既存実装の状態」表）。レビュー側でも全件再検証して一致を確認。計画の現状認識が正確で、置換対象の取り違えリスクが無い。
- **据え置き（⛔）ルートの除外理由が個別に明記**され、editor 系は ADR #669-003（`EDITOR_ROUTE_IDS`）、ライブ要件系は「ナビゲーション時に最新を見たい」と根拠付き。実コードの `routerInvalidate.ts` でも editor 除外が裏取りでき、スコープ境界が堅牢。誤って Infinity 化してライブ性を壊す事故を計画段階で塞いでいる。
- **有限 `staleTime` を採らない理由が ADR-001/002 に明文化**。「有限値はフラッシュの先送りにしかならない（期限切れ後の再訪で RSC 再 suspend）」という Issue 本文の核心論点を、選択肢 (a)(b)(c) の比較として ADR に正しく転記している。公開ルートで `Infinity`+`gcTime` を選ぶ理由（匿名閲覧者に invalidate 経路が無い）も Issue と整合。
- **#293 の supersede を非破壊で行う方針**（`.issue/293/adr.md` 本体を編集せず #683 側で supersede 宣言）が、プロジェクトの ADR 追記慣習（#487/#669）と一致し、AC-9 を満たす。
- **🔶 フォーム系 3 ルートの判断を ADR-003 として独立記録**し、(A) 群へ含める根拠（差分 1 行・テスト同型・分割の管理コスト過大）を明示。Issue 本文の「実装時に判断」を曖昧に残さず計画段階で決着させている。
- **`PUBLIC_ROUTE_GC_TIME` の置き場所**（`app/components/public/routeCache.ts`）が既存の framework-free public モジュール（`searchPeriod.ts`/`publicDateRange.ts`）の慣習に沿い、CLAUDE.md「定数は 1 箇所に hoist」と整合。AC-11 を構造的に満たす。
- **受け入れ条件 → AC → 実装ステップ → チェックリスト**の 4 層トレーサビリティが取れており、各 AC に「由来」と「対応ステップ」列がある。Issue 要件のどれがどのステップで充足されるかが一意に追える。

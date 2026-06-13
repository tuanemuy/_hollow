# Plan Review — Issue #642 / Round 1（アーキテクチャ・リスク視点）

レビュー対象: `.issue/642/plan.md` / `.issue/642/adr.md`
視点: アーキテクチャ整合性・実現可能性・リスク

## 検証したこと

- `app/core/domain/search/valueObject.ts` — `SearchQuery` / `dateBasis`（plain union + `create` のデフォルト `"date_for_calendar"`、L342/L355/L375）。計画の「`DateBasis` と同型の先行例に揃える」は実在のパターンと一致
- `app/core/adapters/d1/searchIndex.ts` — `runMatchQuery` の `ORDER BY bm25(...) ASC, sd.note_id ASC`、`runLikeQuery` の `ORDER BY sd.note_id ASC`、両経路とも `sd.updated_at` を既に SELECT 済み（#627 反映済み）。計画の前提どおり、スキーマ変更なしで ORDER BY 切替のみで実現可能
- `app/routes/search.tsx` — `searchSchema`（`.catch(undefined)`）と `renderInputSchema`（`.catch` なし）の二重定義、`loaderDeps: ({ search }) => search`（sort は自動的に deps に乗る）、loader の `...(deps.x !== undefined ? ... : {})` パターン。計画ステップ4はこの流儀に正確に沿っている
- `app/components/public/PublicSearch.tsx` — L183 `SORT_LABEL` の span、hidden input（`period !== null` の条件付き）、「次のページ」リンクの search 組み立て。計画ステップ5の変更箇所は全て実在
- `app/components/public/SearchFilterDrawer.tsx` — `navigate` は `search: (prev) => ({ ...prev, cursor: undefined, ... })` で **prev をスプレッドする**実装。ファセット変更時に `sort` は自動的に維持される（計画が暗黙に依存している性質だが、成立している。下記 S-002）
- 依存方向: ドメイン（Step 1）→ ユースケース（Step 2）→ アダプター（Step 3）→ transport 境界（Step 4）→ UI（Step 5–6）→ モック/spec（Step 7–8）→ テスト（Step 9）。内側から外側への順序で、ヘキサゴナルの依存方向と整合
- ロジック配置: ソート軸の定義は domain VO（`SearchSort` / `SearchQuery.sort`）、SQL 翻訳はアダプター、形の検証は `validateSearch` / `inputValidator`、状態保持は URL。CLAUDE.md の「クエリ条件は domain VO が単一の真実」「validate at the boundaries」と一致。ユースケースやアダプターへのドメインロジック漏れなし
- スコープ: P32 のみ対象・own/user 検索は UI 非露出（デフォルト値で無害波及）は Issue 文言どおり。過剰な理想形追求（カーソルのキーセット化、`published_at` projection 追加等）を意図的に避けており適切

## 問題点（要修正）

問題点ゼロ

## 改善提案（検討推奨）

- **[S-001]** `spec/domains/search.md` の更新（Step 8）に「`sort` はカウント系（`countByDateRanges`）に影響しない」旨を一言入れることを検討
  - 理由: 計画はポートの JSDoc には補足すると書いている（設計セクション）が、spec 側はフィールド追加の記述のみ。spec が単一の真実である以上、順序非依存であることも spec に置いた方が将来の読み手が JSDoc を探さずに済む。1行で済む話
- **[S-002]** Step 5 のテスト方針（手動確認）に「`sort=newest` の状態でファセット（ユーザー/タグ/期間）を変更しても `sort` が維持される」を1項目追加
  - 理由: `SearchFilterDrawer.navigate` が `...prev` スプレッドで未知パラメータを保持する実装に暗黙依存している。現状は成立するが、計画書に検証項目として明示しておかないと、実装中に drawer 側を触った場合の回帰に気づけない
- **[S-003]** ADR-001 の補足として、`period` ファセット（公開日基準）と `sort: newest`（更新日時基準）を併用した場合の挙動（公開日で絞り、更新日時で並べる）を spec/pages/index.md の P32 記述に明示することを検討
  - 理由: ADR-001 は時間軸の不一致をトレードオフとして認識しているが、両者を「同時に使った」ケースの定義が spec 更新内容（Step 8）に含まれていない。挙動自体は自然に正しいので実装変更は不要、spec の1文の問題

## 良い点

- 受け入れ基準が Issue 完了条件 + 派生要件（AC-5 cursor リセット、AC-6 LIKE 経路、AC-7 後方互換）まで分解され、各ステップにトレースされている
- `dateBasis` という既存の同型先行例を特定し、brand の要否・デフォルト値・`.catch` の有無まで既存規約に正確に揃えている。「既存に合わせただけの妥協」ではなく、あるべきパターン（illegal states unrepresentable な union + 境界 zod 検証）そのものに合致
- ADR-001 の `updated_at` 採用判断は、join コスト・表示値との一貫性・Issue 本文の想定を根拠にしており妥当。`published_at` 案の将来拡張パスも残している
- オフセットカーソル × ソート切替の整合性リスク（手組み URL でもエラーにならず単に新順序のオフセットになる）まで分析済みで、tie-breaker `note_id ASC` の維持も明記
- テスト方針が MATCH/LIKE 両経路 × newest/relevance × ページネーション連続性をカバーし、既存テストを回帰ガードとして位置づけている

## 結論

承認可能。問題点ゼロ、改善提案は3件いずれも軽微（spec 記述の明確化・手動テスト項目の追加）で、計画の構造変更は不要。

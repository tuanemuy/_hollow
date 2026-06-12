# Plan Review — Issue #642 / Round 1（要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/642/plan.md` / `.issue/642/adr.md`
視点: Issue要件のカバレッジ、受け入れ基準の検証可能性、基準↔ステップの紐づけ、スコープ逸脱

## 検証内容

- Issue #642 本文（コメントなし）と完了条件3項目を確認
- plan.md の AC-1〜AC-7、実装ステップ 1〜9、スコープ除外リストを照合
- コード実態を確認: `searchIndex.ts` の ORDER BY（L220 / L257）、`PublicSearch.tsx` の `SORT_LABEL` ラベル（L183）、`search.tsx` の `period` スキーマ二重定義パターン、`valueObject.ts` の `DateBasis` 先行例、`spec/design/pages/P32-public-search.html` の `.sort-label`（L380/L891）— いずれも plan の調査結果記載と一致
- 前提 #627（`updated_at` projection）が CLOSED 済みで、`sd.updated_at` が既に SELECT されていることを確認

## カバレッジ照合

| Issue 要件 | plan 上の対応 | 判定 |
|---|---|---|
| spec 拡張（`spec/pages/index.md` にソート選択肢） | AC-1 / ステップ 8 | OK |
| バックエンド: ユースケース + `searchIndex.ts` の `updated_at` 降順切替 | AC-2 / ステップ 1–3 | OK |
| フロント: トグル可能なソートUI + `validateSearch` で URL 保持 | AC-2, AC-3 / ステップ 4–5 | OK |
| 完了条件3: モック `.sort-btn`（下矢印付き）と整合 | AC-4 / ステップ 5–7 | OK |

派生基準 AC-5（cursor リセット）、AC-6（LIKE 経路）、AC-7（後方互換）はいずれも Issue 要件を満たすために必然的に導かれるもので、スコープ拡大ではない。各 AC は検証可能な形（URL パラメータ名、ソート基準、リセット挙動）で書かれており、対応ステップの紐づけも正しい（AC-1→8、AC-2→1–5、AC-3→4–5、AC-4→5–7※下記 S-001、AC-5→5、AC-6→3、AC-7→1–5）。

スコープ外の混入も確認: P30/SearchUserPublicNotes の UI 非対応、`published_at` 基準の不採用（ADR-001）、#618 項目2/3 の除外がいずれも明記されており、ドメイン VO のデフォルト付き拡張による波及は無害（既存呼び出し元無変更）と説明されている。逸脱なし。

#### 問題点（要修正）

問題点ゼロ

#### 改善提案（検討推奨）

- **[S-001]** AC-4 の「対応ステップ」列が「5, 6」だが、モックを `.sort-btn` に戻すステップ 7 も AC-4 の達成手段として plan 本文（ステップ7の理由欄）で明示されている。表を「5–7」に揃えると紐づけが完全になる。
  - 理由: 基準↔ステップの対応表は実装後の検収に使われるため、本文と表の不一致は小さくても混乱の元。
- **[S-002]** AC-5（ソート切替時の cursor リセット）は UI 実装の責務として plan に書かれているが、spec 側（ステップ 8 の `spec/pages/index.md` P32 追記）にこの挙動を一文含めることを検討。
  - 理由: spec は単一の真実という本プロジェクトの方針上、URL パラメータの相互作用（sort 変更で cursor 破棄）も仕様として残す方が将来の改修時に安全。スコープ増はほぼゼロ（一文の追記）。

#### 良い点

- Issue 完了条件3項目がすべて AC に落ちており、AC-5〜AC-7 の派生基準（カーソル整合・LIKE 経路・後方互換）まで先回りして検証可能な形で定義されている
- 調査結果の行番号・コミット参照（L220/L257、`SORT_LABEL` L183、a91f73fe）が実コードと正確に一致しており、計画の信頼性が高い
- 前提 #627 の充足（`updated_at` projection 済み・CLOSED）を確認したうえでマイグレーション不要と判断している
- スコープ除外（P30、SearchUserPublicNotes の UI、`published_at` 基準、#618 残項目）が明示され、ドメイン拡張の波及がデフォルト値で無害化される設計になっている
- `searchSchema`（`.catch` あり）と `renderInputSchema`（`.catch` なし）の二重定義の罠を「既存 `period` の轍」としてリスク欄に明記している

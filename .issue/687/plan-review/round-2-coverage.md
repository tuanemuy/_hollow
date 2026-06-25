# Plan Review — Issue #687 / Round 2

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/687/plan.md`, `.issue/687/adr.md`
**日付:** 2026-06-13

## 1周目指摘の反映確認

| 指摘 | 内容 | 反映先 | 判定 |
|---|---|---|---|
| coverage S-001 | AC-7 に README をスコープへ含める根拠を補強 | plan AC-7（L23）に「README を含める根拠: S5 で `Generate release notes` を削除すると README の『creates a GitHub Release』記述が陳腐化し、条件5『新フローに更新』の趣旨と矛盾するため」と明記 | 反映済み |
| coverage S-002 | AC-8 に squash の "Default commit message" = "Pull request title" 設定手順を含める旨を AC 文言レベルで明示 | plan AC-8（L24）に「squash の "Default commit message" を "Pull request title" に設定する手順を含み、1 PR = 1 conventional commit を担保」と明記。S7（L223）/ ADR-003（L70）とも整合 | 反映済み |
| arch P-001 | PAT 必須を確定（条件付き廃止） | AC-3（L19）/ S4（L198）/ リスク欄（L239）/ ADR-001（L25）すべて「PAT 必須・確定」で統一 | 反映済み |
| arch P-002 | `Generate release notes` 削除の workflow_dispatch 経路影響を明記 | S5（L205）に両経路の影響を明記 | 反映済み |
| arch S-001/S-003/S-004 | include-component-in-tag 表現統一 / deploy-staging 並走明示 / bootstrap-sha 逃げ道 | ADR-002（L44,L49）/ plan L100・図 L84 / ADR-003（L79）に反映 | 反映済み |

1周目で挙げた指摘（問題点0 / 改善提案2）はすべて plan・adr に反映されている。新たな反映漏れはない。

## 要件トレーサビリティ再確認

- Issue スコープ6項目（config / manifest / package.json version / release-please.yml / タグ整合確認 / docs更新）→ AC-1〜AC-7・S1〜S7 に漏れなく対応。
- Issue 受け入れ条件5項目 → AC-1〜AC-5・AC-7 に対応。各 AC は検証可能文言（タグ `vX.Y.Z`、`0.1.0` 一致、deploy ログに Release ステップ無し 等）を保持。
- ユーザー決定済み未決事項3つ（0.1.0 始まり / squash 統一 / workflow_dispatch fallback 残さない）→ AC・S・ADR・スコープ除外で一貫反映。

## コード照合（plan 記載の正確性・再確認）

- `package.json` に `version` 欠落 → 実ファイル確認（L1-6 に version なし）。S1 の前提が正しい。OK
- `deploy-production.yml` の `Generate release notes`（`softprops/action-gh-release@v2`, `generate_release_notes: true`）→ 実ファイル L153-156 に存在。S5 の削除対象記載と一致。OK
- `deploy-production.yml` の `on.push.tags: ["v*.*.*"]`（L6）+ `workflow_dispatch`（L7）→ 実ファイルと一致。AC-3 の前提が正しい。OK
- `README.md` Release flow 節（L137-145、`pnpm version` + 「creates a GitHub Release with auto-generated notes」L145）→ 実ファイルと一致。AC-7 の更新対象記載が正しい。OK

## 問題点（要修正）

問題点ゼロ。

1周目の2件の改善提案は AC 文言レベルで正しく反映され、新たな反映漏れ・矛盾は検出されなかった。Issue で合意されたスコープ6項目・受け入れ条件5項目・決定済み未決事項3つは、AC・実装ステップ・ADR・スコープ除外の各所で一貫して落ちている。plan が参照する実ファイルの行・内容も現物と一致しており、調査結果の正確性も維持されている。AC ↔ ステップ ↔ テスト方針の双方向トレーサビリティも崩れていない。

## 改善提案（検討推奨）

なし。要件カバレッジ・スコープ整合性の観点で追加すべき改善は見当たらない。

## 良い点

- 1周目指摘の反映が、単なる追記でなく AC 文言・S 本文・ADR の三層で整合を取って行われており、層間の食い違い（arch S-001 が指摘した include-component-in-tag の表現ズレ等）も解消済み。
- AC-7 / AC-8 の根拠補強により、Issue 本文に明記のない README 更新・default commit message 設定という「スコープ拡張」の正当性が AC レベルで自明になり、レビュアーがトレースできる状態になった。
- レビュー履歴節（plan L259-265）に反映/見送りが明記され、2周目の差分追跡が容易。

# PR Review #001 — design: admin/metrics のデザインモック新設（P47・#520）

**PR:** #527
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 3（design W-001 / W-002、SSOT W-001）
- Notes: 8
- Verdict: **BLOCKED**

---

## デザイン整合（Frontend / Design）

#### Blockers
なし。`:root`（131行）が P40 と完全一致、header / admin-nav / base / responsive ブロックがバイト一致、nav 8項目で「利用状況」active かつ実シェル順と一致、新規 CSS（`.num` / `.code` / `.panel` / banner strong mono）は既存プリミティブの最小拡張で新規トークンの発明なし。実装の画面構成・nullable 設計をモック末尾コメントが正確に反映。マージ可能。

#### Warnings
- **[design W-001]** `.table` モバイルカード化で `.num` 左寄せ解除に依存した可読性がやや弱い（`P47-admin-metrics.html` の 767px クエリ）。8行2列で破綻はなく、375px 実機で長ラベル行の折り返しを確認済みのため許容。→ 対応不要（P40 積層パターン踏襲のトレードオフ）。
- **[design W-002]** モックと実装の細部差分（banner margin、metric-card hover、section 見出し余白）が末尾コメントの2点以外にもある。いずれも「モックが理想形」の admin 共通パターンで、追従判断は #514。→ 対応不要（情報共有）。

#### Notes
- N-001: a11y 良好（h1→h2、各 section に aria-label、検索・通知に aria-label、avatar aria-hidden）。
- N-002: nullable / alerts 条件描画 / R2・DO 内訳が末尾コメントに正確。
- N-003: §9 を全て満たす。`.tag` の `white-space:nowrap` は非シェルの妥当なハードニング。
- N-004: 登録ポリシーで実装は `<code>`、モックは `<span class="code">`。見た目同一、デザイン整合上問題なし。

## SSOT・ドキュメント整合

#### Blockers
- **[B-001]** 範囲表記・画面数の更新漏れ（design/index.md 外の SSOT 索引）
  - 場所: `spec/index.md:19`（`全 34 画面 HTML`）/ `spec/index.md:60`（`全 34 画面（… / P40-P46）`）/ `spec/progress.md:64`（`P40-P46 (管理)`）
  - 理由: P47 追加で admin は8画面・総数+1 になるが、これら索引が P40-P46・34画面のまま。範囲表記の grep が `spec/design/index.md` 内に閉じ、`spec/` 全体の他索引を見落とし。
  - 提案: 34→35画面、P40-P46→P40-P47 に更新。
- **[B-002]** cross-phase 検証票の I5 行が P40 単独のまま（計画ステップ3が明記した更新の実施漏れ）
  - 場所: `spec/review/cross-phase/001.md:51`（`| I5 利用状況 | P40 | …`）
  - 理由: pages/index.md・§2.4 では I5 を P40（概況）+ P47（詳細）の二画面分担に SSOT 化したのに、トレーサビリティ票だけ「I5→P40 のみ」と古い対応を主張し矛盾。
  - 提案: 画面列を `P40, P47` に更新。

#### Warnings
- **[SSOT W-001]** `.issue/520/adr.md:77` が severity を「critical / warning / **low**」と記載するが、実装 DTO は `"info" | "warning" | "critical"`（`app/core/application/dto/common.ts:50`）。出荷 SSOT（モック・pages/index.md）は総称表記で矛盾しないが、作業ドキュメントの誤記が #514 への誤誘導になりうる。
  - 提案: adr.md の「low→accent-surface」を「info→accent-surface」に修正（testing.md は既に info で正しい）。

#### Notes
- N-001: admin モック全8枚が nav 8項目に整合、リンク先・ラベル・配置・active が全枚一致、実シェルと完全一致。
- N-002: スコープ遵守。差分に `.tsx` 変更皆無。
- N-003: §2.4 の責務境界が双方向相互参照で一貫、spec-sync 二重定義誤検出への配慮あり。
- N-004: 実装事実（`loadInstanceSettings` を metrics だけが引く、severity surface、`/admin/registration` 導線）と一致。

---

## Design Decisions

特になし（既存 ADR-001〜005 で設計判断は記録済み）。本ラウンドの Blocker は範囲表記の波及漏れという機械的修正で、新たな設計判断は伴わない。

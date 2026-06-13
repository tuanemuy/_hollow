# 計画レビュー round-2 — アーキテクチャ整合性・実現可能性・リスク（Issue #670）

対象: `.issue/670/plan.md` / `.issue/670/adr.md`（round-1 反映後の収束確認）

#### 問題点（要修正）

問題点ゼロ。

round-1 arch 指摘（P-001 Step0 実証ゲート / P-002 module-scope 可変 state と plan↔adr 不整合 / P-003 可視状態退避 / S-001 staleTime 差 / S-003 宣言的 AC-5 担保）はいずれも適切に反映され、計画はアーキテクチャ的に収束。一次情報で検証済み:

- 引用先の実在性: PR #676（issue/669）は origin/main にマージ済み（`f8226edb`）。`.issue/669/adr.md`・`analysis.md`・`noteEditorSeedOnce.test.tsx`・`routerInvalidate.ts` 改修はすべて origin/main に実在。plan の引用は正確。
- 前提補正の正しさ: `analysis.md` は TC-007 の真因を InlineEditor 内部 `host.replaceChildren()` と特定し「autosave/invalidate ではない」と明記。TC-009 は生 invalidate 後も編集維持。plan/adr の remount 断定撤回 → Step 0 実証ゲートへの転換は実測根拠と一致。
- ルート除外整合: `routerInvalidate.ts` は `_app` とエディタールートのみ除外。本 Issue の対象3ルートは除外対象外、という記述は正確。
- 機構一本化: plan/adr が共に (a)（境界外引き上げ・第一候補）/ (b)（境界外 Context）/ (c)（module-scope client-only adapter・最終手段、CLAUDE.md 整合）で一致。

#### 改善提案（検討推奨）

- **[S-001]** #669 マージ済み origin/main からの分岐確認を Step 0 冒頭に固定する。
  - 理由: plan L15 の前提自体は正しいが、実装着手時に「#676 を含む origin/main から分岐（or rebase 済み確認）」を Step 0 の最初に1行入れておくと、参照先不在のまま実装に入る取り違えを防げる。

- **[S-002]** Step 0 のユニット再現が本番 RSC 差し替えと非等価になりうる点を判定の主従として明記する。
  - 理由: `renderServerComponent(...)` の RSC ペイロードを `useLoaderData()` で描画する経路では、loader 再実行時に leaf 要素の type/key が同一なら React は reconcile し remount しない（TC-009 がこの挙動）。ユニットで意図的に親を unmount→remount すれば必ず「喪失」が出るが本番の証明にならない。判定の一次根拠は本番相当 invalidate の agent-browser 観測（mount カウンタ増加）、ユニットは補助、という主従を AC-1 エビデンス要件に明記すると過剰防御を確実に防げる。

#### 良い点

- #669 の precaution（エディタールート除外）を「remount を実測したから外した」と誤読せず、一次情報に基づき remount 断定を撤回し Step 0 実証ゲートに倒した判断が的確。過剰設計を構造的に回避。
- 機構を (a)→(b)→(c) の優先順で並べ (a) 境界外引き上げを第一候補に据えたのは CLAUDE.md のステートレス志向と最も整合し、reset 漏れ・サーバ越境リーク・key 衝突のいずれのリスクも持たない。
- staleTime 非対称を Step 0 で区別観測する設計は3ルート一律「影響あり」とする誤りを防ぐ実測的アプローチ。
- ドメイン/アプリ/アダプター層に影響なし＝UI 局所修正、の切り分けが正しい。

### サマリー
- 問題点: 0 / 改善提案: 2
- `[S-001]` #669 マージ済み origin/main からの分岐確認を Step 0 冒頭に固定
- `[S-002]` Step 0 判定の主従（本番 invalidate のブラウザ観測が一次、ユニット親 remount は補助）を AC-1 に明記

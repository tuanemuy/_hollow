# Plan Review — Issue #728 / Round 2（Issueの要件カバレッジ・スコープ整合性）

レビュアー視点: Issue 本文で求められた要件がすべて受け入れ基準に落ち、各基準が検証可能で、実装ステップと正しく紐づき、スコープ外作業が紛れ込んでいないか。加えて 1 周目の改善提案（S-001 / S-002）と、その後入った arch-risk 視点の設計変更（`clearAppShellAndNavigate` → `clearAppShellCache`、clearCache のみ・navigate は呼び出し側）がカバレッジ面で破綻していないか。

## 検証済み事実（2 周目で再確認）

- 1 周目で確認した全ファイル・行番号は plan.md と一致したまま。今回の設計変更は「ヘルパーに何を含めるか」のみで、対象ファイル・対象フォーム（UserMenu / LoginForm / PasswordResetConfirmForm / AccountDeleteForm）の集合は不変。要件カバレッジの母集合は変わっていない。
- `app/components/common/routerInvalidate.ts` を再確認: `APP_SHELL_ROUTE_ID = "/_app"` 定数と `appShellInvalidate`（`routeId === "/_app"` 厳密一致 filter）が既存。新ヘルパー `clearAppShellCache` は同じ定数・同じ filter 形を流用でき、同居が自然。モジュール冒頭 JSDoc は現状「`router.invalidate()` 制御を集約」「公開 API は 2 つ」と明記しており、ステップ 1 の JSDoc 更新指示（責務を「AppShell キャッシュ制御」へ拡張・公開 API 3 つへ更新）は実コードの記述と正確に対応している。
- **S-001 の反映**: AC-3 に「前提: リセット確認 action は `setSessionCookie` でセッションを確立し `/` = 認証済みホームへ遷移する。後述『調査結果』で確認済み」が追記済み。調査結果 line 40 で `action.ts:26` の `setSessionCookie` / `resetPassword` usecase（旧セッション revoke → 新セッション issue → token 返却）まで根拠立てされ、AC-6 の「SignUpForm = セッション非発行」と対比される形で確認観点が明確化されている。1 周目 S-001 の指摘どおり「AC-3 の検証が空振りしない」状態になっている。
- **S-002 の反映**: AC-7 / ステップ 7 が「LoginForm / PasswordResetConfirmForm のテストを先に存在確認し、存在すれば追従必須、無ければ任意（最小担保 = helper test + UserMenu test + AccountDeleteForm 既存 test）」へ更新済み。実コードを確認したところ両フォームに test ファイルは存在しない（`LoginForm/` `PasswordResetConfirmForm/` ともに `action.ts` / `index.tsx` のみ）ため、「任意」の判定は正しく、最小担保（helper + UserMenu + AccountDeleteForm）が AC-2/AC-3 の呼び出し方式回帰を実際にカバーする構成になっている。1 周目 S-002 の指摘どおり「検証根拠が明確」な状態。
- 設計変更（clearCache のみ集約）後も AC-4 は「現在マウント中ルートをその場で再描画しない破棄方式 + 共通ヘルパー 1 本に集約（navigate は per-call 型推論を保つため呼び出し側に残す）」と更新され、Issue の二要件（race 回避 + 再発防止）を維持。navigate がヘルパー外に出たことで「共通化が片肺になるのでは」という懸念は、AC-4 が集約対象を「clearCache 述語」に限定し直しているため要件充足としては成立している（Issue が求めたのは「各フォームが手順を個別に書かない」= clearCache 述語の重複排除であり、これは達成される）。

---

#### 問題点（要修正）

問題点ゼロ

Issue 本文で求められた要件はすべて AC-1〜AC-7 に漏れなく落ちたままで、設計変更（clearCache のみ集約）によってカバレッジが欠落・後退した箇所はない。各基準は検証可能（具体パス・具体フォーム・具体的な観測対象が明記）、AC ↔ 実装ステップの紐づけも一対一で正確。スコープ外作業の混入もない。1 周目の改善提案 S-001 / S-002 はいずれも plan に反映済み。要修正レベルの欠落・誤りは検出できなかった。

#### 改善提案（検討推奨）

- **[S-001]** AC-4 に「navigate は呼び出し側に残す」前提が入ったことで、「3 フォーム + AccountDeleteForm がいずれも `clearAppShellCache` を呼び navigate を後続させる」という *呼び出し順序* が要件の一部に昇格している。AC-4 は集約（述語の重複排除）を検証する基準だが、「clearCache が navigate より前」という順序不変条件の検証はステップ 7（UserMenu test の順序 assert）に閉じている。Issue 症状（race 回避）の本質は順序にあるため、AC レベルで「ヘルパー呼び出しが navigate に先行すること」を 1 語添えると、設計変更後の race 回避要件が AC とテストの両面で明示的に紐づく。
  - 理由: 設計変更前は「ヘルパー 1 本で破棄+navigate 完結」だったため順序ミスが構造的に起こり得なかった。clearCache と navigate を分離した今、順序は呼び出し側の規律に依存する。plan はこのリスクを「リスクと注意点」と helper/UserMenu テストの順序 assert で既に手当てしているので致命ではないが、順序が race 回避の核心になった以上、AC への明示は検証根拠を一段堅くする。

#### 良い点

- 1 周目の改善提案 S-001 / S-002 がいずれも plan 本文（AC-3 / AC-7 / 調査結果 / ステップ 7）に具体的に取り込まれ、「レビュー履歴」セクションにも S-001(coverage) / S-002(coverage) として反映が追跡可能な形で記録されている。指摘の消化が形式的でなく、検証観点（リセット確認のセッション確立、フォームテスト存在確認）として実体化している。
- arch-risk 由来の設計変更（ヘルパーを clearCache 専用へ縮小、navigate を呼び出し側へ）が、要件カバレッジを一切削らずに吸収されている。AC-4 が「集約対象 = clearCache 述語」に再定義され、Issue が求めた「各フォームが手順を個別に書かない」という再発防止意図を、navigate を外に出しても満たす形に整理されている。スコープの過小化（共通化の放棄）にも過大化（navigate まで型を曲げて無理に集約）にも陥っていない。
- AC-5（AccountDeleteForm を同ヘルパーに寄せる）が設計変更後「clearCache 行のみ置換・navigate 行はそのまま = 呼ぶ router メソッド不変 → 挙動完全等価・既存テスト無改修 green」と明確化され、参照実装の寄せ込みが回帰ゼロで成立することが論証されている。Issue が「修正の方向性は AccountDeleteForm に既にある」と指摘した点と完全整合。
- AC-6（invalidate-only 4 フォーム）の「変更なし・確認のみ」スコープ判断と、`useAuthGuardEffect` をスコープ外とする ADR-002 の構造的切り分けは 1 周目から維持され、設計変更による影響を受けていない。Issue の「別途確認が必要」「合わせて検討」という曖昧な要求に対し、確認のみ / スコープ外という線引きが論理的根拠付きで安定している。
- 各 AC に「由来」列と「対応ステップ」列があり、Issue のどの記述から来た基準がどのステップで満たされるかが一対一で追跡可能。設計変更後も AC ↔ ステップの対応表が崩れていない（ステップ 1〜5 が AC-1〜AC-5 に対応、ステップ 6 が AC-6、ステップ 7 が AC-7）。

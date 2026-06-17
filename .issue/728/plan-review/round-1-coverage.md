# Plan Review — Issue #728 / Round 1（Issueの要件カバレッジ・スコープ整合性）

レビュアー視点: Issue 本文で求められた要件がすべて受け入れ基準に落ち、各基準が検証可能で、実装ステップと正しく紐づき、スコープ外作業が紛れ込んでいないか。

検証済み事実:
- plan.md が挙げる全ファイル・行番号は実コードと一致（UserMenu 68-69 `invalidate()→navigate({to:"/login"})`、LoginForm 82-83 `invalidate()→navigate({to:"/",search:HOME_SEARCH})`、PasswordResetConfirmForm 97-98 同型、AccountDeleteForm 50-51 `clearCache({filter:routeId==="/_app"})→navigate`）。
- `routerInvalidate.ts` に `APP_SHELL_ROUTE_ID="/_app"` 定数と `appShellInvalidate`（厳密一致 filter）が既存。新ヘルパー同居は構造的に妥当。
- AC-6 の前提検証: signup.tsx は `redirectAuthenticatedRoute` guard あり、signUp usecase はセッション非発行（cookie/session 参照なし）→ invalidate 後も未認証のまま＝意図しない `/` redirect は起きない。setup.tsx は `checkSetupEnabled` のみ（guard 非搭載）。verify-email.tsx / email-change/confirm.tsx は guard なし。いずれも plan の記述通り。
- テスト: UserMenu.test は `invalidate`/`navigate` を mock、AccountDeleteForm.test は `clearCache`/`navigate` を mock、routerInvalidate.test は filter 述語を検証。plan のテスト方針と整合。

---

#### 問題点（要修正）

問題点ゼロ

Issue 本文で求められた要件はすべて AC-1〜AC-7 に漏れなく落ちており、各基準は検証可能（具体パス・具体フォーム・具体的な観測対象が明記）、AC ↔ 実装ステップの紐づけも一対一で正確。スコープ外作業の混入もない。要修正レベルの欠落・誤りは検出できなかった。

#### 改善提案（検討推奨）

- **[S-001]** AC-3（PasswordResetConfirmForm）の「自動ログイン遷移」が実際に成立する前提を AC または確認観点に 1 行追記すると良い。
  - 理由: AC-1/AC-2 はログアウト/ログインで認証状態が確実に変わる。一方 AC-3 のチラつきは「リセット完了 = サーバー側でセッション確立済み」が前提。`resetPassword` usecase がセッション cookie を張るのか（張らないなら `/` 着地後に AppShell が認証済みで描画されるはずがなく、そもそも race の症状が出るのか）は plan で未確認。AC-6 では SignUpForm のセッション非発行を明示的に確認しているのに、AC-3 は対になる「セッションを張る」確認がない。手動確認(testing.md)で吸収できる範囲だが、確認観点に「リセット完了でセッションが確立されること」を明記しておくと AC-3 の検証が空振りしない。

- **[S-002]** AC-7 の対象に LoginForm / PasswordResetConfirmForm のテスト追従を「任意」ではなく明示的に位置づけるか、現状で十分な理由を 1 行残すと良い。
  - 理由: ステップ 7 は LoginForm / PasswordResetConfirmForm テストを「無ければ追加は任意。最小は UserMenu + helper test」としている。AC-2/AC-3 はこの 2 フォームが対象なのに、回帰を捉えるユニットテストが任意扱いだと、コード変更（invalidate→helper 置換）が実装ミスで navigate を呼ばなくなった場合にユニット層で検知できない。helper 単体テスト + UserMenu で「呼び出し方式」自体は担保されるので致命ではないが、「2 フォームのテストが現状存在するか」を先に確認し、存在するなら追従を必須化、存在しないなら helper test でカバーされる旨を理由として残すと AC-2/AC-3 の検証根拠が明確になる。

#### 良い点

- 受け入れ基準が Issue の要求要素（ログアウト/ログイン/リセットの 3 症状、共通ヘルパー化、AccountDeleteForm の寄せ、invalidate-only 4 フォームの副作用確認、テスト追従）を 1 対 1 で網羅。「由来」列で各 AC が Issue のどの記述から来たか追跡可能になっており、カバレッジ漏れの検証がしやすい。
- AC-4 が「現在マウント中ルートをその場で再描画しない破棄方式」+「共通ヘルパー 1 本に集約」という Issue の二要件（race 回避 + 再発防止）を 1 基準にまとめており、Issue の「共通ヘルパー化」意図に正確に沿っている。
- AC-5（AccountDeleteForm を同ヘルパーに寄せる）は Issue が「修正の方向性はコードベース内に既に存在する」と指摘した参照実装をヘルパー化の基準点に据えており、Issue 意図と完全整合。挙動等価（clearCache→navigate 維持）も明記され、回帰リスクの扱いが適切。
- AC-6（invalidate-only 4 フォーム）の「変更なし・確認のみ」というスコープ判断が Issue の「別途確認が必要」という要求に正確に対応。各フォームの guard 有無・セッション発行有無をステップ 6 で個別に根拠立てしており、確認が検証可能な形になっている（本レビューで実コードと突き合わせ、全て正しいことを確認済み）。
- `useAuthGuardEffect` をスコープ外とした判断が ADR-002 で構造的根拠（navigate を伴わない leaf 観測経路で clearCache 解法が適用不能、#300 ADR-001 で受容済みトレードオフ）とともに明記され、Issue が「合わせて検討」と曖昧に求めた点に対し「なぜ別問題か」を論理的に切り分けている。スコープの過大・過小いずれも回避できている。
- 修正方針案 2/3（順序入れ替え・アトミック機構）を ADR-001 で明示的に不採用とし、既存実績パターンへの統一理由を述べている。Issue が複数案を提示した中からの取捨選択が記録され、スコープが発散していない。

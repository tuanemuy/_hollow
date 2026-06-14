# Round 1 レビュー — Issueの要件カバレッジ・スコープ整合性（#573）

レビュー対象: `.issue/573/plan.md` / `.issue/573/adr.md`
視点: Issueの要件カバレッジ・スコープ整合性
日付: 2026-06-14

## 検証した事実（コード照合）

- `deleteAccount.ts` の `confirmation` は username 一致のみ・パスワード未検証 → 計画の現状認識は正確（L41-46）。
- `requestEmailChange.ts` が `verifyPasswordForUser` → `AuthenticationError('invalid_credentials')` の同型再認証を実装済み → AC-1 の参照パターンは正確（L31-40）。
- `credentialStore.ts:75-79` `verifyPasswordForUser` は「あらゆる失敗（soft-deleted 含む）で false を返す」契約。**パスワード未設定（SSO のみ）も false になりうる** → リスク欄の指摘は契約と一致。
- `dispatchDomainEvent.ts` の `user.deleted` fan-out は publication → export の 2 つのみ。**note / media / savedView / prompt の reaction handler は存在しない** → ADR-003 / AC-5 の「ノート本体・メディア実体は purge されない」前提は正確。
- モック `P24-settings-account-delete.html`: alert-error（影響リスト 6 項目）+ confirm-steps（step-num 3 段）+ checkbox-row + danger-action（aria-disabled ボタン + danger-note）。計画の UI 要素分解は正確。
- 現状フロント `AccountDeleteForm/index.tsx` は `ConfirmDialog`（username のみ）+ `clearAppShellCache` → `/` navigate。`account-delete.tsx` の loader は `<AccountDeletePage user=...>` を直接描画（async データ無し）。計画の現状認識は正確。
- `schema.ts:35-37` `deleteAccountSchema = { confirmation }`。計画の追加対象は正確。

## 結論サマリー

Issue 本文のスコープ（1. 多段確認 + パスワード再検証、2. 削除影響の実データ集計、虚偽表示禁止原則）は **受け入れ基準 AC-1〜AC-8 に過不足なく落ちている**。モックの全 UI 要素（alert / confirm-steps / step-num / checkbox-row / danger-action / 影響リスト 6 項目）も AC-6 に反映済み。スコープ外作業の混入も見当たらない。要件カバレッジ観点での **要修正の問題点はゼロ**。検証可能性・トレーサビリティを高める改善提案を数点挙げる。

---

## 問題点（要修正）

問題点ゼロ。

（要件カバレッジ・スコープ整合性の観点で、Issue 本文・モック・コメント合意と計画の間に齟齬・漏れ・スコープ逸脱は検出されなかった。以下はいずれも「あれば尚良い」レベルの改善提案。）

---

## 改善提案（検討推奨）

- **[S-001]** モック影響リストの 6 項目すべてに対する「採否と表現方針」を AC 表に 1 対 1 で対応づけると、カバレッジ漏れの検証が容易になる。
  - 現状: モックは ①ノート 127 件、②メディア 1.4GB、③公開ノート 34 件（410 Gone）、④限定公開リンク 8 本失効、⑤保存ビュー・カスタムプロンプト・進行中エクスポートジョブ、⑥復元不可、の 6 項目。AC-4/AC-5 と ADR-003 で各項目の扱いは記述されているが、**「⑤の保存ビュー・カスタムプロンプト」を集計値として出すか／出さないか**が AC 表からは読み取れない（ADR-003 では「個別の削除断定を避け包括表現」だが、AC には「集計しない」が明記されていない）。
  - 理由: 実装者が「保存ビュー件数も集計すべきか」を AC だけで判断できない。AC-4 は集計対象を「件数・容量・410 Gone・失効リンク」と列挙しており、saved view / prompt はそこに含まれていない＝集計しないと読めるが、明示すれば曖昧さが消える。AC-5 もしくはスコープ「含まれないもの」に「saved view / custom prompt の件数集計は行わない（包括表現にとどめる）」と 1 行追記を推奨。

- **[S-002]** AC-7 の「即時ログアウト」を検証可能な observable に具体化すると良い。
  - 現状: AC-7 は「実行後は即時ログアウトされ `/` へ遷移」とあるが、ログアウトの実体は usecase の `sessionService.revokeAllForUser`（UoW 外）+ frontend の `clearAppShellCache` + navigate。検証手段（manual-test で「再アクセスで未認証にリダイレクトされる」等）は計画のテスト方針に部分的にあるが、AC 自体は「ログアウトされた」を直接観測する形になっていない。
  - 理由: 「`/` に遷移した」だけでは「セッションが実際に失効した」ことの検証にならない。AC-7 を「削除実行後、保護ルート再訪で未認証として扱われる（= revokeAll が効いている）」まで含めると検証可能性が上がる。なお revokeAll 自体は既存挙動なので新規実装はゼロ。

- **[S-003]** AC-1 の「検証順序（username → password）」が AC では断定されていない点。
  - 現状: 計画 L87 では「username → password 順とする（差分最小）」と判断しているが、AC-1 は「username 不一致は `confirmation_mismatch`、password 不一致は `invalid_credentials`」とエラー種別のみ規定し順序を縛っていない。テスト方針には「検証順序の確認」とある。
  - 理由: AC とテスト方針・設計判断の間で順序の扱いに濃淡がある。frontend が両方必須にするため実害は無いが、テストで順序を assert するなら AC-1 にも「username を先に判定する」を 1 句足すか、逆にテストで順序を縛らない（どちらのエラーが返ってもよい）方針に統一すると、AC ↔ テストの紐づけが明確になる。

- **[S-004]** リスク欄の「SSO のみ（パスワード未設定）ユーザー」論点を、実装フェーズ送りにせず計画段階で結論づけることを推奨。
  - 現状: 計画 L214 は「password 必須でないユーザーが存在しうるか要確認／フォールバックの要否は実装フェーズで判断」と保留。
  - 理由: これは要件カバレッジに直結する（「全ユーザーがアカウント削除できる」という暗黙要件を満たせるか）。もしパスワード未設定ユーザーが存在しうるなら、AC-1 のパスワード再検証は当該ユーザーの削除経路を塞ぐ＝**機能後退になりうる**。スコープ判断（本 Issue で扱う / 別 Issue 化）を計画段階で確定し、ADR 化しておくと後戻りがない。コードベースに SSO 専用ユーザーが存在しうるかの調査（`removePassword` の利用箇所・SSO サインアップ経路の有無）を 1 ステップ追加するのが安全。

- **[S-005]** AC-3 の「DELETE 確認語を backend に渡さない」境界を、AC とリスク欄に加えて**テスト方針でも担保**すると徹底できる。
  - 現状: AC-3・リスク欄 L217・ステップ 7 で「`confirmWord` を action で破棄し usecase へ渡さない」と複数箇所で明記されており方針は十分明確。ただしテスト方針には `confirmWord` 非伝播の検証が無い。
  - 理由: 「backend が確認語に関与しない」は Issue 明記の境界。`DeleteAccountInput` に confirmWord が増えていないことは型で守られるが、action 層のテスト（confirmWord を含む入力でも usecase へは confirmation/currentPassword のみ渡る）を 1 ケース足すと境界が回帰から守られる。任意。

---

## 良い点

- **AC 表に「由来」列があり、各基準が Issue 本文・モック・参照 Issue（#510/#221/#728）のどこから来たかをトレースできる。** 要件カバレッジ検証が容易で、漏れの発見可能性が高い設計。
- **虚偽表示禁止（AC-5 / ADR-003）の扱いが具体的かつコード事実に基づいている。** 「`user.deleted` fan-out が publication/export のみで note/media に reaction handler が無い」という実装事実をコード参照付きで確認した上で、「ノート本体・メディア実体は即時 purge されない＝『失われる』を断定しない」と結論づけており、#543 で確立した原則を正しく踏襲している。実コード照合でこの前提は正確だった。
- **owner 横断集計の方式選択（ADR-001）が実カスケードとの一致を判定基準にしている。** 「失効対象は public ノートのリンクではなく全ノートの active リンク」という実挙動（`publication.handleUserDeletedEvent` が全ノート private 化）を踏まえ、案1（public 列挙合算）を「過小カウント＝虚偽表示」として正しく退け、案3（owner-scoped count SQL）を選んでいる。要件（正確な失効リンク数）と原則（虚偽表示禁止）の両立が取れている。
- **スコープの「含まれないもの」が明確で、purge 追加・他画面流用・別ダイアログ化・兄弟 Issue 領域を明示的に除外している。** スコープクリープのリスクが低い。
- **モックの全 UI 要素（alert-error / confirm-steps / step-num / checkbox-row / danger-action / disabled ゲート）が AC-6/AC-7 に反映され、モック由来の影響リスト 6 項目も漏れなく言及されている。** モック SSOT 追従の観点で抜けが無い。
- **既存パターン（`requestEmailChange` の再認証、`listUserSessions` の read-only projection、#728 の clearAppShellCache）への準拠が明示され、新規発明を最小化している。** 差分最小で要件を満たす方針が一貫している。

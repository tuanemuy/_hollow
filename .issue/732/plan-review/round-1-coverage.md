# Round 1 レビュー — Issueの要件カバレッジ・スコープ整合性 (#732)

レビュー対象: `.issue/732/plan.md` / `.issue/732/adr.md`
視点: Issueの要件カバレッジ・スコープ整合性

---

#### 問題点（要修正）

- **[P-001]** AC-4 が検証可能な「回数」基準として弱く、回帰の物差しになっていない
  - 理由: Issue が最重視する不変条件のうち「初回 1 RPC・以降 0 RPC（`staleTime: Infinity`）」を AC-4 が担っているが、文面が「regression しない」「fresh 訪問では走らない」という定性表現に留まり、何をどう測れば green とみなすかが定義されていない。実装ステップ 4（テスト方針）でも検証しているのは `appShellInvalidate`（= `router.invalidate`）の**呼び出し回数**であって、`_app.loader`/`renderHome` server fn の **RPC 回数**ではない。`appShellInvalidate` を 1 回しか呼ばないことと「初回 1 RPC・以降 0 RPC」が保たれることは別事象（invalidate が走れば RPC は増えうる）。本変更は invalidate ロジックを等価に保つ設計なので実態としては regression しないが、AC として「何を見れば守られていると言えるか」が空欄なのは検証可能性の欠落。
  - 提案: AC-4 を 2 分割または明文化する。(a)「本変更前後で `useAuthGuardEffect` の `useEffect` 発火条件・依存配列が等価（不整合時のみ `appShellInvalidate` 1 回、fresh/認証済みで 0 回）であることをユニットテストでピン留め」、(b)「fresh 未認証訪問では `_app.loader` の server fn が初回 1 回のみ呼ばれ、レンダリングガード追加によって追加 RPC が発生しないこと」を手動テスト（DevTools Network で RPC 回数を観測）で確認、と検証手段まで落とす。少なくとも (a) は既存 `routerInvalidate.test.ts` / `useAuthGuardEffect.test.tsx` の回数 assert が担保している旨を AC-4 の「対応ステップ」に明記する。

- **[P-002]** AC-2（fresh 未認証で `LandingPage` が描画される）に対する自動検証が無く、最重要リスクが手動テストのみに委ねられている
  - 理由: plan.md「リスクと注意点」自身が「fresh 未認証訪問者の誤抑制リスク（最重要）」と位置づけている要件が AC-2。しかし対応ステップ 4 のユニットテストは hook の**戻り値**（fresh で `false`）までしか検証せず、「`false` のとき `HomeRoute` が実際に `LandingPage` を描画する（中立プレースホルダに差し替わらない）」というレンダリング分岐そのものは手動テストにしか紐づいていない。戻り値が `false` でも、ステップ 2 の分岐実装を「`isResolvingAuthMismatch ? placeholder : LandingPage`」の条件を取り違えると AC-2 を破るが、それを捕まえるテストが無い。SSOT を hook に置く設計で構造的リスクは下がるものの、分岐の向きの取り違えは hook 戻り値テストでは検出できない。
  - 提案: ステップ 4 に「`HomeRoute` の分岐ロジックを純関数として切り出すか、戻り値フラグ → 描画選択のマッピング（`true`→中立 / `false`→`LandingPage`）を最小テストで固定する」案を 1 行追加するか、それが server component の都合で困難なら AC-2 の「対応ステップ」から自動テスト（4）を外して手動テスト主担当であることを明示し、誤抑制を検出する手動手順を具体化する（現状の手動テスト項目「未ログインで初回 `/` → `LandingPage` 即表示」は妥当なので、これが AC-2 の主検証であると表に紐づける）。

#### 改善提案（検討推奨）

- **[S-001]** AC-5 の収束に「不整合フラグが `false` に落ちる」中間状態の検証観点を追記すると、自動/手動の責任分界が明確になる
  - 理由: AC-5（invalidate 完了 → AppShell 再評価 → `LandingPage` 収束）は本質的に非同期収束で、ユニットテストでは fire-and-forget 完了を待てないため手動テストに依存する。これは設計上妥当だが、AC-5 の表に検証手段（手動）が明記されておらず「対応ステップ 1,2」とだけある。実装ステップ 1/2 はコード変更であって検証ではない。AC-5 の検証は手動テスト項目（AC-1/AC-5 を同一手順で確認）が担う旨を表に紐づけると、各 AC の検証手段の所在が一意になる。

- **[S-002]** Issue が許容する「明示的再受容（ADR-001 案 D）」を選ばなかった判断は ADR に十分あるが、AC 表が「ゼロフレーム化」前提のみで、Issue の二択（ゼロフレーム化 **または** 再受容）の片方しか基準化していない
  - 理由: Issue 本文・優先度: 低の文脈では「再受容して close」も合意済みの正当な着地点。plan は (A) ゼロフレーム化を選び ADR-001 で (D) を退けているため要件は満たすが、もし実装中にゼロフレーム化が `staleTime: Infinity` や収束保証と衝突すると判明した場合のフォールバック（= (D) 再受容で close）が AC 表に無い。スコープ厳守の観点では問題ないが、優先度: 低の Issue として「ゼロフレーム化が割に合わなければ (D) に退避する」撤退条件を ADR-001 Consequences に 1 行残すと、実装段階での判断が一貫する。

#### 良い点

- Issue が明示した 3 不変条件（①初回 1 RPC・②`staleTime: Infinity`・③fresh 未認証で誤発火しない）がいずれも AC 表（AC-2 / AC-4）と「リスクと注意点」に落ちており、Issue 本文・#728 ADR-002・#300 ADR-001 の参照が正確。要件の取りこぼしは無い。
- スコープ「含まれないもの」が Issue の「検討の方向性」と完全に対応している。特に (B) navigate 案・(C) redirect 再設計を ADR-001 で原理的に効かない/コスト過大として退け、Issue 本文の「`/` へ navigate しても同一ルートで再評価されない」という指摘とコードの実態（`_app/route.tsx` の `staleTime: Infinity` + `AppLayout` が `userDto===null` で `<Outlet/>`）が一致している。スコープ外作業の混入は無い。
- ちらつきの実発生箇所を `_app/index.tsx` の `if (!data.authenticated) return <LandingPage />`（166 行目）と正確に特定し、変更を hook と唯一の呼び出し元 `HomeRoute` の 2 箇所に局所化。`routerInvalidate.ts` の 3 API・`AppLayout`・`HOME_SEARCH` を不変としている点が #300 ADR-002 発火点規約と整合。
- 不整合判定の SSOT を hook に一本化（ADR-002 (b)）し、`HomeRoute` 側の式二重化による fresh 未認証誤抑制を構造的に防ぐ設計判断は、最重要リスク（AC-2）への正しい対処。既存テスト `useAuthGuardEffect.test.tsx` の不整合検出契約（fresh no-op / 不整合 1 回 / id 変化で再発火）を維持する方針も明確。

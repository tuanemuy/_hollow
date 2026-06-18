# Plan Review — Issue #728 (round-2: アーキテクチャ整合性・実現可能性・リスク)

レビュー対象: `.issue/728/plan.md` / `.issue/728/adr.md`（round-1 の P-001 / P-002 反映後）
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

#### 問題点（要修正）

- **[P-001]** ステップ 1 の JSDoc 更新が **モジュール冒頭 JSDoc にしか言及しておらず、`routerInvalidate.ts` 内の関数レベル JSDoc 2 箇所に残る「rule 1 は生の `router.invalidate()` を使う」という明示記述との矛盾を手当てしていない**。このままだと、コード規約（JSDoc）が「rule 1 = 生 invalidate」と命じる一方、実装は rule 1 を clearCache 化するという、SSOT モジュール内部での自己矛盾が残る。
  - 理由: 該当記述は 2 箇所ある。
    - `routerInvalidate` の JSDoc（57-65 行）:「以下のいずれかに該当する mutation でのみ生の `router.invalidate()` を直接呼ぶこと（AppShell を再評価させたいケース）: rule 1. 認証状態が変わる（未認証 ⇄ 認証）/ rule 2 / rule 3」。
    - `appShellInvalidate` の JSDoc（92-95 行）:「3 rule 例外（auth / directory / displayName mutation）は **AppShell の依存データ自体が変わる** ため、引き続き生の `router.invalidate()` を使う（leaf も併せて再評価される必要があるため）」。
    本 Issue は rule 1（認証状態変化）の **破棄手段を clearCache へ統一** するので、上記 2 つの「rule 1 では生 invalidate」という規約文と直接衝突する。plan ステップ 1 は「モジュール冒頭 JSDoc の責務記述拡張＋公開 API 2→3」しか挙げておらず、この 2 箇所の関数 JSDoc 改訂が**ステップに含まれていない**。さらに `appShellInvalidate` JSDoc の「leaf も併せて再評価される必要があるため生 invalidate」という根拠は、clearCache（leaf を再評価せず破棄するだけ）へ寄せる本 Issue の前提と論理的にも食い違っており、なぜ rule 1 が clearCache 側に移れるのか（mutation 直後は navigate で別ルートへ遷移するため leaf の in-place 再評価がそもそも不要、という本 Issue 固有の事情）を明記しないと、規約の読み手が「rule 1 は生 invalidate」と「rule 1 は clearCache」のどちらが正なのか判断できない。
  - 提案: ステップ 1 に、モジュール冒頭 JSDoc に加えて関数レベル JSDoc 2 箇所の改訂を明記する。具体的には (a) `routerInvalidate` JSDoc の rule 列挙を「rule 1 は **navigate を伴う mutation 直後は `clearAppShellCache` + navigate**、navigate を伴わない AppShell 再評価（rule 2/3・errorComponent retry 等）は生 invalidate / `appShellInvalidate`」のように、手段が文脈で分岐することを書き分ける。(b) `appShellInvalidate` JSDoc の「3 rule 例外は引き続き生 invalidate」記述から rule 1 を外す（または「rule 1 のうち navigate を伴うフローは `clearAppShellCache` を使う」と例外条件を補足する）。rule 2/3（directory / displayName mutation、navigate を伴わず現在ルートに留まって再評価したい）は引き続き生 invalidate で正しいので、その区別を残す。

#### 改善提案（検討推奨）

- **[S-001]** ステップ 6 の補足「補足: invalidate のみで navigate しないフロー（SignUpForm 等）」が `appShellInvalidate` ではなく**生 `router.invalidate()`** を呼んでいる前提で書かれているか、念のため実呼び出しを 1 度確認しておくとよい（plan は invalidate-only として整理しているが、`appShellInvalidate` 経由かどうかで「rule 1 の手段統一」の波及範囲がわずかに変わる）。本 Issue では変更しないので致命ではないが、P-001 の JSDoc 改訂時に「rule 1 = 認証状態変化」の定義が SignUpForm（認証状態を変えない）と AccountDelete/Login/Logout/Reset（変える）でどう線引きされるかを JSDoc に書くなら、確認しておくと記述がぶれない。

- **[S-002]** clearCache → navigate の評価順序リスクについて、plan は AccountDeleteForm の実績を根拠に「踏襲は安全」とし手動確認（AC-1〜3）で目視する方針で、これは妥当。ただし AccountDeleteForm の遷移先は `/`（= `_app` 内）であり、ログアウト（UserMenu）の遷移先 `/login` は **`_app` 外**である点で前例と条件が一致しない。`_app` 外への navigate では clearCache 済みの `_app` match がそもそもアンマウントされる経路になるため race の構造はより単純（むしろ安全側）だが、「AccountDeleteForm に実績がある」を唯一の根拠にすると遷移先の違いを取りこぼす。AC-1 の手動確認（`/`, `/notes`, `/settings` 各ページからのログアウト）でこの `_app`→`_app外` 経路を必ず踏むので実害はないが、リスク欄に「ログアウトは `_app` 外遷移なので前例（AccountDelete=`_app`内）と経路が異なる旨」を一言添えると、目視確認の重点が明確になる。

#### 良い点

- **[G-001]** round-1 の P-001（型 pin）/ P-002（clearCache は同期 void）が正しく解消されている。ヘルパーを `clearAppShellCache(router): void`（clearCache のみ・同期 void）に絞り、navigate を呼び出し側にリテラル引数で残す設計は、`router.navigate` の per-call 型推論（`{ to: "/", search: HOME_SEARCH }`）を保ち `pnpm typecheck` を通す妥当な形。AccountDeleteForm（49-51 行）が同期 `clearCache(...)` → `await navigate(...)` で実動している実績とも完全に整合。型プローブで再現したエラーを設計レベルで回避できている。

- **[G-002]** ステップ 5（AccountDeleteForm）の寄せ方が「clearCache 行のみヘルパー化、navigate 行はそのまま」になっており、呼ぶ router メソッド（clearCache / navigate）が不変＝挙動完全等価。実コード（50-51 行）が plan の記述どおりで、既存テスト（`useRouter: () => ({ navigate, clearCache })` で個別 mock）を無改修 green で維持できる根拠が正しい。

- **[G-003]** テスト方針の現実性が高い。LoginForm / PasswordResetConfirmForm にテストディレクトリが存在しないことを実地確認したところ、plan の「存在すれば追従必須・無ければ任意、最小担保は helper + UserMenu + AccountDeleteForm 既存」という判断と一致する。helper を clearCache 専用にしたことで navigate 引数型の回帰源にならず、search 付き navigate の回帰は呼び出し側リテラル＋`pnpm typecheck` でカバーする整理も妥当。helper テストが既存 `FakeMatch` / `takeFilter` パターンを流用できる点も実コード（`routerInvalidate.test.ts`）で確認でき、実装容易。

- **[G-004]** plan 各ステップの行番号参照（UserMenu 68-69 / LoginForm 82-83 / PasswordResetConfirmForm 97-98 / AccountDeleteForm 50-51）が実コードと完全に一致しており、調査の精度が高い。リセット確認が `setSessionCookie` で認証を確立する（= AC-3 の race 成立条件）という前提も action.ts / usecase まで追って裏取りされている。

---

## 総評

round-1 の P-001 / P-002 は設計変更で正しく解消され、型・同期性の観点では実装可能な形になった。残る要修正は **P-001 1 件**: `routerInvalidate.ts` 内の関数レベル JSDoc 2 箇所（`routerInvalidate` の rule 列挙、`appShellInvalidate` の「3 rule 例外は引き続き生 invalidate」記述）が「rule 1 = 生 invalidate」と明示しており、本 Issue の「rule 1 を clearCache へ統一」と矛盾するのに、plan ステップ 1 はモジュール冒頭 JSDoc しか改訂対象に挙げていない。SSOT モジュール内部の規約矛盾を残さないよう、関数 JSDoc 2 箇所の改訂をステップに加えること。これを手当てすれば実装に進んで問題ない。

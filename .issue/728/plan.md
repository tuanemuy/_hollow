# 実装計画 — Issue #728: 認証状態の遷移（ログイン/ログアウト等）でランディングページが一瞬表示される — invalidate→navigate の race

**Issue:** #728
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

認証状態を変える mutation（ログイン・ログアウト・パスワードリセット確認）の直後、目的ページへ遷移し切る前に未認証時のランディング（`/`）が 1 フレーム挟まるチラつきを解消する。`AccountDeleteForm` が確立済みの `clearCache({ filter: _app }) → navigate()` パターンに統一し、**clearCache 部分を共通ヘルパー（`clearAppShellCache`）に集約**して再発を防ぐ。navigate は各呼び出し側に残す（per-call の型推論を保つため。詳細は ADR-001 / 設計セクション）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `_app` 配下の任意のパス（`/`, `/notes`, `/settings` 等）からログアウトしたとき、`/login` 着地までの間にランディング/未認証 UI が描画されない | Issue 症状・動作確認の観点 | 2 |
| AC-2 | ログイン成功後 `/`（認証済みホーム）への遷移過程でランディングが描画されない | Issue 症状・動作確認の観点 | 3 |
| AC-3 | パスワードリセット確認の自動ログイン遷移過程でランディングが描画されない（前提: リセット確認 action は `setSessionCookie` でセッションを確立し `/` = 認証済みホームへ遷移する。後述「調査結果」で確認済み） | Issue 症状・動作確認の観点 | 4 |
| AC-4 | 上記 3 箇所が「現在マウント中ルートをその場で再描画しない」破棄方式（`clearCache`）を経由し、各フォームが clearCache 手順を個別に書かず共通ヘルパー `clearAppShellCache` 1 本に集約されている（navigate は per-call 型推論を保つため呼び出し側に残す）。**順序不変条件: `clearAppShellCache` 呼び出しが直後の `navigate` に先行する（破棄 → 遷移の順）** | Issue 修正方針（共通ヘルパー化） | 1〜4 |
| AC-5 | `AccountDeleteForm` も同じ共通ヘルパーに寄せ、退会フローの既存挙動（チラつき無し）が維持される | Issue「AccountDeleteForm を同ヘルパーに寄せるか明記」 | 5 |
| AC-6 | invalidate のみで navigate しないフロー（SignUpForm / AdminSignUpForm / VerifyEmail / EmailChangeConfirm）の挙動が変わらない（成功画面が出続け、意図しない `/` redirect が起きない）ことを確認・記録 | Issue「副作用確認」 | 6（確認のみ） |
| AC-7 | 既存ユニットテスト（UserMenu / AccountDeleteForm 等）が新しい呼び出し方式に追従して green。LoginForm / PasswordResetConfirmForm はテストが存在すれば mock を追従させ、無ければ追加は任意（最小担保は helper test + UserMenu test + AccountDeleteForm 既存 test。根拠はテスト方針を参照） | テスト方針 | 7 |

## スコープ

### 含まれないもの

- **`useAuthGuardEffect` の fire-and-forget 経路の改修**。これは「navigate を伴わない leaf 観測 → AppShell 再評価」であり、本 Issue の「mutation 直後に invalidate→navigate を逐次 await する race」とは発火構造が異なる。`.issue/300/adr.md` ADR-001 で 1 フレームのトレードオフとして既に受容・記録済み。clearCache では navigate を伴わないため同じ解法を当てられず、別の設計（leaf 側で navigate を起こす等）が必要になり Issue スコープを超える。本 Issue では「対象外」と明記し、必要なら別 Issue 化する（adr.md ADR-002）。
- 「navigate を先 / invalidate を後」への順序入れ替え案、navigate と破棄をアトミックに行う独自機構（Issue 修正方針案 2）。既存に確立された `clearCache` パターンがあり、そちらに統一する方が一貫性・実績で勝るため採らない（adr.md ADR-001）。
- invalidate-only 4 フォームの実装変更（確認のみ。AC-6）。

## 調査結果

- 関連ファイル:
  - `app/components/identity/AccountDeleteForm/index.tsx:49-51` — 確立済みの回避策（`clearCache({ filter: routeId === "/_app" }) → navigate`）。参照実装。
  - `app/components/layout/UserMenu.tsx:66-69` — ログアウト。`invalidate() → navigate({to:"/login"})`。要修正。
  - `app/components/auth/LoginForm/index.tsx:81-83` — ログイン。`invalidate() → navigate({to:"/"})`。要修正。
  - `app/components/auth/PasswordResetConfirmForm/index.tsx:96-98` — パスワードリセット確認。`invalidate() → navigate({to:"/"})`。要修正。
  - `app/components/auth/PasswordResetConfirmForm/action.ts:26` — `resetPasswordFn` の handler が `setSessionCookie(result.sessionToken, ...)` を呼ぶ。`resetPassword` usecase（`app/core/application/identity/resetPassword.ts`）は旧セッションを revoke 後に新セッションを `issue` し token を返す。**= リセット確認はセッションを確立する**ため、直後の `/` 遷移は認証済みホームに着地し、AC-3 の「認証状態が変わる直後の navigate race」が成立する（AC-6 の SignUpForm = セッション非発行 と対になる確認）。
  - `app/components/common/routerInvalidate.ts` — `_app` 系制御を集約する既存モジュール（`routerInvalidate` / `appShellInvalidate`）。新ヘルパー（clearCache のみ）はここに同居させるのが構造的に最も自然。
  - `app/routes/_app/route.tsx:52-90` — `loadAppShell`（`getCurrentUser()` で `userDto` を返す）/ `staleTime: Infinity`（本番）。race の発生源（invalidate がここを即時再評価する）。
  - `app/core/presentation/authGuard.ts:28-31` — `redirectAuthenticatedRoute`。`/login` `/signup` の beforeLoad に付く。authenticated なら `/` redirect。
  - invalidate-only フォーム: `SignUpForm/index.tsx:106`（route `/signup`、guard あり）, `AdminSignUpForm/index.tsx:115`（route `/setup`、guard なし＝`checkSetupEnabled` のみ）, `VerifyEmail/index.tsx:74`（route `/verify-email`、guard なし）, `EmailChangeConfirm/index.tsx:73`（route `/email-change/confirm`、guard なし）。
  - テスト: `app/components/layout/__tests__/UserMenu.test.tsx`（`invalidate` / `navigate` を mock）、`app/components/identity/AccountDeleteForm/__tests__/index.test.tsx`（`clearCache` / `navigate` を mock）、`app/components/common/__tests__/routerInvalidate.test.ts`（filter 述語を検証）。
- あるべきアーキテクチャ:
  - `_app.loader` の `staleTime: Infinity`（#293）= 「初回 1 RPC、以降 0 RPC」。invalidate は **現在マウント中ルートをその場で再評価** するため、認証状態を変えた直後に呼ぶと未認証 UI を即時描画してしまう。`clearCache` は cached match を破棄するが in-place 再評価をしない → navigate と race しない（#421 由来、AccountDeleteForm のコメント）。
  - `_app` 系 invalidate は `routerInvalidate.ts` に集約し、routeId のリネームに 1 ファイルで追従する設計（#293 ADR-010）。新ヘルパーも同方針で同モジュールに置く。
  - 「認証状態が変わる mutation は AppShell を破棄する（rule 1）」が確立済みの規約（`routerInvalidate.ts` JSDoc）。本 Issue は rule 1 の **破棄手段** を「invalidate（in-place 再評価あり）」から「clearCache（破棄のみ）+ navigate」へ統一する。
- 既存実装の状態:
  - `AccountDeleteForm` のみ「あるべき姿（clearCache）」に到達済み。ただしヘルパー化されておらず手順がインライン。
  - UserMenu / LoginForm / PasswordResetConfirmForm は旧パターン（invalidate→navigate）のまま＝あるべき姿から乖離。本 Issue で是正。
  - invalidate-only 4 フォームは navigate を伴わない別パターンであり、本 Issue の race とは無関係（AC-6 で副作用が無いことを確認するに留める）。
- 依存関係: `routerInvalidate.ts` に公開 API を 1 つ（`clearAppShellCache`、clearCache のみ・同期 `void`）追加するのみ。`_app` の routeId 定数（`APP_SHELL_ROUTE_ID`）を再利用する。`router.clearCache` は router-core v1.170.15 で `(opts?) => void` の **同期 void**（await 対象でない）。AccountDeleteForm 既存実装（`clearCache(...)` は await せず直後に `await navigate(...)`）が同期前提で正しく動いている実績どおり。

## 設計

### ドメインモデルへの影響

なし。本 Issue はフロントエンドのルーター制御（クライアントサイドのキャッシュ破棄と遷移順序）のみで、ドメイン/ユースケース/アダプターに変更はない。

### ユースケース / アプリケーションロジック

なし。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

- `routerInvalidate.ts` に **認証状態遷移時に AppShell の cached match を破棄する** 新ヘルパー `clearAppShellCache(router): void` を追加する（命名は調整可。clearCache のみ実行）。
  - 内部は `router.clearCache({ filter: (m) => m.routeId === APP_SHELL_ROUTE_ID })` のみ。`appShellInvalidate` と同じ `APP_SHELL_ROUTE_ID` の厳密一致 filter を使う。戻り値は `void`（`clearCache` は同期。await しない）。
  - **navigate はヘルパーに含めない。** 各呼び出し側で `clearAppShellCache(router); await router.navigate({ to, search? });` の形で書く。これは `router.navigate` が per-call で `TTo`/`TFrom`/search スキーマを推論する generic（`NavigateFn`）であり、引数を `Parameters<AnyRouter["navigate"]>[0]` のような単一インスタンス型に落とすと `{ to: "/", search: HOME_SEARCH }` が `TS2322` で落ちるため（arch-risk レビュー P-001 で型プローブ再現済み）。navigate をリテラル引数のまま呼び出し側に残すことで型補完と search 形が保たれる。
- 3 つのフォーム（UserMenu / LoginForm / PasswordResetConfirmForm）を「`clearAppShellCache(router)` + 既存 navigate」へ置き換える。`AccountDeleteForm` は既に `clearCache(...) + navigate(...)` なので、clearCache 行だけを `clearAppShellCache(router)` に寄せる（navigate 行はそのまま＝挙動完全等価）。

## 実装ステップ

### 1. 共通ヘルパー `clearAppShellCache` を追加

- **対象ファイル:** `app/components/common/routerInvalidate.ts`
- **変更内容:** 既存の `APP_SHELL_ROUTE_ID` を再利用し、新関数を追加・export する。
  ```ts
  /**
   * 認証状態が変わる mutation 直後、navigate 前に呼ぶ。
   * cached `_app` match を clearCache で破棄する（in-place 再評価を起こさない）。
   * これにより直後の router.navigate が完了する前に、新しい認証状態で
   * 現在ルートが再描画される race を避けられる。invalidate と違い同期 void。
   */
  export function clearAppShellCache(router: AnyRouter): void {
    router.clearCache({ filter: (m) => m.routeId === APP_SHELL_ROUTE_ID });
  }
  ```
  併せて **JSDoc を 3 箇所更新する**（round-1 S-001 arch-risk + round-2 P-001 arch-risk）。本 Issue は rule 1（認証状態変化）の **破棄手段を生 invalidate から clearCache へ統一** するため、SSOT モジュール内部に「rule 1 = 生 invalidate」という旧規約文が残ると自己矛盾になる。線引きの原則は「**navigate を伴う auth 遷移 = `clearAppShellCache` + navigate**」「**navigate を伴わない AppShell 再評価（rule 2/3・errorComponent retry・`useAuthGuardEffect` 等）= 生 invalidate / `appShellInvalidate`**」で、JSDoc 全体がこの一貫した線引きになるよう更新する。

  1. **モジュール冒頭 JSDoc（1-16 行）**: 現状「`router.invalidate()` 制御を集約するモジュール」「公開 API は 2 つ（`routerInvalidate` / `appShellInvalidate`）」と締めている。(a) 責務記述を「`_app` AppShell のキャッシュ制御（invalidate / clearCache）を集約するモジュール」へ広げ、(b) 公開 API を 3 つ目（`clearAppShellCache`: clearCache ベース、mutation 直後の navigate 前破棄に使う）として追記し、`appShellInvalidate`（navigate を伴わない AppShell 再評価）と `clearAppShellCache`（navigate を伴う auth 遷移直前の破棄）の意味分担を 1 行添える。背景に `.issue/728` を引く。
  2. **`routerInvalidate` 関数 JSDoc 内の rule 列挙（57-65 行）**: 現状「以下のいずれかに該当する mutation でのみ生の `router.invalidate()` を直接呼ぶこと: rule 1. 認証状態が変わる（未認証 ⇄ 認証）/ rule 2. directory tree 改変 / rule 3. displayName 改変」。**rule 1 のうち navigate を伴う auth 遷移（ログイン/ログアウト/リセット確認/退会）は `clearAppShellCache` + navigate を使う** ことを明記し、生 invalidate を直接呼ぶのは「navigate を伴わず AppShell を in-place 再評価したいケース（rule 2/3、および認証状態を変えない invalidate-only フローの `_app` 再評価）」に限定されるよう書き分ける。rule 2/3 は引き続き生 invalidate で正しい旨を残す。
  3. **`appShellInvalidate` 関数 JSDoc（92-95 行）**: 現状「3 rule 例外（auth / directory / displayName mutation）は AppShell の依存データ自体が変わるため、引き続き生の `router.invalidate()` を使う（leaf も併せて再評価される必要があるため）」。auth mutation の navigate 遷移経路が `clearAppShellCache` 側に移ったことを反映し、「3 rule 例外」から rule 1 の navigate 遷移フローを外す（または「rule 1 のうち navigate を伴うフローは `clearAppShellCache` を使い、navigate を伴わない `_app` 再評価のみここを使う」と例外条件を補足する）。「leaf も併せて再評価される必要がある」という根拠は navigate を伴わない rule 2/3 にのみ当てはまる旨が読み取れるよう整える（mutation 直後に navigate で別ルートへ遷移するフローは leaf の in-place 再評価が不要、という本 Issue 固有の事情を一言添えると線引きが明確になる）。
- **理由:** rule 1 mutation の **clearCache 手段** を 1 箇所に集約し、各フォームが clearCache 述語を個別に書く再発要因を断つ（AC-4）。navigate を含めないのは P-001 round-1（`Parameters<AnyRouter["navigate"]>[0]` が search 付き navigate を型エラーにする）の回避。`routerInvalidate.ts` は既に `_app` 系制御の SSOT なので同居が自然。JSDoc を 3 箇所まとめて直すのは、SSOT モジュール内部に「rule 1 = 生 invalidate」という旧規約と「rule 1 = clearCache」という新実装が併存する自己矛盾を残さないため（P-001 round-2）。

### 2. ログアウト（UserMenu）を新ヘルパーに置き換え

- **対象ファイル:** `app/components/layout/UserMenu.tsx`
- **変更内容:** 68-69 行の `await router.invalidate(); await router.navigate({ to: "/login" });` を `clearAppShellCache(router); await router.navigate({ to: "/login" });` に置換。import 追加。コメントを clearCache 方式の理由に更新。`clearAppShellCache` は同期 void なので `await` しない（navigate のみ await）。
- **理由:** AC-1。

### 3. ログイン（LoginForm）を新ヘルパーに置き換え

- **対象ファイル:** `app/components/auth/LoginForm/index.tsx`
- **変更内容:** 82-83 行の `await router.invalidate(); await router.navigate({ to: "/", search: HOME_SEARCH });` を `clearAppShellCache(router); await router.navigate({ to: "/", search: HOME_SEARCH });` に置換。import 追加・コメント更新。navigate はリテラル引数のまま呼び出し側に残るので search の型補完が保たれる。
- **理由:** AC-2。

### 4. パスワードリセット確認（PasswordResetConfirmForm）を新ヘルパーに置き換え

- **対象ファイル:** `app/components/auth/PasswordResetConfirmForm/index.tsx`
- **変更内容:** 97-98 行の `await router.invalidate(); await router.navigate({ to: "/", search: HOME_SEARCH });` を `clearAppShellCache(router); await router.navigate({ to: "/", search: HOME_SEARCH });` に置換。import 追加・コメント更新。
- **理由:** AC-3。

### 5. AccountDeleteForm を新ヘルパーに寄せる

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:** 50 行の `router.clearCache({ filter: (match) => match.routeId === "/_app" });` を `clearAppShellCache(router);` に置換するのみ。**51 行の `await router.navigate({ to: "/", search: HOME_SEARCH });` はそのまま**。`startTransition` 内 `try` の構造・前後の `setError` も維持。import 追加。
- **理由:** AC-5。既に正しい挙動だが、clearCache 述語がインラインのままだと「SSOT に集約して再発防止」という Issue 意図が片肺になる。clearCache のみヘルパー化なので navigate は呼び出し側に残り、**呼ぶ router メソッド（clearCache / navigate）が変わらない → 挙動完全等価・既存テスト無改修で green 維持**（S-003 arch-risk）。

### 6. invalidate-only 4 フォームの副作用確認（コード変更なし）

- **対象ファイル:** `SignUpForm/index.tsx`, `AdminSignUpForm/index.tsx`, `VerifyEmail/index.tsx`, `EmailChangeConfirm/index.tsx`（確認のみ）
- **変更内容:** 変更しない。下記を確認し plan/PR に記録する。
  - `/signup`（SignUpForm）は `redirectAuthenticatedRoute` guard を持つが、サインアップ action はセッション Cookie を発行しない（メール確認フロー）。invalidate 後も `checkAuthenticated` は false を返すため `/` への意図しない redirect は起きず、成功画面が出続ける。
  - `/setup`（AdminSignUpForm）は guard が `checkSetupEnabled` のみで `redirectAuthenticatedRoute` 非搭載。redirect 副作用なし。
  - `/verify-email`・`/email-change/confirm` は guard なし。redirect 副作用なし。
  - いずれも navigate を伴わないため本 Issue の race（navigate との競合）は構造的に発生しない。
  - **invalidate 経路の確認（S-001 arch-risk）:** 4 フォームとも `appShellInvalidate` / `routerInvalidate` 経由ではなく **生の `router.invalidate()` 直呼び**であることを実コードで確認済み（`SignUpForm/index.tsx:106` / `AdminSignUpForm/index.tsx:115` / `VerifyEmail/index.tsx:74` / `EmailChangeConfirm/index.tsx:73`）。`EmailChangeConfirm` のみ「`_app` の `userDto.email` キャッシュ破棄のため」というコメントで `rule 1` を引いているが、これは **認証状態を変えない**（メールアドレス変更で session は不変）ため、本 Issue の rule 1 JSDoc 線引き（auth 状態変化 ⇄ navigate）における「rule 1 の auth 遷移」には該当しない。ステップ 1 の rule 1 JSDoc を書く際は、`clearAppShellCache` へ寄せる対象は「**認証状態を変える** mutation のうち navigate を伴うもの（Login/Logout/Reset 確認/AccountDelete）」に限定され、これら invalidate-only 4 フォーム（生 invalidate のまま）は線引きの外であることを記述ぶれなく書く。
- **理由:** AC-6。Issue で明示された副作用観点の確認。invalidate 経路の確認は P-001（rule 1 JSDoc 線引き）の記述ぶれ防止のため。万一 SignUpForm が将来セッションを張る設計に変わると guard と invalidate が干渉しうる点を PR コメントに残す。

### 7. テスト更新

- **対象ファイル:**
  - `app/components/common/__tests__/routerInvalidate.test.ts` — `clearAppShellCache` の単体テスト追加: `clearCache` mock を足し、渡した filter が `/_app` 厳密一致のみ通す（leaf / `/_app/notes` prefix-extension を弾く）ことを検証。`appShellInvalidate` の既存 filter テスト（`FakeMatch` / `takeFilter` パターン）を流用する。helper は clearCache のみなので navigate 引数の検証はここでは行わない。
  - `app/components/layout/__tests__/UserMenu.test.tsx` — mock router を `clearCache` + `navigate` に変更（AccountDeleteForm test と同形）。`invalidate` 検証を `clearAppShellCache`（= clearCache 呼び出し）検証に置換し、navigate 呼び出しと順序（clearCache が navigate より前）を assert。
  - `LoginForm` / `PasswordResetConfirmForm` のテスト — 先に存在確認する。存在すれば mock を `clearCache` + `navigate` 方式に追従（必須）。存在しなければ追加は任意（最小担保は helper test + UserMenu test + AccountDeleteForm 既存 test。S-002 coverage / S-002 arch-risk）。
  - `AccountDeleteForm/__tests__/index.test.tsx` — 既に `useRouter: () => ({ navigate, clearCache })` で両方を個別 mock 済み。clearCache のみヘルパー化で**呼ぶ router メソッドが変わらない**ため、mock 構造を一切変えずに green を維持できる（S-003 arch-risk）。helper import の mock 解決のみ確認。
- **理由:** AC-7。

## 設計判断

- **破棄手段は `clearCache → navigate` に統一**（順序入れ替えやアトミック機構は採らない）。既存の確立済みパターンに寄せる。→ adr.md ADR-001。
- **ヘルパーは clearCache のみ集約し、navigate は呼び出し側に残す**。`router.navigate` の per-call 型推論を保ち、search 付き navigate（`{ to: "/", search: HOME_SEARCH }`）を型エラーにしないため（P-001）。→ adr.md ADR-001。
- **`useAuthGuardEffect` の fire-and-forget 経路は本 Issue スコープ外**。発火構造が異なり clearCache 解法を当てられないため。→ adr.md ADR-002。
- ヘルパーの配置は `routerInvalidate.ts`（`_app` 系制御の既存 SSOT）に同居。新規ファイルは作らない。

## リスクと注意点

- `clearCache` は cached match を破棄するが、**現在 `/_app` がマウント中**の場合に navigate がどの順で評価されるかは TanStack Router の実装に依存する。AccountDeleteForm で実績がある（退会→`/` 遷移でチラつき無し）ので踏襲は安全と判断するが、動作確認（AC-1〜3）で各パスからの遷移を必ず目視する。
- ログアウトは遷移先が `/login`（`_app` 外）、ログイン/リセットは `/`（`_app` 内）。後者は navigate 先で `_app.loader` が新しい認証状態で fresh load される（clearCache 済みのため）。`HOME_SEARCH` を維持して URL を汚さないこと。
- **ログアウトの経路差（S-002 arch-risk・目視確認の重点）:** ログアウトは `_app` 外（`/login`）への遷移で、前例の AccountDelete（`_app` 内 `/` への遷移）と経路が異なる。`_app` 外 navigate では clearCache 済みの `_app` match がアンマウントされる経路になり race 構造はむしろ単純（安全側）だが、「AccountDeleteForm に実績がある」を唯一の根拠にすると遷移先の違いを取りこぼすため、AC-1 の手動確認（`/`, `/notes`, `/settings` 各ページからのログアウト）でこの `_app` → `_app` 外経路を必ず目視する。
- ヘルパーは clearCache のみで navigate を含めない（P-001 回避）。そのため呼び出し側で「clearCache を先に呼ぶ」順序を各フォームが守る必要がある。順序ミスはレビューと helper/UserMenu テスト（clearCache→navigate の順序 assert）で検知する。`clearAppShellCache` は同期 void なので `await` は不要・付けてもよいが意味はない（await は navigate のみ）。
- SignUpForm が将来セッションを張る設計になった場合、`/signup` の guard と invalidate が干渉する（成功画面が出ず `/` に飛ぶ）。現状は無害だが PR に注意書きを残す。

## テスト方針

- ユニット: `routerInvalidate.test.ts` に `clearAppShellCache`（filter が `/_app` 厳密一致のみ通すこと。clearCache のみなので navigate 引数の検証は不要）。`UserMenu.test.tsx` を clearCache 方式に追従（clearCache→navigate の順序 assert）。
- search を伴う navigate 引数の回帰は、LoginForm / PasswordResetConfirmForm の呼び出し側テスト（存在すれば追従）または `pnpm typecheck`（navigate が呼び出し側のリテラル引数のまま per-call 推論されるため、search スキーマ不整合は型レベルで検知）でカバーされる。helper を clearCache 専用にしたことで、helper 自体は navigate 引数型の回帰源にならない（P-001 / S-002 arch-risk）。AccountDeleteForm 既存テストは無改修で green 維持（S-003）。
- 既存テスト green 維持（`pnpm typecheck && pnpm lint:fix && pnpm format` 後 `pnpm test:unit`）。
- 手動/ブラウザ確認（testing.md / manual-test）:
  - `/`, `/notes`, `/settings` 各ページからログアウト → `/login` 着地までランディングが挟まらない。
  - ログイン成功 → `/` 遷移でランディングが挟まらない。
  - パスワードリセット確認完了 → `/` 遷移でランディングが挟まらない。
  - 退会 → `/`（ランディング）遷移で従来同様チラつき無し（回帰確認）。
  - SignUpForm / VerifyEmail / EmailChangeConfirm の成功画面が従来通り表示される（副作用が無い回帰確認）。

## レビュー履歴

- **1 周目:** arch-risk 2 件（要修正）・coverage 0 件（要修正）・改善提案計 5 件を反映。
  - P-001（arch-risk）: ヘルパー型 `Parameters<AnyRouter["navigate"]>[0]` が search 付き navigate を typecheck で落とす → **設計変更: ヘルパーを clearCache 専用 `clearAppShellCache(router): void` に絞り、navigate は各呼び出し側にリテラル引数で残す**。実装ステップ 1〜5・設計・テスト方針・AC-4・ADR-001 を全面更新。
  - P-002（arch-risk）: `router.clearCache` は同期 void で await 対象でない → plan/ADR から await・Promise 戻り値前提を除去。ヘルパーは void、navigate のみ await。
  - S-001（arch-risk）: `routerInvalidate.ts` 冒頭モジュール JSDoc の「公開 API は 2 つ」「invalidate 制御を集約」記述更新をステップ 1 に明記。
  - S-002（arch-risk）/ S-002（coverage）: helper は clearCache 専用のため filter 厳密一致のみ検証。search 付き navigate の回帰は呼び出し側テスト＋typecheck でカバーする旨をテスト方針に整理。LoginForm/PasswordResetConfirmForm はテスト存在時のみ追従必須・無ければ任意（最小担保 = helper + UserMenu + AccountDeleteForm 既存）と AC-7 に明記。
  - S-003（arch-risk）: ステップ 5 を「clearCache 行のみ `clearAppShellCache(router)` に置換、navigate 行はそのまま」へ修正。呼ぶ router メソッドが不変のため既存テスト無改修 green を明記。
  - S-001（coverage）: AC-3 / 調査結果に「リセット確認 action は `setSessionCookie` でセッションを確立する（`action.ts:26` / `resetPassword` usecase）」前提を追記。
- **2 周目:** arch-risk P-001（JSDoc 整合）+ 改善提案 3 件を反映。JSDoc 更新対象を関数レベル 2 箇所に拡充、AC-4 に順序不変条件を追記。
  - P-001（arch-risk）: ステップ 1 の JSDoc 更新が冒頭モジュール JSDoc しか挙げておらず、関数レベル JSDoc 2 箇所（`routerInvalidate` の rule 列挙、`appShellInvalidate` の「3 rule 例外は引き続き生 invalidate」）に残る「rule 1 = 生 invalidate」が clearCache 化と矛盾 → **ステップ 1 の JSDoc 更新対象をモジュール冒頭 + 関数 2 箇所の計 3 箇所に拡充**。線引き原則「navigate を伴う auth 遷移 = `clearAppShellCache` + navigate / navigate を伴わない AppShell 再評価 = 生 invalidate・`appShellInvalidate`」が JSDoc 全体で一貫するよう更新。ADR-001 Consequences にも補足。
  - S-001（arch-risk）: invalidate-only 4 フォーム（SignUpForm/AdminSignUpForm/VerifyEmail/EmailChangeConfirm）が **生 `router.invalidate()` 直呼び**であることを実コードで確認し、ステップ 6 に記録。`EmailChangeConfirm` の `rule 1` コメントは「認証状態を変えない」ため auth 遷移の線引き外である旨も整理（rule 1 JSDoc の記述ぶれ防止）。
  - S-002（arch-risk）: リスク欄に「ログアウトは `_app` 外（`/login`）遷移で前例の AccountDelete（`_app` 内 `/` 遷移）と経路が異なるため目視確認の重点」を追記。
  - S-001（coverage）: AC-4 に「`clearAppShellCache` 呼び出しが直後の `navigate` に先行する（破棄 → 遷移の順）」順序不変条件を追記。

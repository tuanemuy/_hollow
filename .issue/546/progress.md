# 進捗・据え置き事項 — Issue #546

## 実装完了

- 認証フォーム3枚（SignUpForm / LoginForm / AdminSignUpForm）の form-error サマリーを
  共通 `ALERT*` 定数による `.alert alert-error` 案D 構造に置換（`role="alert"` 維持）。
  旧 `FORM_ERROR` import を3ファイルから除去。`auth/styles.ts` の `FORM_ERROR` 定数自体は
  P04/P05 が使用中のため温存。
- P34 エラーページ: 全バリアントに「一つ前に戻る」バックリンク（`router.history.back()`）を追加。
  バリアント別アクション出し分け（404=ホーム+検索 / 403=ログイン+ホーム / 410=ホーム /
  500=再読み込み+ホーム）。back/reload のみを client 島 `ErrorNavActions.tsx`
  （`ReloadButton` / `BackLink`）に切り出し、`ErrorPage` 本体はサーバーのまま維持。
  `public/styles.ts` に `BACK_LINK` 定数を新設（トークン/Tailwind 標準スケールに収斂、リテラル px 無し）。
- 単体テスト4本追加（SignUpForm / LoginForm / AdminSignUpForm / ErrorPage）。

## 据え置き事項

- **P34 forbidden(403) の desc 文言微差**: モック（「アカウントにログインしている場合は、
  別のユーザーで…」）と実装 `COPY.forbidden.desc`（「ログインしている場合は、別のアカウントで…」）
  が微妙に異なる。本Issueはアラート案D化と P34 アクション出し分けが主眼で、この文言微差は
  追従スコープ外として据え置き（後続レビューで追従漏れと誤認しないため記録）。

## 別Issue起票候補（スコープ外・plan.md 準拠）

- **P06 アドレス差分カード `.address-summary`**（ADR-002）: `verifyEmailChange` 応答に
  旧/新アドレスを載せる機能追加が前提。**→ #594 で起票済み**（親 #514）。
- **P04/P05 の `FORM_ERROR` サマリー案D化**: 現行モックに error-summary alert が無いため
  追従対象外。モックが案D化した時点で別途追従。

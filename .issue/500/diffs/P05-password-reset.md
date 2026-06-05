# P05-password-reset 突き合わせ
対応: route=app/routes/password-reset/confirm.tsx, components=[auth/PasswordResetConfirmForm, auth/AuthHeader], styles=[auth/styles.ts]

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] subtitle の文言 / 観点:component / 旧モック:「<email> のパスワードを再設定します。強固なパスワードを設定してください。」（email 埋め込み） → 実装:「強固なパスワードを設定してください。完了するとログイン状態になります。」（email 非表示） / 修正内容:実装文言に置換

レイアウト・auth-title(mb-2)・入力欄(h44=h-11)・パスワード強度バー（`.strength` gap-2/mt-1、track `grid grid-cols-4 gap-1 h-1`、segment 色 error/warning/accent/success、label level3=accent-ink・level4=success）は実装の `estimateStrength`/`segmentColor`/`labelColor` と一致。confirm hint・btn-primary(h48)・auth-footer も一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- なし

## C. 要判断（曖昧）
- なし

# P04-password-reset-request 突き合わせ
対応: route=app/routes/password-reset/index.tsx, components=[auth/PasswordResetRequestForm, auth/AuthHeader], styles=[auth/styles.ts]

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] auth-title 下マージン / 観点:token / 旧モック:mb space-3 → 実装:`AUTH_TITLE`=mb-2 / 修正内容:space-2 に
- [x] auth-subtitle 行間 / 観点:token / 旧モック:leading-relaxed → 実装:`AUTH_SUBTITLE`=leading-normal / 修正内容:leading-normal に

レイアウト・入力欄(h44=h-11)・field-hint・btn-primary(h48)・notice(=NOTICE: mt-6/p-4/rounded-lg/bg-surface/text-sm/leading-relaxed)・auth-footer は実装一致。送信後の sent 状態（再設定リンク送信完了）も文言一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- なし

## C. 要判断（曖昧）
- なし

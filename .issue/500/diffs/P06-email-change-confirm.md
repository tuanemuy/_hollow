# P06-email-change-confirm 突き合わせ
対応: route=app/routes/email-change/confirm.tsx, components=[auth/EmailChangeConfirm, auth/AuthHeader], styles=[auth/styles.ts]

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] status-icon 内アイコンサイズ / 観点:component / 旧モック:success チェック SVG 36px → 実装:`Icon size={24}`（STATUS_ICON 72px・アイキャッチ size=24） / 修正内容:24px に
- [x] auth-title 下マージン / 観点:token / 旧モック:mb space-3 → 実装:`AUTH_TITLE`=mb-2 / 修正内容:space-2 に
- [x] auth-body 下マージン / 観点:token / 旧モック:mb space-6 → 実装:`AUTH_BODY`=mb-8 / 修正内容:space-8 に
- [x] alert アイコンサイズ / 観点:component / 旧モック:警告 SVG 18px → 実装:`Icon icon={AlertCircle} size={20}` / 修正内容:20px（AlertCircle 形）に
- [x] alert 本文の文言 / 観点:component / 旧モック:「旧アドレス <strong>old@example.com</strong> ではログインできなくなりました。…」（email 埋め込み） → 実装:「旧アドレスではログインできなくなりました。今後は新しいアドレスをご利用ください。」（email 非表示） / 修正内容:実装文言に置換

success ブロックの `.alert`（warning-surface / rounded-lg / p-4 / mb-8 / items-start / gap-3）は実装の warning callout と box-model 一致。btn-primary(h48/min-w-200=BTN_PRIMARY_INLINE)も一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- アドレス差分カード `.address-summary`（旧アドレス→新アドレスを取り消し線付きで対比表示）/ 根拠:実装 EmailChangeConfirm の success 状態は auth-body → warning alert → ホームへ進む の3要素のみで、旧/新アドレス対比カードを描画しない（DTO に旧アドレスが渡らない設計）。モックのリッチな対比 UI は未実装のため方針2でモックに残置 / 別Issue化候補:Yes（実装するなら旧アドレスを success 応答に載せる必要があり機能追加。デザイン強化 Issue 候補）

## C. 要判断（曖昧）
- なし

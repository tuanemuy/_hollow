# P01-signup 突き合わせ
対応: route=app/routes/signup.tsx, components=[auth/SignUpForm, auth/AuthHeader], styles=[auth/styles.ts, common/styles.ts]

レイアウト・主要フォーム（成功状態ブロック）はトークン水準で実装に一致。
入力欄 `.input`(h44/radius-md) = `INPUT`(h-11/rounded-md)、`.btn-primary`(h48) = `BTN_PRIMARY`(pillBtnTall h-12)、
`.auth-title`(mb space-2) = `AUTH_TITLE`(mb-2)、checkbox(16px/mt2px) = `CHECKBOX_INPUT`、フッターリンク = `textLink`。差分なし。

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] validation エラーバリアント(a)直前の設計意図コメントが陳腐化 / 観点:variant / 旧モック:「schema は message 未指定で Zod デフォルト英語、validation 日本語化は #201 申し送り」 → 実装:`schema.ts` signUpSchema が transport 境界の日本語 message を保持（#201 対応済み）、値オブジェクト由来の業務不変条件は `errorDisplay.ts` renderIdentityBusinessMessage が summary 側で日本語化 / 修正内容:コメントを現行2系統（field直下=Zod日本語 / summary=identity業務コード日本語）の説明に更新

## B. 実装フォローアップ（モックを正に残した＝未実装）
- conflict(c) 「email 重複を field 直下に開示」案 / 根拠:SignUpForm の `fieldErrorOf` は kind==="validation" のみ field 直下化し、email_taken を validation kind の fieldErrors.email に変換するのは usecase 層依存で、component 層では確認できない。モックコメント自身が「採否は #201」と明記。設計提案としてモックに残置 / 別Issue化候補:No（#201 の申し送り事項に内包）

## C. 要判断（曖昧）
- なし

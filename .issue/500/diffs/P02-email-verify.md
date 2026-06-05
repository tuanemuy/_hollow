# P02-email-verify 突き合わせ
対応: route=app/routes/verify-email.tsx, components=[auth/VerifyEmail, auth/AuthHeader], styles=[auth/styles.ts]

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] status-icon 内アイコンサイズ / 観点:component / 旧モック:SVG 36px（success/expired/used 各ブロック） → 実装:`Icon size={24}`（STATUS_ICON は w/h 72px、アイキャッチ icon は size=24・§7.1） / 修正内容:3 ブロックすべて SVG を 24px に
- [x] auth-title 下マージン / 観点:token / 旧モック:mb space-3 → 実装:`AUTH_TITLE`=mb-2 / 修正内容:space-2 に
- [x] success 本文の文言 / 観点:component / 旧モック:「<email> のアドレスを認証しました。これでアカウントを利用できます。」（email 埋め込み） → 実装:「これでアカウントを利用できます。ログイン状態でホームへ進めます。」（email 非表示） / 修正内容:実装文言に置換
- [x] expired 本文の文言 / 観点:component / 旧モック:「…もう一度確認メールをお送りします。」 → 実装:「…メールアドレスを入力すると確認メールを再送します。」 / 修正内容:実装文言に置換
- [x] btn-secondary 寸法 / 観点:token / 旧モック:h44 + padding space-6 + text-sm → 実装:`BTN_SECONDARY_TALL`=pillBtnTall（h-12=48px + px-8 + text-md + min-w-200px） / 修正内容:h48・px space-8・text-md・min-width 200px に

## B. 実装フォローアップ（モックを正に残した＝未実装）
- expired バリアントの再送 UI 構造差 / 根拠:実装 VerifyEmail の expired は「メールアドレス入力欄 + 再送ボタン」フォームで、送信後は成功テキストに置換。モックは単一の「確認メールを再送する」ボタンのみで入力欄を描いていない。モックが簡略化（入力欄欠落）しているため、入力欄付き再送フォームは実装が正で未反映。文言は A で寄せたが構造（email 入力欄）は未追加 / 別Issue化候補:No（モック整備の軽微な追補。本Issueの A で深掘りせず B として記録）

## C. 要判断（曖昧）
- なし

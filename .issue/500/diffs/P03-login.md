# P03-login 突き合わせ
対応: route=app/routes/login.tsx, components=[auth/LoginForm, auth/AuthHeader], styles=[auth/styles.ts, common/styles.ts]

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] 本体ブロックの未認証 callout 配色 / 観点:token / 旧モック:`.callout`（warning-surface 背景 + warning アイコン、電話アイコン SVG、再送リンク=`<a>`）→ 実装:`CALLOUT`= neutral（bg-surface + accent アイコン MailWarning、再送=`<button>`、ADR-004） / 修正内容:本体 callout を `callout callout-neutral` に、アイコンを MailWarning（封筒+警告ドット）20px に、再送を `<button>` + ChevronRight 14px に
- [x] callout-neutral の box-model / 観点:token / 旧モック:base `.callout`（radius-lg / padding space-4）継承のみ → 実装:`CALLOUT`=rounded-md / px-4 py-3 / mb-6 / items-start / 修正内容:`.callout-neutral` に radius-md・padding space-3 space-4 を追加、ヘッダコメントを「全 callout を neutral 統一、warning は P06 .alert が担う」に更新
- [x] validation バリアント(a)直前コメントの陳腐化 / 観点:variant / 旧モック:「Zod デフォルト英語・#201 申し送り」 → 実装:loginSchema は signUpSchema と違い transport 日本語 message 無し（Zod デフォルト）だが、ログインの主失敗は unauthorized で validation hint は前面化しにくい / 修正内容:コメントを loginSchema の実態に即して更新

レイアウト・入力欄・field-label-row・field-link(=FIELD_LINK)・btn-primary・form-error・auth-title(mb-2)・checkbox は実装一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- conflict/「ユーザー存在 vs パスワード違い」を判別させない抽象化（列挙攻撃対策）はモック・実装で一致のため未実装項目なし

## C. 要判断（曖昧）
- callout-body 内の構造（strong/本文/action の縦並び）/ 論点:実装 `CALLOUT_BODY`=`flex flex-col gap-2`（strong・span・button を gap-2 で縦並べ）に対し、モックは `.callout-body strong { display:block; margin-bottom:space-1 }` + 本文インライン + `.callout-action { margin-top:space-2 }`。視覚は近接（strong 下 4px / action 上 8px ≒ gap-2）だが厳密一致ではない。微差のためモック構造は据え置き、要判断として記録

# P01b-admin-setup 突き合わせ
対応: route=app/routes/setup.tsx, components=[auth/AdminSignUpForm, auth/AuthHeader], styles=[auth/styles.ts, common/styles.ts]

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] admin-eyebrow の形態 / 観点:component+token / 旧モック:accent-surface 背景のピルチップ + 先頭 accent ドット（::before）+ mb space-4 → 実装:`ADMIN_EYEBROW`= 素テキストの accent 色ラベル（`inline-block text-xs text-accent font-medium uppercase tracking-[0.06em] mb-3`、背景・ドット無し） / 修正内容:`.admin-eyebrow` を素テキストラベルに置換、`::before` ドット削除、mb space-3 に
- [x] context callout の配色 / 観点:token / 旧モック:accent-surface 背景 + accent-ink テキスト + radius-lg + padding space-4 + mb space-8、icon・strong も accent-ink → 実装:`CALLOUT`= neutral（`bg-surface text-ink-secondary rounded-md px-4 py-3 mb-6 items-start`）、icon=`text-ink-tertiary`(Info)、strong=`text-ink`、リンク=accent下線 / 修正内容:`.callout` を neutral 配色・rounded-md・py-3・mb-6・items-start に、icon を Info（`circle + i path`）へ、strong を ink に
- [x] auth-title 下マージン / 観点:token / 旧モック:mb space-3 → 実装:`AUTH_TITLE`=mb-2 / 修正内容:space-2 に
- [x] auth-subtitle / 観点:token / 旧モック:mb space-6 + leading-relaxed → 実装:`AUTH_SUBTITLE`=mb-8 + leading-normal / 修正内容:space-8・leading-normal に
- [x] reveal-btn アイコンサイズ / 観点:component / 旧モック:Eye SVG 18px → 実装:`Icon size={20}` / 修正内容:20px に
- [x] 本体ブロックが setupToken を恒常 has-error + form-error 埋め込みで提示 / 観点:variant / 旧モック:既定ブロックが Setup Token 不一致エラー固定表示 → 実装:エラーは isSetupTokenError 条件下のみ表示（既定は安静状態） / 修正内容:本体ブロックの has-error と埋め込み form-error を除去し安静状態に（エラーは下のバリアント (b) が担う）
- [x] ref-footer（ADR-007 リンク）/ 観点:component / 旧モック:auth-footer の下に「ADR-007: 管理者登録は Setup Token で行う」参照フッター → 実装:AdminSignUpForm に該当 UI 無し（設計ドキュメント注釈） / 修正内容:ref-footer の DOM と CSS を削除

レイアウト・入力欄(h44=h-11)・btn-primary(h48=pillBtnTall)・reveal-btn(right-1/w-9 h-9/rounded-md)・form-error は実装一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- なし

## C. 要判断（曖昧）
- なし

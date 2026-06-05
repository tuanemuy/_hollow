# P34-error 突き合わせ
対応: route=app/routes/error.tsx, components=[public/ErrorPage, public/PublicLayout], styles=[public/styles.ts]
（AppErrorFallback（app/routes/_app/route.tsx）は _app loader 失敗時の最小フォールバックで別物。スタイル付きエラーページのモック P34 は public/ErrorPage に対応する）

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] err-search 入力欄の寸法 / 観点:token / 旧モック:height 44px / padding 0 18px 0 44px / font-size 14px / icon left 16px → 実装:`USER_SEARCH_INPUT`=h-10（40px）+ pl-10 pr-4（40/16px）+ text-sm、`SEARCH_ICON`=left-[11px] / 修正内容:height 40px・padding 0 16px 0 40px・font-size text-sm・icon left 11px に
- [x] 500 メタの trace 文字列 / 観点:component / 旧モック:「Error code: 500 Internal Server Error · trace: 7f9c3a2b」 → 実装:COPY.system.meta=「Error code: 500 Internal Server Error」（内部 trace を UI に出さない方針 §フィードバック・エラー表示原則） / 修正内容:trace 部分を削除

err-page（py-14 pb-20 / flex center）、err-inner（max-w-560）、err-code（clamp(96,18vw,168) font-light gradient ink→ink-secondary bg-clip-text、mb-2）、err-title（text-2xl semibold tracking-tighter mb-3 leading-snug）、err-desc（text-md leading-relaxed mb-8 max-w-440）、err-actions（gap-2.5 mb-6）、err-meta（text-xs font-mono mt-3）は実装の ERR_* と一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- 「一つ前に戻る」バックリンク（`.back-link`、全バリアントに配置）/ 根拠:実装 ErrorPage のアクションは「ホームへ戻る」+「検索ページを開く」の固定ペアのみで、history.back 相当のバックリンクを描画しない。モックの back-link は実装に無く方針2でモックに残置 / 別Issue化候補:Yes（ナビ補助の機能追加。実装するか判断要）

## C. 要判断（曖昧）
- バリアント別アクションセットの差 / 論点:実装 ErrorPage は kind に依らずアクションを「ホームへ戻る（primary）+ 検索ページを開く」で固定し、検索ボックスは notFound/gone のみ表示。一方モックは 404=ホームへ戻る+検索ページを開く / 403=ログイン+ホームへ戻る / 410=ホームへ戻る のみ / 500=再読み込み+ホームへ戻る、とバリアント毎にアクションを出し分ける。モックの出し分け（403→ログイン誘導、500→再読み込み）は UX 上意図的に見え、実装の固定ペアへ機械的に潰すと設計意図を損なう恐れ。どちらを正とするか判断保留（実装を正とするなら全バリアントを固定ペア＋kind 別検索表示へ書換、モックを正とするなら実装にバリアント別アクションを追加）。モックは現状の出し分けのまま据え置き
- ヘッダー（PublicLayout 共通シェル）/ 論点:P34 ヘッダーは public/PublicLayout の責務でバッチD（P30）の一次判定対象。本ファイルでは err-page コア部のみ突き合わせ、ヘッダーの pill-btn/text-link 寸法差（mock pill-btn=surface 36px、ログインが primary でない 等）はバッチD に委譲

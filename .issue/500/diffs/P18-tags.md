# P18-tags 突き合わせ
対応: route=`app/routes/_app/tags/index.tsx`, components=[`tag/TagManager`,`TagList`,`TagActions`,`CreateTagForm`,`MergeTagDialog`], styles=[`tag/styles.ts`,`layout/styles.ts`,`common/styles.ts`]

共通シェルは SHELL.md A 反映済み（P18 はヘッダーが `.btn` 系の別名だが、ラベル/構成を実装に合わせて更新）。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell（新規→新規作成、アップロードボタン追加、placeholder「ノートを検索」） / 観点:component / 注:P18 は `.btn` クラス系のため `.btn` で追加。
- [x] サブタイトル（stats「47 タグ · 3件除外中 · 562件のタグ付け」）→ 件数のみ「47 件のタグ」（実装 TagList:`{count} 件のタグ`） / 観点:component。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- タグ検索（`.field-search` タグを検索）。実装 TagList に検索 UI 無し。根拠: 実装に無い。別Issue化候補:Yes。
- 並び順セグメント（利用件数 / 名前 / 最終使用）。実装にソート UI 無し。根拠: 実装に無い。別Issue化候補:Yes。
- 「最終使用」列（最終: 今日 14:32）。実装の行は `#tag` + 「{noteCount} 件のノート」のみで最終使用日時を持たない。別Issue化候補:Yes。
- 統合進行バナー（`.process-banner`：#project を #Projects に統合中 / 進捗 / キャンセル）。実装は統合をダイアログ（MergeTagDialog）で行い、ページ常設の進行バナーは持たない。別Issue化候補:Yes（統合進捗の可視化）。
- 「除外されたタグ」セクション。実装 TagList に除外タグ機能・セクション無し。根拠: 実装に無い。別Issue化候補:Yes（タグ除外機能）。
- CreateTagForm（タグ名入力 + 追加）は**実装にあってモックに無い**（モックは検索を置く）。モック追加は本Issueスコープ外。別Issue化候補:No。

## C. 要判断（曖昧）
- **行アクションの差**: モックの各タグ行は「統合」ボタンのみ（+ 行展開のインラインリネーム）。実装 TagActions は「リネーム」「統合」「削除」の 3 ピル（リネームはインライン編集で 保存/キャンセル）。実装(方針1)に寄せるなら各行に リネーム/削除 ピルを追加すべきだが、モックの行はテーブル（タグ名/件数/最終使用/アクション）構成で、実装の DATA_ROW（`#tag` + 件数 / アクション）と列構成が異なるため、行アクション単独でなく行全体の再構成が要る。今回はサブタイトル・ヘッダーのみ寄せ、行構成は要判断として残置。
- タグ表示形態: モックは `#research`（hash + name）テーブル行 + 件数「42 件」。実装は `#name` + 「{noteCount} 件のノート」の DATA_ROW。列構成（最終使用列の有無）の差を含め、テーブル → DATA_ROW への寄せは上記と一体で要判断。

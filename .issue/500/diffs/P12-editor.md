# P12-editor 突き合わせ
対応: route=`app/routes/_app/notes/new.tsx`, components=[`note/editor/NoteEditor`,`EditorModeSwitch`,`WysiwygEditor`,`HtmlEditor`,`InlineEditor`,`FrontMatterEditor`,`DirectoryPicker`,`MediaUploader`,`AutosaveIndicator`,`EditLockBanner`], styles=[`common/styles.ts`]

共通シェルは SHELL.md A 反映済み。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell 3 点（SHELL.md）反映 / 観点:component。
- [x] 編集モード切替をセグメントコントロール（WYSIWYG/HTML）→ pill-btn タブ群に変更し、**FrontMatter タブを追加**（実装 EditorModeSwitch：新規は WYSIWYG/FrontMatter/HTML、`pillBtn`+`data-primary`、テキストのみ #292 ADR-002） / 観点:component+variant / 修正:`.segmented`→`.mode-tabs`/`.mode-tab`（アクティブ accent/white）。
- [x] 保存/キャンセルの順序を 実装に合わせ primary(保存) → secondary(キャンセル) に。キャンセルを `pill-btn ghost`（透明）→ プレーン `pill-btn`（surface 背景）に（実装はキャンセルも surface pill、ghost ではない） / 観点:variant。
- [x] px 直値 font-size の fluid トークン化（#461）: pill-btn / mode-tab / save-status の `14px|13px`→`--text-sm` / 観点:token。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- FrontMatter を**常時表示の折り畳みメタパネル**として本文と同居させる構成（`.meta-panel`）。実装は FrontMatter を独立した**モードタブ**として扱い、選択時のみ `FrontMatterEditor` を表示（本文とは排他）。モックの「常時パネル同居」UI は実装に無い。根拠: 実装はモード排他。別Issue化候補:Yes（要検討、設計差）。※モックのメタパネルは残置。
- 内部リンク補完ポップアップ（`[[` で候補表示）。実装にも `internalLinkSuggest`/`InternalLinkSuggestPopup` はあるが、モックの静的ポップアップ描画はそのまま残置（実装は動的）。別Issue化候補:No。
- サイドバー項目差は SHELL.md B。

## C. 要判断（曖昧）
- **エディタ画面全体の構成差（大）**: モックは「大きな枠なしタイトル入力（`.title-input`）+ 場所 dir-pill + タグチップ行 + 書式ツールバー(B/I/U/見出し/code/link/image) + 保存ステータスを上部 editor-topbar」という WYSIWYG エディタ然とした構成。実装 `NoteEditor` は**フォーム型**：ラベル付き「タイトル」`fieldControl` + ラベル付き「タグ（カンマ区切り）」テキスト入力（チップではない）+ DirectoryPicker + モードタブ + 各モードのエディタペイン + 下部に 作成/キャンセル、自動保存は右上 `AutosaveIndicator`。
  - 論点: 実装(方針1)に寄せると、タイトルの枠なし大型入力 → ラベル付き小型入力、タグチップ行 → カンマ区切りテキスト入力、書式ツールバー位置（WYSIWYG モード内に内包）、保存の上部 → 下部、という広範な書き換えが必要。書式ツールバー自体は実装 `WysiwygEditor` にアイコンのみ円形ボタンとして存在する（モックの text `tb-btn` B/I/U とは形態が異なる）。影響範囲が大きく、エディタ体験の意図差（リッチ vs フォーム）も孕むため、本Issueの一存で全面書き換えはせず要判断として残置。今回はモード切替・保存ボタン・shell のみ実装へ寄せた。
- タイトル入力の大型枠なし（`.title-input`、mobile 28px）vs 実装 `fieldControl`（ラベル付き h-10 text-sm）。上記構成差に内包。
- タグ：チップ + 追加入力 vs カンマ区切りテキスト入力。上記構成差に内包。
- 書式ツールバーの形態（text B/I/U + 見出しドロップダウン）vs 実装 WysiwygEditor のアイコンのみ円形ボタン（`EDITOR_TOOLBAR_BTN`）。上記構成差に内包。
- 編集ロックバナー（`.lock-banner`）は実装 `EditLockBanner` に対応。文言/構成の細部は要確認だが概ね一致のため残置。

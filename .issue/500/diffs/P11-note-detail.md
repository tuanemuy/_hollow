# P11-note-detail 突き合わせ
対応: route=`app/routes/_app/notes/$noteId/index.tsx`（→ `NoteDetail`）, components=[`note/detail/NoteDetail`,`NoteBreadcrumb`,`NoteActions`,`NoteActionsMenu`,`NoteMetaPanel`,`FrontMatterPanel`,`UrlCopyButton`], styles=[—（インラインTailwind）]

共通シェルは SHELL.md A を反映済み（ヘッダー：アップロード pill 化 / 新規作成 / 検索 placeholder）。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell 3 点（SHELL.md）反映 / 観点:component。
- [x] アクションツールバーを実装(NoteActions #459)に合わせ、頻用アクションをアイコンのみの円形ピルに変更 / 観点:component+variant / 旧:編集/公開/共有/その他（ラベル付き pill 3 + icon-btn 1）→ 実装:編集(icon-only primary)・公開設定(ラベル付き pill、先頭に公開状態ドット + Globe)・移動(icon-only)・URLコピー(icon-only)・エクスポート(icon-only)・その他メニュー(icon-only) / 修正:`pill-btn icon-only`（正方形36px px-0）導入、6 ボタン構成に。
  - 「共有」単独ボタンは廃止（実装は公開設定ダイアログ + URLコピー）。移動・エクスポート・複製/履歴/削除(...)を追加。
- [x] アクションツールバー余白 `margin-bottom:--space-10` → `margin:--space-4 0 --space-6`（実装 MENU=`my-4 mb-6`） / 観点:token。
- [x] px 直値 font-size の fluid トークン化（#461）: pill-btn `14px`→`--text-sm`、nav-item `14px`→`--text-sm` / 観点:token。
- [x] 編集ボタンを primary（accent）に（実装 `ICON_BTN_PRIMARY` data-primary） / 観点:variant。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- ノート本文の wikilink ホバープレビュー（`.link-preview` ツールチップ）。実装はホバープレビュー UI を持たない（内部リンクはピル表示のみ、`internalLinkExtension`）。根拠: 実装に本文内ホバープレビューが無い。別Issue化候補:Yes。
- 本文 meta の「文字数」「読了目安」フィールド。実装 `NoteMetaPanel` は 作成日/更新日/公開日/タグ/元ファイル/状態 のみで、文字数・読了目安は持たない。根拠: 実装に当該算出が無い。別Issue化候補:Yes（メタ拡張）。
- サイドバー項目差（最近更新/お気に入り/件数/保存ビュー個別列挙）は SHELL.md B に集約。別Issue化候補:Yes。

## C. 要判断（曖昧）
- **レイアウト構成の根本差**: モックは index.md §2.1 準拠の 3 カラム（サイドバー + 本文 760px + 右メタレール `--meta-rail-width`、lg+ で sticky）。実装 `NoteDetail` は単一中央カラム `max-w-[760px] mx-auto` のみで右メタレールを持たず、メタ情報（プロパティ/バックリンク）を本文の**下**にセクションとして積む（Issue #356 ADR-002/003 が右レール廃止を意図的に駆動）。
  - 論点: モックは設計原則文書 §2.1（3カラム）を正として描いているが、実装は #356 で右レール廃止に倒している。「実装が正（方針1）」で右レールを削るべきか、それとも §2.1 の設計原則と矛盾するため index.md 側の見直しを含む判断が必要か。→ 影響範囲が大きく（レイアウト全面 + index.md §2.1 整合）、本Issueの一存で潰さず要判断として残置。右メタレール・mobile-meta は現状維持。
- 本文下メタの「場所（ディレクトリ）」表示: 実装はディレクトリをパンくず/移動ダイアログで扱い、下部メタには出さない（#356 ADR-002「重複させない」）。モックのメタに「場所」行が残る点も上記レイアウト判断と一体で要判断。
- バックリンク表示形態: モックはメタレール内のテキストリンク行 + 本文下インライン `backlink-card` の二重。実装はカード型リスト（タイトル + snippet 2 行クランプ）+「参照ノート一覧を見る」リンク 1 箇所。上記レイアウト判断に内包。

# 実装フォローアップ一覧 — Issue #500（未実装、モックを正に残置）

モックにあるが実装されていない UI/状態/バリアント。モックを正として残置済み。別Issue化候補を明示する。

## 概要

- 総件数: 95
- 別Issue化候補（Yes）: 65件

件数は各 `.issue/500/diffs/*.md` の B 節に記録された全項目を転記・集約したもの。SHELL のサイドバー項目は P10〜P24 で重複参照されるが、SHELL.md の 4 項目として一度だけ計上し、各ページの「SHELL.md B に集約」参照は重複としてカウントしない。

## ページ別一覧

### SHELL（共通シェル / layout）

P10〜P24 の認証済みページ全体に重複する共通シェル領域。各ページの「サイドバー項目差は SHELL.md B」参照はここに束ねる。

| 項目 | 観点 | 根拠（なぜモックが正か） | 別Issue化候補 |
|---|---|---|---|
| サイドバー「ライブラリ」の最近更新 / お気に入りナビ項目 | component | 実装 Sidebar.tsx は「すべてのノート / 保存ビュー」のみでナビ導線が無い | Yes |
| サイドバー「すべてのノート」の件数バッジ `127`（.count） | component | 実装 NAV_ITEM にカウント表示なし | Yes |
| サイドバー「保存したビュー」の個別ビュー名列挙（未公開の下書き / 今週のレビュー等） | component | 実装は「保存ビュー」1リンクのみでサイドバー内の個別列挙は無い（/views へ集約） | Yes |
| サイドバー最下部セクションの精緻化（管理見出し化 + エクスポート→エクスポートジョブ + アップロード追加、directory tree 動的描画差含む） | component+layout | directory tree の動的性が高く各ページ追従の費用対効果が低い。サイドバー専用の精緻化 Issue として束ねる | Yes |

### P01-signup（認証）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| conflict(c)「email 重複を field 直下に開示」案 | variant | email_taken の validation kind 変換は usecase 層依存で component 層では確認できない。モックコメント自身が採否は #201 と明記 | No（#201 申し送りに内包） |

### P02-email-verify（認証）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| expired バリアントの再送 UI 構造差（メール入力欄付き再送フォーム） | variant | 実装の expired は入力欄+再送ボタンの後に成功テキスト置換。モックは単一ボタンのみで入力欄欠落 | No（モック整備の軽微な追補） |

### P06-email-change-confirm（認証）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| アドレス差分カード `.address-summary`（旧→新を取り消し線で対比） | component | 実装の success は本文+warning alert+導線の3要素のみで対比カード無し（DTO に旧アドレスが渡らない設計） | Yes（旧アドレスを応答に載せる機能追加） |

### P10-home（ノート一覧）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| タイル / カレンダー表示のモック描画 | variant | TileView/CalendarView は実装にあるがモックは1状態（リスト）のみ描画 | No（代表状態の描画方針） |

### P11-note-detail（ノート詳細）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 本文 wikilink ホバープレビュー（`.link-preview` ツールチップ） | component | 実装に本文内ホバープレビュー UI が無い（内部リンクはピル表示のみ） | Yes |
| 本文 meta の「文字数」「読了目安」フィールド | component | 実装 NoteMetaPanel は作成日/更新日/公開日/タグ/元ファイル/状態のみで当該算出を持たない | Yes（メタ拡張） |

### P12-editor（エディタ）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| FrontMatter を常時表示の折り畳みメタパネルとして本文と同居させる構成（`.meta-panel`） | component+variant | 実装は FrontMatter を独立モードタブとして扱い、選択時のみ表示（本文と排他） | Yes（設計差） |
| 内部リンク補完ポップアップ（`[[` で候補表示）の静的描画 | component | 実装にも InternalLinkSuggestPopup はあるが動的。モックは静的描画を残置 | No |

### P13-upload（取り込み）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 「対応形式」チップ列（`.format-chips`） | component | 実装 UploadPage はページ上にチップを並べない（案内はモーダル説明文に集約） | No |
| ドロップゾーン直下のエラー/警告バナー2種の見本 | component | 実装は inline role="alert" で出すが常設バナー2種の見本を持たない | No |
| アクションバーの一括操作（すべて再生成 / 破棄 / 個別保存 / 完了分まとめて保存） | component | 実装 IngestionQueue/IngestionJobRow はカードごとの個別アクションのみで全体一括バー無し | Yes（取り込み一括操作） |
| DiscardedToggle（破棄済みを表示） | component | 実装にあってモックに無い（モック追加はスコープ外） | No |

### P13-upload-modal（取り込みモーダル）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 「詳細オプション（カスタムプロンプト）」details アコーディオン | component | 実装 SelectView にあるがモックに無い（モック追加はスコープ外） | No |

### P14-publish-settings（公開設定）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| QR コードボタン（`.icon-mini` QR） | component | 実装 PublishSettings はリンクの QR 発行を持たない | Yes |
| ラジオカードの説明文（`.radio-desc`） | component | 実装のラジオカードは status dot + ラベルのみで説明文行が無い | Yes（説明文追加の検討） |
| パスワード補助テキスト（`.input-help` 8文字以上推奨等） | component | 実装はラベル「パスワード（任意）」のみで補助文無し | No |

### P15-export（エクスポート）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| エクスポートフォームのデザイン全体が未実装 | layout+component+token | 実装 ExportForm は className を一切持たない素の HTML（fieldset/label/button をトークン無しで描画） | Yes |

### P16-export-jobs（エクスポートジョブ）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| ジョブ一覧・詳細のデザイン全体が未実装 | layout+component+token | 実装 ExportJobsListView/ExportJobDetailView は className を一切持たない素の HTML | Yes |

### P17-trash（ゴミ箱）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| フィルタツールバー（削除日 select / タイトル検索） | component | 実装 TrashList にフィルタ無し | Yes |
| 一括選択（行チェックボックス + 選択を復元 / 選択を完全削除 / ゴミ箱を空にする） | component | 実装 TrashList に一括操作・選択 UI 無し（行ごとの操作のみ） | Yes（ゴミ箱の一括操作） |
| テーブルヘッダ行（タイトル/場所/削除日/残日数） | layout | 実装はヘッダ行を持たない2カラムリスト | No（bulk と一体で検討） |
| 「場所（ディレクトリ）」列 + 「残日数（残 N 日）」countdown ピル | component | 実装の行はタイトル+excerpt+削除日のみで場所・残日数を持たない | Yes（残日数表示） |
| 空状態（ゴミ箱が空）の見本 | variant | 実装に空状態 UI があるがモックは行あり状態を見せている | No |

### P18-tags（タグ）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| タグ検索（`.field-search`） | component | 実装 TagList に検索 UI 無し | Yes |
| 並び順セグメント（利用件数 / 名前 / 最終使用） | component | 実装にソート UI 無し | Yes |
| 「最終使用」列（最終: 今日 14:32） | component | 実装の行は #tag + 件数のみで最終使用日時を持たない | Yes |
| 統合進行バナー（`.process-banner`） | component | 実装は統合をダイアログで行いページ常設の進行バナー無し | Yes（統合進捗の可視化） |
| 「除外されたタグ」セクション | component | 実装 TagList に除外タグ機能・セクション無し | Yes（タグ除外機能） |
| CreateTagForm（タグ名入力 + 追加） | component | 実装にあってモックに無い（モック追加はスコープ外） | No |

### P20-views（保存ビュー）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 保存ビューのクエリ条件チップ（公開状態/更新範囲/ソート/タグ/ディレクトリ） | component | 実装 view-chips は表示モードラベル + 壊れた条件件数のみで、クエリ条件をチップ表示しない | Yes |
| 「既定」マークのアイコン（実装 lucide Star vs モック star polygon） | component | 視覚はほぼ同等の微差 | No |
| 壊れた条件バナーの詳細文言 | component | 文面はサンプルでデータ依存 | No |
| 表示モードを示すチップ（実装はチップ+タイル両方 vs モックはタイル title） | component | 条件チップ対応時にまとめて整理が妥当 | Yes（条件チップと同一Issue） |

### P21-settings-profile（設定）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| アバターアップロード行（avatar-large + アップロード/削除 + 推奨サイズヘルプ） | component | 実装 ProfileForm にアバター UI が存在しない | Yes |
| 自己紹介の文字数カウンタ（73 / 160） | component | 実装の textarea に文字数カウンタ表示が無い | Yes |
| ユーザー名の入力 prefix（`hollow.example/`）/ 公開 URL プレビュー行 / 90日レート制限ヘルプ | component | 実装は素の input + 現在: @username のみ | Yes |
| 公開プロフィールページの外部リンク（プレビューを新タブで開く） | component | 実装に該当リンクが無い | Yes |
| action-row の「リセット」ボタン / 「最終保存: …」タイムスタンプ | component | 実装は保存ボタンのみ | Yes |

### P22-settings-security（設定）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| アクティブセッション一覧（端末ごとの行 + 行単位ログアウト + 「このセッション」バッジ） | component | 実装 SecurityForm は「他のすべてのセッションをログアウト」一括操作のみで個別列挙・行単位失効を持たない | Yes |
| 新しいパスワードの強度要件ヘルプ（12文字以上・3種類以上） | component | 実装にクライアント側の強度ヘルプ表示が無い | Yes |
| メール変更リンクの有効期限ヘルプ（24時間） | component | 実装は成功時メッセージのみ | No |

### P23-settings-prompts（設定）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| プロンプトのプレビュー機能（入力サンプル → 出力サンプル・「サンプルで実行」） | component | 実装 PromptsForm にプレビュー実行 UI が無く保存/デフォルトに戻すのみ | Yes |
| 「メタデータ抽出」「OCR 補正」用途のカード | component | 実装は5用途をループ描画。モックは代表3用途のみ | No（代表サンプル方針） |
| グローバルの「未保存の変更があります」表示・キャンセル | component | 実装は各カード独立保存で集約表示を持たない | No |

### P24-settings-account-delete（設定）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 「削除によって失われるもの」詳細一覧（ノート件数/メディア容量/410 Gone/限定公開リンク失効数/構造情報/復元不可） | component | 実装は SECTION_DESC の1段落のみで詳細リストを持たない | Yes |
| 4ステップのインライン確認（同意チェック / `DELETE` 入力 / パスワード再入力） | component | 実装の確認は ConfirmDialog 内のユーザー名入力のみ | Yes |
| ユーザー名 input の prefix（`hollow.example/`） | component | 実装はダイアログ内の素の input でユーザー名照合のみ | No |

### P30-user-public-top（公開）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| ユーザートップのフィルター chip 群（すべて / #タグ / タグ追加 / 期間） | component | 実装 UserPublicTop は検索 input とノート一覧のみでフィルター UI を持たない | Yes |
| 表示モード切替セグメント（リスト/タイル/カレンダー）+ ソートボタン（公開日順） | component | 公開トップに DisplayModeSwitch 相当・ソート UI が未実装（認証側 P10 にはあるが公開側に無い） | Yes |

### P31-public-note（公開）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| バックリンクセクション（「バックリンク（公開ノート）」+ `.backlink-list`） | component | PublicNoteDetail は本文 article のみ描画。BACKLINKS 定数は存在するが未使用 | Yes |
| 「同じ著者の他のノート」関連カードグリッド（`.related-grid`/`.related-card`） | component | 実装に関連ノート表示が無い | Yes |
| 本文末尾の bottom-meta ブロック（タグ + 公開/更新日の再掲） | component | 実装は note-meta-inline のみで末尾再掲が無い | No |
| 本文内 wikilink / hashtag の見た目（`.wikilink` ピル+ドット、`.hashtag`） | token | 本文は dangerouslySetInnerHTML 経由で装飾は index.css 側責務。§6 規約準拠でモック正 | No |

### P32-public-search（公開）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| レート制限バナー（`.rate-banner`） | component | PublicSearch にレート制限の可視化 UI が無い | Yes |
| フィルターバー（件数 + フィルターボタン(バッジ) + 関連度順ソート） | component | 実装は検索フォーム + 結果サマリ(件数)のみ | Yes |
| アクティブフィルターチップ列（ユーザー/タグ/期間 chip + すべて解除） | component | 実装にアクティブフィルター chip の描画が無い | Yes |
| フィルタードロワー一式（facet-section: ユーザー/タグ combobox、期間 radio 等） | component | 実装にファセット絞り込みドロワーが無い（検索は q/username/cursor/limit のみ） | Yes |
| 検索結果の `<mark>` ハイライト | component | SEARCH_HIT_TITLE/SNIPPET はプレーン表示でヒット語ハイライト無し | Yes |
| 結果メタの2行スニペット（line-clamp:2） | component | 実装 SEARCH_HIT_SNIPPET は clamp 無し（差は軽微） | No |

### P33-share-link（公開）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| STATE2「ロック解除後のノート本文インライン表示」一式（note-banner / doc-title / author-mini / action-toolbar / content） | component+layout | 実装 ShareLinkGate はロック解除成功で P31(PublicNoteDetail) へ遷移し、ゲート内に本文をインライン描画しない。SHARE_NOTE_BANNER 定数は存在するが未使用 | Yes（インラインバナー/限定公開アクションの扱い要検討） |

### P34-error（エラー）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 「一つ前に戻る」バックリンク（`.back-link`、全バリアントに配置） | component | 実装 ErrorPage のアクションは「ホームへ戻る」+「検索ページを開く」の固定ペアのみで history.back 相当を持たない | Yes（ナビ補助の機能追加） |

### P40-admin-dashboard（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 上部 warning banner（運用アラートを CTA「詳細」付きで表示） | component+variant | 実装は AlertDTO ループでバナー表示するが、CTA や具体的閾値アラートの発火元が未実装 | Yes |
| 「直近24時間」チャートセクション（アップロード数 / LLM呼び出しの area チャート×2） | component | 実装は時系列チャートを持たず「管理メニュー」セクションに置換 | Yes |
| 「最近のアクティビティ」テーブル（時刻・種類・対象・詳細） | component | 実装にアクティビティ/監査ログのテーブルが存在しない | Yes |
| メトリクスカードの hover 浮上と delta 増減色（success/error） | token+variant | 実装の metric-card は hover 効果・delta を持たない | Yes |

### P41-admin-llm（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| クォータセクション（1ユーザー/24h・インスタンス全体・アラート閾値・レート制限の4入力） | component | 実装にクォータ設定 UI/usecase が存在しない（コスト上限制御は未実装） | Yes |
| モデルのコスト目安テーブル（input/output 単価・用途） | component | 実装はモデルを自由入力 text にしておりコストテーブル/候補リストを持たない | Yes |
| 接続テストの success/error 詳細（「モデル N 件取得」「認証失敗(401)」等の構造化結果） | component | 実装の test 結果は接続成功/失敗の簡易表示のみ | No |

### P42-admin-prompts（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| プロンプトのサンプル入力 / 実行プレビュー出力ブロック | component | 実装にプロンプト実行プレビュー機能が無い | Yes |
| 「実行プレビュー」ボタン | component | プレビュー実行 usecase が未実装 | Yes |
| 「履歴を見る」リンク（プロンプト変更履歴） | component | 実装に履歴 UI/永続化が無い | Yes |
| 「直近24h エラー率」表示 | component | プロンプト別エラー率の集計・表示が未実装 | Yes |

### P43-admin-tokens（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| ライブプレビューペイン（サンプルノートでトークン変更を視覚確認） | component | 実装にプレビュー機構が無い（index.md §10 で別フェーズ＝スコープ外と明記） | Yes（ただし §10 で意図的スコープ外） |
| 変更差分パネル（編集前→編集後の from/to 表示） | component | 実装に diff 表示が無い | Yes |
| トークンのカテゴリ別グループ化 + 折りたたみ（カラー/タイポ/スペーシング/角丸） | component | 実装は flat リスト。グルーピング UI が未実装 | Yes |
| 「編集後 / 編集前との比較」segmented トグル | component | プレビュー・diff が無いため segmented も未実装 | Yes |

### P44-admin-registration（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 状態変更履歴セクション（直近20件の公開/停止切替を担当者・理由付きで一覧） | component | 実装に登録ポリシー変更履歴の永続化・表示が無い（トグルは現在値のみ保持） | Yes |

### P45-admin-users（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 行の複数選択 + 一括操作（bulk-bar: 一時停止/強制ログアウト/削除） | component | 実装に行選択・一括操作が無い | Yes |
| 行展開（ノート数・アップロード履歴・公開ノート数の統計） | component | 実装に行展開・ユーザー統計表示が無い | Yes |
| ユーザー削除（ハンドル入力確認付きモーダル、即時削除/削除取消） | component | 実装の admin アクションは suspend/reinstate/promote/demote のみ | Yes |
| 「強制ログアウト」アクション | component | 実装に強制ログアウト（セッション失効）アクションが無い | Yes |
| ストレージ列・最終ログイン列・ストレージフィルタ | component | 実装の UserDTO はストレージ/最終ログインを表に出さない | Yes |

### P46-admin-jobs（admin）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| 状態サマリーチップ（実行中/失敗/DLQ の件数バッジ） | component | 実装にジョブ状態の集計チップが無い（各セクション件数のみ） | Yes |
| 自動リフレッシュトグル（5s ポーリング ON/OFF） | component | admin/Jobs は client polling を持たず手動更新のみ | Yes |
| ジョブ種別タブ（すべて/取り込み/エクスポート/クリーンアップ/パージ/Outbox/DLQ） | component | 実装はセクション分割固定表示でタブ絞り込みが無い | Yes |
| 失敗展開行（失敗理由 + スタックトレース pre） | component | 実装はエラーを行内テキスト表示し stack 展開が無い（stack 非表示は意図的） | No |
| 経過時間・再試行回数列、ジョブのキャンセル/詳細アクション | component | 実装の Job DTO は elapsed/retryCount を表に出さず、キャンセル/詳細導線も無い | Yes |
| メディアクリーンアップ/ゴミ箱パージ/Outbox リレー等を「ジョブ行」として一覧する表示 | component | 実装は cron 駆動の概要テーブル（実行履歴非永続）として扱う | Yes（実行履歴永続化は別Issue予定と実装コメントで明記） |

### E-no-mock（admin、実装→モック欠落）

| 項目 | 観点 | 根拠 | 別Issue化候補 |
|---|---|---|---|
| admin/metrics（利用状況）の対応モックが存在しない | layout | 実装 MetricsPage（/admin/metrics）はあるが Pxx-admin-metrics.html が無い。P40 系 admin デザイン言語に沿ったモック新設が必要 | Yes（admin-metrics モック新設） |

## 別Issue化候補の束ね（テーマ別）

実際の起票判断に使うため、Yes 項目を構造的テーマでまとめる。

- **エクスポート系デザイン全体未実装（最優先）**: P15（エクスポートフォーム）/ P16（ジョブ一覧・詳細）はいずれも className を持たない素の HTML。エクスポート機能の UI スタイリング Issue として一括起票が妥当。

- **admin デザイン充実（チャート/アクティビティ/履歴/プレビュー）**: P40（チャート×2・アクティビティテーブル・warning banner・delta）/ P42（プロンプト実行プレビュー・履歴・エラー率）/ P43（ライブプレビュー・diff・グループ化・segmented）/ P44（状態変更履歴）/ P41（クォータ・コストテーブル）。admin の運用可視化・プレビュー機構として複数 Issue に分割可能。

- **admin-metrics モック新設（E-no-mock）**: 実装にあってモックが無い唯一のケース。P40 系デザイン言語に沿った Pxx-admin-metrics.html 新設。P40 の責務整理（ダッシュボード=概況 vs metrics=詳細）と併せて検討。

- **一覧・テーブルの一括操作 / フィルタ / ソート**: P17（ゴミ箱の filter/bulk/残日数）/ P18（タグの検索/ソート/最終使用/除外/統合進捗）/ P45（ユーザーの bulk/削除/強制ログアウト/行展開）/ P13-upload（取り込み一括操作）/ P46（ジョブのサマリーチップ/自動リフレッシュ/タブ/キャンセル）。テーブル系運用機能の拡充としてページ別または機能別に起票。

- **公開側の検索・フィルタ強化（#231 周辺）**: P30（ユーザートップの filter chip/表示モード/ソート）/ P32（レート制限バナー/フィルターバー/アクティブチップ/ドロワー/ハイライト）。公開側の絞り込み・検索体験の強化。

- **公開ノートの関連導線**: P31（バックリンク/関連ノートグリッド）/ P33（共有リンク解除後のインライン表示）。公開ノート閲覧の周辺導線。

- **設定画面のフィールド拡充**: P21（アバター/文字数カウンタ/URL prefix・プレビュー・レート制限/外部リンク/リセット）/ P22（アクティブセッション一覧/強度ヘルプ）/ P24（削除影響の詳細一覧/多段確認）。設定フォームの情報量・確認強度の拡充。

- **共通サイドバー精緻化（SHELL）**: 最近更新/お気に入り、件数バッジ、保存ビュー個別列挙、管理セクション整合。サイドバー専用 Issue として一括。P10/P11/P12 等が参照。

- **ノート詳細・公開設定のメタ/機能拡張**: P11（wikilink ホバープレビュー/文字数・読了目安）/ P06（アドレス差分カード）/ P14（QR コード/ラジオ説明文）。

- **エディタ設計差（要検討）**: P12（FrontMatter 常時パネル同居 vs モードタブ排他）。設計判断を伴うため C（要判断、P12 構成差）と一体で扱う。

- **エラーページのナビ補助**: P34（一つ前に戻るバックリンク）。単発で軽微。

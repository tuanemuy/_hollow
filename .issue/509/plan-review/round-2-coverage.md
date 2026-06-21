# Round 2 レビュー — Issue #509 計画（視点: 要件カバレッジ・スコープ整合性）

対象: `.issue/509/plan.md` / `.issue/509/adr.md`
レビュー視点: 1周目の改善提案（S-001〜S-004）が適切に反映されたか、要件カバレッジ・スコープ整合性に残課題・新規問題がないか。

実装・モック・#500 成果物を再度突き合わせて検証した（`app/components/export/{ExportForm,ExportJobsList,ExportJobDetail}/`、`spec/design/pages/{P15-export,P16-export-jobs}.html`、`app/components/admin/Jobs/index.tsx`）。

---

## 1周目指摘の反映確認

- **[S-001] 6 status → 色マッピング表**: 反映済み。AC 直下に「status 値 → 表示バリアントの対応表」を新設（plan L27-40）、ADR-004 を新設。`exportStatusTag(status): Tone` が `admin/Jobs/index.tsx` L141 に実在し、L321 で `tagBadge`+`tagTone[exportStatusTag(...)]` として稼働中であることを確認。`expired`=`cancelled`=warning の寄せも明記。**適切。**
- **[S-002] page-subtitle と「文言追加回避」の矛盾解消**: 反映済み（plan L99 / design 節）。「モックに既存の subtitle のみ忠実転記、新規文言は足さない」と明文化。P16 subtitle 文言（L780）は実装の `expiresAt` ロジックと整合する旨も記載。**適切。**
- **[S-003] 見出しレベルの一意確定**: 反映済み（plan L98）。「既存 `<h2>` を維持し `<h1>` を新設しない（AppShell 化 #502 は別 Issue）」と確定。実装を再確認: `ExportForm` は `<h2>`（index.tsx L170）、`ExportJobsPage` は `<h1>エクスポートジョブ`（Page.tsx L19、P16 モック L779 と一致）、`ExportJobDetail` は `<h1>エクスポートジョブ詳細`（Page.tsx L28）。**適切。**
- **[S-004] ページネーション導線=対象外**: 反映済み（plan L200）。`PAGE_SIZE=20`/`offset` を loader が処理し、`ExportJobsListView` 自体に導線が無いことを再確認。**適切。**

4件すべてが計画本文・ADR に正しく落ちており、1周目の指摘は解消されている。

---

#### 問題点（要修正）

問題点ゼロ。

Issue の 3 受け入れ条件・#500 フォローアップ・#588 申し送り・`decisions-pending.md` の論点はすべて AC に反映され、各 AC は検証可能な形で記述され、AC↔ステップの紐づけも実装と一致している。スコープ外作業（モーダル化・同一ページ展開・機能追加・ロジック変更）の混入は無く、ADR-004 で持ち込む `exportStatusTag` の共通化（admin→common へのロジック移動 1 件）も「二重定義回避のための軽微リファクタ」として ADR で正当化済み・スコープ逸脱とは言えない。

---

#### 改善提案（検討推奨）

- **[S-001] P15 subtitle の転記範囲（埋め込み `<code>` を含む複数行構造）を一言確定すると良い**
  - 理由: 計画は「P15 モック L671 の subtitle をそのまま転記」とするが、実モックの P15 subtitle（L671-674）は単純な 1 行ではなく、`<code style="font-family: var(--font-mono)">エクスポートジョブ一覧</code>` を文中に埋め込んだ複数文の説明（「…完了後に〔エクスポートジョブ一覧〕からダウンロードできます。」）である。P16 subtitle（L780）が 1 行プレーンなのと非対称。「そのまま転記」が (a) 文言のみプレーンに移すのか (b) `<code>` 装飾（mono ピル）まで再現するのかが一意でない。`<code>` 内の「エクスポートジョブ一覧」は実装に存在する別ルート（一覧）への参照であり、リンク化すると導線追加=スコープ外になりうる点も含め、「文言のみ転記・`<code>` は mono インライン装飾に留めリンク化しない」等の一線を design 節に足すと、実装者が subtitle 再現で機能（リンク導線）を足す誤りを防げる。

- **[S-002] ExportJobDetail のページタイトル文言とモックの一致確認を注意点に**
  - 理由: 計画はステップ 5 で `ExportJobDetail` の `<h1>` 意匠化に触れるが、実装 `<h1>エクスポートジョブ詳細`（Page.tsx L28）が P16 詳細モックの見出し文言と一致するかの確認軸が AC/注意点に無い（S-003 で一覧・フォーム側の見出しは固めたが詳細側は未言及）。`ExportJobNotFound` の `<h1>ジョブが見つかりません`（L18）も同様。見出し文言・レベルを「現状維持（変更しない）」と詳細側にも明記しておくと、3 画面で見出し方針が揃い、レビュー判定が機械的になる。

---

#### 良い点

- 1周目の 4 提案すべてを取り込み、各々を計画本文の該当箇所（AC 表・design 節・risk 節・ADR）に分散反映している。特に S-001 は単なる注記でなく ADR-004 として独立させ、`exportStatusTag` の共通化方針（admin/Jobs ローカル → common へ移動、import 差し替え 1 箇所）まで踏み込んで二重定義リスクを構造的に潰している。
- マッピング表が「DTO status / Tone / チップ class / dot 色 / 備考」の 5 列で書かれ、`expired`→warning の寄せ理由（モックに専用色なし）まで明記。AC-3 の「6 status すべてがいずれかのバリアントにマップ」が機械的に緑判定できる。
- スコープ外の宣言（モック固有の対象ラジオ 3 択・推定サイズ・ファイル名規則・フィルターバー・更新/新規ボタン・expiry 残日数色分け・ページャ）が risk 節 L195-200 に列挙され、「意匠だけ」を口実にした機能追加（スコープクリープ）を防いでいる。`exportStatusTag` 共通化という唯一のロジック移動も ADR で限定・正当化されており、スコープ整合性が高い。
- `ExportForm.test.tsx` の `findMediaCheckbox()` が `item(1)`（2番目 checkbox = メディア埋め込み）に依存する事実を実コード（L77-83）で確認のうえ risk 注記に明示し、checkbox の DOM 出現順維持を AC-9 のテスト緑維持と結びつけている。

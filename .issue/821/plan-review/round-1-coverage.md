# Round-1 レビュー — Issue #821（視点: 要件カバレッジ・スコープ整合性）

対象: `.issue/821/plan.md` / `.issue/821/adr.md`
レビュー日: 2026-07-10

## サマリ
Issue 本文で列挙された全候補（grep 実測 15 ヒット = 12 コンポーネント + 対象外 3）を実コードと突き合わせて検証。すべてが plan.md の判断表（L39-56）で「修正 / 対象外」いずれかに明示され、漏れはゼロ。対象外判断・3 提案の落とし込み・AC と実装ステップの紐づけも妥当。スコープ外作業の混入なし。

#### 問題点（要修正）
問題点ゼロ。

検証の実測根拠:
- `grep -rn "toLocale*|Intl.DateTimeFormat" app --include=*.tsx,*.ts`（テスト除く）の全ヒットが判断表に存在。判断表にあって実在しない箇所もなし。
- `"use client"` ディレクティブ実測と plan の client/RSC 区分が完全一致（ProfileForm・SecurityForm・PublishSettings・TagList・CalendarView・UsersTable・Jobs = client / Dashboard・NoteMetaPanel・NoteHistoryList・NoteRevisionDetail・TrashList・listSelectors・relativeTime = ディレクティブなし）。listSelectors / relativeTime はモジュールだが消費側（ListView/TileView・SecurityForm）が client なので AC-3（client 経路）扱いで正しい。
- 対象外 3 件の根拠を実コードで確認: CalendarView L16 / PublicNoteViews L200 は `new Date(\`${dateKey}T00:00:00\`)`（Z なし = ランタイムローカル解釈）を同一ローカル TZ で日付整形するため SSR/クライアントで同日 → TZ 非依存。`groupNotesByDay`（listSelectors L169-184）は `Intl.DateTimeFormat().resolvedOptions().timeZone` を client 解決して引数で渡す設計。いずれも「対象外」判断は妥当。
- plan L58 の「`formatMonthLabel` は存在しない（Issue の推測表記）」は正しい。listSelectors の `toLocale*` は `formatDate`（L20-28）のみ。Issue の不確実な列挙を実コードで潰しており高評価。
- Issue の 3 提案がすべて計画に落ちている:（a）共有ヘルパー集約 → AC-1 / ステップ1 / ADR-002、（b）TZ=UTC と Asia/Tokyo で同一出力の単体テスト → AC-2 / ステップ2、（c）表示 TZ 方針統一（Asia/Tokyo 固定・追従は client 解決方式） → ADR-001 / スコープ節。
- AC と実装ステップの紐づけ（AC-1→S1, AC-2→S2, AC-3→S3, AC-4→S4, AC-5→S5, AC-7→S3,6）は整合。AC-6（対象外は変更しない）はステップなしで正しい（不作為の基準）。
- スコープ外作業の混入なし。ユーザー設定 TZ 切替・視覚フォーマット統一は「含まれないもの」で明示除外。DTO/ユースケース/ドメイン/アダプター不変も明記され、表示整形のみに閉じている。

#### 改善提案（検討推奨）
- **[S-001]** AC-2 の検証手段が「ヘルパーが `timeZone` を明示するのでランナー TZ 非依存 → 単一テストで担保」に留まる点。
  - 理由: Issue の提案文言は「TZ=UTC と Asia/Tokyo で同一出力を担保」であり、文字通りには 2 つの `process.env.TZ` での実行を含意する。plan の「TZ 固定ゆえ本質的に非依存」という論証は正しく、実質的に上位互換だが、"TZ を落とすと (a) が失敗する" という回帰ガードは「ヘルパーが TZ を明示している」ことは検出できても「呼び出し側が TZ 未指定に退行した」ケースは各コンポーネント側で検出できない。ヘルパー集約後は全呼び出しがヘルパー経由になる前提なので実害は小さいが、AC-2 のテストコメント/名前に「ランナー TZ に依存せず同一出力（＝ Issue の UTC/Asia/Tokyo 同一出力提案を満たす）」と明記しておくと、レビュー時に Issue 提案との対応が一目で追える。

- **[S-002]** AC-3 の対象列挙で「SecurityForm」が 2 回現れる（自身の `formatLoginTime` と、`relativeTime` フォールバックの消費者として）。
  - 理由: 冗長で読み手が「別物か？」と迷う。「SecurityForm（`formatLoginTime`）」「relativeTime フォールバック（SecurityForm が消費）」のように役割を分けて 1 回ずつにすると基準の検証対象が明確になる。内容は正しいので表記のみ。

- **[S-003]** Dashboard の移行は現状 `Intl.DateTimeFormat("ja-JP", {...}).format()`（NaN ガードなし, L147）から `formatJstDateTime`（`toLocaleString` ベース + NaN ガードあり）への置換になる。
  - 理由: 出力は同一オプションで等価だが、(1) NaN 入力時に従来は `Invalid Date` 文字列、移行後は iso 素通し、という微小な挙動変更が入る（改善方向）。(2) 唯一 `Intl.DateTimeFormat().format()` 系からの移行で他は `toLocale*` 系という差異がある。ステップ4 の変更内容に「Dashboard は Intl.DateTimeFormat → ヘルパー（toLocaleString 等価）へ、NaN ガードが付与される」と一言添えると実装時の取りこぼしを防げる。カバレッジ上の欠落ではない。

#### 良い点
- 判断表（L39-56）が「箇所 × 区分 × 整形の性質 × 判断 × 根拠」の 5 列で全候補を網羅し、Issue の「各箇所を個別に判断せよ」という要請に正面から応えている。カバレッジ観点で理想的な構造。
- client（真の mismatch）と RSC（UTC 誤表示だが mismatch ではない）を ADR-003 で明確に区別し、「RSC 側は mismatch 修正ではなく表示正確性＋集約」と過大主張を避ける注意まで書いている（L154）。基準の検証可能性と正確性の両立。
- Issue の不確実な列挙（`formatMonthLabel` 等）を実コードで検証し、存在しないことを明記して修正している。
- ADR-002 の「オプション透過 vs 固定プリセット」判断が、W-001 の重複の実体（ボイラープレート + WHY コメントであってオプション集合ではない）を正確に捉え、「既存の見た目を維持」という #817 原則との整合を保っている。スコープ肥大（視覚統一）を意識的に回避。
- 既存テスト影響（ProfileForm test L289）を具体行まで特定し、他に同型テストがないか着手時 grep する旨も記載。実測でも `toLocale|timeZone` を含むテストは ProfileForm の 1 件のみで、リスク評価が正確。

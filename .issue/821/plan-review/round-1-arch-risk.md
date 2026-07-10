# plan-review round-1 — 視点: アーキテクチャ整合性・実現可能性・リスク

**Issue:** #821
**対象:** `.issue/821/plan.md` / `.issue/821/adr.md`
**レビュー日:** 2026-07-10

## 検証サマリー

計画の調査（判断表）を実コードで全件突合した。`grep -rn "toLocale*|Intl.DateTimeFormat"`（tests 除外）で検出される整形箇所は **16 件**で、いずれも計画の判断表に過不足なく載っており、区分（client / RSC）・修正/対象外の判定も実装と一致していた。

- 計画で「対象外」とした `CalendarView:18` / `PublicNoteViews:202`（date-key の日付のみ整形）と `listSelectors:184`（`en-CA` + `tz` 引数の `groupNotesByDay`）は、実コードでも instant 非依存 or client 解決 TZ 引数渡しで、判定は妥当。
- 計画が「`formatMonthLabel` は存在しない」「`listSelectors` の `toLocale*` は `formatDate` のみ」と記した点は正しい（`formatDateRangeChipLabel`/`shortDate` は `YYYY-MM-DD` を `split("-")` で処理し `Date`/`toLocale` を使わないため mismatch 源ではない＝対象外で正しい）。
- 「他コンポーネントに同型テストがないか grep で確認」の答えは事前に確定できる: 日付を assert しているテストは `ProfileForm/__tests__/index.test.tsx` のみ。他は無し。着手時の追加調査コストは小さい。

結論として、**must-fix（P）はゼロ**。アーキテクチャ整合性・スコープ規律とも良好で、実現可能。以下は実装時に効く軽微な改善提案のみ。

## 問題点（要修正）

問題点ゼロ。

## 改善提案（検討推奨）

- **[S-001]** `ProfileForm.formatDay(d: Date)` はヘルパー `formatJstDateTime(iso: string, ...)` と入力型が違う（`Date` を受け取る／NaN ガードも無い）ため、計画の「自前の `new Date()` + NaN ガードを `formatJstDateTime(iso, {...})` の1行に置換」がこの1箇所だけ字義どおりには当てはまらない。
  - 理由: 実装者が「iso 文字列前提」の記述をそのまま当てて詰まる恐れ。実際は呼び出し元 `formatDay(nextChange)`（`nextChange` は算出済み `Date`）を保つなら、内部で `formatJstDateTime(d.toISOString(), {...})` と橋渡しする必要がある。挙動は正しく、ラッパー関数のシグネチャも不変に保てるので設計上の破綻はないが、手順に一言あると安全。
  - 提案: ステップ3の ProfileForm 行に「`formatDay` は `Date` 入力なので `d.toISOString()` を噛ませてヘルパーへ渡す（他は ISO 文字列直渡し）」と明記。あるいはヘルパーを `string | Date` 受けにするかは過剰なので不要。

- **[S-002]** ヘルパー名 `formatJstDateTime` が日付のみ整形の呼び出し側（`TagList`/`TrashList`/`listSelectors.formatDate`/`ProfileForm.formatDay`/`relativeTime` フォールバック）でも使われる。`toLocaleString` に日付のみオプションを渡せば日付のみを返す（計画 line 93 の主張は正しく、実挙動と一致）ので機能上は問題ないが、名前が日時専用の印象を与える。
  - 理由: 将来の読者が「日付のみ整形に DateTime ヘルパーを使っている」と誤解しうる。ただし ADR-002 の「オプション透過・単一関数」方針からすると命名を汎用寄り（例 `formatJstDate` ではなく現状維持のまま JSDoc で「日付のみオプションなら日付のみを返す」を明記）にするのが素直。名称変更は任意。
  - 提案: 名前は現状維持でよいが、ヘルパー JSDoc に「日付のみオプションを渡せば日付のみを返す（`toLocaleDateString` 相当の置換にも使える）」を1文追記すると意図が明確になる。

## 良い点

- **調査精度が高い**: 16 箇所の client/RSC 区分、instant 依存性、対象外根拠まで実コードと完全一致。`formatMonthLabel` 不在・`formatDateRangeChipLabel` 除外の判断も正しく、見落とし・過剰包含とも無し。
- **ADR-002（オプション透過）の選択が妥当**: 12+ の整形箇所でオプション粒度がバラバラ（`month` の `2-digit`/`short`/`long`、`dateStyle`/`timeStyle`、年有無、時刻有無）である実態を踏まえ、固定プリセットで見た目を壊さず「TZ 固定＋NaN ガード＋ロケール」だけを1点に集約する判断は、#817 の「既存の見た目・粒度を維持」原則と整合。W-001 の重複の実体（ボイラープレート＋WHY コメント）を正しく捉えている。
- **ADR-001 を #817 に委譲**: 選択肢比較（`suppressHydrationWarning`/DTO 整形の不採用理由）を再論せず参照に留めたのは適切。プレゼンテーション層への配置（`relativeTime.ts` JSDoc の「整形はプレゼンテーション層の責務」）とも一致し、ドメイン/アプリ層へ整形が漏れない。`relativeTime.ts` と `dateFormat.ts` は同一 `common/` 内・循環 import 無しで関係が整理されている。
- **ADR-003 の RSC 区別が誠実**: RSC 側は「mismatch 修正」ではなく「UTC 誤表示の是正＋集約」と明記し、受け入れ基準でも過大主張を避けている。RSC も表示値は実際に誤り（instant の日付のみ整形は深夜帯で1日ずれ）なので、含める判断は正当。
- **`{ ...options, timeZone: "Asia/Tokyo" }` の順序**が正しく、呼び出し側の誤 TZ 上書きを防ぐ防御的設計。
- **テスト方針（AC-2）が本質的**: 境界インスタント `2026-01-01T16:00:00Z`（JST 翌日01時）で JST 側の日付・時刻を assert し、TZ を落とすと失敗する回帰ガードにしている。ランナーの `process.env.TZ` に依存せず同一出力になる方針は実装可能（ヘルパーが `timeZone` を明示するため）。
- **既存テストの回帰リスクが実際に低い**: `relativeTime.test.ts:35` の絶対フォールバック assert は入力 instant が `2026-05-08T00:00:00.000Z`（= JST 09:00 同日）で、`timeZone: "Asia/Tokyo"` 追加後も `2026年5月8日` で不変。計画の「relativeTime 既存テスト整合維持」は追加修正なしで満たせる公算が高い（実装時に UTC/JST 双方で走らせて確認すれば十分）。`ProfileForm` テストのみ期待値再構築が必要という指摘も正確。

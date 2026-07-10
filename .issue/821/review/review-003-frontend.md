# PR #823 レビュー round-3（フル再レビュー） — 観点: Frontend

**対象 PR:** #823 `fix(frontend): #821 日付整形の TZ を Asia/Tokyo 固定し共有ヘルパーに集約`
**ブランチ:** `issue/821/date-format-tz-helper`
**計画:** `.issue/821/plan.md` / `.issue/821/adr.md`
**レビュー日:** 2026-07-10
**品質ゲート実測:** `pnpm typecheck` 通過 / `pnpm test:unit` 全通過（289 files / 4459 tests）

---

## 検証サマリー（AC 対応）

GitHub 上の PR #823 の変更ファイルは 16 の app ファイル + `.issue/821/` ドキュメントのみ（`biome.json` 等の非 app ファイルは main の先行分岐で、PR には含まれない）。各 AC を実コードで突合した。

- **AC-1（共有ヘルパー）**: `app/components/common/dateFormat.ts` に `formatJstDateTime(iso, options)` が存在。`ja-JP` + `timeZone: "Asia/Tokyo"` を固定、NaN 入力で `iso` を素通し。JSDoc に「TZ 固定で mismatch を1点に閉じる」「日付のみオプションなら日付のみを返す（`toLocaleDateString` 相当置換にも使える）」まで明記。**満たす。**
- **AC-2（TZ 非依存テスト）**: `__tests__/dateFormat.test.ts` が境界インスタント `2026-01-01T16:00:00Z`（JST 翌 01:00）で日付のみ / 日時 / NaN の3系統に加え、呼び出し側 `timeZone` を JST が上書きするスプレッド順序ガード（(c)）を持つ。コメントに「ランナー TZ 非依存＝ Issue の UTC/Asia/Tokyo 同一出力提案を満たす」を明示。**満たす。**
- **AC-3（client 移行）**: ProfileForm（`formatTimestamp`/`formatDay`）・SecurityForm（`formatLoginTime`）・PublishSettings（`formatLastAccess`）・TagList（`formatLastUsed`）・listSelectors（`formatDate`）・relativeTime 絶対フォールバック すべてヘルパー経由。既存オプション保持。**満たす。**
- **AC-4（RSC 移行）**: Dashboard（`formatActivityTime`）・NoteMetaPanel（`formatDate`）・NoteHistoryList・NoteRevisionDetail・TrashList すべてヘルパー経由。history 2件は `toLocaleString()`（ロケール/オプション未指定）→ 明示 `ja-JP` 日時（ADR-002 例外）。**満たす。**
- **AC-5（#817 集約）**: UsersTable / Jobs から自前ボイラープレート（`new Date`+NaN ガード+`toLocale*`）と重複 WHY コメントを除去しヘルパーへ。オプション集合は不変で `timeZone: "Asia/Tokyo"` はヘルパー側に移譲、表示不変。**満たす。**
- **AC-6（対象外不変）**: CalendarView / PublicNoteViews は PR で未変更（`git diff` 名前一覧で不在を確認）。`groupNotesByDay` の client 解決 TZ 経路も不変。**満たす。**
- **AC-7（品質ゲート）**: ProfileForm テスト L289 の期待値に `timeZone: "Asia/Tokyo"` を追加し新方針と整合。typecheck / unit 全通過。**満たす。**

## 重点確認（設問対応）

- **ヘルパー API**: `iso: string` + `Intl.DateTimeFormatOptions` を受け、`{ ...options, timeZone: "Asia/Tokyo" }` の順で TZ を最後に固定。呼び出し側の誤 TZ を JST に倒す防御的設計が実装・テスト（(c)）両面で担保。良好。
- **表示挙動の保存**: 移行 12 箇所すべてで既存オプションが逐語一致（UsersTable/Jobs から旧 `timeZone` 指定を除去した点のみ差分＝ヘルパーへ移譲で等価）。history 2件のみ意図的なフォーマット変更（既定ロケール+UTC → ja-JP+JST）で ADR-002 例外に一致。
- **ProfileForm.formatDay の Date 橋渡し**: `formatJstDateTime(d.toISOString(), {...})`。入力 `nextChange` は `nextUsernameChangeAt` が `null` または NaN ガード済み有効 Date のみ返すため（`usernameCooldown.ts:25`）、`.toISOString()` が RangeError を投げる経路は存在しない。橋渡しは安全。
- **mounted ゲートのコメント整合（round-2 修正の確認）**: `ProfileForm/index.tsx:131-136` のコメントは gate の理由を「cooldown 計算の `new Date()`（現在時刻）依存」と正しく帰属し、「日付整形自体は JST ピンの `formatJstDateTime` で SSR-safe」と補足。実装（`nextChange = mounted ? nextUsernameChangeAt(..., new Date()) : null`）と一致。round-2 の訂正が正しく反映され、挙動変更なし。
- **RSC 系移行**: RSC 5 箇所は「mismatch 修正ではなく UTC 誤表示の是正＋集約」という ADR-003 の位置づけどおり。RevisionDetail/HistoryList の `<time dateTime={...createdAt}>` は機械可読 ISO を保持したまま表示テキストのみ JST 化しており、a11y 面も適切。
- **CLAUDE.md スタイル準拠**: 整形はプレゼンテーション層（`app/components/common/`）に配置しドメイン/アプリ層へ漏れなし。逐語 WHY コメントをヘルパー JSDoc へ集約し重複除去（W-001 解消）。circular import なし（`relativeTime.ts` → `dateFormat.ts` の単方向）。

---

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** #821 のスコープ外の付随リファクタが 1 件混入している。`app/components/publication/PublishSettings/index.tsx` で日付整形（`formatLastAccess`）とは無関係に、単一利用の型エイリアス `type FormState = void;` を削除して 2 箇所の `useActionState<FormState, FormData>` を `useActionState<void, FormData>` にインライン化し、付随コメントを移動している。／ 場所 `app/components/publication/PublishSettings/index.tsx:99-116, 152-179`（旧 `FormState` 宣言の除去と `void` インライン化）／ 理由: 挙動は完全に等価（`void` エイリアス → `void` 直書き、初期値 `undefined` も不変。typecheck・unit 全通過で確認済み）で、移動後コメントは「`undefined` だと action の `Promise<void>` 戻り型が非互換に広がる」という有用な補足も加えている。一方で「日付整形の TZ 固定」に絞った修正 PR に無関係な型整理が混じるのはレビュー・追跡の観点で好ましくなく、`git blame`/リバートの粒度を濁す。／ 提案: そのまま残すなら PR 説明に「PublishSettings の `FormState` エイリアス整理を同梱」と一言添えるか、別コミット/別 PR に分離する。挙動リスクは無いため merge ブロッカーではない。

#### Notes

- **[N-001]** ヘルパーとテストの設計が堅牢。特にテスト (c)（呼び出し側 `timeZone: "America/New_York"` を JST が上書きすることを assert）は、AC-2 が要求する「ランナー TZ 非依存」を `process.env.TZ` に依存せず単一プロセスで証明しており、スプレッド順序の回帰も同時に検出する。境界インスタントの選定（JST 翌日 01:00）も日付ずれ検出に最適。
- **[N-002]** `TagList.formatLastUsed` はヘルパー移行後も自前の `new Date(iso)` + NaN ガードを残しているが、これは意図的で正しい。NaN 時のフォールバックが `"未使用"`（ヘルパーの「iso 素通し」とは異なる）であり、`null`/NaN を独自に `"未使用"` へ倒す必要があるため。表示挙動が保存されている。
- **[N-003]** `ProfileForm` の「最終保存」表示（L427-431）は依然 `mounted` ゲート下にあるが、`formatTimestamp(user.lastSavedAt)` は固定インスタント×JST ピンで既に SSR-safe になったため、厳密にはサーバー側描画も可能になった。ゲート維持は「cooldown ヒントと同一の見え方を保つ／挙動不変に留める」保守的判断として妥当で、コメントも「最終保存はゲートを共有する」と正直に書いている。将来レイアウトシフトを嫌うなら un-gate できる余地がある、という参考情報（本 PR での対応は不要）。
- **[N-004]** manual-test 結果（TC-01〜08）が非 JST ブラウザ（America/New_York）で実施され、UTC 00:00 seed が JST 09:00 で表示される決定的ケース（TC-04/05）と、UsersTable が前日ずれせず `2024/01/01` 固定表示（TC-02）で、クライアントがブラウザ TZ に引っ張られないことを実機確認済み。PublishSettings / NoteMeta / History 系はデータ欠如で実機未確認だがユニット/型でカバーという切り分けも妥当。

---
**[W-001] → 見送り（誤検出）**: `git diff origin/main...HEAD -- app/components/publication/PublishSettings/index.tsx` を確認したところ、当該ファイルの変更は `formatLastAccess` のヘルパー移行＋逐語 JSDoc 削除のみ。指摘された `FormState` 型エイリアス除去・`void` インライン化は差分に存在しない（レビュアーの誤読と判断）。修正不要。

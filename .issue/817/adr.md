# ADR — Issue #817: UsersTable/Jobs の hydration mismatch（日付フォーマット）

## ADR-001: admin の日付表示タイムゾーンを Asia/Tokyo に固定する

### Status
Accepted

### Context
`/admin/users` の `formatDate` と `/admin/jobs` の `formatDateTime` は、`"use client"` コンポーネント内で `Date#toLocaleDateString`/`toLocaleString` を **`timeZone` 未指定**で呼んでいる。Cloudflare Workers 上の SSR は `Intl` の既定 TZ が UTC になるため、クライアント（ブラウザのローカル TZ）と出力文字列がずれ、React が hydration mismatch を報告してツリーを再生成する。

Issue が挙げた選択肢は3つ:
1. `timeZone` を明示した決定論的整形
2. DTO 側で整形済み文字列を渡す
3. 該当要素に `suppressHydrationWarning`

### Decision
**選択肢1** を採り、`formatDate`/`formatDateTime` の整形オプションに `timeZone: "Asia/Tokyo"` を追加する。ロケールは既存の `ja-JP` を維持する。

理由:
- **最小・局所的**: 整形関数1行の追加で SSR/クライアントが同一文字列になり、mismatch が根本から消える。DTO 契約やユースケースに触れない。
- **既存方針との一貫性**: アプリ全体が `ja-JP` ロケールをハードコードしており、その自然な対になる表示 TZ は JST。`listSelectors.groupNotesByDay` が既に `timeZone` 指定の `Intl.DateTimeFormat` を本番で使っている実績もある。
- **選択肢2 を採らない理由**: 表示整形を DTO/ユースケース側へ持ち込むと、プレゼンテーションの責務（`relativeTime.ts` JSDoc が「整形はプレゼンテーション層の責務」と明記）がバックエンドに漏れる。過剰な設計変更でスコープに見合わない。
- **選択肢3 を採らない理由**: `suppressHydrationWarning` は warning を黙らせるだけで、サーバー描画済みテキスト（UTC 表記）がそのまま残り、閲覧者は UTC の日付を見続けることになる。決定論化と違い「正しい値を出す」問題を解決しない。Issue も「やむを得ない場合」の最終手段と位置づけている。

### Consequences
- 良い点: hydration mismatch と不要な再レンダリングが解消。admin の日付が常に JST で一貫表示され、閲覧環境に依存しなくなる。
- トレードオフ: 非 JST 環境から admin を見ると、これまでブラウザ TZ で再生成されていた値が JST 固定になる。ただし admin は `ja-JP` 前提の運用ビューであり、実質的な影響はほぼない。
- 波及: 同型の潜在バグ（`ProfileForm` など TZ 未指定の `toLocale*` を使う他コンポーネント）は本 Issue のスコープ外。横断修正は別 Issue として起票を検討する。

---

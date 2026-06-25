# レビュー round-2 — アーキテクチャ整合性・実現可能性・リスク (#615)

レビュアー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## サマリー
- 問題点: 0 / 改善提案: 2
- Round 1 の P-001 / P-002 / P-003 はいずれも plan.md / adr.md に適切に反映され、実コードに照らして現実的であることを確認した。
- best-effort 化（限定 try/catch + ログ握り潰し）・cache() 副作用セマンティクスの整理・ISO 文字列スロットルの 3 点を実コードで検証し、いずれも成立する。新たな要修正の問題点はゼロ。

---

## Round 1 指摘の解消確認（実コード照合）

### P-001（recordActivity 失敗が認証リクエストを落とす）→ 解消
- plan.md ステップ6・設計（L82, L136-137）・AC-4（L20）・ADR-003（adr.md L62）で、`getCurrentUser` 内の **`recordActivity` 呼び出しのみを限定 try/catch で囲み、失敗はログのみで握り潰す** best-effort 方針が一貫して明記された。
- 実コード検証: `app/lib/server/currentUser.ts` L51-62 の `getCurrentUser` は現状 try/catch を持たず、`resolve` 成功後に `userRepository.findById` を呼ぶだけ。ここに `recordActivity` を素朴に await すると `mapDbError`（`app/core/adapters/d1/repositories/sessionService.ts` で全 DB 操作をラップ）経由の `SystemError` が認証経路を巻き込む、という Round 1 の指摘どおりのリスクは実在する。限定 try/catch で塞ぐ方針は妥当。
- ログ握り潰しの実現可能性も確認済み: コンテナは `SharedDeps.logger: Logger`（`app/core/application/di/types.ts` L102, `serverCloudflare.ts` L703 周辺で `ConsoleLogger` を注入）を公開しており、`getCurrentUser` は既に `getContainer()` を保持しているため、`container.logger.warn(...)` で握り潰しログを出せる。新たな配線は不要。
- CLAUDE.md「broad try/catch は明示的境界のみ」との整合も、ADR-003 L62 が「付随書き込みの partial-failure tolerance」という正当な境界として明文化しており、CLAUDE.md の「worker → root」partial-failure 容認と同型の判断として筋が通る。

### P-002（read-only な getCurrentUser に書き込み副作用）→ 解消
- plan.md L83・L136 と ADR-003 L63 で、(a) `getCurrentUser` JSDoc を「read のみ」→「read + best-effort activity-touch」へ改訂、(b) `cache()` の 1 回保証を負荷見積りの前提から外し、冪等＋WHERE スロットルで複数回呼ばれても無害である点を主軸に据える、という二段の整理が反映された。
- 実コード検証: 現 JSDoc（`currentUser.ts` L48-49）は確かに「one-line port access (… read) that does not need a usecase wrapper」と read-only を宣言しており、改訂対象として正確に特定できている。React `cache` がメモ化であって at-most-once 副作用ランナーではない、という指摘も技術的に正しく、設計の主軸を「冪等性」に置き直した点はアーキテクチャ的に健全。

### P-003（スロットル WHERE と ISO 文字列スキーマの整合）→ 解消
- plan.md ステップ5（L129）・設計（L81）・ADR-003（adr.md L60）で、`cutoff = new Date(clock.now().getTime() - ACTIVITY_THROTTLE_MS).toISOString()` をアプリ側で算出し `and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff))` の文字列比較で間引く、SQLite `datetime()` 算術は使わない、と具体化された。
- 実コード検証: `app/core/adapters/d1/schema.ts` L169 で `updatedAt: text("updated_at")`（テキスト=ISO 文字列）であること、`issue` が `now.toISOString()` で挿入（sessionService.ts L67-69）、`resolve`/`listForUser` が `gt(sessions.expiresAt, now.toISOString())` の文字列比較（L92, L153）であることを全て確認。ISO 8601 は辞書順 = 時系列順なので `lt` 文字列比較は正しく機能する。提案どおりの実装で既存の時刻表現と完全に整合する。
- 加えて `token` 列に `uniqueIndex("uniq_sessions_token")`（schema.ts L177）があるため、`WHERE token = ?` 単独で対象行は高々 1 行に絞られ、`updated_at < cutoff` のスロットル条件評価も index seek 後の単一行判定で済む。write-on-read のスロットル設計は性能面でも現実的。

---

#### 問題点（要修正）
問題点ゼロ。Round 1 の 3 指摘はいずれも実コードに照らして妥当な形で解消されており、新たなアーキテクチャ違反・実現不能・看過リスクは検出されなかった。

---

#### 改善提案（検討推奨）

- **[S-001]** `recordActivity` を `unitOfWorkProvider.run` の外で呼ぶことを設計/ステップに一言明記すると親切
  - 理由: `getCurrentUser`（`currentUser.ts` L57-59）は `userRepository.findById` を `unitOfWorkProvider.run(...)` の中で呼ぶ。一方 `sessionService` は adapter JSDoc（sessionService.ts L43-48）が明言するとおり **UoW の外**で binding に直接実行される設計で、現コードも `resolve` を `run` の外で呼んでいる。plan は `recordActivity` を「`resolve` 成功直後」に置くとしており実質 UoW 外で正しいが、レビュー/実装時に「findById と同じ UoW callback 内に紛れ込ませない（セッションはアグリゲート外・UoW 対象外）」点を一文添えると、後続実装者の取り違えを防げる。必須ではない（現行記述でも結果は正しい）。

- **[S-002]** best-effort 握り潰しに使うロガーの参照経路（`container.logger`）を ステップ6 に明記
  - 理由: ADR-003 / ステップ6 は「失敗はログのみに留めて握り潰す」と書くが、ログ出力手段の具体（`container.logger.warn` を使う）には触れていない。`SharedDeps.logger`（types.ts L102）が利用可能であることは確認済みなので、`console.*` 直書きでなく注入済みポート（`container.logger`）を使う旨を一行残すと、CLAUDE.md「cross-cutting（logging）はポート越し」原則との整合が実装段階でブレない。軽微。

---

#### 良い点
- Round 1 の 3 つの要修正点すべてに対し、plan.md 本文・該当ステップ・ADR・リスク欄・「レビュー履歴」へ多層に反映されており、設計判断の追跡性が高い。特に P-001/P-002 を ADR-003 の同一節に集約し「どこで・何回・失敗時どうするか」を一箇所で確定させた構成は、後続の spec-sync / architecture-audit でのブレを防ぐ。
- P-003 の修正が実スキーマ（`text` 型 + `toISOString()` 挿入 + 文字列比較の既存 `resolve`/`listForUser`）に正確に整合しており、ISO 8601 の辞書順=時系列順という性質に依拠した `lt(cutoff)` スロットルは実装上そのまま成立する。Round 1 で懸念された `datetime()` 算術への誤誘導を明示的に禁じている点も堅実。
- best-effort 化を「認証可用性を下げない」というアーキテクチャ品質属性（可用性）の観点で正当化し、CLAUDE.md の partial-failure tolerance 境界（worker → root と同型）に接続している。例外伝播の境界設計が原則と一貫。
- cache() 副作用問題を「メモ化に副作用回数を暗黙依存させない / 冪等性を主軸にする」と整理した点は、React の `cache` セマンティクスを正しく踏まえた堅牢な設計判断で、脆い前提への依存を排している。
- スロットル幅 ≤「たった今」粒度（S-004）の整合がリスク欄・ADR-003/004 に残り、定数調整時の指針が明文化されている。表示の意味論（「最終アクセス（おおむね）」）まで踏み込んで虚偽表示禁止原則と接続している点も良い。

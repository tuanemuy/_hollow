# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #573）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/573/plan.md` / `.issue/573/adr.md`

---

## 結論サマリー

計画の骨子（集計 = application 層 read-only usecase / パスワード再認証 = `requestEmailChange` 同型 / 新ポート2本 + 集計 SQL / 文言の実カスケード一致）は**アーキテクチャ的に正しく、実現可能**。依存方向（内側→外側）の実装ステップ順も適切。

ただし、計画が参照する「既存の型」に**実コードとの食い違いが2点**あり、これがそのまま実装ガイドになると誤った構造（または存在しないフェイクへの追従）に流れるリスクがある。最大は **test 方針（in-memory フェイク repo 前提）** と **集計 usecase の呼び出し位置／構造的雛形の取り違え**。SSO 削除不能リスクは「現コードベースでは発生しない」と結論できる。

---

## 問題点（要修正）

- **[P-001] 集計 usecase の「構造的雛形」を `listUserSessions` としているが、これは UoW を使わない別系統。正しい雛形は `listNotesByOwner`（read-only + UoW）**
  - 理由: plan.md L40・L91 は「`listUserSessions` 同型の read-only usecase」「`unitOfWorkProvider.run` で読み取り用にアクセス（read-only だが repo 取得経路が UoW のため）」と書くが、実コードの `listUserSessions`（`app/core/application/identity/listUserSessions.ts`）は **`unitOfWorkProvider.run` を一切使わず** `container.sessionService` を直接呼ぶだけ。`SessionService` は UoW 非参加ポートだから直接呼べる。一方、本 Issue の集計は note/media/sharelink/publication の**リポジトリ**を読む必要があり、`RequestContainer`（`app/core/application/di/types.ts`）は**リポジトリを直接公開しておらず `unitOfWorkProvider` 経由でしか取得できない**。実際 read-only でリポジトリを読む `listNotesByOwner`（`app/core/application/note/listNotesByOwner.ts`）は `container.unitOfWorkProvider.run` の中で `ctx.noteRepository.listWithCount(...)` 等を呼び、`collectEvents` を呼ばずに値だけ返している。
  - 補足: つまり plan の「UoW で回す」という**結論自体は正しい**（リポジトリ取得経路が UoW のため必須）。誤っているのは「`listUserSessions` 同型」というラベルだけ。read-only で UoW を回し event collect しないパターンは `listNotesByOwner` で確立済みで、契約上も安全。
  - 提案: 計画の「構造的雛形 = `listUserSessions`」を **「構造的雛形 = `listNotesByOwner`（read-only かつ UoW で repo を読み collectEvents しない）」**に差し替える。AC-4 の記述・テスト方針もこの雛形に合わせる。

- **[P-002] テスト方針が「in-memory / フェイク repo に集計値を仕込んで検証」を前提にしているが、本リポジトリの application 層テストは実 D1 を使う integration 方式でフェイク repo が存在しない**
  - 理由: plan.md L104「フェイク実装（テスト用 in-memory repo があれば）にも同メソッドを追加」、L222「フェイク repo で件数・bytes・public・activeLink を仕込み検証」、L169 ステップ5「（存在すれば）対応するフェイク/in-memory 実装」。だが実コードでは:
    - identity usecase は `app/core/application/identity/__tests__/identity.integration.test.ts` の **実 D1 integration** のみ（`setupTestContainer` は `D1UnitOfWorkProvider` / 実 D1 リポジトリを組む。`app/core/application/__tests__/helpers.ts`）。`deleteAccount` 専用 unit test は存在しない。
    - `app/core/application/__tests__/fakes/` にあるフェイクは **LLM / tempFileStorage / idGenerator / logger / objectStorage のみ**。note/media/sharelink/publication の **in-memory リポジトリフェイクは存在しない**。
  - 影響: 「フェイク repo に仕込んで検証」という指示のまま実装すると、存在しない基盤を前提にした実装計画になる。`summarizeAccountDeletion` も `countActiveByOwner`/`aggregateByOwner` も、結局**実 D1 integration test でデータを seed して検証**するのが本リポジトリの方式。
  - 提案: テスト方針を「`summarizeAccountDeletion` は `identity.integration.test.ts`（または近傍の integration suite）に実 D1 で seed して集計値を検証」「`countActiveByOwner`/`aggregateByOwner` は `app/core/adapters/d1/__tests__/` の実 DB integration で検証」に統一し、「フェイク repo」「in-memory 実装への追従」の記述を削除する。ステップ5・ステップ10 の文言も合わせる。

- **[P-003] 集計 usecase の呼び出し位置を「route loader」としているが、確立パターン（および Issue 本文の指示）は Page.tsx の async server component（Suspense + SectionErrorBoundary）内**
  - 理由: plan.md ステップ6（L173-177）は `app/routes/_app/settings/account-delete.tsx` の **loader** で集計 usecase を呼ぶ設計。しかし Issue 本文は「影響集計は `AccountDeleteForm/Page.tsx`（server）で集計 usecase を呼んで渡す」と明記。実装上の確立パターンも P22 の `SecurityForm/Page.tsx` で、**route loader は auth/token 解決と RSC 描画のみ**を行い、**usecase は Page 内の async server component（`SecuritySection`）が `getContainer()`（`@/core/application/di/containerStore`）経由で呼び、`<Suspense fallback>` + `<SectionErrorBoundary>` で囲んで stream する**。loader で集計を待つと、現状 loader 同期描画で速い account-delete 画面に集計レイテンシ（大量データユーザー）を被せ、エラー時の隔離（SectionErrorBoundary）も失う。
  - 補足: AC-8 自体は「Page.tsx（server）で呼ぶ」と正しく書かれており、ステップ6 と AC-8 の間で齟齬がある（ステップが Issue/AC から逸脱している）。
  - 提案: ステップ6 を「loader で呼ぶ」から「Page.tsx に集計用 async server component を追加し、`getContainer()` 経由で `summarizeAccountDeletion` を呼んで `<Suspense>` + `<SectionErrorBoundary>` で囲む（P22 `SecurityForm/Page.tsx` 準拠）」に修正。`account-delete.tsx` loader は現状どおり auth + RSC 描画のみに保つ（`<AccountDeletePage user={...} />` のまま、impact は Page 側で取得）。

---

## 改善提案（検討推奨）

- **[S-001] SSO/パスワード未設定ユーザーの削除不能リスクは「現コードベースでは発生しない」と結論づけ、リスク欄を確定させる**
  - 理由: 実コードを精査した結果、`verifyPasswordForUser` は契約上 password 行が無いと `false`（`app/core/domain/identity/ports/credentialStore.ts:38-44, 79`）だが、**password 未設定ユーザーを生成する経路が存在しない**。
    - ユーザー作成は `signUp`（`registerPassword` を必ず呼ぶ・L76）と `adminSignUp` のみ。
    - SSO 系（`linkProvider`/`resolveProvider`）はポート/アダプターに**定義はあるが、呼び出す usecase・ルートが一つも無い**（`grep` で application/routes/components いずれもヒットなし）。OAuth サインインフローは未実装。
    - `removePassword`/`unlinkProvider` を呼ぶ usecase も存在しないため、既存ユーザーから password を剥がす経路も無い。
  - つまり「全ユーザーは必ず password を持つ」が現状の不変条件。`verifyPasswordForUser` による削除ブロックは現実には起きない。plan.md L214 のリスクは「将来 SSO ログインを追加したら再考」という注記に格下げし、本 Issue では `hasPassword` フォールバックを**実装しない**（YAGNI / スコープ外）と確定するのが適切。
  - （注: `hasPassword(userId)` というポートメソッドは存在するので、将来必要になればフォールバックは容易、という点だけ ADR に残すと親切。）

- **[S-002] `countPublicByOwner` を 410 Gone 化対象数の「正確な SSOT」と断言しているが、実カスケードとの間に active-only JOIN 由来の微小ズレがある点を文言で吸収する**
  - 理由: plan.md L44 / L95 は 410 Gone 化対象数を `publicationStateRepository.countPublicByOwner` で取る。だが `countPublicByOwner` は JSDoc どおり **`notes.status='active'` で INNER JOIN** して数える（trashed-but-still-public を除外）。一方、実カスケード `publication/handleUserDeletedEvent` は `noteRepository.findByOwner`（**trashed 含む全ノート**）を走査して private 化する。よって「trashed だが published 状態のノート」が存在する場合、`countPublicByOwner` は実際に 410 化される件数より**過小**になりうる。
  - 影響: 通常 trash 時に publication は private 化されるはずなので実害は小さいが、「trash → outbox-relay lag」の窓では乖離しうる（JSDoc も lag に言及）。「正確な SSOT」という強い表現は #543「虚偽表示禁止」と緊張する。
  - 提案: ADR-003 の文言方針で「公開中のノート ≈ N 件（公開停止 → 410 Gone 化）」のように**断定を少し緩める**か、計画のリスク欄に「`countPublicByOwner` は active のみ集計＝実カスケード（全ノート対象）と厳密には一致しない可能性」を1行追記して認識を残す。集計手段自体の変更は不要（active 公開ノート数は表示値として妥当）。

- **[S-003] `activeShareLinkCount` の集計対象は「全ノートの active リンク」であることを SQL 仕様として明示（trashed ノートのリンクも含む）**
  - 理由: 実カスケード（`handleUserDeletedEvent` → `revokeAllLinksInternal`、`app/core/domain/publication/service.ts:118`）は **owner の全ノート**の `findByNoteId` 上で revoked 以外を revoke する＝ trashed ノートのリンクも失効対象。plan.md L78 は「owner で絞る（status 不問でよい）」と方向性は正しいが、ADR-001 の D1 実装記述は「`shareLinks` を `notes`（owner）に JOIN」とだけで status を明示していない。実装時に誤って active ノートに絞ると過小カウント＝虚偽表示になる。
  - 提案: ADR-001 / ステップ5 に「JOIN は `notes.ownerId = ?` のみで `notes.status` で絞らない（trashed ノートの active リンクも失効対象に含めるのが実カスケードと一致）」と一文足す。`countActiveByOwner` の `revokedAt IS NULL` 条件は実挙動（revoked スキップ）と一致しており正しい。

- **[S-004] `mediaTotalBytes` が集計する母集団と purge ライフサイクル（status: ready/orphan/deleting）の関係を明示する**
  - 理由: `MediaAssetRepository` の `aggregateByOwner` を `SELECT COUNT(*), SUM(byteSize) WHERE ownerId = ?`（ADR-002）で素朴に実装すると、`orphan`/`deleting` 状態（purge worker 待ち）の行も合算しうる。「ユーザーがアクセスできるメディア容量」として表示するなら ready 系のみに絞るのが直感に合う可能性がある。逆に「DB 上に残存する総容量」を出すなら全 status でよい。#543「虚偽表示禁止」の観点では、どの母集団かを DTO JSDoc と SQL で一致させておく必要がある。
  - 提案: ADR-002 に「集計対象 status」を明記（表示意図に合わせて ready のみ／全件を決め、DTO JSDoc と SQL を一致させる）。決め切れない場合は実装フェーズの判断点として明示。

- **[S-005] `confirmWord` の transport 検証に `z.literal('DELETE')` を使うと、誤入力時に返るのは汎用 `ValidationError`。UX 的にフィールド別エラーへ確実にマップできるか確認**
  - 理由: plan.md L127 は `confirmWord: z.literal('DELETE')`。frontend が送信前に既に gating する設計（L123）なので二重防御として妥当だが、`z.literal` の失敗メッセージはフィールド名 `confirmWord` 付きで `fieldErrors` に入る。action でこのフィールドを破棄する以上、サーバー側 fieldErrors の `confirmWord` を UI がどう拾うか（捨てるのか表示するのか）を決めておくと実装がぶれない。
  - 提案: 軽微。frontend gating があるので transport では shape 担保のみと割り切り、`confirmWord` の fieldErrors は UI 側で無視（client gating が先に弾く）と方針を1行残す。

---

## 良い点

- **集計 = application 層 read-only usecase + DTO projection** の配置が hexagonal/DDD の方針（ドメインに cross-aggregate join を持ち込まない／DTO は application 層）と完全に一致。`publicationStateRepository` の JSDoc 方針とも整合。
- **パスワード再認証を `requestEmailChange` 同型で組み込む**判断は実コード（`verifyPasswordForUser` → false で `AuthenticationError('invalid_credentials')`、UoW 内検証）と寸分違わず、新 error code を増やさない（errorCodeNaming テスト無影響）点も正しい。
- **ADR-001 の方式選定が実カスケードの集合論的分析に裏打ちされている**: 「失効対象 = public ノートのリンク」ではなく「全ノートの active リンク」と正しく見抜き、案1（過小カウント＝虚偽表示）を退け案3（owner-scoped 集計 SQL）を採った。`revokeAllLinksInternal`（revoked スキップ）と `revokedAt IS NULL` の一致も正しい。
- **虚偽表示禁止（#543）への忠実さ**: note/media が `user.deleted` reaction で purge されない実挙動（`dispatchDomainEvent` の fan-out は publication/export のみ。note/media handler 無し）を正確に把握し、「失われる」断定を避ける文言方針（ADR-003）に落としている。これは本 Issue の核心要件で、調査が正確。
- **`confirmWord` を backend に流さない境界**（Issue 明記の「確認語は transport/frontend 完結」）をリスク欄でも徹底（L217）しており、`DeleteAccountInput` を汚さない判断が良い。
- **集計を count/SUM SQL に寄せて O(n) 列挙を避ける**（ADR-002）方針は、大量データユーザーのレイテンシ・D1 row budget の両面で妥当。
- 実装ステップが**依存方向（ドメインポート → アダプター → presentation）の内側→外側順**で並んでおり、各 AC へのトレースも明示されている。

---

## 確定した調査結論（実装フェーズへの申し送り）

1. **SSO 削除不能リスクは現状ゼロ**: password 未設定ユーザーを生む経路が無い（[S-001]）。`hasPassword` フォールバックは本 Issue では不要。
2. **集計 usecase は UoW 必須**（container は repo を直接公開しない）だが、雛形は `listNotesByOwner`（read-only + UoW + no collectEvents）。`listUserSessions` ではない（[P-001]）。
3. **テストは実 D1 integration**。in-memory フェイク repo は存在せず追従不要（[P-002]）。
4. **集計の呼び出しは Page.tsx の async server component + Suspense + SectionErrorBoundary**（P22 `SecurityForm/Page.tsx` パターン）。loader ではない（[P-003]）。
5. UoW context は note/media/sharelink/publicationState の全リポジトリを公開済み（`app/core/application/execution/unitOfWork.ts`）。DI 追加配線は不要、で正しい。

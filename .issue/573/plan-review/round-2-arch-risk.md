# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #573）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/573/plan.md` / `.issue/573/adr.md`（2 周目）
前提: 1 周目の指摘（P-001〜P-003 / S-001〜S-005）の反映確認を含む

---

## 結論サマリー

1 周目で指摘した 3 つの問題点はすべて実コードと整合する形で正しく反映された。確認結果:

- **[P-001 反映 OK]** 集計 usecase の雛形が `listNotesByOwner` に差し替わった。実コード（`app/core/application/note/listNotesByOwner.ts` L61-112）は `container.unitOfWorkProvider.run` 内で `ctx.noteRepository.listWithCount` / `ctx.publicationStateRepository.findByNoteIds` を読み、`collectEvents` を呼ばず値だけ返す。read-only + UoW + no-collectEvents パターンと一致。`listUserSessions`（UoW 不使用・`sessionService` 直接呼び）は別系統である旨も調査結果 L42 に明記済み。
- **[P-002 反映 OK]** テスト方針が実 D1 integration に統一され、「フェイク repo」「in-memory 実装への追従」の記述が削除された。`setupTestContainer` / `identity.integration.test.ts` の流儀に合わせ、アダプター集計メソッドは `app/core/adapters/d1/__tests__/` で検証する方針（ステップ5・10 と整合）。ADR-001/002 の「フェイク/in-memory 実装にも追従が必要」という旧記述だけは ADR 側に残存（後述 [S-001]）。
- **[P-003 反映 OK]** 集計呼び出しが `AccountDeleteForm/Page.tsx` の async server component に修正された。確立パターン `SecurityForm/Page.tsx`（L22-48: shell が `<SectionErrorBoundary>` + `<Suspense fallback={<FormSkeleton/>}>` で async section を囲み、section 内で `getContainer()` 経由 usecase 呼び出し → client component に props 渡し）と一致。AC-8・ステップ6/8・設計が整合し、route loader は auth + RSC 描画のみに保つことも明記。

実コードとの食い違い（パスワード再認証の型・`countPublicByOwner` の active-only JOIN・MediaStatus・user.deleted fan-out・SSO 経路不在）はすべて精査し、計画記述が正確であることを確認した。**アーキテクチャ的に正しく、実現可能。** 残るのは軽微な整合性の指摘のみ。

---

## 問題点（要修正）

問題点ゼロ。

1 周目の 3 つの問題点は実コードと整合する形で反映済み。新たな要修正のアーキテクチャ・実現可能性問題は検出されなかった。

---

## 改善提案（検討推奨）

- **[S-001] ADR-001/002 の「フェイク/in-memory 実装にも追従が必要」という Consequences 記述が、plan.md 本文（P-002 反映で削除済み）と矛盾したまま残っている**
  - 理由: plan.md L107 / L174 / テスト方針 L227-232 は「in-memory フェイク repo は本リポジトリに存在しない／追加不要、検証は実 D1 integration」に統一された。しかし `adr.md` の ADR-001 Consequences（L24「フェイク/in-memory 実装にも追従が必要」）と ADR-002 Consequences（L46「media 領域のポート + アダプター（+ フェイク）に 1 メソッド増える」）には旧前提（フェイク追従）が残っている。実装者が ADR を根拠に存在しないフェイクを探す/作る余地が残る。
  - 提案: ADR-001/002 の Consequences から「フェイク/in-memory 実装への追従」の文言を削除し、「実 D1 integration で検証」に揃える（plan.md と同期）。アーキテクチャ判断自体は変わらない軽微な整合修正。

- **[S-002] plan.md / adr.md の行番号参照が実コードと数行ずれている箇所がある（記述内容は正確）**
  - 理由: 例として plan.md は `credentialStore.ts:79`（実コードでも L79 `verifyPasswordForUser` で一致）、`noteRepository.ts:328`（実コードでも L328 `countByOwner` で一致）は OK だが、Issue 本文由来の `shareLinkRepository.ts:40`（実コードでも L40 `countByNoteId` で一致）も OK。一方 `mediaAssetRepository.ts:27`（実コードでは L27 `findByOwner` で一致）、`publicationStateRepository.ts:97`（実コードでも L97 `countPublicByOwner` で一致）も一致を確認。**主要参照はすべて行番号一致しており実害なし。** ただし行番号は実装フェーズで容易にずれるため、レビュー上の指摘というより「行番号より shape（メソッド名・契約）で同定する」運用注記にとどめる。
  - 提案: 軽微。実装フェーズでは行番号ではなくメソッド名・JSDoc 契約で同定すれば足りる。計画修正は不要レベル。

- **[S-003] `aggregateByOwner` / `countActiveByOwner` を `RequestContainer` の UoW context（`ctx`）から取得できることの最終確認を実装フェーズの第一歩に置く**
  - 理由: 集計 usecase は `listNotesByOwner` 同型で `ctx.mediaAssetRepository` / `ctx.shareLinkRepository` / `ctx.noteRepository` / `ctx.publicationStateRepository` を読む前提。`MediaAssetRepository` は他リポジトリと違い `TransactionalRepository` を継承しない特殊 repo（OCC 非対応、`mediaAssetRepository.ts` L18-23 JSDoc）。read-only 集計メソッド追加は OCC 契約と矛盾しないが、UoW context が `mediaAssetRepository` を公開しているか（`listNotesByOwner` は note/tag/publicationState を使うが media は使わない）を実装着手時に `unitOfWork.ts` で 1 度確認しておくと、ステップ1 の前提崩れを早期に検知できる。
  - 理由補足: 1 周目の申し送り L84 は「note/media/sharelink/publicationState の全リポジトリを公開済み」と結論しているが、計画記述の信頼性のため実装の最初に再確認する価値がある（read-only 集計でも UoW 経由でしか取れない以上、公開漏れがあるとステップ1 が成立しない）。
  - 提案: 軽微。ステップ1 の冒頭に「UoW context が 4 リポジトリを公開していることを確認」を 1 行加えるか、実装者の暗黙確認に委ねる。

---

## 良い点

- **1 周目の 3 問題点を、ラベル差し替えだけでなく調査結果・設計・AC・実装ステップ・テスト方針の全箇所で一貫して反映**している。特に P-001 の「read-only でも UoW 経由でしか repo を取れない」という構造的理由を調査結果 L41 / L94 に明文化し、`listUserSessions` が別系統である理由（`SessionService` は UoW 非参加）まで残したのは、実装者の誤解を防ぐ良い記述。
- **パスワード再認証の組み込みが `requestEmailChange`（実コード L23-40）と寸分違わぬ同型**。UoW 内で `verifyPasswordForUser(actor, currentPassword)` → false で `AuthenticationError('invalid_credentials')`。新 error code を増やさず errorCodeNaming テスト無影響、という判断も正しい。
- **検証順序（username → password）の判断が明示的**（AC-1 / 設計 L90 / テスト方針 L229 で統一）。既存 `deleteAccount` は username 一致チェックが先（実コード L41-46）なので、追加検証を後置する差分最小の設計は妥当。
- **ADR-001 の集合論的分析が実カスケードと一致**。`publication/handleUserDeletedEvent` が `noteRepository.findByOwner`（trashed 含む全ノート）を走査し `revokeAllLinksInternal` で全 active リンクを revoke する実挙動（grep で L39 `findByOwner` 確認）に対し、`countActiveByOwner` の JOIN を `notes.status` で絞らない仕様（ADR-001 L20）が一致。案1（public のみ＝過小カウント）を退けた判断が正しい。
- **虚偽表示禁止への忠実さ**。`dispatchDomainEvent` の user.deleted fan-out が publication → export の 2 つだけ（実コード L299-326 で確認、note/media handler 無し）という実挙動を正確に把握し、ノート本体・メディア実体の「失われる」断定を避ける文言方針（ADR-003）に落としている。MediaStatus が `pending|attached|orphan|deleting`（実コード `valueObject.ts` L75）で集計母集団を `attached` のみに絞る判断（ADR-002）も実定義と一致。
- **SSO 削除不能リスクの結論が実コードで裏取りされている**。`linkProvider`/`resolveProvider` を呼ぶ application/route/component が 1 つも無い（grep で 0 件確認）、`signUp`/`adminSignUp` の双方が `registerPassword` を呼ぶ（grep 確認）。「全ユーザーは必ず password を持つ」が現状の不変条件、という ADR-004 の結論は正確で、`hasPassword` フォールバック不実装（YAGNI）の判断が適切。
- **`countPublicByOwner` の active-only JOIN ズレ**（実コード JSDoc L92「counts over the `active` population」で確認）を S-002（1周目）として正しく取り込み、ADR-003 で「約 N 件」と断定を緩める方針にした。虚偽表示禁止と整合。
- 実装ステップが依存方向（ドメインポート → アダプター → presentation）の内側→外側順で並び、各 AC へのトレースが明示。`confirmWord` を backend に流さない境界（DeleteAccountInput を汚さない）も徹底。

---

## 実装フェーズへの申し送り（確定事項）

1. 1 周目 P-001〜P-003 は実コードと整合して反映済み。集計 usecase は `listNotesByOwner` 同型（read-only + UoW + no collectEvents）、テストは実 D1 integration、呼び出しは `AccountDeleteForm/Page.tsx` の async server component。
2. ADR-001/002 の Consequences に「フェイク追従」の旧記述が残存（[S-001]）。実装時はテスト方針（実 D1 integration）を正とする。
3. パスワード再認証は `requestEmailChange` 同型、新 error code なし。検証順序は username → password。
4. SSO 削除不能リスクは現状ゼロ。`hasPassword` フォールバック不要。
5. 表現方針（ADR-003）は実装フェーズで frontend レビュー必須（ノート本体・メディア実体の「失われる」断定回避 / `countPublicByOwner` の active-only ズレ吸収 / saved view・custom prompt は包括表現）。

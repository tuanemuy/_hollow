# Round 2 レビュー — Issueの要件カバレッジ・スコープ整合性（#573）

レビュー対象: `.issue/573/plan.md` / `.issue/573/adr.md`
視点: Issueの要件カバレッジ・スコープ整合性
日付: 2026-06-14
これは2周目のレビュー（1周目: `round-1-coverage.md`）。

## 1周目指摘の反映確認（S-001〜S-005）

すべて適切に反映済み。

- **[S-001]** saved view / custom prompt を集計対象外（件数を出さず包括表現）に。→ スコープ「含まれないもの」L33・AC-4 末尾・AC-5・ADR-003 末尾に明記。**反映済み**。
- **[S-002]** AC-7 の「即時ログアウト」を observable な基準に。→ AC-7 に「削除実行後に保護ルートを再訪すると未認証としてリダイレクトされる（= `revokeAllForUser` が効いている）」と具体化。テスト方針 frontend にも「保護ルート再訪で未認証にリダイレクト」を追記。**反映済み**。
- **[S-003]** AC-1 の検証順序（username → password）を AC で断定。→ AC-1 に「username を先に判定 … 検証順序は AC・設計・テストで統一」、テスト方針にも「検証順序を AC-1 と統一（username 不一致時はパスワード検証に到達しないことを assert）」。**反映済み**。
- **[S-004]** SSO のみ（パスワード未設定）ユーザー論点を計画段階で結論。→ ADR-004 として「現コードベースに password 未設定ユーザーの生成経路が無い（signUp/adminSignUp とも registerPassword を必ず呼ぶ、SSO/removePassword を呼ぶ usecase 無し）」を実コード確認の上で結論。リスク欄でも確定（保留撤回）。**反映済み**。
- **[S-005]** DELETE 確認語を backend に渡さない境界をテスト方針で担保。→ テスト方針「action 境界（S-005）」に「`confirmWord` を含む入力でも usecase へ渡るのは confirmation + currentPassword のみ」を追加。**反映済み**。

## 検証した事実（コード再照合）

- `deleteAccountSchema` は現状 `{ confirmation }` のみ（`schema.ts:35-37`）→ currentPassword / confirmWord 追加が真に必要。計画の現状認識は正確。
- `dispatchDomainEvent.ts:299` `user.deleted` の fan-out は publication → export の 2 つのみ。`media.*` は `skipped`（L87-90、Issue #159 ADR-003）。note/media に reaction handler 無し → AC-5 / ADR-003 の「ノート本体・メディア実体は purge されない」前提は正確。
- `noteRepository.ts:328` `countByOwner(ownerId, opts?)` は `status?: NoteStatus`（L57）を opt で取れる → AC-4 の `{ status: 'active' }` 指定は実装可能。
- `publicationStateRepository.ts:97` `countPublicByOwner(ownerId)` 存在。`MediaStatus`（`valueObject.ts:75`）= `pending|attached|orphan|deleting` → ADR-002 の attached のみ集計の根拠は正確。
- `SecurityForm/Page.tsx`（P22）は shell が `<SectionErrorBoundary>` + `<Suspense fallback={<FormSkeleton/>}>` で async `SecuritySection` を囲み、section 内で `getContainer()` 経由で usecase を呼び client component に props で渡す構造。AC-8 の参照パターンと完全一致。

## 結論サマリー

1周目の改善提案 S-001〜S-005 はすべて適切に反映され、AC・スコープ・ADR・テスト方針の間の濃淡（順序・observable・集計対象の曖昧さ）が解消された。Issue 本文のスコープ（多段確認 + パスワード再検証 / 削除影響の実データ集計 / 虚偽表示禁止）は AC-1〜AC-8 に過不足なく対応し、モックの全 UI 要素・影響リスト 6 項目も網羅。スコープ外作業の混入も無し。計画が依拠する主要なコード事実はすべて再照合で正確だった。**要件カバレッジ観点の要修正問題はゼロ。** 軽微な改善提案を 1 点のみ挙げる（任意）。

---

## 問題点（要修正）

問題点ゼロ。

（要件カバレッジ・スコープ整合性の観点で、Issue 本文・モック・コメント合意・1周目指摘と計画の間に齟齬・漏れ・スコープ逸脱は検出されなかった。1周目の指摘 S-001〜S-005 はすべて適切に反映されている。）

---

## 改善提案（検討推奨）

- **[S-001]** AC-1 のパスワード検証順序とテスト方針の表現を完全に一致させると尚良い（任意）。
  - 現状: AC-1 は「username を先に判定 … その後にパスワード再検証」と断定。一方、設計 L90 では「username → password 順とする（差分最小）」としつつ、同じ箇所に「（または前）」という揺れた表現が L89 に残っている（「username 一致チェックの後（または前）に verifyPasswordForUser を呼び」）。AC・テスト方針は「後」で確定しているので、設計 L89 の「（または前）」を削除して「後」に一本化すると、3 箇所（AC / 設計 / テスト）の表現が完全一致し実装者の迷いが消える。
  - 理由: 実装ステップ・テストは「username 不一致時はパスワード検証に到達しない」を assert する方針なので、設計本文の「（または前）」だけが順序未確定の名残になっている。実害は無いが、トレーサビリティ上クリーンになる。

---

## 良い点

- **1周目指摘の反映が機械的でなく、根拠まで踏み込んでいる。** 特に S-004（SSO ユーザー論点）は「保留 → 実装フェーズ送り」ではなく、実コード（signUp/adminSignUp の registerPassword 呼び出し、SSO/removePassword を呼ぶ usecase が存在しないこと）を確認して ADR-004 に「現状の不変条件 = 全ユーザーが password を持つ」と結論づけ、将来 SSO 追加時の申し送り（`hasPassword` ポートは既存でフォールバック容易）まで残している。要件カバレッジ（全ユーザーが削除可能か）に直結する論点を計画段階で閉じた点が優れている。
- **AC 表の「由来」列と「対応ステップ」列で双方向トレースが成立している。** Issue 本文・モック・参照 Issue → AC → 実装ステップの紐づけが追え、漏れの検出可能性が高い。
- **虚偽表示禁止（AC-5 / ADR-003）が実装事実に厳密。** `user.deleted` fan-out が publication/export のみで media は skipped という実コードを踏まえ、「ノート本体・メディア実体は即時 purge されない → 『失われる』を断定しない」「公開ノート数は active-only JOIN 由来で微小ズレ → 断定を緩める」と、表示文言を実カスケードに一致させる方針が一貫している。#543 で確立した原則を正しく継承。
- **owner 横断集計の方式選択（ADR-001/002）が「実カスケードとの一致」と「O(1) read」の両基準で正当化されている。** 失効リンクは「全ノートの active リンク」（trashed 含む、`notes.status` で絞らない JOIN）と実挙動に厳密一致させ、案1（public 列挙合算 = 過小カウント = 虚偽表示）を正しく退けている。
- **スコープ「含まれないもの」が明確（purge 追加なし / 他画面流用なし / 別ダイアログ化なし / saved view 件数集計なし / 兄弟 Issue 領域除外）。** スコープクリープのリスクが低い。

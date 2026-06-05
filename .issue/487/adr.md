# ADR — Issue #487: 設定画面のナビゲーション挙動

## ADR-001: サブページの `staleTime: Infinity`（本番）化は mutation 後の invalidate に鮮度を委ねる

### Status
Proposed

### Context
設定サブページ（profile/security/prompts/account-delete）は現状 `staleTime: 0` で、サブナビ遷移のたびに loader（RSC 描画 + DB クエリ）が再実行され体感が遅い。`_app/route.tsx` は本番で `staleTime: Number.POSITIVE_INFINITY` を採用しサブページ遷移時の loader 再実行を抑止している。

サブページはユーザーが編集可能なフォーム（表示時点のサーバー値をプリフィル）を含むため、安直に `staleTime: Infinity` にすると「編集→保存→離脱→再訪」で古いプリフィル値が残る懸念がある。選択肢:

- (A) `staleTime: 0` のまま（毎回再フェッチ・現状維持）
- (B) `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY`（`_app` と同パターン）＋ mutation 後 invalidate に鮮度を委ねる
- (C) 中間的な有限 `staleTime`（例: 数十秒）

### Decision
(B) を採用する。理由:

- 設定フォーム（ProfileForm/SecurityForm/PromptsForm）はいずれも mutation 成功後に `routerInvalidate(router)`（Profile は Header 更新のため `router.invalidate()`）を呼んでおり、invalidate は `staleTime` に関係なく対象 leaf loader を再実行する。したがって「編集直後のデータが古いまま残る」事象は発生しない。
- `account-delete` は削除後ログアウト遷移するため鮮度問題が原理的に存在しない。
- `_app/route.tsx` と完全に同じ `import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` パターンに揃えることで、DEV では HMR の鮮度を維持しつつ本番でのみキャッシュ最適化が効き、プロジェクト内の既存方針と一貫する。
- (C) の有限 staleTime は「いつ消えるか」の閾値設計が恣意的になり、invalidate で十分担保できるため不要。

補足: メールアドレス変更だけは確定が別ルート（メールリンク経由の `app/components/auth/EmailChangeConfirm`）で起きるが、当該経路は `router.invalidate()`（フィルタ無しの全 invalidate）を呼び、かつ確定後 `/login` へ遷移するため、security ページに古い `user.email` が残るエッジケースも発生しない。

### Consequences
- 良い点: 本番でサブページ間 SPA 遷移がキャッシュヒットし即時化。既存の `_app` 最適化パターンと統一され認知負荷が低い。
- トレードオフ: 鮮度担保が「mutation 経路が invalidate を呼ぶ」という不変条件に依存する。将来サブページに invalidate を呼ばない新たな更新経路を足す場合は、この前提を再確認する必要がある（実装時点では全 mutation 経路が invalidate 済みであることを確認）。

---

## ADR-002: `loadInstancePromptDefaults()` のクエリ単位キャッシュは追加しない

### Status
Proposed

### Context
Issue の対応方針案に「`loadInstancePromptDefaults()` 等の不変寄りデータにキャッシュを検討」とある。prompts ページは `loadInstancePromptDefaults()` + `loadUserPromptOverride()` の2クエリを実行し、特に重い。選択肢:

- (A) サブページ全体の `staleTime: Infinity`（ADR-001）に加え、`loadInstancePromptDefaults()` にクエリ単位の永続キャッシュ層を別途追加
- (B) クエリ単位キャッシュは追加せず、`staleTime` 化のみで対応

### Decision
(B) を採用する。理由:

- ADR-001 の `staleTime: Infinity`（本番）により、prompts ルートの loader（= 2クエリを含む RSC 全体）は初回ロード後キャッシュされ、サブページ遷移では再実行されない。本Issueの目的である「サブページ切り替えの体感改善」はこれで達成される。
- クエリ単位の独立キャッシュは、キャッシュ無効化のタイミング設計（インスタンスのプロンプトデフォルト更新時にどう破棄するか）という新たな複雑性を持ち込む。本Issueの体感改善目的に対しては過剰最適化（premature optimization）。
- 必要が生じれば独立Issueとして別途扱える（スコープ分離）。

### Consequences
- 良い点: 変更が `staleTime` の1行修正×4ファイル＋index追加に収まり、レビュー容易性とリスクが最小化される。キャッシュ無効化の複雑性を持ち込まない。
- トレードオフ: 設定画面を離れて再訪した直後（本番で `_app` 含むキャッシュが効かない初回など）の prompts 初回ロードは依然2クエリ。ただしこれは本Issueの主訴（サブページ間切り替え）ではなく、許容する。

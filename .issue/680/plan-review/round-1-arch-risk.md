# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #680）

**レビュー視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/680/plan.md` / `.issue/680/adr.md`
**日付:** 2026-06-13

---

#### 問題点（要修正）

- **[P-001]** `/admin/prompts` の対象フィールドの記述が実コードと食い違う（`<textarea>`×2 ではなく `<textarea>`×1 + `<input>`×1）
  - 理由: plan ステップ5・調査結果（plan L42）・ADR-001 適用範囲（adr.md L43）・AC-3 はいずれも「`<textarea>`（text / variables）」「`<textarea>`×2」と書くが、実装（`app/components/admin/PromptsForm/index.tsx`）では `text` は `<textarea>`（L189-197）、`variables` は `<input type="text">`（L211-219）。フィールド型を誤認したまま実装すると、`variables` 入力（カンマ区切りプレースホルダ）の focus/caret 復元が漏れる、または「textarea 専用」と誤って実装する恐れがある。AC-3 の検証文言も `<textarea>×2` を前提にしており、実機検証で variables 側の確認が抜ける。
  - 提案: plan L19・L42・L107、adr.md L43 を「text は `<textarea>`、variables は `<input type="text">`」に修正。新規フックが `HTMLInputElement | HTMLTextAreaElement` 両対応である点（plan L84 で既に両対応と明記）と矛盾しないので、フック設計自体は変更不要。ステップ5の配線対象を「2フィールド（textarea + input）」と明示し、AC-3 の検証も両フィールドで行う。

- **[P-002]** 「直前に当該要素が focus を持っていた」判定の実装機序が、`useRovingMenu` 前例と非対称で、実機検証なしには成立性が読めない
  - 理由: ADR-001（adr.md L40）は「直前 focus の追跡は `onFocus`/`onBlur` ではなく、各コミット直前に `activeElement` を観測して記録する方式」とするが、フックの本体は「毎コミット後に走る `useEffect`（dep なし）」（plan L81-83）。React の commit phase では `useEffect` は**コミット後（paint 後の非同期）**に走るため、「各コミット直前に activeElement を観測」する正規のフックポイントが無い（`useLayoutEffect` のクリーンアップでも次コミット直前ではなく前コミットの effect 破棄時）。`useRovingMenu` は `activeIndex`（caller 所有の論理 state）を保持するだけで「直前に DOM focus があったか」を時間軸で追う必要がなかったが、本フックは「invalidate コミットで body に落ちた直後」と「ユーザーが自分で blur した直後」を区別するため、focus 喪失**前**の selection スナップショットが必要になる。この退避タイミング（plan L82 step1「当該要素が現在 focus を持っているなら退避」）が「focus がまだ body に落ちる前の commit effect」で取れる保証はコードからは読めない。`useEffect` が走る時点で既に activeElement が body に落ちていれば、退避フェーズ自体がスキップされ復元ソースが空になる。
  - 提案: 退避を `useEffect`（コミット後）ではなく `onSelect`/`onKeyUp`/`onMouseUp` などの**ユーザー操作イベント時に selection を ref へ随時記録**する方式（focus 中は常に最新 caret を ref に持つ）に改める案を検討し、ADR に退避経路を明示する。あるいは「focus 中は毎コミット後 effect の先頭で（まだ自要素が activeElement のうちに）退避 → 同じ effect 内で body 判定して復元」という単一 effect の順序保証が成り立つかをステップ7の実機検証の**前**に、ステップ2の設計時点で擬似コードレベルで確定させる。現状の plan/ADR は退避と復元を同一 effect に同居させているが、invalidate コミットでは「focus が落ちるコミット」と「effect が走るコミット」が同一のため、effect 実行時には既に body へ落ちている可能性が高く、退避が間に合わない懸念がある。これは AC-2/3/4 の caret 復元（focus は戻っても caret 位置が末尾へ飛ぶのを防ぐ）の成否を直接左右する核心。

---

#### 改善提案（検討推奨）

- **[S-001]** ステップ7（必須実機ゲート）に「caret スナップショットが復元ソースとして実際に保持されていたか」を観測項目として明示する
  - 理由: plan L121 は「focus と caret 位置が保持される」を確認するとあるが、P-002 の退避タイミング懸念があるため、「復元が走ったが caret は退避できておらず末尾に飛んだ」ケースを「成功」と誤判定しないよう、退避値の有無・復元後の `selectionStart/End` 実測を before/after で記録する観測手順を testing.md に書くべき。#670 Step 0 の観測精度（DOM ノード同一性まで確認）に倣う。

- **[S-002]** `useRovingMenu` の `preventScroll: true` と clamped index の知見を、フック JSDoc に引き継ぐ根拠として明記する
  - 理由: plan L83/L85 は `el.focus({ preventScroll: true })` を採るとあり妥当。ただし `useRovingMenu` L116-120 が `preventScroll` を採った理由（復元がユーザースクロールと競合してリストが飛ぶ）はフォーム入力でも同様に効くので、WHY を JSDoc に残す前例として参照する旨を ADR-002 に1行加えると、後続の保守者が「なぜ preventScroll か」を辿れる。フック新設方針（共通フック化）自体は妥当。

- **[S-003]** IME（composition）中の `setSelectionRange` リスクを、ステップ7の「軽く確認」より一段具体化する
  - 理由: plan L144 は「`setSelectionRange` が composition を壊さないか実機で軽く確認」とあるが、IME 変換中（`compositionstart`〜`compositionend` 間）に `focus()` + `setSelectionRange()` を呼ぶと変換セッションが中断され未確定文字が確定/消失する実害があり得る。日本語入力が主言語の本プロジェクトでは無視できない。`isConnected` ガード（plan L84）と同様に、composition 中は復元をスキップする（`compositionend` まで保留 or 早期 return）ガードを設計段階で検討項目に格上げすると良い。少なくとも「IME 中は復元しない」を許容仕様とするか、保留して復元するかをステップ2で決めておくと実機で迷わない。

- **[S-004]** 「ユーザーが意図的に focus を外した」競合ガードのテストケースに、`window` blur（タブ切替）ケースを追加する
  - 理由: plan ステップ3（L93-94）は「別要素へ focus を移した」ケースを pin するが、`useRovingMenu` L101-103 が明示的に対処している「window blur 時は activeElement が要素のまま（body にならない）」ケースと、「タブ非アクティブ中に invalidate が走り、復帰時に body へ復元が誘発される」ケースの差は jsdom で再現困難ながら設計上の盲点になりやすい。`activeElement === body` ガードがこのケースをどう扱うかを ADR の Consequences に1行残すと、トレードオフ（plan L142 / adr.md L48）の記述と整合する。

---

#### 良い点

- **アプローチ選定が前例駆動で堅実。** ADR-001 が `useRovingMenu.restoreFocusOnCommit`（#467）という**プロジェクト内の同一機序の実働前例**を根拠に「コミット後 focus 復元」を選び、描画構造見直し（framework 内部挙動への介入）と invalidate 抑制（最新値再表示の退行）を明確な理由で却下している。CLAUDE.md「cross-cutting concern はフック/ポートに集約」「ステートレス志向」とも整合。

- **置き場所・命名・配置の規約適合が正しい。** 新規フックを `app/components/common/`（`useRovingMenu` / `routerInvalidate` / `useAuthGuardEffect` / `usePopover` と同列）に置き、`"use client"`・library-level JSDoc で WHY を残す方針は、既存共通フック群の慣行とCLAUDE.mdフロントエンド規約に完全に沿っている。invalidate トリガー（UploadDialog）側に置かず「focus を失う当事者側」に置く判断（ADR-001 L36-40）は関心の分離として正当で、Issue が指摘した「トリガーが遠い」設計課題への回答として的確。

- **不確実性に対する実機検証ゲートの設置が適切。** 核心リスク（コミット後 useEffect が detach→再 attach に確実に後続するか）を ADR-003 で明示的に切り出し、ステップ7を「必須ゲート」とし、#670 Step 0 の検証手法（`window.__TSR_ROUTER__.invalidate({filter})` で本命経路を忠実再現・focus を動かさず観測・before/after）を踏襲。万一フックで解決しない場合のフォールバック（描画構造見直し）も残課題として記録しており、検証文化の踏襲として模範的。

- **スコープ管理が #670 の結論と厳密に整合。** 「入力 value 保持（no-repro 済）」「再マウント耐性（守る state なし）」「invalidate 抑制（最新値再表示を壊す）」を #670 ADR-003 を根拠に明確に除外。Dialog 系（ViewFormDialog / IngestionPreviewForm）も #670 ADR-002 の整理を引いてスコープ外とし、別の描画構造（portal + focus-trap）であることを理由に挙げており、スコープ膨張を正しく抑えている。AC が全て #670 実測または Issue 本文に紐付いており、根拠なきゲートが無い。

- **退行防止（AC-6）の担保が構造的。** invalidate 経路（UploadDialog / routerInvalidate）に一切触れず、発生源非依存でコミット後に局所復元する設計のため、「自分の保存 → invalidate → 最新値再表示」の既存挙動を構造的に壊さない。focus はブラウザ副作用でビジネスロジックではない、という層判断（plan L51-61: ドメイン/ユースケース/アダプター影響なし）も正しい。

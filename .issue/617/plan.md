# 実装計画 — Issue #617: 公開検索画面（P32）がデザインモックと乖離している

**Issue:** #617
**作成日:** 2026-06-10
**複雑度:** 中〜大規模

---

## 目的

公開検索画面（/search, P32）の実装をデザインモック（`spec/design/pages/P32-public-search.html` / `spec/design/pages/mobile/P32-public-search.html`）に整合させる。ただし対象は「フロントだけで吸収できる乖離」に限定し、バックエンド拡張を要する項目（更新日時・キーワードハイライト）は別Issueに分離する。確定済み方針として「検索」送信ボタン（ADR-004）は維持し、⌘Kヒントはモック側を実装に合わせて更新する。

## スコープ

### 含まれるもの
1. ヒーローの検索バー視覚をモックに合わせる: `bg-surface` + 枠線なし、フォーカス時 `bg-surface-hover`、高さ 56px(PC)/48px(モバイル)。送信ボタン（ADR-004）は維持し、surface 背景上での可読性を担保する。
2. ヒーローのレイアウトをモックに合わせる: 中央寄せ（`text-center` / `mx-auto` / `max-w-[720px]`）、padding 64px 0 24px（PC）/ 36px 0 16px（モバイル）、フォームも `mx-auto`。
3. 検索結果カードの要素順とタグ表現をモックに合わせる: 要素順を「タイトル → スニペット → 著者+タグメタ（下部）」に変更。タグは accent 色のドット区切り（`.tag` 相当）に変更。
4. ソート表示の見た目整合: モックの `.sort-btn` に合わせるか、読み取り専用ラベルとして据え置くかを設計判断で決定（chevron-down の誤示唆リスクを考慮）。
5. デザインモック更新: PC/モバイル両モックの `.kbd`（⌘K）を「検索」ボタンの記述に差し替える。

### 含まれないもの（別Issue化）
- **更新日時の表示**: `SearchHitDTO`（`app/core/application/dto/search.ts`）に日付フィールドが無い。`OwnedSearchHitDTO` は `updatedAt` を持つが、これは home/note-list 向けに DB 行から解決した別 projection。public 検索ヒットへ日付を載せるには `SearchHitDTO` / 検索インデックス projection / `toSearchHitDTO` の拡張が必要なため**スコープ外**。Phase 4 で別Issueとして起票する。
- **キーワードハイライト（`<mark>`）**: マッチ位置データが検索インデックス／DTO から来ないため**スコープ外**。同上の別Issueに含める。
- これらに伴い、モックにある「右列の更新日時（grid 1fr auto の右カラム）」も今回は実装しない。日付列が無いことを前提にカードを単カラムにするか grid を維持するかは「設計判断」で決定する。

## 実装ステップ

### Step 1: ヒーロー検索バーの視覚をモックに合わせる

- **対象ファイル:** `app/components/public/styles.ts`（`SEARCH_FORM_INPUT`）
- **変更内容:**
  - 背景: `bg-bg` → `bg-surface`
  - 枠線: `border border-hairline` を削除（モックは `border:none`）
  - フォーカス: `focus:border-hairline-strong` を削除し `focus:bg-surface-hover` を追加。`focus:shadow-focus` はモック（`box-shadow: var(--shadow-focus)`）と一致するため維持。
  - 高さ: `h-12`(48px) → `h-14`(56px)、モバイルは `max-sm:h-12`(48px)。
  - 左 padding `pl-12`(48px): モック PC は 54px・モバイル 46px。`pl-[54px] max-sm:pl-[46px]` に寄せる（標準スケールに該当値が無いため任意値で妥当 — 既存 `PUBLIC_HEADER_SEARCH_INPUT` の `pl-[38px]` と同様）。
  - アイコン位置（`SEARCH_FORM_ICON`）: モックは PC `left: 22px` / モバイル `left: 18px`。現状 `left-[18px]` 固定を `left-[22px] max-sm:left-[18px]` に直し、padding 拡大と整合させる（レビュー [P-002] 反映）。
  - フォントサイズ: `text-[15px]` → **`text-md` トークン採用**。モックは `--text-md` で、`text-md` トークンが `@theme inline` 経由で利用可能なため、トークン規約（CLAUDE.md「Design tokens … bridged into Tailwind utilities」）に従いトークンへ寄せる（任意値 padding はトークン非存在ゆえ任意値、font はトークン存在ゆえトークン、と理由を分ける）。
- **理由:** モック乖離 #1 の解消。`bg-surface` + 枠線なし + focus surface-hover はトークン経由で表現でき、CLAUDE.md の utility-first / トークン規約に沿う。

### Step 2: 送信ボタンの可読性を surface 背景上で担保する

- **対象ファイル:** `app/components/public/styles.ts`（`SEARCH_FORM_BUTTON`）、必要なら `PublicSearch.tsx`
- **変更内容:** 現状の `SEARCH_FORM_BUTTON = ${pillBtn} ${pillBtnPrimary} absolute right-1.5 top-1/2 -translate-y-1/2`（accent 塗り）は維持。ADR-004 の中央寄せ配置（`top-1/2 -translate-y-1/2`）を維持し、input 高さが h-14(56px) に増えても中央配置で破綻しないことを確認。右オフセット `right-1.5` と input 右 padding がボタン幅に対して十分かをブラウザで確認。
- **理由:** ADR-004（中央寄せ）を壊さず、surface 背景化に伴う可読性・収まりを検証する。

### Step 3: ヒーローのレイアウトを中央寄せ・モック余白に合わせる

- **対象ファイル:** `app/components/public/styles.ts`（`SEARCH_HERO`, `SEARCH_FORM`）
- **変更内容:**
  - `SEARCH_HERO`: `py-12 pb-6 text-left` → `max-w-[720px] mx-auto text-center pt-16 pb-6 max-sm:pt-9 max-sm:pb-4`
    - PC: padding 64px 0 24px = `pt-16 pb-6`（左右は `PUBLIC_MAIN` 側で確保）。
    - モバイル: padding 36px 0 16px = `max-sm:pt-9 max-sm:pb-4`。
  - `SEARCH_FORM`: `relative max-w-[640px]` → `relative max-w-[640px] mx-auto`。
  - `hero-sub` のモバイル margin 差（24px → 20px）は軽微なので据え置き可（必要なら `max-sm:mb-5`）。
- **理由:** モック乖離 #2 の解消。`max-sm:` パターン（CLAUDE.md 規約）で PC/モバイル差を表現。

### Step 4: 検索結果カードの要素順・タグ表現をモックに合わせる

- **対象ファイル:** `app/components/public/PublicSearch.tsx`（hits.map 内の `<Link>`）、`app/components/public/styles.ts`（`SEARCH_HIT_*`）
- **変更内容:**
  - **要素順**（現状: 著者(上) → タイトル → スニペット → タグメタ）→（モック: タイトル → スニペット → メタ行）。JSX を並べ替え、著者ブロックをメタ行内へ移す。
  - **メタ行の DOM 構造（モック `P32-public-search.html:922-926` 準拠）**: メタ行は順に「著者 span（avatar-mini + `@username`、`text-ink-secondary`）→ ドット `<span className="text-hairline-strong">·</span>` → タグ span（`text-accent`）」とする。**ドットは著者ブロックとタグ群の境界に1個だけ**置く（タグ同士の区切りではない）。日付が無いため著者は常に在り、ドットは常に表示でよい。参照は P30 の `TILE_META`（ドット有パターン）に限定する（`NOTE_META` はドット無しの別系統なので参照しない）。
  - **タグ表現**: 現状ロジック `hit.tagNames.map((t) => "#"+t).join(" ")` は P30 `NOTE_TAGS` と同じ「1 span スペース連結」で、ロジックはモックと既に一致している。**変えるのは span の色だけ**（`text-ink-tertiary` → `text-accent`）。タグ同士をドットで区切るのではない（レビュー [P-001]/[P-002] 反映）。
  - **フォントサイズ（S-001 反映・確定）**: モック準拠で `SEARCH_HIT_META`・`SEARCH_HIT_AUTHOR` を `text-xs` → `text-sm`（モック `.result-meta`/`.result-author` は `--text-sm`）。avatar は `text-[8px]` → `text-[9px]`（モック `font-size:9px`）に寄せる。
  - avatar は既存 `AUTHOR_AVATAR` / `avatarInitials` を流用。
- **理由:** モック乖離 #3 のうちフロントで吸収できる項目（要素順・タグ表現）を解消。更新日時の右列・`<mark>` はデータ不在のため載せない。

### Step 5: カードを grid 化するか単カラムのままにするか（設計判断 → ADR-001）

- **対象ファイル:** `app/components/public/styles.ts`（`SEARCH_HIT_ROW` ほか）
- **変更内容:** 日付データが無いため右列（auto 列）は空になる。**単カラム**で実装する（ADR-001）。`SEARCH_HIT_ROW` を `flex flex-col gap-1` 化（または `.result-main` 相当の縦 flex を内側に置く）。padding はモック値（PC `py-5 px-3` / モバイル `max-sm:py-4 max-sm:px-2`）。別Issue で日付を載せる際に P30 `NOTE_ROW` 同型へ grid 化する。
- **理由:** モック乖離 #3 の構造選択。無駄な grid を持ち込まず、別Issue 着手時に拡張できる形にする。

### Step 6: ソート表示の見た目を整合させる（設計判断 → ADR-002）

- **対象ファイル:** `app/components/public/styles.ts`（`SORT_LABEL`）、必要なら `PublicSearch.tsx`
- **変更内容:** chevron-down は付けず、読み取り専用 `<span>`（`SORT_LABEL`）を維持する（ADR-002）。ソートは relevance 固定でトグル不能なため、chevron は誤った操作可能性を示唆する。見た目整合はラベル位置・色・余白の範囲に留める。
- **完了条件3の達成基準（S-001 反映・確定）**: 「chevron 無し ＋ 色・余白・配置をモックに寄せた状態」をもって完了条件3「ソート表示の見た目が整合」を満たすものとする。
- **理由:** モック乖離 #4。見た目整合とアクセシビリティのトレードオフを ADR に記録。

### Step 7: デザインモックを実装に合わせて更新（⌘K → 「検索」ボタン）

- **対象ファイル:** `spec/design/pages/P32-public-search.html`、`spec/design/pages/mobile/P32-public-search.html`
- **変更内容:** PC モックの `.hero-search` 内の `<span class="kbd">⌘ K</span>` を削除し、accent pill の「検索」送信ボタン（surface input 上に中央寄せ配置）を記述。`.kbd` の CSS 定義と `@media` の `display:none` も整理。モバイルモックも整合のためボタン記述へ統一。
- **ソート chevron の申し送り（S-002 反映）**: 今回のモック更新は ⌘K→ボタンに限定する。モック内の `.sort-btn`（chevron 付き）は実装（chevron 無し span, ADR-002）と意図的に差分が残る。この差分は ADR-002 由来の意図的なものである旨を PR に明記し、後続 spec-sync の誤検知への申し送りとする（モック側の固定ラベル化は将来検討）。
- **理由:** 確定方針「⌘Kヒント → 検索ボタンの記述に直す」。モックと実装の双方向整合を保ち、後続のデザインレビュー／spec-sync の誤検知を防ぐ。

### Step 8: 検証

- `pnpm build` でユーティリティ生成・CSS カスケード順を確認（特に `h-14`/`max-sm:h-12`、`SEARCH_FORM_BUTTON` の中央寄せが input 内に収まるか）。
- ブラウザで PC/モバイル幅を確認: ヒーロー中央寄せ・surface 検索バー・focus surface-hover・送信ボタン可読性・カード要素順・タグ accent ドット区切り・ソートラベル。
- モック HTML を直接ブラウザで開き、更新後（ボタン版）の見た目が実装と一致することを確認。

## 設計判断

詳細は `.issue/617/adr.md` を参照。要点:
- **ADR-001:** 検索結果カードは grid 化せず単カラムで実装（日付データ不在のため auto 列が無意味）。別Issue で日付実装時に P30 `NOTE_ROW` 同型へ grid 化する。
- **ADR-002:** ソートラベルに chevron-down を付けない（relevance 固定でトグル不能。chevron は操作可能性を誤示唆）。読み取り専用 `<span>` を維持。
- **ADR-003:** 検索バー surface 化後も送信ボタンは `data-primary`（accent 塗り）を維持。accent は surface 上で十分なコントラストを持つため配色変更不要。ADR-004（#417）の中央寄せ配置を維持。

## リスクと注意点

- **CSS カスケード順（#416 ADR-005）:** `SEARCH_FORM_INPUT` の高さを `h-14` + `max-sm:h-12` とする。`max-sm:` の縮小（56→48px）が `h-14` を正しく上書きするか `pnpm build` の生成 CSS で確認する。
- **送信ボタンの収まり（ADR-004 継承）:** input 高さ変更に伴い、中央寄せボタンが上下に収まるか・右オフセットが適切かをモバイル幅（min-h 44px 発火時）で確認する。
- **text-md トークン採用の判断:** input フォントを `text-[15px]` 据え置きか `text-md`（clamp 上限 17px）に寄せるか。最小差分 vs トークン規約一貫性のトレードオフ。レビューで決定。
- **メタ行サイズ変更:** `SEARCH_HIT_META` を `text-xs` → `text-sm`（モック準拠）にすると見た目が変わる。P30 と揃うが、視覚変化として認識しておく。
- **モック更新の波及:** Step 7 でモックを書き換えると、過去のデザインレビュー成果物との差分が生じる。確定方針に基づく意図的変更である旨をコミット／PR に明記する。
- **別Issue 起票（Phase 4）:** 更新日時・キーワードハイライトのバックエンド拡張（`SearchHitDTO` / 検索インデックス projection / `toSearchHitDTO` / カードの grid 化 + 右列日付 + `<mark>`）を独立 Issue として起票する。

## テスト方針

- **ビルド:** `pnpm typecheck && pnpm build` で型・生成 CSS を通す。
- **目視（PC/モバイル）:** ヒーロー中央寄せ・余白（64/24、36/16）、検索バー surface + 枠線なし + focus surface-hover + 高さ 56/48、送信ボタン可読性・収まり、カード要素順（タイトル → スニペット → 著者+タグ）、タグ accent ドット区切り、ソートラベル整合。
- **回帰確認:** ADR-004 の中央寄せが壊れていないこと、`hasKeyword` 分岐・空状態・ページネーションが従来どおり動くこと。
- **モック整合:** 更新後の P32 モック（ボタン版）を実装と並べて差分が方針どおりであることを確認。

## 残る論点（実装/検証で確認）

- `max-sm:h-12`（56→48px の縮小方向 variant）が CSS カスケード順で `h-14` を正しく上書きするかの `pnpm build` 実測確認（`max-sm:` はメディアクエリ修飾ルールで base より後に出るため通常勝つが、過信せず実測する）。
- input 高さ拡大後の送信ボタンの収まり・右オフセットのブラウザ確認（ADR-004 継承）。

> 計画レビューで「論点」だった以下は確定済み: input フォント → `text-md` トークン採用（Step 1）／メタ行 `text-xs` → `text-sm`（Step 4）／ソート chevron 不採用を完了条件3の達成基準として確定（Step 6）。

## レビュー履歴

### 1周目（2視点並列: 要件カバレッジ / アーキ・リスク）

**修正した点（両視点とも同じ核心を指摘 → 1件に統合）**:
- [P-001/P-002] メタ行の DOM 構造とタグ／ドット表現を精密化。タグは「1 span スペース連結（`join(" ")`）の色だけ `text-accent` 化」、ドット（`text-hairline-strong` の `·`）は「著者ブロックとタグ群の境界に1個」と Step 4 に明文化。参照を P30 `TILE_META`（ドット有）に限定（`NOTE_META` のドット無し系統と取り違えない）。
- [P-002（要件視点）] 検索アイコン left を PC 22px / モバイル 18px（`left-[22px] max-sm:left-[18px]`）に整合させる旨を Step 1 に追記。

**取り込んだ改善提案**:
- [S-001] メタ行フォント `text-xs` → `text-sm`、avatar `text-[8px]` → `text-[9px]` をモック準拠の必須項目として Step 4 に確定。
- [S-002（アーキ視点）] input フォントを `text-md` トークン採用に確定（padding は任意値、font はトークン、と使い分けの理由を明記）。
- [S-001（要件視点）] ソート完了条件3の達成基準（chevron 無し＋色・余白・配置整合）を Step 6 に確定。
- [S-002（要件視点）] ソート chevron のモック据え置き（ADR-002 由来の意図的差分）を Step 7 に申し送りとして追記。

**見送った提案とその理由**:
- [S-003（アーキ視点）] `:first-child { border-top:none }` 相当の扱いは別Issue（grid 化）時に P30 と統一する案 → 今回スコープ外（P30 も未対応）。別Issue 起票時の検討事項として留意するに留め、plan 本体には取り込まない。

両視点とも、修正必須は上記メタ行構造の精密化に集約。スコープ分離・カスケード順リスク認識・ADR-004 継承は両視点とも「良い点」として高評価。

# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク (Issue #762)

レビュー観点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**

2周目。1周目（P-001/P-002/P-003、S-001/S-002/S-003）の反映を確認しつつ、ゼロベースで再検証した。

## 1周目指摘の反映状況（実コードと突き合わせて確認）

- **arch P-001（ホワイトスペース正規化規則の明文化）→ 解消。** plan「設計」1 と ADR-001 に「block コンテナで子が全て block/whitespace-only TEXT のときのみ整形空白を挿入/除去」「inline を含むコンテナ内部テキストは触らない」「`<pre>`/`<code>`/`<textarea>` は whitespace-significant」「タグ集合はサニタイザの `BLOCK_TAGS`/`INLINE_TAGS` を SSOT 共有 or lockstep JSDoc」の4規則が固定された。サニタイザ側にも実際に `BLOCK_TAGS`/`INLINE_TAGS` が存在し（`htmlSanitizer.ts` L81-127）、共有/lockstep 戦略は実在の集合に紐づいていて実現可能。
- **arch P-002（初期 htmlDraft seed の二重定義）→ 概ね解消。** plan「設計」2 と ADR-003 で「初期値 `""`、`setMode("html")` 遷移時のみ整形に一本化」と明記。`createInitialEditorState` が `new→wysiwyg`/`edit→inline`（L206）で html 始まりが無いことも実コードで確認。ただしステップ2の本文に旧記述が残存（下記 P-001）。
- **arch P-003（手動保存が snapshotForSubmit を通らない）→ 解消。** 現状 `onSubmit`（NoteEditor.tsx L311-366）が `contentHtml: state.contentHtml` を `createNote`（L327）/`saveNote`（L342）へ直送し、`frontMatterJson`（L314）/`tagNames`（L315）を別途組み立てている事実を実コードで確認。plan「設計」4 と ステップ4で「`onSubmit` を `snapshotForSubmit` 経由に作り変え、両分岐を `snap` 由来に揃える」と明示され、手動・自動が同一スナップショットルールを通る設計に統一された。
- **coverage P-001（MediaUploader の html 挿入整合）→ 解消。** 現状 html 分岐が `MediaUploader contentHtml={state.contentHtml}`（L471）・`onMediaInsert` が `setContent`（L205）である事実を確認。plan「設計」4で入口 prop=`htmlDraft`／出口 dispatch=`setHtmlDraft`、inline/wysiwyg は `contentHtml` のまま据え置き、と両側＋スコープ境界が明示された。
- **S-001（自作再帰シリアライザ確定）→ 反映。** ADR-001 Decision で walkSync 破壊変形を退け再帰シリアライザに確定。
- **S-002（`minifyHtml(formatHtml(m)) === m` 等式テスト）→ 反映。** テスト方針に等式と「編集を挟んだ inline→html→inline 往復」ケースの格上げが入った。
- **S-003（reducer の ultrahtml 間接化）→ 反映。** ADR-003 に「reducer は `ultrahtml` を直接 import せず `htmlFormat.ts` 越し」、AC-1 に「初期 html マウントの整形なしは設計どおり」検証メモが入った。

実コード（`editorState.ts`/`htmlSanitizer.ts`/`NoteEditor.tsx`/`useAutosave.ts`/`MediaUploader.tsx`）と ultrahtml の export（`parse`/`walkSync`/`renderSync` 実在、`d.ts` L50/69/70）を突き合わせ、plan が参照する行番号・構造はすべて正確だった。

---

#### 問題点（要修正）

- **[P-001]** plan ステップ2 の変更内容に、解消したはずの旧 P-002 記述が**化石として残存**している。
  - 理由: ステップ2（plan L128）に「`createInitialEditorState` で初期 `htmlDraft` を整形して seed（surface=edit が html で開くケースは無いが、html 遷移時の整形で担保）」という一文が残っている。これは「設計」セクション2（L91）および ADR-003（「初期値は `""`、seed しない」）と**真っ向から矛盾**する。1周目 P-002 で「初期 seed と html 遷移時整形の二重定義を廃し後者に一本化」と合意したのに、実装ステップという「実装者が直接参照する箇所」に二重定義の片割れが生き残っており、実装者が seed コードを書いてしまう余地がある。これは些細な文言ではなく、二重状態同期の不変条件（どちらが真実か）の発生源そのもの。
  - 提案: ステップ2 L128 の「`createInitialEditorState` で初期 `htmlDraft` を整形して seed（…）」を削除し、「`htmlDraft` の初期値は `""`。`setMode("html")` 遷移時にのみ `formatHtml(contentHtml)` で畳む（初期 seed しない）」へ書き換えて、設計セクション2・ADR-003 と完全に一致させる。

#### 改善提案（検討推奨）

- **[S-001]** html→wysiwyg 遷移時の「minify 確定」と「decoration-loss 検出」の**実行順序**を plan で固定すべき。
  - 理由: `onModeChange`（NoteEditor.tsx L262-264）は `surface==="edit" && nextMode==="wysiwyg"` のとき `detectUnsupportedTags(latest.contentHtml)` を `contentHtml` に対して走らせ、`lostTags.length>0` なら `setMode` を**しないで** ConfirmDialog を出す。本 Issue では html タブ編集中の真実は `htmlDraft` で `contentHtml` は stale になり得る。html タブで `<section>` 等の TipTap 非対応タグを書いて wysiwyg に移ると、(a) detect が stale な `contentHtml` を見て検出漏れ→そのまま wysiwyg でフラット化、または (b) `confirmWysiwygSwitch`（L274-296）が `setMode("wysiwyg")` だけ dispatch して `htmlDraft`→`contentHtml` の minify 確定をスキップ→html 編集が捨てられる、のどちらかが起きうる。plan のリスク欄は「`onModeChange` の全分岐で同期を保証」「unsaved-confirm/decoration-warning の既存ゲートと干渉しない順序」と**問題意識は持っている**が、html→wysiwyg の具体的な順序（= 「離脱時に先に `minifyHtml(htmlDraft)→contentHtml` を確定 → その確定済み `contentHtml` で detect → ConfirmDialog 経由でも確定済みを使う」）を1行で固定しておくと実装漏れを防げる。`confirmWysiwygSwitch` 側にも同期 dispatch を通す必要がある点も明記推奨。
  - 補足: これは新規バグではなく、ADR-003 が選んだ「派生フィールド分離」が必然的に生む同期点。リスク欄の自認を実装ステップ4の手順に落とすだけで足りる。

- **[S-002]** `setHtmlDraft` が立てる dirty キーを plan で `"content"` と明示しておくと安全。
  - 理由: plan ステップ2 は「`setHtmlDraft`（dirty=content を立てる）」と書いているが、`DirtyKey` 型（editorState.ts L78-83）に `"content"` はあるものの `htmlDraft` 用の新キーは無い。html タブ編集を `content` dirty に乗せるのは自動保存ゲート（`shouldFlushAutosave`）と既存の dirty 集合運用に整合し正しい選択。ただし `htmlDraft` を更新しても `contentHtml` 本体は変わらない設計なので、autosave 経路が「`contentHtml` 変化なし＝snapshot useMemo が再計算されない」とならないよう、useMemo 依存に `htmlDraft`/`mode` を足す（plan「設計」4 で明記済み）こととの整合を、テスト「`setHtmlDraft` 後の `snapshotForSubmit` が `minifyHtml` 済み」で機械的に押さえる方針は妥当。明示は文書化の念押しレベル。

#### 良い点

- 1周目の3つの P がいずれも設計セクション・ADR・実装ステップ・テスト方針に多層で反映され、各反映箇所が実コードの行番号・構造と正確に一致している。特に P-003（手動保存の snapshotForSubmit 一本化）は、`onSubmit` が現状 `frontMatterJson`/`tagNames`/`contentHtml` を三者三様に組み立てている実態（L314/L315/L327）を正しく捉え、`snap` 由来へ揃える指示まで具体化されている。
- ADR-002（adapter 層に置かない）は、`htmlSanitizer.ts` が「単一外部リソース＋ドライバエラー翻訳（`SystemError` への翻訳、L363-369/L384-390）」という adapter の定義に忠実な実装であることと対照して妥当。クライアント表示整形はその責務に属さないという切り分けが CLAUDE.md のレイヤー定義と整合。
- ADR-001 の「サーバと同一の `ultrahtml` パーサ/直列化器を使い minified 表現を揃える」判断は、サニタイザが実際に `parse→renderSync`（L375-381）で minified を出している事実に裏打ちされ、`minifyHtml(formatHtml(m))===m` の `m` をサニタイザ出力フィクスチャに揃えるテスト方針がラウンドトリップ等価をサーバ往復まで含めて担保できる。
- `BLOCK_TAGS`/`INLINE_TAGS` の SSOT 共有/lockstep 方針が、実在する集合（L81-127）に紐づいており空論でない。`wysiwygUnsupportedTags.ts` の手動キュレーション前例に倣う点も既存方針と一貫。
- リスク欄が「二重状態同期」「自動保存 useMemo 依存追加忘れ」「モード往復の minify 確定取りこぼし」を自認しており、本レビューの P-001/S-001 と問題意識が一致。plan 自身が弱点を把握している。

---

**総括:** 1周目の指摘は設計・ADR・テスト方針レベルで適切に解消済み。残る要修正は実装ステップに化石として残った旧記述（P-001）の1点のみで、これは文言修正で足りる。S-001/S-002 は実装漏れ予防の念押しで、設計の妥当性自体は揺るがない。自作再帰シリアライザの実現可能性・reducer 純粋性・二重状態同期は十分手当てされている。

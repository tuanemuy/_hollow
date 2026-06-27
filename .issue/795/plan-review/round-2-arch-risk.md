# Round 2 レビュー — アーキテクチャ整合性 / 実現可能性 / リスク（Issue #795）

**レビュー対象:** `.issue/795/plan.md` / `.issue/795/adr.md`
**視点:** あるべきアーキテクチャ（CLAUDE.md Styling 規約・layer 方向）との整合・実現可能性・リスク
**主目的:** 1 周目（round-1-arch-risk.md）の指摘反映確認

---

## 総評

1 周目で挙げた要修正 2 点・改善提案 5 点は、いずれも plan.md / adr.md に正しく反映されている。実コードと突き合わせて確認した結果（`MediaUploader.tsx` の `kindForMime` L39-42・state machine `idle|uploading|error` L34-37・`disabled` が input のみ無効化 L137、`schema.ts` の `BYTE_SIZE_MAX` 非 export L4、`DROPZONE` が `UploadForm.tsx:30` / `UploadDialog.tsx:58` にバイト単位で完全一致重複）、計画の前提事実はすべて正確。状態機械を `idle|uploading|error|done` に変えたことで生じうる新たな実現可能性の問題も、ほぼ手当て済み。残るのは「状態のペイロード表現」に関する軽微な明示不足 1 点のみで、実装をブロックする問題ではない。

### 1 周目指摘の反映状況

- **[P-001 反映済]** `selected` を状態機械から削除し `idle | uploading | error | done` に確定。「選択/ドロップ → 検証 → 即アップロード、preview は uploading 中に progress と併記」を設計 item 3（L82）・Step 1 mock（L92）・Step 5（L128-133）・AC-2（L18）で一貫させた。dead state は解消。
- **[P-002 反映済]** 二重起動ガードを Step 5 L136 に明記（`onDrop`/`onChange`/`onDragOver` を `state.kind !== "uploading"` で early-return、label に `data-disabled` + `pointer-events-none` 相当、検証バナー表示中=`idle` の新規 drop は上書き受理）。リスク欄 L166 にも追記。
- **[S-002 反映済]** `validateMediaFile` の返す `kind` を presign に渡し `kindForMime` を削除＝MIME→kind 正規化を一点集約（Step 4 L118 / Step 5 L134）。
- **[S-003 反映済]** テスト方針 L175 に `global.XMLHttpRequest` フェイクと `URL.createObjectURL`/`revokeObjectURL` スタブの必要性、および put 経路をブラウザ検証に委ねる線引きを明記。
- **[S-004 反映済]** import 経路を `@/components/media/schema` 直 import で統一し barrel は触らない、と Step 4 L120 に明示。
- **[S-005 反映済]** `revokeObjectURL` を `useEffect(() => () => revoke(url), [url])` の単一クリーンアップに一本化（URL を state 保持・画像 kind のみ生成）を Step 5 L138・リスク欄 L163 で統一。
- **[S-001 見送り・記録済]** クライアント別 UX 上限案の見送り理由（product 判断で AC 外、`BYTE_SIZE_MAX` 共有で invariant 維持）を ADR-002 Consequences L48 とレビュー履歴 L196-197 に記録。判断・記録とも妥当。

---

#### 問題点（要修正）

問題点ゼロ。1 周目の P-001 / P-002 は確定済みで、状態機械変更に伴う新たなブロッカーは検出されなかった。

#### 改善提案（検討推奨）

- **[S-001]** 状態機械を `idle|uploading|error|done` の 4 名で確定したが、各状態が運ぶ**ペイロード**（特に検証バナーの置き場）が plan 上まだ抽象的。実装時に「不正状態を表現不能にする」（CLAUDE.md 原則）形へ落とせるよう、最低限の payload を一言添えておくと迷いが減る。
  - 理由: 検証 NG は「`idle` のままバナー併記」と決めたが（Step 5 L133/136）、現行の `{ kind: "idle" }` には検証結果を持つスロットが無い。`idle` に optional な validation reason を畳む（例 `{ kind:"idle"; rejection?: {reason:"unsupported"|"oversized"; sizeLabel?} }`）か、別 `useState` で持つかで表現が分かれる。同様に `uploading` は preview 併記のため file/thumbnailUrl/progress を、`done` は filename を運ぶ必要がある（S-005 の「URL を state 保持」と整合）。いずれも実装で自明に解決できるレベルだが、discriminated union のどこに何を載せるかを Step 5 に一行で示すと、別 useState 散在による状態不整合（バナーと state.kind の食い違い等）を未然に防げる。これは要修正ではなく明示の推奨。

#### 良い点

- **1 周目指摘の反映が網羅的かつ正確。** 反映箇所をレビュー履歴（L183-197）に逐条で残し、設計セクション・Step・AC・リスク欄・ADR まで横断的に整合させている。両論併記のまま実装に渡す状態は解消された。
- **状態機械変更後の新規リスクをほぼ自力で先回り。** 「検証バナー表示中（idle）の新規 drop は上書き受理」「done → 次の選択で idle 復帰」「preview と progress を同一ブロックに併記（mock L94）」など、`selected` 削除で生じる遷移の穴を Step 5 / Step 1 mock で塞いでいる。残ったのは payload 表現の明示だけ。
- **検証バナー表示タイミングが auto-upload と矛盾しない。** 検証は選択/ドロップ直後・upload 着手前に同期実行し、NG は `idle` に留まる設計（Step 5 L133）。Issue AC の「before/while uploading」のうち「while」を併記で満たし、「before（検証フィードバック）」を upload 着手前の同期検証で満たす二段構えは AC-2/AC-3 を素直にカバーしており、即アップロード化で要件が崩れていない。
- **層越境ゼロを維持。** `validation.ts`（presentation/frontend 純粋関数）+ `schema.ts` からの `BYTE_SIZE_MAX` export は同層内参照で core を跨がず、1 周目評価どおり依存方向を侵さない。`DROPZONE` 完全一致移設（バイト一致を本レビューでも確認）も `common/styles.ts` の domain-agnostic シェル規約に忠実。

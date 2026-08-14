/* ═══════════════════════════════════════════════════════════
   testprep.js — 定期テスト前モード
   ─────────────────────────────────────────────────────────
   ★何のためのものか
   中学の「成績」は定期テストでほぼ決まる。ところがこれまで、
   テストの日程・範囲は学習計画に何も影響していなかった。
   点数は記録できるのに、その手前がつながっていなかった。

   ★沙和さんの操作は「Lukeに話す」だけ
   「来週の火曜、数学のテスト。範囲は比例と反比例」— これだけ。
   AIが note_test を呼び、ここが範囲を概念に対応づけ、
   テスト当日まで毎日の出題が範囲優先に切り替わる。
   新しいボタンは作らない(タブを増やさない方針と同じ理由)。

   ★範囲→概念の対応づけはコードがやる
   AIに概念IDを直接選ばせると、210個の中から間違ったIDを
   もっともらしく作られたとき(m1-hire など)に気づけない。
   AIは「比例」「反比例」という**言葉**だけを渡し、
   照合はここで決定的にやる。合わなかった言葉は合わなかったと返す。

   ★テストで脅さない
   「テストまであと◯日!」で急かす作りにはしない。
   出題の中身が静かに変わるだけ。前日は総ざらいに絞り、
   当日を過ぎたら自動でふだんに戻る。出来を問い詰める指示も入れない。
   ═══════════════════════════════════════════════════════════ */

/** テスト何日前から範囲優先にするか */
const TEST_BOOST_DAYS = 14;
/** 記録しておく最大件数(古い順に落とす。期末は5教科なので余裕を持つ) */
const TEST_MAX = 20;

/* ── 範囲の言葉 → 概念 ─────────────────────────────────── */

/** 「比例」「be動詞」などの言葉を、その教科の概念に対応づける */
function matchTestConcepts(subject, keywords) {
  const kws = (keywords || []).map((k) => String(k).trim()).filter(Boolean);
  const hit = new Set();
  const used = new Set();
  for (const c of CONCEPTS) {
    if (c.s !== subject) continue;
    const text = c.n + " " + (c.u || "");
    for (const k of kws) {
      if (text.includes(k)) { hit.add(c.id); used.add(k); }
    }
  }
  return { ids: [...hit], unmatched: kws.filter((k) => !used.has(k)) };
}

/* ── 記録する ──────────────────────────────────────────── */

function noteTest(S, raw) {
  const subject = SUBJECTS[raw.subject] ? raw.subject : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || "")) ? raw.date : null;
  if (!subject) return { ok: false, reason: "教科が不明です" };
  if (!date) return { ok: false, reason: "日付の形式が不正です(YYYY-MM-DD)" };
  if (date < todayISO()) return { ok: false, reason: "過去の日付です。テストが済んでいるなら記録は不要です" };

  const m = matchTestConcepts(subject, raw.range_keywords);
  S.tests ||= [];
  // 同じ教科・同じ日付なら上書き(あとから範囲を言われたとき用)
  S.tests = S.tests.filter((t) => !(t.subject === subject && t.date === date));
  const t = {
    id: "t" + Date.now().toString(36),
    subject, date,
    label: String(raw.label || "").trim().slice(0, 24) || "テスト",
    keywords: (raw.range_keywords || []).map((k) => String(k).slice(0, 30)).slice(0, 12),
    conceptIds: m.ids,
    at: Date.now(),
  };
  S.tests.push(t);
  S.tests.sort((a, b) => a.date.localeCompare(b.date));
  if (S.tests.length > TEST_MAX) S.tests.splice(0, S.tests.length - TEST_MAX);
  return { ok: true, test: t, matched: m.ids, unmatched: m.unmatched };
}

/* ── 読む ──────────────────────────────────────────────── */

/** これからのテスト(近い順)。過ぎたものは出さない(記録には残る) */
function upcomingTests(S) {
  const d = todayISO();
  return (S.tests || []).filter((t) => t.date >= d);
}

function daysToTest(t) {
  return Math.round((new Date(t.date + "T12:00") - new Date(todayISO() + "T12:00")) / 864e5);
}

/**
 * 範囲優先にする概念ID。
 * ★範囲の概念に前提の穴があるなら、**穴のほうを先に**優先する。
 * テスト前に文章題を積んでも、土台が壊れていたら乗らない。
 */
function testTargetIds(S) {
  const out = new Set();
  const seen = new Set();
  const addWithPrereqs = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = CONCEPT_MAP[id];
    if (!c) return;
    out.add(id);
    for (const p of c.pre || []) {
      const st = (S.mem || {})[p];
      if (!st || (st.mastery || 0) < 0.6) addWithPrereqs(p);   // 土台の穴も範囲に含める
    }
  };
  for (const t of upcomingTests(S)) {
    if (daysToTest(t) > TEST_BOOST_DAYS) continue;
    for (const id of t.conceptIds) addWithPrereqs(id);
  }
  return out;
}

/* ── AIへの指示 ────────────────────────────────────────── */

function testPromptBlock(S) {
  const ups = upcomingTests(S).filter((t) => daysToTest(t) <= TEST_BOOST_DAYS);
  if (!ups.length) return "";
  let s = "\n# 定期テスト前モード(いま有効です)\n";
  for (const t of ups) {
    const d = daysToTest(t);
    const names = t.conceptIds.map((id) => CONCEPT_MAP[id]?.n).filter(Boolean);
    s += `\n【${SUBJECTS[t.subject].name}の${t.label} — ${t.date}(あと${d}日)】\n`;
    s += names.length
      ? `- 範囲:${names.join("、")}(${t.conceptIds.join(", ")})\n`
      : `- 範囲:「${t.keywords.join("、")}」と聞いていますが、概念に対応づけできていません。会話の中で単元を確かめて、note_test でもう一度記録してください\n`;
    if (d <= 1) {
      s += "- **前日・当日です。** 新しいことはやらず、範囲の総ざらいだけにしてください。特に「自信あり×不正解」だったところを優先\n";
      s += "- 夜ふかしの気配があれば「寝たほうが点になる」と止めてください(睡眠は記憶の定着に必要です)\n";
    }
  }
  s += "\n- 出題は範囲を優先してください(今日の分にも反映済みです)。ただし**範囲外の復習をゼロにはしない**でください(テストのたびに前のことを忘れるのを防ぐため)\n";
  s += "- 「あと◯日だよ!」と急かさないでください。範囲を多めに出すだけで十分です\n";
  s += "- テストが済んだあと、出来を問い詰めないでください。本人が話したくなったら聞く、でお願いします\n";
  s += "- 新しくテストの予定を聞いたら note_test で記録してください\n";
  return s;
}

/* ── 画面(成績タブ)────────────────────────────────────── */

function testListHtml(S) {
  const ups = upcomingTests(S);
  if (!ups.length) return "";
  return ups.map((t) => {
    const d = daysToTest(t);
    const names = t.conceptIds.map((id) => CONCEPT_MAP[id]?.n).filter(Boolean);
    const md = `${Number(t.date.slice(5, 7))}月${Number(t.date.slice(8, 10))}日`;
    const when = d === 0 ? "今日" : d === 1 ? "明日" : `あと${d}日`;
    return `<div class="tp-item">
      <span class="tp-sub">${SUBJECTS[t.subject].emoji}</span>
      <div class="tp-main">
        <div>${esc(SUBJECTS[t.subject].name)}の${esc(t.label)} — ${md}(${when})</div>
        <div class="tp-range">${names.length ? "範囲:" + esc(names.join("、")) : "範囲:まだ聞いていません(Lukeに話すと入ります)"}</div>
      </div>
      <button class="tp-x" data-id="${t.id}" title="この予定を消す">✕</button>
    </div>`;
  }).join("");
}

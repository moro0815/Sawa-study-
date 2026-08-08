/* 保護者への共有リンク(share.html)の中身。
   ★CSPで script-src 'self' にしたため、HTMLの中に直接書けなくなった。
     差し込まれたスクリプトを実行させないための制限で、これはその副作用。 */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function decode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function render(d) {
  $("#title").textContent = `${d.n || ""}さんの学習レポート`;
  $("#meta").textContent = `${d.g} ・ 直近${d.pd}日間 ・ ${d.dt} 時点`;

  let h = "";

  /* 今週まず知っておくこと */
  if (d.ad) {
    h += `<div class="card"><h2>▶ まず知っておくこと</h2>
      <div class="al ${esc(d.ad.t)}"><div class="al-b" style="font-size:12.5px">${esc(d.ad.x)}</div>
      ${d.ad.s ? `<div class="al-s">${esc(d.ad.s)}</div>` : ""}</div></div>`;
  }

  /* 気づいたこと */
  if (d.al?.length) {
    h += `<div class="card"><h2>▶ 気づいたこと</h2>` + d.al.map((a) =>
      `<div class="al ${esc(a.l)}"><div class="al-t">${esc(a.i)} ${esc(a.t)}</div>
       <div class="al-b">${esc(a.b)}</div>${a.s ? `<div class="al-s">${esc(a.s)}</div>` : ""}</div>`).join("") + `</div>`;
  }

  /* 学習の記録 */
  h += `<div class="card"><h2>▶ 学習の記録</h2>
    <div class="row"><span>学習した日数</span><b>${d.p.ad} 日 / ${d.pd}日</b></div>
    <div class="row"><span>解いた問題数</span><b>${d.p.an} 問</b></div>
    ${d.p.mi ? `<div class="row"><span>学習時間</span><b>${Math.round(d.p.mi / 60)} 時間</b></div>` : ""}
    <div class="row"><span>新しく習得した概念</span><b>${d.p.nw} 個</b></div>
    <div class="row"><span>練習中の正答率</span><b>${d.p.ac != null ? d.p.ac + "%" : "—"}</b></div>
    <div class="note"><b>この数字の読み方</b><br>
      練習中の正答率は<b>低くて構いません</b>。単元をわざと混ぜて出題する設計(交互練習)のため、
      ある研究では、練習中の正答率が 89%→60% に下がる一方、あとのテストの成績は 38%→77% と大きく改善しました(Rohrer et al. 2020)。
      特定の条件での比較なので、同じ幅で伸びると約束するものではありませんが、方向は一貫しています。
      正答率ではなく<b>「学習した日数」と「新しく習得した概念」</b>を見てあげてください。</div></div>`;

  /* 教科別 */
  if (d.sm?.length) {
    h += `<div class="card"><h2>▶ 教科別の習得度</h2>` + d.sm.map((s) =>
      `<div style="margin-bottom:8px"><div class="row" style="border:none;padding:2px 0">
        <span>${esc(s.n)}</span><span class="sub">${s.l}/${s.t}概念 ・ ${s.m}%</span></div>
        <div class="bar"><i style="width:${s.m}%"></i></div></div>`).join("") + `</div>`;
  }

  /* 理解の質 */
  if (d.w) {
    h += `<div class="card"><h2>▶ 理解の質</h2>
      <div class="row"><span>わかったつもり率</span><b>${d.w.o}%</b></div>
      <div class="row"><span>最優先の弱点(自信あり×不正解)</span><b>${d.w.hw} 件</b></div>
      <div class="row"><span>定着している概念</span><b>${d.w.hr} 件</b></div>
      <div class="note">「わかったつもり」は、研究上<b>最も直りやすく最も伸びる場所</b>です(ハイパーコレクション効果)。
        見つかったこと自体が前進なので、叱る材料にはしないでください。</div></div>`;
  }

  /* 成績 */
  if (d.gr?.length) {
    h += `<div class="card"><h2>▶ 定期テスト</h2>` + d.gr.map((g) =>
      `<div class="row"><span>${esc(g.s)} ${esc(g.n)}<br><span class="sub">平均${g.a}点 ・ 推定偏差値 ${g.h}</span></span>
        <b>${g.p}点</b></div>`).join("") + `</div>`;
  }

  /* 志望と受験 */
  if (d.c) {
    h += `<div class="card"><h2>▶ 志望</h2>
      <div class="row"><span>今の志望</span><b>${esc(d.c.e)} ${esc(d.c.n)}</b></div>
      <div class="row"><span>これまでの変更回数</span><b>${d.c.ch} 回</b></div>
      ${d.ex ? `<div class="row"><span>共通テストまで</span><b>${d.ex}</b></div>` : ""}
      ${d.hs ? `<div class="row"><span>模試</span><b>${esc(d.hs)}</b></div>` : ""}
      <div class="note">${esc(d.c.r)}</div>
      <div class="say">
        <div class="bad"><h3>✕ 志望が変わったとき避けたい</h3><ul>
          <li>「あんなに言ってたのに」</li><li>「今までの勉強、無駄になるよ」</li>
          <li>「本当にそれでいいの?」</li><li>「まだ決まってないの?」</li></ul></div>
        <div class="good2"><h3>○ 効果がある</h3><ul>
          <li>「そう思ったきっかけ、聞かせて」</li><li>「そう思えるようになったんだね」</li>
          <li>「今までの勉強はほとんど使えるよ」</li><li>「決まってなくても大丈夫」</li></ul></div>
      </div></div>`;
  }

  /* 一緒に過ごした日数 */
  if (d.j) {
    h += `<div class="card"><h2>▶ 続けている日数</h2>
      <div class="row"><span>はじめてから</span><b>${d.j} 日</b></div>
      <div class="note">結果よりも、<b>続いていること</b>を言葉にして認めてあげてください。
        それが次の1週間を支えます。</div></div>`;
  }

  $("#out").innerHTML = h;
}

try {
  const frag = location.hash.slice(1);
  const m = frag.match(/(?:^|&)d=([^&]+)/);
  if (!m) throw new Error("no data");
  render(decode(decodeURIComponent(m[1])));
} catch (e) {
  $("#out").innerHTML = `<div class="err">レポートを読み込めませんでした。<br><br>
    リンクが途中で切れている可能性があります。<br>
    お子さんの端末から、もう一度送ってもらってください。</div>`;
}

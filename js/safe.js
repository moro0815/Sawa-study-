/* ═══════════════════════════════════════════════════════════════════
   safe.js — 記録を失わないための守り

   ★まず、はっきりさせておきます。
   Safari の「Webサイトデータを消去」を止める方法は **ありません。**
   localStorage も IndexedDB も Cache も、まとめて消えます。
   ブラウザにそれを拒否する仕組みは無く、これは仕様です。

   ですから、やるべきことは「消えないようにする」ではなく
   **「消えても困らないようにする」** です。守りを4枚重ねます。

     1枚目 端末の中(自動)…… localStorage + IndexedDB。速いが消える
     2枚目 端末の保護設定 …… 勝手に消されるのを防ぐ(手動消去は防げない)
     3枚目 サーバー(自動) …… エックスサーバーに自動で預ける。★本命
     4枚目 ファイル(手動) …… iCloud Drive に置く。Safariの外なので絶対に残る

   ★もうひとつ、見落とされがちな危険があります。
   iOS は「**7日間そのサイトを開かないと、保存を全部消す**」という
   決まりを持っています(ITP)。ただし **ホーム画面に追加したアプリは対象外**です。
   Safari のタブから使っていると、消去操作をしていなくても消えます。
   ここは検知して知らせます。

   ★そして、いちばん大事な穴。
   全部消えると **サーバーの合言葉(srvToken)も一緒に消えます。**
   サーバーに預けてあるのに、取りに行く鍵が無い状態になります。
   なので「復元用リンク」を作って、保護者の方に保管してもらいます。
   ═══════════════════════════════════════════════════════════════════ */

/* ── 端末の状況を調べる ────────────────────────────────── */

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints || 0) > 1);
}

/** ホーム画面から開いているか(iOSの7日ルールを避けられているか) */
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

/**
 * 「保護」を申請する。
 * ★これで防げるのは **勝手に消されること**(容量不足やITPの自動削除)だけです。
 *   人が「Webサイトデータを消去」を押したときは、保護されていても消えます。
 *   そこは正直に画面にも書きます。
 */
async function askPersist() {
  if (!navigator.storage?.persist) return { supported: false };
  try {
    const already = await navigator.storage.persisted?.();
    const granted = already || await navigator.storage.persist();
    let est = null;
    try { est = await navigator.storage.estimate(); } catch (_) {}
    return {
      supported: true, granted,
      usedMB: est ? Math.round((est.usage || 0) / 1e5) / 10 : null,
      quotaMB: est ? Math.round((est.quota || 0) / 1e6) : null,
    };
  } catch (_) { return { supported: true, granted: false }; }
}

/* ── いま何枚守れているか ──────────────────────────────── */

function safetyReport(S) {
  const now = Date.now();
  const days = (t) => (t ? Math.floor((now - t) / 864e5) : null);
  const srvDays = days(S.srvLastAt);
  const fileDays = days(S.lastBackupAt);
  const offDevice = [srvDays, fileDays].filter((x) => x != null);
  const oldest = offDevice.length ? Math.min(...offDevice) : null;

  const layers = [
    {
      id: "home", ok: !isIOS() || isStandalone(),
      title: "ホーム画面から開く",
      good: isStandalone() ? "ホーム画面のアイコンから開いています" : "パソコンなので、この心配はありません",
      bad: "Safariのタブから開いています。**iOSは7日間開かないと保存を全部消します。**"
         + "ホーム画面に追加して、そのアイコンから開いてください(共有 → ホーム画面に追加)",
      fix: null,
    },
    {
      id: "persist", ok: null,   // 起動時に調べて入れる
      title: "端末の保存を保護する",
      good: "保護されています(容量不足でも勝手に消されません)",
      bad: "保護されていません。ただし、これは**自動で消されるのを防ぐだけ**で、"
         + "手で「Webサイトデータを消去」したときは、保護されていても消えます",
      fix: null,
    },
    {
      id: "server", ok: !!S.srvToken && !S.srvLastError && srvDays != null && srvDays <= 3,
      title: "サーバーに自動で預ける ★本命",
      good: srvDays === 0 ? "今日、自動で預けました" : `${srvDays}日前に自動で預けました`,
      bad: !S.srvToken
        ? "まだ設定していません。**1回押すだけ**で、あとは何もしなくても自動で預かります"
        : S.srvLastError ? `前回うまく預けられませんでした:${S.srvLastError}`
        : "しばらく預けられていません",
      fix: "srv",
    },
    {
      id: "file", ok: fileDays != null && fileDays <= 45,
      title: "ファイルにも残す(iCloud Drive)",
      good: `${fileDays === 0 ? "今日" : fileDays + "日前"}に書き出しました`,
      bad: fileDays == null
        ? "まだ書き出していません。**Safariの外**に置けるので、ここがいちばん確実です"
        : `${fileDays}日たちました。月に1回で十分です`,
      fix: "file",
    },
    {
      id: "key", ok: !!S.srvToken,
      title: "復元用リンクを保管する",
      good: "作れます。下のボタンから、メモやメールに保管してください",
      bad: "サーバーの自動バックアップを設定すると作れるようになります",
      fix: "key",
    },
  ];

  return {
    layers,
    offDeviceDays: oldest,
    /** 端末の外に1つも無い状態か。ここが本当の危険 */
    naked: oldest == null,
  };
}

/* ── 端末の外へ出す ────────────────────────────────────── */

/* ★書き出し処理はここに二重に持たない。
   app.js の shareBackup() が同じことをしており、そちらは secrets=false。
   ここに別実装を置いたせいで、片方だけ鍵ごと書き出していた。
   実装は shareBackup() に一本化した(この関数は削除)。 */

/* ── 復元用リンク ──────────────────────────────────────
   ★全部消えると、サーバーの合言葉も一緒に消えます。
     預けてあるのに取りに行けない、という穴を塞ぐためのものです。
   ⚠️ このリンクは合言葉を含みます。**家族以外に渡さないでください。**
     ただし AIのAPIキーは入れません(料金に直結するため)。 */

function restoreLink(S) {
  if (!S.srvToken) return "";
  const base = location.href.replace(/[?#].*$/, "");
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    v: 1, t: S.srvToken, n: S.name || "", g: S.grade || "",
  }))));
  return `${base}#restore=${payload}`;
}

/** 起動時に #restore= があれば読む */
function readRestoreLink() {
  const m = /#restore=([A-Za-z0-9+/=]+)/.exec(location.hash);
  if (!m) return null;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    return o && o.t ? o : null;
  } catch (_) { return null; }
}

function clearRestoreHash() {
  history.replaceState(null, "", location.href.replace(/#restore=[^&]*/, "") || location.pathname);
}

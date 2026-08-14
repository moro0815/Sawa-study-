/* ═══════════════════════════════════════════════════════════
   写真の受け口(ドラッグ&ドロップ / 貼り付け)
   ─────────────────────────────────────────────────────────
   ★なぜ要るのか。
   沙和さんは宿題を iPhone で撮る。学習は MacBook でやる。
   その間をつなぐ手だてが、これまで「ファイルを選ぶ」しかなかった。
   Finder を開いて、どこに保存されたか探して、選ぶ — 12歳には多すぎる。

   iPhone から Mac へ写真を持ってくる方法(AirDrop / iCloud写真)は
   どちらも「Mac 側に写真が現れる」ところまでは勝手にやってくれる。
   足りないのは最後の一歩だけなので、そこだけ短くする。

     ・写真アプリや Finder から、画面へ**放り込む**
     ・写真をコピーして、⌘V で**貼り付ける**

   ★サーバーは経由しない。
   「iPhone から送信 → サーバー → Mac が受け取る」も作れるが、
   それは宿題の写真(=12歳の子の顔や名前が写りうるもの)を
   サーバーに置くということ。AirDrop なら端末から端末へ直接渡る。
   同じことができるなら、置かないほうを選ぶ。
   ═══════════════════════════════════════════════════════════ */

/** 受け取ってよいファイルだけ拾う。フォルダや文章のドラッグは無視する */
function dropPickFiles(dt) {
  if (!dt) return [];
  const out = [];
  for (const f of Array.from(dt.files || [])) {
    if (f.type.startsWith("image/") || f.type === "application/pdf") out.push(f);
  }
  return out;
}

/** ファイルのドラッグかどうか。文字を選択してドラッグしただけのときに反応しない */
function dropIsFiles(dt) {
  if (!dt) return false;
  const t = Array.from(dt.types || []);
  return t.includes("Files");
}

/* 画面をまたぐと dragleave が何度も飛ぶので、数えて 0 になったときだけ消す */
let dropDepth = 0;

function dropZone() {
  let z = document.getElementById("dropZone");
  if (z) return z;
  z = document.createElement("div");
  z.id = "dropZone";
  z.className = "dz";
  z.hidden = true;
  z.innerHTML = `<div class="dz-box">
    <span class="dz-ic">📥</span>
    <b>ここに はなしてください</b>
    <span class="dz-sub">しゅくだいの しゃしんとして とりこみます</span>
  </div>`;
  document.body.appendChild(z);
  return z;
}

function dropShow(on) {
  const z = dropZone();
  z.hidden = !on;
  if (!on) dropDepth = 0;
}

/**
 * ドラッグ&ドロップを受け付ける。
 * @param {(files: File[], how: string) => void} onFiles
 * @param {() => boolean} busy 別の画面(カメラ・書く練習)が開いているとき true
 */
function dropInit(onFiles, busy) {
  const blocked = () => (typeof busy === "function" ? busy() : false);

  window.addEventListener("dragenter", (e) => {
    if (!dropIsFiles(e.dataTransfer) || blocked()) return;
    e.preventDefault();
    dropDepth++;
    dropShow(true);
  });

  window.addEventListener("dragover", (e) => {
    if (!dropIsFiles(e.dataTransfer) || blocked()) return;
    e.preventDefault();                                  // ★これが無いと drop が来ない
    try { e.dataTransfer.dropEffect = "copy"; } catch (_) { }
  });

  window.addEventListener("dragleave", (e) => {
    if (!dropIsFiles(e.dataTransfer)) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) dropShow(false);
  });

  /* ★ドロップは、受け口の外に落とされたときも必ず止める。
     止めないとブラウザが画像を別ページとして開き、アプリから出てしまう。 */
  window.addEventListener("drop", (e) => {
    if (!dropIsFiles(e.dataTransfer)) return;
    e.preventDefault();
    dropShow(false);
    if (blocked()) return;
    const files = dropPickFiles(e.dataTransfer);
    if (files.length) onFiles(files, "drop");
  });
}

/**
 * ⌘V(Ctrl+V)での貼り付けを受け付ける。
 * 文字の貼り付けは、これまでどおり素通りさせる。
 */
function pasteInit(onFiles, busy) {
  window.addEventListener("paste", (e) => {
    if (typeof busy === "function" && busy()) return;
    const cd = e.clipboardData;
    if (!cd) return;
    let files = Array.from(cd.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) {                                  // Safari は files に入らないことがある
      for (const it of Array.from(cd.items || [])) {
        if (it.kind === "file" && String(it.type).startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    if (!files.length) return;                            // 文字の貼り付け → 触らない
    e.preventDefault();
    onFiles(files, "paste");
  });
}

/** ドラッグできる環境か(指だけの端末では案内を出さない) */
function dropUsable() {
  try { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; }
  catch (_) { return false; }
}

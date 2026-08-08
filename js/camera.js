/* ═══════════════════════════════════════════════════════════
   camera.js — アプリの中で直接撮るカメラ

   ★なぜ必要か
   <input type="file" capture="environment"> は「カメラを開いてほしい」という
   *お願い* でしかない。ブラウザは無視してよい。
     ・パソコンのブラウザ  … capture は完全に無視。必ずファイル選択になる
     ・iPhone のSafari    … 通常タブでは効くが、ホーム画面に追加した
                            スタンドアロン表示だと、ファイルアプリが出ることがある
     ・どの端末でも        … 「写真を撮る / 写真ライブラリ / ファイルを選択」の
                            メニューが一枚挟まる
   そこで getUserMedia でカメラ映像を直接受け取り、アプリ内で撮る。
   これなら確実に一発でカメラが開き、撮り直しも連写もできる。
   ★使えない環境(権限拒否・古い端末・http接続)では、
     呼び出し側が従来の <input capture> に自動で戻す。
   ═══════════════════════════════════════════════════════════ */

/** この端末でアプリ内カメラが使えるか */
function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && window.isSecureContext);
}

let camEl = null;      // オーバーレイのDOM
let camStream = null;  // 動いているカメラ
let camFacing = "environment";

function camStop() {
  if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
}

function camBuild() {
  const el = document.createElement("div");
  el.className = "cam";
  el.innerHTML = `
    <div class="cam-stage">
      <video class="cam-video" playsinline autoplay muted></video>
      <img class="cam-still" alt="撮った写真" hidden>
      <div class="cam-guide"><span>プリントが枠に収まるように</span></div>
      <!-- ★どの画面からでも抜けられるように、閉じるは常に出しておく -->
      <button class="cam-x cam-close" type="button" aria-label="とじる">✕</button>
    </div>
    <div class="cam-strip" hidden></div>
    <div class="cam-msg" hidden></div>
    <div class="cam-bar">
      <span class="cam-sp"></span>
      <button class="cam-shutter" type="button" aria-label="撮る"></button>
      <button class="cam-b cam-flip" type="button">🔄 切替</button>
    </div>
    <div class="cam-bar cam-bar2" hidden>
      <button class="cam-b cam-retake" type="button">↩ 撮り直す</button>
      <button class="cam-b cam-more" type="button">＋ もう1枚</button>
      <button class="cam-b cam-use" type="button">これを使う</button>
    </div>`;
  document.body.appendChild(el);
  return el;
}

async function camStart(video) {
  camStop();
  camStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: camFacing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
    audio: false,
  });
  video.srcObject = camStream;
  await video.play().catch(() => {});
}

/** カメラを開いて、撮った写真を File の配列で返す(閉じたら空配列) */
function openCamera(opt = {}) {
  const max = Math.max(1, Math.min(6, opt.max || 6));
  return new Promise((resolve) => {
    camEl = camEl || camBuild();
    const q = (s) => camEl.querySelector(s);
    const video = q(".cam-video"), still = q(".cam-still"), strip = q(".cam-strip");
    const bar1 = q(".cam-bar:not(.cam-bar2)"), bar2 = q(".cam-bar2"), msg = q(".cam-msg");
    const shots = [];
    let pending = null; // 確認待ちの1枚

    const say = (t) => { msg.textContent = t || ""; msg.hidden = !t; };

    const drawStrip = () => {
      strip.hidden = !shots.length;
      strip.innerHTML = shots.map((s, i) =>
        `<span class="cam-th"><img src="${s.url}" alt="${i + 1}枚目"><b data-rm="${i}">✕</b></span>`).join("");
      strip.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
        URL.revokeObjectURL(shots[+b.dataset.rm].url);
        shots.splice(+b.dataset.rm, 1); drawStrip();
      });
    };

    const showLive = () => {
      pending = null;
      still.hidden = true; video.hidden = false;
      bar1.hidden = false; bar2.hidden = true;
      q(".cam-guide").hidden = false;
      say(shots.length ? `${shots.length}枚 撮れています` : "");
    };

    const showShot = (blob) => {
      pending = blob;
      still.src = URL.createObjectURL(blob);
      still.hidden = false; video.hidden = true;
      bar1.hidden = true; bar2.hidden = false;
      q(".cam-guide").hidden = true;
      // 上限に達していたら「もう1枚」は出さない
      q(".cam-more").hidden = shots.length + 1 >= max;
      say("文字が読めるか確認してください。ぼやけていたら撮り直しを。");
    };

    const finish = () => {
      camStop();
      camEl.classList.remove("on");
      document.removeEventListener("keydown", onKey);
      const files = shots.map((s, i) =>
        new File([s.blob], `camera-${i + 1}.jpg`, { type: "image/jpeg" }));
      shots.forEach((s) => URL.revokeObjectURL(s.url));
      if (still.src) URL.revokeObjectURL(still.src);
      resolve(files);
    };

    const onKey = (e) => { if (e.key === "Escape") finish(); };

    const keep = () => {
      if (!pending) return;
      shots.push({ blob: pending, url: URL.createObjectURL(pending) });
      drawStrip();
      return shots.length;
    };

    q(".cam-shutter").onclick = () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) { say("カメラの準備中です。もう少し待ってください。"); return; }
      const scale = Math.min(1, 2000 / Math.max(w, h));
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      const cx = cv.getContext("2d");
      if (camFacing === "user") { cx.translate(cv.width, 0); cx.scale(-1, 1); } // 自撮りは鏡像を戻す
      cx.drawImage(video, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => b && showShot(b), "image/jpeg", 0.92);
    };

    q(".cam-retake").onclick = showLive;
    q(".cam-more").onclick = () => { keep(); showLive(); };
    q(".cam-use").onclick = () => { keep(); finish(); };
    q(".cam-close").onclick = finish;

    q(".cam-flip").onclick = async () => {
      camFacing = camFacing === "environment" ? "user" : "environment";
      video.classList.toggle("mirror", camFacing === "user");
      try { await camStart(video); } catch { say("こちら側のカメラは使えませんでした。"); }
    };

    camEl.classList.add("on");
    drawStrip(); showLive();
    document.addEventListener("keydown", onKey);

    camStart(video).catch((e) => {
      camStop();
      camEl.classList.remove("on");
      document.removeEventListener("keydown", onKey);
      resolve(null); // null = 使えなかった。呼び出し側がファイル選択に戻す
      console.warn("camera:", e && e.name);
    });
  });
}

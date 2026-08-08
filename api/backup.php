<?php
/* =========================================================================
   backup.php — 沙和ナビの自動バックアップ受け口

   これを public_html に一緒に置いておくと、アプリが自動で
   学習記録をサーバーへ預けるようになります。
   端末がこわれても、機種変更しても、記録は残ります。

   ・保存先は public_html の【外】。ブラウザからは直接開けません
   ・合言葉(トークン)を知っている端末からしか書き込めません
   ・上書きアップロードしても、預けた記録と合言葉は消えません
   ・APIキーは預かりません(アプリ側で送らないようにしています)

   設置:このファイルを public_html/api/backup.php として置くだけ。
        中身を書き換える必要はありません。

   ★初回設定を「早い者勝ち」にしないための PIN について

   以前は ?a=init を最初に叩いた相手が合言葉を持っていける形でした。
   家庭で使うぶんには当たる可能性は低いのですが、URLを先に知られると
   第三者が先に初期化できてしまいます。理屈のうえで開いている穴は塞ぎます。

     1. アプリが疎通確認(ping)をすると、サーバーが **PINを1つ自動生成**し、
        public_html の【外】(= ブラウザから開けない場所)にファイルで置きます
     2. 保護者だけがサーバーのファイル管理から、そのPINを読めます
     3. アプリにPINを入れて初期化すると、合言葉が発行されます
     4. **成功した時点でPINファイルは削除**され、二度と初期化に使えません

   PINを間違えると回数制限がかかります(5回で15分ロック)。
   PINは公開領域に置かないので、URLを知っただけの相手には読めません。

   ★PINファイルは ZIP に含まれません。上書きしても消えません。
   ★合言葉を失くしたときは、サーバーの token.txt を消してください。
     次の ping で新しいPINが作られ、やり直せます(預けた記録は残ります)。
   ========================================================================= */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const KEEP     = 30;                    // 残す世代数
const MAX_BODY = 8 * 1024 * 1024;       // 1回に受け取る上限(8MB)

/* 初期化PIN。読み違えにくい字だけを使う(0とO、1とlを入れない) */
const PIN_ALPHABET  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIN_LEN       = 8;
const PIN_MAX_TRIES = 5;                // 続けて間違えられる回数
const PIN_LOCK_SEC  = 900;              // 超えたら15分ロック

/* ── 保存先を決める ────────────────────────────────────────
   public_html の1つ上に置く。そこはブラウザから開けない。 */
function storage_dir(): string {
    $p = __DIR__;
    while (($parent = dirname($p)) !== $p) {
        if (basename($p) === 'public_html') return $parent . '/sawa-backups';
        $p = $parent;
    }
    return __DIR__ . '/data';           // 見つからないときは同じ場所に(保護つき)
}

function ensure_dir(string $dir): void {
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) fail(500, '保存先を作れませんでした');
    // public_html の外に置けなかった場合の保険
    if (str_contains($dir, 'public_html') && !file_exists($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    }
}

function out(array $v, int $code = 200): never {
    http_response_code($code);
    echo json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $msg): never { out(['ok' => false, 'error' => $msg], $code); }

$dir       = storage_dir();
$tokenFile = $dir . '/token.txt';
$pinFile   = $dir . '/init-pin.txt';
$tryFile   = $dir . '/init-tries.json';
$action    = $_GET['a'] ?? 'ping';

/* ── 初期化PIN ───────────────────────────────────────── */

/** まだ無ければ作る。すでにあれば作り直さない(保護者が自分で置いた値も尊重) */
function ensure_pin(string $pinFile): void {
    if (is_file($pinFile)) return;
    $pin = '';
    $n = strlen(PIN_ALPHABET);
    for ($i = 0; $i < PIN_LEN; $i++) $pin .= PIN_ALPHABET[random_int(0, $n - 1)];
    if (@file_put_contents($pinFile, $pin, LOCK_EX) !== false) @chmod($pinFile, 0600);
}

/** 間違えた回数。総当たりを止めるため。ロックが明けたら数え直す */
function pin_tries(string $tryFile): array {
    $j = is_file($tryFile) ? json_decode((string)file_get_contents($tryFile), true) : null;
    if (!is_array($j)) return ['n' => 0, 'until' => 0];
    $n     = (int)($j['n'] ?? 0);
    $until = (int)($j['until'] ?? 0);
    if ($until > 0 && $until <= time()) { $n = 0; $until = 0; }   // ロック明け
    return ['n' => $n, 'until' => $until];
}

/** 1回間違えた。上限に達したらロックする。残り回数を返す */
function pin_note_fail(string $tryFile): int {
    $t = pin_tries($tryFile);
    $t['n']++;
    if ($t['n'] >= PIN_MAX_TRIES) { $t['until'] = time() + PIN_LOCK_SEC; $t['n'] = 0; }
    @file_put_contents($tryFile, json_encode($t), LOCK_EX);
    @chmod($tryFile, 0600);
    return $t['until'] > time() ? 0 : max(0, PIN_MAX_TRIES - $t['n']);
}

/* ── 合言葉の確認 ─────────────────────────────────────── */
function check_token(string $tokenFile): void {
    if (!is_file($tokenFile)) fail(409, 'まだ設定されていません。アプリの「サーバー自動バックアップ」から設定してください。');
    $want = trim((string)file_get_contents($tokenFile));
    $got  = $_SERVER['HTTP_X_SAWA_TOKEN'] ?? '';
    if ($want === '' || !hash_equals($want, (string)$got)) fail(401, '合言葉が違います。アプリで設定し直してください。');
}

switch ($action) {

/* 疎通確認。まだ設定前なら、このときPINを用意する */
case 'ping':
    $ready = is_file($tokenFile);
    if (!$ready) { ensure_dir($dir); ensure_pin($pinFile); }
    /* ★保存先が public_html の外に取れなかった場合(サーバー構成によっては起こる)。
       そのときPINは .htaccess だけで守られる。Apache以外では .htaccess が効かず、
       PINを読まれると初期化を横取りされる余地が戻ってしまう。黙らずに伝える。 */
    $exposed = str_contains($dir, 'public_html');
    out([
        'ok' => true, 'ready' => $ready, 'version' => 2,
        'pin_required' => !$ready,
        // ★PIN そのものは絶対に返さない。置き場所の案内だけ
        'pin_where' => $ready ? '' : ($exposed
            ? 'public_html/api/data フォルダの init-pin.txt'
            : 'public_html と同じ階層にある sawa-backups フォルダの init-pin.txt'),
        'exposed' => $exposed,
    ]);

/* 初回の設定。★PINが合っているときだけ合言葉を発行する */
case 'init':
    ensure_dir($dir);
    if (is_file($tokenFile)) {
        out(['ok' => false, 'claimed' => true,
             'error' => 'すでに設定済みです。別の端末で設定した合言葉を、この端末にも貼り付けてください。'], 409);
    }

    /* ★ここが以前の穴。PINが無い状態では発行しない(閉じる側に倒す)。
       以前は誰でも ?a=init を叩けば合言葉を持っていけた。 */
    ensure_pin($pinFile);
    if (!is_file($pinFile)) fail(500, 'PINファイルを作れませんでした。サーバーの書き込み権限を確認してください。');

    $t = pin_tries($tryFile);
    if ($t['until'] > time()) {
        fail(429, '間違いが続いたため、しばらく設定できません。' . ceil(($t['until'] - time()) / 60) . '分ほど待ってください。');
    }

    $want = trim((string)file_get_contents($pinFile));
    $got  = trim((string)($_SERVER['HTTP_X_SAWA_PIN'] ?? ''));
    if ($want === '' || $got === '' || !hash_equals($want, $got)) {
        $left = pin_note_fail($tryFile);
        fail(401, $left > 0
            ? 'PINが違います(あと' . $left . '回)。サーバーの sawa-backups フォルダにある init-pin.txt を確認してください。'
            : '間違いが続いたため、' . (int)(PIN_LOCK_SEC / 60) . '分ほど設定できなくなりました。');
    }

    $token = bin2hex(random_bytes(24));
    if (@file_put_contents($tokenFile, $token, LOCK_EX) === false) fail(500, '合言葉を保存できませんでした');
    @chmod($tokenFile, 0600);
    /* ★使い終わったPINは消す。二度と初期化に使えないようにする */
    @unlink($pinFile);
    @unlink($tryFile);
    out(['ok' => true, 'token' => $token]);

/* 預ける */
case 'save':
    check_token($tokenFile);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'POSTしてください');
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw === false || $raw === '') fail(400, '中身がありません');
    if (strlen($raw) > MAX_BODY)      fail(413, 'データが大きすぎます');
    if (json_decode($raw) === null && json_last_error() !== JSON_ERROR_NONE) fail(400, '形式が正しくありません');

    ensure_dir($dir);
    // 同じ秒に2回来ても上書きしないよう、末尾に短い乱数をつける
    $name = 'bk-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '.json';
    if (@file_put_contents($dir . '/' . $name, $raw, LOCK_EX) === false) fail(500, '保存できませんでした');
    @chmod($dir . '/' . $name, 0600);

    // 古い世代を捨てる
    $files = glob($dir . '/bk-*.json') ?: [];
    sort($files);
    while (count($files) > KEEP) @unlink(array_shift($files));

    out(['ok' => true, 'file' => $name, 'count' => count($files), 'bytes' => strlen($raw)]);

/* 一覧 */
case 'list':
    check_token($tokenFile);
    $files = glob($dir . '/bk-*.json') ?: [];
    rsort($files);
    out(['ok' => true, 'items' => array_map(fn($f) => [
        'file'  => basename($f),
        'bytes' => filesize($f),
        'at'    => gmdate('c', filemtime($f)),
    ], $files)]);

/* 取り出す */
case 'get':
    check_token($tokenFile);
    $f = (string)($_GET['f'] ?? '');
    if (!preg_match('/^bk-\d{8}-\d{6}(-[0-9a-f]{4})?\.json$/', $f)) fail(400, 'ファイル名が不正です');
    $path = $dir . '/' . $f;
    if (!is_file($path)) fail(404, '見つかりません');
    echo (string)file_get_contents($path);
    exit;

default:
    fail(400, '不明な操作です');
}

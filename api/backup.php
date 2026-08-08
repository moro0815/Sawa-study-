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
   ========================================================================= */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const KEEP     = 30;                    // 残す世代数
const MAX_BODY = 8 * 1024 * 1024;       // 1回に受け取る上限(8MB)

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
$action    = $_GET['a'] ?? 'ping';

/* ── 合言葉の確認 ─────────────────────────────────────── */
function check_token(string $tokenFile): void {
    if (!is_file($tokenFile)) fail(409, 'まだ設定されていません。アプリの「サーバー自動バックアップ」から設定してください。');
    $want = trim((string)file_get_contents($tokenFile));
    $got  = $_SERVER['HTTP_X_SAWA_TOKEN'] ?? '';
    if ($want === '' || !hash_equals($want, (string)$got)) fail(401, '合言葉が違います。アプリで設定し直してください。');
}

switch ($action) {

/* 疎通確認 */
case 'ping':
    out(['ok' => true, 'ready' => is_file($tokenFile), 'version' => 1]);

/* 初回の設定。合言葉をこの場で作って1度だけ返す */
case 'init':
    ensure_dir($dir);
    if (is_file($tokenFile)) {
        out(['ok' => false, 'claimed' => true,
             'error' => 'すでに設定済みです。別の端末で設定した合言葉を、この端末にも貼り付けてください。'], 409);
    }
    $token = bin2hex(random_bytes(24));
    if (@file_put_contents($tokenFile, $token, LOCK_EX) === false) fail(500, '合言葉を保存できませんでした');
    @chmod($tokenFile, 0600);
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

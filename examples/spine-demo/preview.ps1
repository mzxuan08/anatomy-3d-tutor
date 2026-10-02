$ErrorActionPreference = 'Stop'
$taskRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $taskRuntime)) {
    $taskRuntime = (Get-Command python -ErrorAction Stop).Source
}
$taskSibling = Join-Path (Split-Path -Parent $PSScriptRoot) 'anatomy-3d-tutor\scripts\atlas_tutor.py'
$taskInstalled = Join-Path $env:USERPROFILE '.codex\skills\anatomy-3d-tutor\scripts\atlas_tutor.py'
$taskScript = if (Test-Path -LiteralPath $taskSibling) { $taskSibling } else { $taskInstalled }
if (-not (Test-Path -LiteralPath $taskScript)) { throw '找不到伴学技能脚本，请先安装技能包。' }
$taskReceipt = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.anatomy-tutor.json') -Raw | ConvertFrom-Json
$taskPort = $null
foreach ($taskCandidate in 8765..8775) {
    try {
        $taskRemote = Invoke-RestMethod -Uri "http://127.0.0.1:$taskCandidate/.anatomy-tutor.json" -TimeoutSec 1
        if ($taskRemote.sha256 -eq $taskReceipt.sha256) { $taskPort = $taskCandidate; break }
    } catch {}
    if (-not (Get-NetTCPConnection -LocalPort $taskCandidate -State Listen -ErrorAction SilentlyContinue)) {
        $taskPort = $taskCandidate
        $taskScratch = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'work'
        New-Item -ItemType Directory -Path $taskScratch -Force | Out-Null
        $taskArguments = @('-X', 'utf8', ('"' + $taskScript + '"'), 'serve', '--site', ('"' + $PSScriptRoot + '"'), '--port', [string]$taskPort)
        Start-Process -FilePath $taskRuntime -ArgumentList $taskArguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskScratch "viewer-$taskPort.log") -RedirectStandardError (Join-Path $taskScratch "viewer-$taskPort-error.log") | Out-Null
        break
    }
}
if ($null -eq $taskPort) { throw '没有可用的本地预览端口。' }
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    try {
        $taskRemote = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/.anatomy-tutor.json" -TimeoutSec 1
        if ($taskRemote.sha256 -eq $taskReceipt.sha256) { Start-Process "http://127.0.0.1:$taskPort/"; exit 0 }
    } catch {}
    Start-Sleep -Milliseconds 200
}
throw '预览没有启动，请查看 work 中的日志。'

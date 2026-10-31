#Requires -Version 5.1
<#
  wedding/ranking/capture.ps1
  레거시 rankings 컬렉션(공개 읽기)을 읽어 스냅샷 HTML/JSON을 만들고,
  선택적으로 main에 커밋·푸시합니다. Firestore 규칙/데이터는 변경하지 않습니다.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('0900','1000','1100','test')]
  [string]$Slot,
  [switch]$Push,
  [switch]$NoCommit
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RankingDir = Join-Path $RepoRoot 'wedding\ranking'
$DataDir = Join-Path $RankingDir 'data'
$Git = 'C:\Program Files\Git\cmd\git.exe'
if (!(Test-Path $Git)) { $Git = 'git' }

$ProjectId = 'my-wedding-invitation-efd31'
$LabelMap = @{ '0900' = '09:00'; '1000' = '10:00'; '1100' = '11:00'; 'test' = 'TEST' }
$Label = $LabelMap[$Slot]
$CapturedAt = Get-Date
$CapturedKst = $CapturedAt.ToString('yyyy-MM-dd HH:mm:ss') + ' KST'

function Get-Rankings {
  $base = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents/rankings"
  $all = New-Object System.Collections.Generic.List[object]
  $token = $null
  do {
    $url = $base + '?pageSize=300'
    if ($token) { $url += '&pageToken=' + [uri]::EscapeDataString($token) }
    $r = Invoke-RestMethod -Uri $url -TimeoutSec 60
    foreach ($d in @($r.documents)) {
      if (-not $d) { continue }
      $f = $d.fields
      $at = 0
      if ($f.bestScoreAt.integerValue) { $at = [int64]$f.bestScoreAt.integerValue }
      elseif ($f.bestScoreAt.timestampValue) { $at = [DateTimeOffset]::Parse($f.bestScoreAt.timestampValue).ToUnixTimeMilliseconds() }
      $all.Add([pscustomobject]@{
        nickname = $(if ($f.nickname.stringValue) { $f.nickname.stringValue } else { '(이름없음)' })
        phone    = $(if ($f.phoneNumber.stringValue) { $f.phoneNumber.stringValue } else { '' })
        score    = $(if ($f.bestScore.integerValue) { [int64]$f.bestScore.integerValue } else { 0 })
        plays    = $(if ($f.playCount.integerValue) { [int64]$f.playCount.integerValue } else { 0 })
        at       = $at
        id       = ($d.name -split '/')[-1]
      }) | Out-Null
    }
    $token = $r.nextPageToken
  } while ($token)
  return @($all | Sort-Object @{ Expression = 'score'; Descending = $true }, @{ Expression = 'at'; Ascending = $true })
}

function Format-Phone([string]$p) {
  $d = ($p -replace '\D','')
  if ($d.Length -eq 11) { return ($d.Substring(0,3) + '-' + $d.Substring(3,4) + '-' + $d.Substring(7)) }
  if ($d.Length -eq 10) { return ($d.Substring(0,3) + '-' + $d.Substring(3,3) + '-' + $d.Substring(6)) }
  return $p
}

function Encode-Html([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;' -replace '"','&quot;' -replace "'",'&#39;')
}

function New-SnapshotHtml($rows) {
  $active = @{
    '0900' = $(if ($Slot -eq '0900') { ' class="active"' } else { '' })
    '1000' = $(if ($Slot -eq '1000') { ' class="active"' } else { '' })
    '1100' = $(if ($Slot -eq '1100') { ' class="active"' } else { '' })
  }
  $rowsHtml = if (-not $rows -or $rows.Count -eq 0) {
    '<div class="empty"><strong>기록 없음</strong>이 시각에 저장된 랭킹이 없습니다.</div>'
  } else {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('<table><thead><tr><th>순위</th><th>닉네임</th><th>전화번호</th><th>점수</th><th>플레이</th></tr></thead><tbody>')
    $i = 0
    foreach ($e in $rows) {
      $i++
      [void]$sb.Append('<tr><td class="rank">' + $i + '</td><td class="nick">' + (Encode-Html $e.nickname) +
        '</td><td class="phone">' + (Encode-Html (Format-Phone $e.phone)) +
        '</td><td class="score">' + ([int64]$e.score).ToString('N0') +
        '</td><td class="plays">' + ([int64]$e.plays).ToString('N0') + '</td></tr>')
    }
    [void]$sb.Append('</tbody></table>')
    $sb.ToString()
  }

  return @"
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="googlebot" content="noindex, nofollow, noarchive">
  <title>$Label 랭킹 스냅샷 (관리용)</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div class="wrap">
    <header>
      <h1>$Label 스냅샷 <span class="badge snap">SNAPSHOT</span></h1>
      <div class="meta">고정 시각: $CapturedKst · 총 $($rows.Count)명 · 점수 높은 순 · 동점이면 먼저 기록한 순</div>
    </header>
    <nav class="nav" aria-label="스냅샷 이동">
      <a href="./live.html">실시간</a>
      <a$($active['0900']) href="./0900.html">09:00</a>
      <a$($active['1000']) href="./1000.html">10:00</a>
      <a$($active['1100']) href="./1100.html">11:00</a>
    </nav>
    <div class="card">
      $rowsHtml
    </div>
    <p class="foot">관리용 고정본입니다. 검색엔진 색인 제외(noindex). 이후 점수 변동이 반영되지 않습니다.</p>
  </div>
</body>
</html>
"@
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Write-Host "[capture] fetching rankings…"
$rows = @(Get-Rankings)
Write-Host "[capture] got $($rows.Count) rows for slot=$Slot"

$jsonPath = Join-Path $DataDir "$Slot.json"
$htmlPath = Join-Path $RankingDir $(if ($Slot -eq 'test') { 'test.html' } else { "$Slot.html" })
$payload = [ordered]@{
  slot = $Slot
  label = $Label
  capturedAtKst = $CapturedKst
  count = $rows.Count
  rows = @($rows | ForEach-Object {
    [ordered]@{ nickname = $_.nickname; phone = $_.phone; score = $_.score; plays = $_.plays; bestScoreAt = $_.at; id = $_.id }
  })
}
$json = $payload | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($jsonPath, $json, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($htmlPath, (New-SnapshotHtml $rows), [Text.UTF8Encoding]::new($true))
Write-Host "[capture] wrote $htmlPath"
Write-Host "[capture] wrote $jsonPath"

if ($Slot -eq 'test') {
  Write-Host "[capture] test slot — skip git unless -Push with care"
  if (-not $Push) { exit 0 }
}

if ($NoCommit) {
  Write-Host "[capture] NoCommit set — done"
  exit 0
}

Set-Location $RepoRoot
& $Git checkout main | Out-Host
& $Git add -- "wedding/ranking/$([IO.Path]::GetFileName($htmlPath))" "wedding/ranking/data/$Slot.json"
$status = & $Git status --porcelain -- "wedding/ranking"
if (-not $status) {
  Write-Host "[capture] nothing new to commit"
} else {
  $msg = "wedding ranking snapshot $Label ($CapturedKst)"
  & $Git -c user.name=ardmos -c user.email=46891528+ardmos@users.noreply.github.com commit -m $msg | Out-Host
}

if ($Push) {
  Write-Host "[capture] pushing…"
  & $Git push origin main | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "git push failed: $LASTEXITCODE" }
  Write-Host "[capture] push ok"
} else {
  Write-Host "[capture] Push not requested — local commit only (if any)"
}
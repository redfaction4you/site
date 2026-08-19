<#
    One reading of how hard the VPS is working, and what is working it.

    Reads the passive monitor's own CSV for the box-level numbers, so watching
    costs the server almost nothing. That matters here: the reason this question
    went unanswered for a week is that logging in to look was itself suspected of
    causing the lag being measured.

    When the game server is busy it also takes a two second per-process sample,
    because the CSV records only the game's own CPU and that turned out to be the
    small half of the story: at the ten busiest moments of any match on record
    the box was at 35 to 53 percent and the game accounted for 8 to 11 of it.
    Something else is doing the rest and nothing was recording what.
#>
$cred = Import-CliXml C:\RF4U\vps-cred.xml

Invoke-Command -ComputerName 100.102.123.101 -Credential $cred -ScriptBlock {
    $dir = 'C:\RFMatchBroadcast\data\performance'
    $file = Get-ChildItem $dir -Filter '*.csv' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $file) { "no performance csv"; return }

    $tail = Get-Content $file.FullName -Tail 60
    $head = (Get-Content $file.FullName -TotalCount 1) -split ',' | ForEach-Object { $_.Trim('"') }
    $idx = @{}
    for ($i = 0; $i -lt $head.Count; $i++) { $idx[$head[$i]] = $i }

    $rf = @(); $sys = @(); $mem = @()
    foreach ($line in $tail) {
        $c = $line -split ','
        $rf += [double]($c[$idx['rf_cpu_core_percent']].Trim('"'))
        $sys += [double]($c[$idx['system_cpu_percent']].Trim('"'))
        $mem += [double]($c[$idx['available_memory_mb']].Trim('"'))
    }
    $rfMax = ($rf | Measure-Object -Maximum).Maximum
    $rfAvg = [math]::Round(($rf | Measure-Object -Average).Average, 1)
    $sysMax = ($sys | Measure-Object -Maximum).Maximum
    $memMin = ($mem | Measure-Object -Minimum).Minimum

    $busy = $rfMax -gt 15
    $state = if ($busy) { 'MATCH' } else { 'idle ' }
    $line = "{0} {1}  game avg/max {2}/{3}% of a core   box max {4}%   free {5}MB" -f `
        (Get-Date -Format 'HH:mm:ss'), $state, $rfAvg, $rfMax, $sysMax, $memMin

    if (-not $busy) { return $line }

    <#
        Who is using the processor, right now.

        Two snapshots of cumulative CPU seconds two seconds apart, differenced.
        Cheap, and unlike a performance counter it needs no warm-up sample to
        produce a real number. Divided by the elapsed wall time it gives each
        process's share of one core, which is the same unit the CSV uses for the
        game server.
    #>
    $cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
    $first = @{}
    foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
        if ($p.CPU) { $first["$($p.Id)|$($p.ProcessName)"] = $p.CPU }
    }
    $started = Get-Date
    Start-Sleep -Seconds 2
    $elapsed = ((Get-Date) - $started).TotalSeconds

    $used = foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
        $key = "$($p.Id)|$($p.ProcessName)"
        if (-not $p.CPU -or -not $first.ContainsKey($key)) { continue }
        $delta = $p.CPU - $first[$key]
        if ($delta -le 0) { continue }
        [pscustomobject]@{
            Name    = $p.ProcessName
            CorePct = [math]::Round(100 * $delta / $elapsed, 1)
            BoxPct  = [math]::Round(100 * $delta / $elapsed / $cores, 1)
        }
    }

    $top = $used | Sort-Object CorePct -Descending | Select-Object -First 5
    $line
    "         using the processor: " + (($top | ForEach-Object { "$($_.Name) $($_.BoxPct)% of box" }) -join '   ')
} -ErrorAction Stop

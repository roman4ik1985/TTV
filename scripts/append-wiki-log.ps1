[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('ingest', 'query', 'lint', 'config', 'implementation', 'handoff')]
    [string]$Type,

    [Parameter(Mandatory = $true)]
    [string]$Files,

    [Parameter(Mandatory = $true)]
    [string]$Summary,

    [string]$LogPath = 'C:\my-erp-system\wiki\log.md'
)

$importantTypes = @('implementation', 'config', 'handoff')

if (-not (Test-Path -LiteralPath $LogPath)) {
    throw "Log file not found: $LogPath"
}

$parent = Split-Path -Parent $LogPath
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    throw "Log directory not found: $parent"
}

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$line = "- [$timestamp] $Type - $Files - $Summary"

$fileInfo = Get-Item -LiteralPath $LogPath
$needsSeparator = $fileInfo.Length -gt 0

if ($needsSeparator) {
    $stream = [System.IO.File]::Open($LogPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $stream.Seek(-1, [System.IO.SeekOrigin]::End) | Out-Null
        $lastByte = $stream.ReadByte()
        $needsSeparator = $lastByte -ne 10
    } finally {
        $stream.Dispose()
    }
}

$writer = New-Object System.IO.StreamWriter(
    [System.IO.File]::Open($LogPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read),
    (New-Object System.Text.UTF8Encoding($false))
)

try {
    $writer.NewLine = "`n"
    if ($needsSeparator) {
        $writer.WriteLine()
    }
    $writer.WriteLine($line)
} finally {
    $writer.Dispose()
}

if ($importantTypes -contains $Type) {
    Get-Content -LiteralPath $LogPath -Tail 5
} else {
    Write-Output $line
}

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [string]$TemplatePath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TemplatePath)) {
    $TemplatePath = Join-Path $PSScriptRoot "..\.agents\templates\AGENTS.base.md"
}

function New-DirectoryIfMissing {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Write-Utf8FileIfMissing {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Content
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
    }
}

$resolvedProjectPath = [System.IO.Path]::GetFullPath($ProjectPath)
$resolvedTemplatePath = [System.IO.Path]::GetFullPath($TemplatePath)
$projectName = Split-Path -Leaf $resolvedProjectPath

if (-not (Test-Path -LiteralPath $resolvedTemplatePath)) {
    throw "AGENTS template not found: $resolvedTemplatePath"
}

New-DirectoryIfMissing -Path $resolvedProjectPath

$directories = @(
    "raw",
    "raw\sources",
    "raw\web-clipped",
    "raw\assets",
    "wiki",
    "wiki\entities",
    "wiki\concepts",
    "wiki\sources",
    "wiki\synthesis"
)

foreach ($directory in $directories) {
    New-DirectoryIfMissing -Path (Join-Path $resolvedProjectPath $directory)
}

Copy-Item -LiteralPath $resolvedTemplatePath -Destination (Join-Path $resolvedProjectPath "AGENTS.md") -Force

$indexContent = @"
# $projectName

## Sections
- [[entities]]
- [[concepts]]
- [[sources]]
- [[synthesis]]
"@

Write-Utf8FileIfMissing -Path (Join-Path $resolvedProjectPath "wiki\index.md") -Content $indexContent
Write-Utf8FileIfMissing -Path (Join-Path $resolvedProjectPath "wiki\log.md") -Content ""

$handoffTemplateContent = @"
# Handoff

## Goal

## Done

## Next Steps

## Key Files
"@

Write-Utf8FileIfMissing -Path (Join-Path $resolvedProjectPath "wiki\synthesis\HANDOFF_TEMPLATE.md") -Content $handoffTemplateContent

Write-Output "Project initialized: $resolvedProjectPath"
Write-Output "AGENTS template: $resolvedTemplatePath"

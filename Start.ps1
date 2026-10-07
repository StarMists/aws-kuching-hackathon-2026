param([string]$ExistingStack,[string]$Project,[int]$Port=8788)
$ErrorActionPreference='Stop'
$zip=Join-Path $PSScriptRoot 'taotern-source-release-20261007.zip'
$expected='7c42f8133b7480c0f7855d3409a97fae69bcd557f5231c3cc3d8910a4ee189bd'
if(-not(Test-Path $zip)){throw 'Pull/download the authoritative source release ZIP beside Start.ps1.'}
if((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $expected){throw 'Checksum mismatch; do not run mixed/incomplete files.'}
$target=Join-Path $PSScriptRoot '.taotern-releases/7c42f8133b74'
if(-not(Test-Path (Join-Path $target 'local-runtime/Install.ps1'))){New-Item -ItemType Directory -Force $target|Out-Null;Expand-Archive -LiteralPath $zip -DestinationPath $target}
& (Join-Path $target 'local-runtime/Install.ps1') -ExistingStack $ExistingStack -Project $Project -Port $Port
& (Join-Path $target 'local-runtime/Check.ps1') -Port $Port

#Requires -Version 5.1
<# Build native Notaeo and its API sidecar on Windows. No browser assets,
   installer or signing. The publish folder includes the .NET runtime. #>
param(
  [string]$Configuration = "Release",
  [ValidateSet("win-x64", "win-arm64")][string]$Runtime = "win-x64"
)
$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Build the Python sidecar on Windows." }
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PublishDir = Join-Path $RepoRoot "windows/build/Notaeo"
foreach ($Tool in @("uv", "dotnet")) {
  if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) {
    throw "$Tool is required. Install uv and the .NET 10 SDK before building."
  }
}
if (($Runtime -eq "win-arm64") -ne ($env:PROCESSOR_ARCHITECTURE -eq "ARM64")) {
  throw "Build win-x64 with x64 Python on Windows, or win-arm64 with ARM64 Python."
}
Write-Host "1/3 Building API sidecar"
Push-Location (Join-Path $RepoRoot "backend")
try {
  & uv run pyinstaller --noconfirm --clean --distpath dist --workpath build research-backend.spec
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed." }
} finally { Pop-Location }
$SidecarDir = Join-Path $RepoRoot "backend/dist/research-backend"
if (-not (Test-Path (Join-Path $SidecarDir "research-backend.exe"))) {
  throw "The Windows sidecar executable is missing."
}
Write-Host "2/3 Publishing native app with .NET runtime"
& dotnet publish (Join-Path $RepoRoot "windows/Research/Research.csproj") `
  -c $Configuration -r $Runtime --self-contained true -o $PublishDir
if ($LASTEXITCODE -ne 0) { throw "Native app publish failed." }
Write-Host "3/3 Bundling API sidecar"
$BackendDest = Join-Path $PublishDir "Resources/backend/research-backend"
$Resources = Join-Path $PublishDir "Resources"
# Only generated resources are replaced; user data is outside the app.
if (Test-Path $Resources) { Remove-Item -Recurse -Force $Resources }
New-Item -ItemType Directory -Force -Path $BackendDest | Out-Null
Copy-Item -Recurse -Force (Join-Path $SidecarDir "*") $BackendDest
if (-not (Test-Path (Join-Path $BackendDest "research-backend.exe"))) {
  throw "Bundled sidecar executable is missing."
}
Write-Host "Built $PublishDir/Notaeo.exe"

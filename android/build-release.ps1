Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-JavaHome {
  if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    return $env:JAVA_HOME
  }

  $adoptiumRoot = 'C:\Program Files\Eclipse Adoptium'
  if (Test-Path $adoptiumRoot) {
    $candidate = Get-ChildItem $adoptiumRoot -Directory |
      Where-Object { $_.Name -like 'jdk-*' } |
      Sort-Object Name -Descending |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw 'JAVA_HOME not found. Install JDK 17 or set JAVA_HOME first.'
}

function Resolve-AndroidSdkRoot {
  if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
    return $env:ANDROID_SDK_ROOT
  }
  if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
    return $env:ANDROID_HOME
  }

  $defaultSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $defaultSdk) {
    return $defaultSdk
  }

  throw 'ANDROID_SDK_ROOT not found. Install Android SDK or set ANDROID_SDK_ROOT first.'
}

function Resolve-GradleCommand {
  param(
    [string]$ProjectRoot
  )

  $asciiGradleRoot = Join-Path $env:LOCALAPPDATA 'NovelWorkshopReader\tooling\gradle-8.7'
  $asciiGradleBat = Join-Path $asciiGradleRoot 'gradle-8.7\bin\gradle.bat'
  if (Test-Path $asciiGradleBat) {
    return @($asciiGradleBat, 'stageReleaseArtifacts')
  }

  $projectZip = Join-Path $ProjectRoot '.tools\gradle-8.7-bin.zip'
  if (Test-Path $projectZip) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-Item -ItemType Directory -Force -Path $asciiGradleRoot | Out-Null
    if (-not (Test-Path $asciiGradleBat)) {
      [System.IO.Compression.ZipFile]::ExtractToDirectory($projectZip, $asciiGradleRoot)
    }
    if (Test-Path $asciiGradleBat) {
      return @($asciiGradleBat, 'stageReleaseArtifacts')
    }
  }

  return @((Join-Path $ProjectRoot 'gradlew.bat'), 'stageReleaseArtifacts')
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$javaHome = Resolve-JavaHome
$androidSdkRoot = Resolve-AndroidSdkRoot
$gradleHome = if ($env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME
} else {
  Join-Path $HOME '.gradle'
}
$tmpDir = Join-Path $env:LOCALAPPDATA 'NovelWorkshopReader\tmp'
$releaseDir = Join-Path $projectRoot 'releases'
$gradleCommand = Resolve-GradleCommand -ProjectRoot $projectRoot

New-Item -ItemType Directory -Force -Path $gradleHome, $tmpDir, $releaseDir | Out-Null

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidSdkRoot
$env:ANDROID_SDK_ROOT = $androidSdkRoot
$env:GRADLE_USER_HOME = $gradleHome
$env:TEMP = $tmpDir
$env:TMP = $tmpDir
$env:PATH = "$javaHome\bin;$androidSdkRoot\platform-tools;$env:PATH"

Push-Location $projectRoot
try {
  & $gradleCommand[0] $gradleCommand[1]

  $apk = Get-ChildItem $releaseDir -Filter *.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $aab = Get-ChildItem $releaseDir -Filter *.aab | Sort-Object LastWriteTime -Descending | Select-Object -First 1

  $lines = @()
  $lines += "GeneratedAt=$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')"
  $lines += "JavaHome=$javaHome"
  $lines += "AndroidSdkRoot=$androidSdkRoot"

  foreach ($artifact in @($apk, $aab)) {
    if (-not $artifact) { continue }
    $hash = (Get-FileHash $artifact.FullName -Algorithm SHA256).Hash
    $lines += ''
    $lines += "Artifact=$($artifact.Name)"
    $lines += "Size=$($artifact.Length)"
    $lines += "SHA256=$hash"
  }

  $apksigner = Join-Path $androidSdkRoot 'build-tools\34.0.0\apksigner.bat'
  if ($apk -and (Test-Path $apksigner)) {
    $lines += ''
    $lines += '[APK Signature]'
    $lines += (& $apksigner verify --print-certs $apk.FullName)
  }

  Set-Content -Path (Join-Path $releaseDir 'release-manifest.txt') -Value $lines -Encoding UTF8
}
finally {
  Pop-Location
}

# Setup Android SDK without Android Studio (solo herramientas minimas para expo run:android)
# Ejecutar en PowerShell como: .\scripts\setup-android-sdk.ps1

$ErrorActionPreference = "Stop"
$sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"

Write-Host "=== Setup Android SDK (sin Android Studio) ===" -ForegroundColor Cyan
Write-Host "Directorio: $sdkRoot" -ForegroundColor Gray

# Buscar Java (JDK) - en PATH o en ubicaciones comunes
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if (-not $javaCmd) {
    $javaPaths = @(
        "C:\Program Files\Microsoft",
        "C:\Program Files\Java",
        "C:\Program Files\Eclipse Adoptium"
    )
    foreach ($base in $javaPaths) {
        $jdkDir = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "jdk*" } | Select-Object -First 1
        if ($jdkDir -and (Test-Path "$($jdkDir.FullName)\bin\java.exe")) {
            $env:JAVA_HOME = $jdkDir.FullName
            $env:Path = "$($jdkDir.FullName)\bin;$env:Path"
            Write-Host "Java encontrado: $($jdkDir.FullName)" -ForegroundColor Gray
            break
        }
    }
    if (-not $env:JAVA_HOME) {
        Write-Host "Java no encontrado. Instala con: winget install Microsoft.OpenJDK.17" -ForegroundColor Red
        Write-Host "Luego cierra y abre una nueva terminal." -ForegroundColor Yellow
        exit 1
    }
}

# 1. Crear directorio
if (-not (Test-Path $sdkRoot)) {
    New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null
    Write-Host "[OK] Directorio creado" -ForegroundColor Green
} else {
    Write-Host "[OK] Directorio existe" -ForegroundColor Green
}

# 2. Descargar command-line tools
$cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip"
$zipPath = "$env:TEMP\cmdline-tools.zip"

Write-Host "Descargando command-line tools (~150 MB)..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $cmdlineUrl -OutFile $zipPath -UseBasicParsing

# 3. Extraer (el zip trae carpeta "tools", debe quedar en cmdline-tools/latest/)
$tempExtract = "$env:TEMP\android-cmdline-extract"
if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

$latestDir = "$sdkRoot\cmdline-tools\latest"
New-Item -ItemType Directory -Path $latestDir -Force | Out-Null
# El zip puede tener "cmdline-tools/version/" o "tools/"
if (Test-Path "$tempExtract\tools") {
    Copy-Item -Path "$tempExtract\tools\*" -Destination $latestDir -Recurse -Force
} elseif (Test-Path "$tempExtract\cmdline-tools") {
    $inner = Get-ChildItem "$tempExtract\cmdline-tools" -Directory | Select-Object -First 1
    Copy-Item -Path "$($inner.FullName)\*" -Destination $latestDir -Recurse -Force
} else {
    Copy-Item -Path "$tempExtract\*" -Destination $latestDir -Recurse -Force
}
Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Command-line tools instalados" -ForegroundColor Green

# 4. Instalar componentes (platform-tools, platform, build-tools)
$sdkmanager = "$sdkRoot\cmdline-tools\latest\bin\sdkmanager.bat"
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot

Write-Host "Instalando platform-tools (adb)..." -ForegroundColor Yellow
& $sdkmanager --sdk_root=$sdkRoot "platform-tools" 2>&1 | Out-Null

Write-Host "Instalando platform android-34..." -ForegroundColor Yellow
& $sdkmanager --sdk_root=$sdkRoot "platforms;android-34" 2>&1 | Out-Null

Write-Host "Instalando build-tools..." -ForegroundColor Yellow
& $sdkmanager --sdk_root=$sdkRoot "build-tools;34.0.0" 2>&1 | Out-Null

# Aceptar licencias
Write-Host "Aceptando licencias..." -ForegroundColor Yellow
echo "y" | & $sdkmanager --sdk_root=$sdkRoot --licenses 2>&1 | Out-Null

Write-Host "[OK] Componentes instalados" -ForegroundColor Green

# 5. Configurar variables de entorno (persistente)
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkRoot, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkRoot, "User")
$platformTools = "$sdkRoot\platform-tools"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$platformTools*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$platformTools", "User")
}
Write-Host "[OK] Variables de entorno configuradas" -ForegroundColor Green

Write-Host ""
Write-Host "=== Listo ===" -ForegroundColor Cyan
Write-Host "Cierra esta terminal y abre una NUEVA para que tome las variables." -ForegroundColor Yellow
Write-Host "Luego ejecuta: npx expo run:android" -ForegroundColor Yellow
Write-Host "Conecta el telefono por USB con depuracion USB activada." -ForegroundColor Gray

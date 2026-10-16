# Сборка архива расширения для загрузки в Chrome Web Store.
# Запуск (из папки проекта):  powershell -ExecutionPolicy Bypass -File pack-extension.ps1
#
# Что делает: берёт всё из папки extension и кладёт в dist\skipper-flow-<версия>.zip.
# Важно: manifest.json должен лежать в КОРНЕ архива (а не в подпапке extension) — так требует магазин.

$ErrorActionPreference = 'Stop'

# Версию берём из manifest.json, чтобы имя архива всегда совпадало с версией расширения
$manifest = Get-Content -Raw -Encoding UTF8 'extension\manifest.json' | ConvertFrom-Json
$version = $manifest.version

# Предупреждаем, если забыли убрать адреса для разработки
$devHosts = $manifest.host_permissions | Where-Object { $_ -like '*localhost*' -or $_ -like '*127.0.0.1*' }
if ($devHosts) {
  Write-Warning "В host_permissions остались адреса для разработки: $($devHosts -join ', '). Уберите их перед публикацией."
}

New-Item -ItemType Directory -Force 'dist' | Out-Null
$zip = "dist\skipper-flow-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Confirm:$false }

# Собираем zip вручную через .NET, а не через Compress-Archive: в Windows PowerShell 5.1
# Compress-Archive пишет пути с обратной косой чертой (common\prompt.js), что нарушает формат zip,
# и Chrome / магазин могут не найти файлы. Здесь пути всегда с прямой чертой: common/prompt.js.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Resolve-Path 'extension').Path
$zipFullPath = Join-Path (Resolve-Path 'dist').Path "skipper-flow-$version.zip"
$archive = [System.IO.Compression.ZipFile]::Open($zipFullPath, 'Create')
try {
  Get-ChildItem $root -Recurse -File | ForEach-Object {
    # Путь внутри архива — относительно папки extension, поэтому manifest.json окажется в корне архива
    $entryName = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName) | Out-Null
  }
} finally {
  $archive.Dispose()
}

Write-Host "Готово: $zip"

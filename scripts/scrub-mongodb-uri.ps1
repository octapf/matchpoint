$ErrorActionPreference = "Stop"

$targets = @(
  ".env.example",
  "VERCEL_DEPLOY.md"
)

foreach ($path in $targets) {
  if (-not (Test-Path $path)) { continue }

  $content = Get-Content -Raw -Path $path
  if ($null -eq $content) { continue }

  if ($content -match "mongodb\+srv://") {
    # Replace any mongodb+srv URI-ish token with a safe placeholder.
    $updated = [regex]::Replace($content, "mongodb\+srv://[^\s""']+", "<redacted-mongodb-uri>")
    if ($updated -ne $content) {
      Set-Content -Path $path -Value $updated -NoNewline -Encoding UTF8
    }
  }
}


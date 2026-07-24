$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Beesocial scraper API on http://127.0.0.1:8091"
Start-Process -FilePath "python" -ArgumentList @("scraper_api.py") -WorkingDirectory $root -WindowStyle Hidden

Write-Host ""
Write-Host "Open the main frontend and go to: Super Admin > Scraper"
Write-Host ""
Write-Host "If the API does not start, run manually:"
Write-Host "  cd $root"
Write-Host "  python scraper_api.py"

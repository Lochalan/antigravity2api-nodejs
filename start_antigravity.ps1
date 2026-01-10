$projectPath = $PSScriptRoot

if (Test-Path $projectPath) {
    # Change directory to the project folder
    Push-Location $projectPath
    
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host "Starting Antigravity API Server" -ForegroundColor Cyan
    Write-Host "Location: $projectPath" -ForegroundColor Gray
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    
    # Run the npm start command
    npm start
    
    # Restore original location after exit
    Pop-Location
} else {
    Write-Error "Directory not found: $projectPath"
}

# Keep window open if there's an error or on exit
Write-Host "`nServer stopped." -ForegroundColor Yellow
Read-Host "Press Enter to close this window..."

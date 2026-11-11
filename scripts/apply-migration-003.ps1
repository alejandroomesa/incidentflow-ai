# PowerShell script to apply migration 003_auto_resolution.sql
# Usage: .\scripts\apply-migration-003.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Applying Migration 003: Auto-Resolution System" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Check if docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Error: Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Check if MySQL container is running
$mysqlStatus = docker compose ps mysql 2>&1
if ($mysqlStatus -notmatch "Up") {
    Write-Host "Starting MySQL container..." -ForegroundColor Yellow
    docker compose up -d mysql
    Write-Host "Waiting for MySQL to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

# Apply the migration
Write-Host ""
Write-Host "Applying migration..." -ForegroundColor Yellow
Get-Content db\003_auto_resolution.sql | docker compose exec -T mysql mysql -uroot -prootpass incident_flow

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migration 003 applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verification:" -ForegroundColor Cyan
    Write-Host "-------------" -ForegroundColor Cyan
    
    # Verify tables were created
    Write-Host "New tables created:" -ForegroundColor Yellow
    docker compose exec -T mysql mysql -uroot -prootpass incident_flow -e @"
SHOW TABLES LIKE 'risk_evaluations'; 
SHOW TABLES LIKE 'protocols'; 
SHOW TABLES LIKE 'auto_resolutions'; 
SHOW TABLES LIKE 'pii_mappings';
"@
    
    Write-Host ""
    Write-Host "Protocols populated:" -ForegroundColor Yellow
    docker compose exec -T mysql mysql -uroot -prootpass incident_flow -e "SELECT id, category, name, version FROM protocols;"
    
    Write-Host ""
    Write-Host "New columns in incidents table:" -ForegroundColor Yellow
    $describeOutput = docker compose exec -T mysql mysql -uroot -prootpass incident_flow -e "DESCRIBE incidents;"
    $describeOutput | Select-String -Pattern "(risk_level|resolved_at)"
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "Migration complete! The database is ready for auto-resolution features." -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Migration failed. Please check the error messages above." -ForegroundColor Red
    exit 1
}

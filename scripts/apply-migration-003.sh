#!/bin/bash
# Script to apply migration 003_auto_resolution.sql
# Usage: ./scripts/apply-migration-003.sh

set -e

echo "================================================"
echo "Applying Migration 003: Auto-Resolution System"
echo "================================================"

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check if MySQL container is running
if ! docker compose ps mysql | grep -q "Up"; then
    echo "Starting MySQL container..."
    docker compose up -d mysql
    echo "Waiting for MySQL to be ready..."
    sleep 10
fi

# Apply the migration
echo ""
echo "Applying migration..."
docker compose exec -T mysql mysql -uroot -prootpass incident_flow < db/003_auto_resolution.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration 003 applied successfully!"
    echo ""
    echo "Verification:"
    echo "-------------"
    
    # Verify tables were created
    echo "New tables created:"
    docker compose exec -T mysql mysql -uroot -prootpass incident_flow -e \
        "SHOW TABLES LIKE 'risk_evaluations'; 
         SHOW TABLES LIKE 'protocols'; 
         SHOW TABLES LIKE 'auto_resolutions'; 
         SHOW TABLES LIKE 'pii_mappings';"
    
    echo ""
    echo "Protocols populated:"
    docker compose exec -T mysql mysql -uroot -prootpass incident_flow -e \
        "SELECT id, category, name, version FROM protocols;"
    
    echo ""
    echo "New columns in incidents table:"
    docker compose exec -T mysql mysql -uroot -prootpass incident_flow -e \
        "DESCRIBE incidents;" | grep -E "(risk_level|resolved_at)"
    
    echo ""
    echo "================================================"
    echo "Migration complete! The database is ready for auto-resolution features."
    echo "================================================"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi

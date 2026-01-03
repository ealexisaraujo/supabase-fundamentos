#!/bin/bash

# Configuration
# Default backend path from SUPABASE_LOCAL_CONTEXT.md
DEFAULT_BACKEND_PATH="/Users/alexis.araujo/Documents/cursos/supabase_curso"
BACKEND_PATH="${SUPABASE_BACKEND_PATH:-$DEFAULT_BACKEND_PATH}"
DUMP_FILE="supabase_local_backup.sql"
CONTAINER_NAME="supabase_db_supabase_curso"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_backend_path() {
    if [ ! -d "$BACKEND_PATH" ]; then
        echo_error "Backend directory not found at: $BACKEND_PATH"
        echo_error "Please check SUPABASE_LOCAL_CONTEXT.md or set SUPABASE_BACKEND_PATH environment variable."
        exit 1
    fi
}

check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        echo_error "Supabase CLI is not installed."
        exit 1
    fi
}

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo_error "Docker is not running. Please start Docker."
        exit 1
    fi
}

cmd_backup() {
    echo_info "Starting database backup..."
    check_backend_path
    check_supabase_cli
    check_docker

    # Navigate to backend to run supabase commands
    cd "$BACKEND_PATH" || exit

    echo_info "Dumping local database schema..."
    supabase db dump --local > "$OLDPWD/$DUMP_FILE"
    
    echo_info "Appending data to backup..."
    supabase db dump --local --data-only >> "$OLDPWD/$DUMP_FILE"

    if [ $? -eq 0 ]; then
        echo_info "Backup successful! File saved to: $OLDPWD/$DUMP_FILE"
    else
        echo_error "Backup failed."
        exit 1
    fi
}

cmd_restore() {
    INPUT_FILE="${2:-$DUMP_FILE}"

    echo_info "Starting database restore..."
    check_backend_path
    check_docker

    if [ ! -f "$INPUT_FILE" ]; then
        echo_error "Dump file not found: $INPUT_FILE"
        exit 1
    fi

    echo_warn "This will OVERWRITE the current local database in '$CONTAINER_NAME'."
    read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo_info "Restore cancelled."
        exit 0
    fi

    # Navigate to backend to ensure context is correct
    cd "$BACKEND_PATH" || exit

    # Ensure Supabase is running
    echo_info "Ensuring Supabase is running..."
    supabase start --exclude edge-runtime

    echo_info "Resetting database..."
    supabase db reset

    echo_info "Restoring data from $INPUT_FILE..."
    # Use docker exec to pipe the SQL directly to psql inside the container
    # This avoids some CLI parsing issues with large files and uses the native psql tool
    cat "$OLDPWD/$INPUT_FILE" | docker exec -i "$CONTAINER_NAME" psql -U postgres

    if [ $? -eq 0 ]; then
        echo_info "Restore successful!"
    else
        echo_error "Restore failed."
        exit 1
    fi
}

usage() {
    echo "Usage: $0 {backup|restore [file]}"
    echo
    echo "Commands:"
    echo "  backup          Dump the local Supabase database (schema + data) to $DUMP_FILE"
    echo "  restore [file]  Restore the database from a SQL dump file (default: $DUMP_FILE)"
    echo
    echo "Configuration:"
    echo "  Backend Path:   $BACKEND_PATH"
}

# Main execution
case "$1" in
    backup)
        cmd_backup
        ;;
    restore)
        cmd_restore "$@"
        ;;
    *)
        usage
        exit 1
        ;;
esac

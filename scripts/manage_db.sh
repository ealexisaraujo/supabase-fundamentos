#!/bin/bash

# --- Configuration ---
# Dynamically determine the project root directory.
# This makes the script portable.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")

# Allow overriding the backend path via environment variable, but default to the found project root.
BACKEND_PATH="${SUPABASE_BACKEND_PATH:-$PROJECT_ROOT}"
DUMP_FILE="supabase_local_backup.sql"

# --- Colors for output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Helper Functions ---
echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Finds the name of the running Supabase database container.
get_db_container_name() {
    docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -n 1
}

check_backend_path() {
    if [ ! -d "$BACKEND_PATH" ]; then
        echo_error "Backend directory not found at: $BACKEND_PATH"
        echo_error "Please set the SUPABASE_BACKEND_PATH environment variable if it's in a non-standard location."
        exit 1
    fi
}

check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        echo_error "Supabase CLI is not installed. Please install it first."
        exit 1
    fi
}

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo_error "Docker is not running. Please start the Docker daemon."
        exit 1
    fi
}

# --- Commands ---
cmd_backup() {
    echo_info "Starting database backup..."
    check_backend_path
    check_supabase_cli
    check_docker

    # Navigate to backend to run supabase commands
    cd "$BACKEND_PATH" || exit
    
    # Ensure Supabase is running before we try to get the container name
    echo_info "Ensuring Supabase is running..."
    supabase start --exclude edge-runtime

    local container_name
    container_name=$(get_db_container_name)

    if [ -z "$container_name" ]; then
        echo_error "Could not find the Supabase database container. Is Supabase running correctly?"
        exit 1
    fi
    echo_info "Found database container: $container_name"

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
    local INPUT_FILE="${2:-$DUMP_FILE}"

    echo_info "Starting database restore..."
    check_backend_path
    check_docker

    if [ ! -f "$INPUT_FILE" ]; then
        echo_error "Dump file not found: $INPUT_FILE"
        exit 1
    fi
    
    # Navigate to backend to ensure context is correct
    cd "$BACKEND_PATH" || exit

    # Ensure Supabase is running before we try to get the container name
    echo_info "Ensuring Supabase is running..."
    supabase start --exclude edge-runtime

    local container_name
    container_name=$(get_db_container_name)

    if [ -z "$container_name" ]; then
        echo_error "Could not find the Supabase database container. Is Supabase running correctly?"
        exit 1
    fi
    echo_info "Found database container: $container_name"

    echo_warn "This will OVERWRITE the current local database in '$container_name'."
    read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo_info "Restore cancelled."
        exit 0
    fi

    echo_info "Resetting database..."
    supabase db reset

    echo_info "Restoring data from $INPUT_FILE..."
    # Use docker exec to pipe the SQL directly to psql inside the container
    cat "$OLDPWD/$INPUT_FILE" | docker exec -i "$container_name" psql -U postgres

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
    echo "  Backend Path:   $BACKEND_PATH (auto-detected)"
}

# --- Main execution ---
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
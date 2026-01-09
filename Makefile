# Makefile for Suplatzigram Local Development
# Manages Supabase and Redis services together
#
# Usage:
#   make help      - Show all available commands
#   make up        - Start all services (Supabase + Redis)
#   make down      - Stop all services
#   make status    - Check status of all services

.PHONY: help up down status logs clean setup \
        supabase-up supabase-down supabase-status supabase-reset \
        redis-up redis-down redis-status redis-logs redis-cli redis-flush redis-migrate redis-verify \
        prod-verify prod-migrate \
        dev build test

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

#---------------------------------------------------------------------------
# HELP
#---------------------------------------------------------------------------

help: ## Show this help message
	@echo ""
	@echo "$(CYAN)Suplatzigram Local Development$(RESET)"
	@echo "================================"
	@echo ""
	@echo "$(GREEN)Quick Start (New Developer):$(RESET)"
	@echo "  make setup   - Full setup (services + Redis migration)"
	@echo ""
	@echo "$(GREEN)Daily Commands:$(RESET)"
	@echo "  make up      - Start all services (Supabase + Redis)"
	@echo "  make status  - Check status of all services"
	@echo "  make dev     - Start Next.js dev server"
	@echo "  make down    - Stop all services"
	@echo ""
	@echo "$(GREEN)Redis Commands:$(RESET)"
	@echo "  make redis-migrate - Sync counters from Supabase to Redis"
	@echo "  make redis-cli     - Open Redis CLI"
	@echo "  make redis-flush   - Clear all Redis data"
	@echo ""
	@echo "$(GREEN)Production Commands:$(RESET)"
	@echo "  make prod-verify   - Verify Upstash vs Supabase cloud sync"
	@echo "  make prod-migrate  - Migrate counters to Upstash Redis"
	@echo ""
	@echo "$(GREEN)All Commands:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

#---------------------------------------------------------------------------
# ALL SERVICES
#---------------------------------------------------------------------------

up: supabase-up redis-up ## Start all services (Supabase + Redis)
	@echo ""
	@echo "$(GREEN)All services started!$(RESET)"
	@echo "Run 'make status' to verify, then 'make dev' to start the app."

down: redis-down supabase-down ## Stop all services
	@echo ""
	@echo "$(GREEN)All services stopped.$(RESET)"

setup: up redis-migrate ## Full setup for new developers (start services + migrate Redis)
	@echo ""
	@echo "$(GREEN)========================================$(RESET)"
	@echo "$(GREEN)Setup complete!$(RESET)"
	@echo "$(GREEN)========================================$(RESET)"
	@echo ""
	@echo "Your local environment is ready:"
	@echo "  - Supabase: http://localhost:54323 (Studio)"
	@echo "  - Redis: localhost:6379 (TCP)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Run 'make dev' to start the Next.js server"
	@echo "  2. Open http://localhost:3000"
	@echo ""

status: ## Check status of all services
	@echo ""
	@echo "$(CYAN)=== Supabase Status ===$(RESET)"
	@supabase status 2>/dev/null || echo "$(RED)Supabase is not running$(RESET)"
	@echo ""
	@echo "$(CYAN)=== Redis Status ===$(RESET)"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "$(RED)Redis containers not found$(RESET)"
	@echo ""
	@echo "$(CYAN)=== Redis Connection Test ===$(RESET)"
	@redis-cli PING 2>/dev/null | grep -q "PONG" \
		&& echo "$(GREEN)Redis TCP (port 6379): OK$(RESET)" \
		|| echo "$(RED)Redis TCP (port 6379): Not responding$(RESET)"
	@echo ""
	@echo "$(CYAN)=== Redis Counter Keys ===$(RESET)"
	@redis-cli KEYS 'post:likes:*' 2>/dev/null | wc -l | xargs -I {} echo "Post counters: {} keys"
	@echo ""

logs: ## Show logs from all services (Ctrl+C to exit)
	@echo "$(CYAN)Showing Redis logs (Ctrl+C to exit)...$(RESET)"
	@docker compose logs -f

clean: down ## Stop all services and remove volumes
	@echo "$(YELLOW)Removing Redis data volume...$(RESET)"
	@docker volume rm suplatzigram-redis-data 2>/dev/null || true
	@echo "$(GREEN)Clean complete.$(RESET)"

#---------------------------------------------------------------------------
# SUPABASE
#---------------------------------------------------------------------------

supabase-up: ## Start Supabase services
	@echo "$(CYAN)Starting Supabase...$(RESET)"
	@supabase start --exclude edge-runtime
	@echo "$(GREEN)Supabase started.$(RESET)"

supabase-down: ## Stop Supabase services
	@echo "$(CYAN)Stopping Supabase...$(RESET)"
	@supabase stop
	@echo "$(GREEN)Supabase stopped.$(RESET)"

supabase-status: ## Show Supabase status
	@supabase status

supabase-reset: ## Reset Supabase database (runs migrations + seeds)
	@echo "$(YELLOW)Resetting Supabase database...$(RESET)"
	@supabase db reset
	@echo "$(GREEN)Database reset complete.$(RESET)"

#---------------------------------------------------------------------------
# REDIS
#---------------------------------------------------------------------------

redis-up: ## Start Redis containers
	@echo "$(CYAN)Starting Redis...$(RESET)"
	@docker compose up -d
	@echo "$(GREEN)Redis started.$(RESET)"
	@echo "Waiting for Redis to be ready..."
	@sleep 2
	@curl -s -X POST http://localhost:8079 \
		-H "Authorization: Bearer local_development_token" \
		-H "Content-Type: application/json" \
		-d '["PING"]' | grep -q "PONG" \
		&& echo "$(GREEN)Redis is ready!$(RESET)" \
		|| echo "$(YELLOW)Redis may still be starting...$(RESET)"

redis-down: ## Stop Redis containers
	@echo "$(CYAN)Stopping Redis...$(RESET)"
	@docker compose down
	@echo "$(GREEN)Redis stopped.$(RESET)"

redis-status: ## Show Redis container status
	@docker compose ps

redis-logs: ## Show Redis logs (Ctrl+C to exit)
	@docker compose logs -f redis-http

redis-cli: ## Open Redis CLI
	@docker exec -it suplatzigram-redis redis-cli

redis-flush: ## Flush all Redis data (clear cache)
	@echo "$(YELLOW)Flushing Redis cache...$(RESET)"
	@redis-cli FLUSHDB
	@echo "$(GREEN)Redis cache cleared.$(RESET)"

redis-keys: ## List all Redis keys
	@redis-cli KEYS '*'

redis-migrate: ## Sync like counters from Supabase to local Redis
	@echo "$(CYAN)Migrating counters from Supabase to Redis...$(RESET)"
	@npx tsx scripts/migrate-counters-to-redis-local.ts
	@echo ""

redis-verify: ## Verify Redis data matches Supabase
	@echo "$(CYAN)=== Redis vs Supabase Verification ===$(RESET)"
	@echo ""
	@echo "Redis post counters:"
	@redis-cli KEYS 'post:likes:*' | wc -l | xargs -I {} echo "  {} posts in Redis"
	@echo ""
	@echo "Supabase posts:"
	@psql postgresql://postgres:postgres@localhost:54322/postgres -t -c "SELECT COUNT(*) FROM posts_new;" 2>/dev/null | xargs -I {} echo "  {} posts in Supabase"
	@echo ""
	@echo "Redis liked sets:"
	@redis-cli KEYS 'post:liked:*' | wc -l | xargs -I {} echo "  {} posts with likes in Redis"
	@echo ""
	@echo "Supabase ratings:"
	@psql postgresql://postgres:postgres@localhost:54322/postgres -t -c "SELECT COUNT(*) FROM post_ratings;" 2>/dev/null | xargs -I {} echo "  {} ratings in Supabase"
	@echo ""

#---------------------------------------------------------------------------
# PRODUCTION (Upstash + Supabase Cloud)
#---------------------------------------------------------------------------

prod-verify: ## Verify production sync (Upstash vs Supabase cloud)
	@echo "$(CYAN)Verifying production sync...$(RESET)"
	@env $$(cat .env.prod | grep -v '^#' | xargs) npx tsx scripts/verify-production-sync.ts

prod-migrate: ## Migrate counters to production Upstash Redis
	@echo "$(CYAN)Migrating counters to Upstash...$(RESET)"
	@env $$(cat .env.prod | grep -v '^#' | xargs) npx tsx scripts/migrate-counters-to-upstash.ts

#---------------------------------------------------------------------------
# DEVELOPMENT
#---------------------------------------------------------------------------

dev: ## Start Next.js development server
	@echo "$(CYAN)Starting Next.js dev server...$(RESET)"
	@npm run dev

build: ## Build the application
	@npm run build

test: ## Run tests
	@npm run test:run

test-watch: ## Run tests in watch mode
	@npm run test

lint: ## Run linter
	@npm run lint

#---------------------------------------------------------------------------
# QUICK CHECKS
#---------------------------------------------------------------------------

check-docker: ## Verify Docker is running
	@docker info > /dev/null 2>&1 && echo "$(GREEN)Docker is running$(RESET)" || echo "$(RED)Docker is not running$(RESET)"

check-supabase-cli: ## Verify Supabase CLI is installed
	@which supabase > /dev/null 2>&1 && echo "$(GREEN)Supabase CLI: $$(supabase --version)$(RESET)" || echo "$(RED)Supabase CLI not found$(RESET)"

check-node: ## Verify Node.js is installed
	@which node > /dev/null 2>&1 && echo "$(GREEN)Node.js: $$(node --version)$(RESET)" || echo "$(RED)Node.js not found$(RESET)"

check-deps: check-docker check-supabase-cli check-node ## Check all dependencies
	@echo ""
	@echo "$(GREEN)Dependency check complete.$(RESET)"

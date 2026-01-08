# Makefile for Suplatzigram Local Development
# Manages Supabase and Redis services together
#
# Usage:
#   make help      - Show all available commands
#   make up        - Start all services (Supabase + Redis)
#   make down      - Stop all services
#   make status    - Check status of all services

.PHONY: help up down status logs clean \
        supabase-up supabase-down supabase-status supabase-reset \
        redis-up redis-down redis-status redis-logs redis-cli redis-flush \
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
	@echo "$(GREEN)Quick Start:$(RESET)"
	@echo "  make up      - Start all services (Supabase + Redis)"
	@echo "  make status  - Check status of all services"
	@echo "  make dev     - Start Next.js dev server"
	@echo "  make down    - Stop all services"
	@echo ""
	@echo "$(GREEN)Available Commands:$(RESET)"
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

status: ## Check status of all services
	@echo ""
	@echo "$(CYAN)=== Supabase Status ===$(RESET)"
	@supabase status 2>/dev/null || echo "$(RED)Supabase is not running$(RESET)"
	@echo ""
	@echo "$(CYAN)=== Redis Status ===$(RESET)"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "$(RED)Redis containers not found$(RESET)"
	@echo ""
	@echo "$(CYAN)=== Redis Connection Test ===$(RESET)"
	@curl -s -X POST http://localhost:8079 \
		-H "Authorization: Bearer local_development_token" \
		-H "Content-Type: application/json" \
		-d '["PING"]' 2>/dev/null | grep -q "PONG" \
		&& echo "$(GREEN)Redis HTTP API: OK$(RESET)" \
		|| echo "$(RED)Redis HTTP API: Not responding$(RESET)"
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
	@docker exec suplatzigram-redis redis-cli FLUSHDB
	@echo "$(GREEN)Redis cache cleared.$(RESET)"

redis-keys: ## List all Redis keys
	@docker exec suplatzigram-redis redis-cli KEYS '*'

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

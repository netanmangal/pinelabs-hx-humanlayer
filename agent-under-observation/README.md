# Agent Under Observation

A **LangGraph 1.0** multi-capability AI agent for IT support with persistent checkpointing.

## Capabilities

| Tool Category | Tools | Description |
|--------------|-------|-------------|
| Cal.com Calendar | 6 tools | Book meetings, check slots, manage bookings |
| GitHub Issues | 6 tools | Create/manage issues in any repo |
| Ecommerce Database | 6 tools | Query users, products, orders via Supabase |
| Web Search | 1 tool | DuckDuckGo search |

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Fill in your API keys
```

### 3. Initialize Database
```bash
python migrate.py
```

### 4. Run the Agent
```bash
# Default test prompt
python multi_agent.py

# Custom query
python multi_agent.py "show me all pending orders"

# Persistent session (memory across calls)
python multi_agent.py --thread user123 "list open github issues"
```

## Architecture

```
multi_agent.py          # Main entry — LangGraph create_agent + SqliteSaver
calcom_tools.py         # Cal.com API v2 (6 tools)
github_tools.py         # GitHub REST API (6 tools)
ecommerce_db_tools.py   # Supabase PostgreSQL (6 tools)
web_search_tools.py     # DuckDuckGo via ddgs (1 tool)
migrate.py              # Schema creation + seed data
checkpoints.db          # SQLite persistent checkpoint store (auto-created)
```

### Persistent Checkpoints

Uses `langgraph-checkpoint-sqlite` (SqliteSaver) for file-based persistence:
- State survives process restarts
- Thread-isolated sessions via `thread_id`
- Supports human-in-the-loop interrupts (Step 2)

```python
with SqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    agent = create_agent(llm, tools, checkpointer=checkpointer)
    result = agent.invoke({"messages": [...]}, config={"configurable": {"thread_id": "my-session"}})
```

## Cal.com API Version Reference

> Different endpoints require DIFFERENT API version headers:

| Endpoint | Required Version |
|----------|-----------------|
| `/slots` (availability) | `2024-09-04` |
| `/bookings` (create/list) | `2024-08-13` |
| `/event-types` | `2024-06-14` |

## Database Schema

Tables seeded in Supabase for ecommerce testing:

```
categories   → products → order_items ┐
users        → orders   → payments    ├→ invoices
users        → addresses              ┘
```

Run `python migrate.py --verify` to check row counts.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o) |
| `CALCOM_CALENDAR_API_KEY` | Cal.com v2 API key |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub PAT (scopes: repo, issues) |
| `GITHUB_DEFAULT_REPO` | Default GitHub repo (`owner/repo`) |
| `SUPABASE_SESSION_POOLER_URL` | Supabase PostgreSQL connection URL |

## Test Individual Tools

```bash
python calcom_tools.py        # Cal.com profile + event types
python github_tools.py        # GitHub issues list
python ecommerce_db_tools.py  # DB overview + user query
python web_search_tools.py    # DuckDuckGo test search
```

## Next Steps

This is **Step 1** of the Human-in-the-Loop project.

**Step 2** will add human approval gates using `interrupt_before` on sensitive tools:
```python
agent = create_agent(
    llm, tools,
    checkpointer=checkpointer,
    interrupt_before=["calendar_create_booking", "github_create_issue"]
)
```

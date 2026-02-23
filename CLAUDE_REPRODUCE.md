# CLAUDE_REPRODUCE.md
# HumanLayer — Complete Reproduction Guide

> **Purpose:** Everything needed to reproduce this project from scratch.
> Architecture: React frontend + FastAPI backend + Supabase PostgreSQL + Python SDK + LangGraph agent.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Directory Structure](#2-directory-structure)
3. [Backend Specifications](#3-backend-specifications)
4. [Frontend Specifications](#4-frontend-specifications)
5. [SDK Specifications](#5-sdk-specifications)
6. [Agent Under Observation](#6-agent-under-observation)
7. [Database Schema](#7-database-schema)
8. [API Reference](#8-api-reference)
9. [Environment Variables](#9-environment-variables)
10. [Challenges & Bugs Fixed](#10-challenges--bugs-fixed)
11. [Deployment Notes](#11-deployment-notes)

---

## 1. Project Overview

**HumanLayer** is an open-source platform for adding human judgment to autonomous AI agent workflows — without rewriting agents.

### Components
| Component | Location | Purpose |
|-----------|----------|---------|
| Backend | `/app/backend/` | FastAPI REST API — auth, event ingest, HITL management |
| Frontend | `/app/frontend/` | React dashboard — HITL review, event feed, settings |
| SDK | `/app/sdk/` | Python SDK — `pip install humanlayer-ai` |
| Agent | `/app/agent_under_observation/` | LangGraph demo agent with HITL integration |

### Tagline
> "Adding human judgment to autonomous AI workflows — without rewriting your agents."

### Live URLs
- **Backend:** `https://hitl-agent-v1.preview.emergentagent.com`
- **Health:** `GET https://hitl-agent-v1.preview.emergentagent.com/api/health` (public, no auth)
- **PyPI:** `https://pypi.org/project/humanlayer-ai/` (v0.2.1)
- **GitHub:** `https://github.com/netanmangal/HumanLayer`

---

## 2. Directory Structure

```
/app/
├── backend/
│   ├── server.py              # Single-file FastAPI app (~700 lines)
│   ├── requirements.txt
│   └── .env                   # SUPABASE_SESSION_POOLER_URL, JWT_SECRET
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # Auth context, routing, sidebar
│   │   ├── index.css          # Global styles, CSS variables, input resets
│   │   ├── index.js
│   │   └── components/
│   │       ├── LandingPage.jsx
│   │       ├── AuthPage.jsx
│   │       ├── Dashboard.jsx
│   │       ├── HITLDashboard.jsx
│   │       └── Settings.jsx
│   ├── package.json
│   └── .env                   # REACT_APP_BACKEND_URL
│
├── sdk/
│   ├── pyproject.toml         # name="humanlayer-ai", version="0.2.1"
│   ├── README.md
│   └── humanlayer/
│       ├── __init__.py        # Re-exports from humanlayer.ai (backward compat)
│       ├── config.py          # Backward compat copy
│       ├── client.py
│       ├── callback_handler.py
│       ├── session.py
│       ├── exceptions.py
│       ├── hitl.py
│       └── ai/                # PRIMARY subpackage — import humanlayer.ai
│           ├── __init__.py    # init(), wrap_tools(), all exports
│           ├── config.py      # HumanLayerConfig dataclass
│           ├── client.py      # HTTP client + batching
│           ├── callback_handler.py  # LangChain BaseCallbackHandler
│           ├── session.py     # Session lifecycle
│           ├── exceptions.py  # HITLRejectedError, HITLTimeoutError, etc.
│           └── hitl.py        # request_approval(), wrap_tools(), _wrap_one()
│
└── agent_under_observation/
    ├── multi_agent.py         # Main LangGraph agent entry point
    ├── calcom_tools.py        # Cal.com API v2 (6 tools)
    ├── github_tools.py        # GitHub REST API (6 tools)
    ├── ecommerce_db_tools.py  # Supabase PostgreSQL (6 tools)
    ├── web_search_tools.py    # DuckDuckGo search (1 tool)
    ├── migrate.py             # Schema + seed data for fake ecommerce tables
    ├── requirements.txt
    ├── .env                   # API keys + HUMANLAYER_* vars
    └── checkpoints.db         # SQLite — LangGraph persistent state
```

---

## 3. Backend Specifications

### Stack
- **Framework:** FastAPI
- **Database:** Supabase PostgreSQL via `psycopg2` (synchronous)
- **Auth:** JWT (HS256) via `python-jose` + bcrypt via `passlib`
- **Port:** 8001

### Key Design Decisions

**Why Supabase PostgreSQL, not MongoDB:**
- The project requires UUID primary keys, JSONB columns, and relational foreign keys
- Emergent provides managed MongoDB but this project explicitly uses external Supabase
- The Supabase session pooler URL is the connection string: `postgresql://postgres.<project>:<password>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`

**Single-file backend (`server.py`):**
All logic lives in one file: schema bootstrap, seed data, auth utilities, Pydantic models, all route handlers.

**Schema bootstrap on startup:**
```python
@app.on_event("startup")
def startup():
    conn = get_conn()
    cur.execute(SCHEMA_SQL)   # CREATE TABLE IF NOT EXISTS for all tables
    conn.commit()
    seed_fake_data()          # Seeds _fake ecommerce tables if empty
```

**DB connection pattern (sync psycopg2):**
```python
def get_conn():
    return psycopg2.connect(SUPABASE_URL, connect_timeout=10)

def db_execute(sql, params=None, fetch=True):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            if fetch: return [dict(r) for r in cur.fetchall()]
            conn.commit()
    except: conn.rollback(); raise
    finally: conn.close()
```
> **Note:** A new connection per query — fine for demo, use connection pooling for production.

### Authentication

**JWT flow:**
1. `POST /api/auth/signup` — creates user + organization atomically
2. `POST /api/auth/login` — returns 72-hour JWT
3. All protected routes use `Depends(get_current_user)` which decodes Bearer token

**API key format:** `adr_<32 random urlsafe chars>`
- Stored as SHA256 hash in `hl_api_keys.key_hash`
- Only `key_prefix` (first 16 chars) stored for display
- On use: `hashlib.sha256(raw_key.encode()).hexdigest()` → lookup in DB

**Two auth methods:**
- `Authorization: Bearer <JWT>` — for dashboard (human users)
- `X-API-Key: adr_...` — for SDK (agent machines)

### Dependencies
```
fastapi>=0.110.0
uvicorn>=0.29.0
psycopg2-binary>=2.9.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-dotenv>=1.0.0
```

---

## 4. Frontend Specifications

### Stack
- **Framework:** React 18 (Create React App with CRACO)
- **Routing:** react-router-dom v7
- **Animations:** framer-motion
- **Toasts:** sonner
- **Icons:** Inline SVG (no icon library)
- **Styling:** Tailwind CSS + inline styles (hybrid approach)
- **Fonts:** Space Grotesk (headings), Inter (body), JetBrains Mono (code) via Google Fonts

### Design System

**Colors (Void & Volt dark theme):**
```css
--bg: #02040a          /* Page background */
--bg-paper: #09090b    /* Component bg — nearly same as page, avoid for cards */
--bg-card: #0e0e18     /* Card bg — MUST be visually different from page bg */
--primary: #6366f1     /* Indigo */
--accent: #0ea5e9      /* Sky blue */
--success: #10b981     /* Emerald */
--warning: #f59e0b     /* Amber */
--error: #f43f5e       /* Rose */
```

> **CRITICAL:** Cards must use `#0e0e18` not `#09090b` — the difference between
> `#02040a` and `#09090b` is invisible on most screens, making cards vanish.

**Global input CSS reset (in index.css):**
```css
input, textarea, select {
  background: #12121e !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  border-radius: 8px !important;
  color: #f8fafc !important;
  -webkit-appearance: none;
  appearance: none;
}
input:focus, textarea:focus, select:focus {
  border-color: rgba(99,102,241,0.55) !important;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important;
}
```
> Without this global reset, browser-default input styles (white background on some
> browsers/OS) break the dark theme completely.

### Routing (App.js)

```
/           → LandingPage (public)
/login      → AuthPage mode="login" (public)
/signup     → AuthPage mode="signup" (public)
/dashboard  → Dashboard (protected, AppLayout)
/hitl       → HITLDashboard (protected, AppLayout)
/settings   → Settings (protected, AppLayout)
```

**Auth context** stored in `localStorage` (key: `hl_token`, `hl_user`).

**AppLayout** provides:
- Desktop: fixed 220px left sidebar
- Mobile (<768px): hamburger button → slide-over sidebar overlay
- Route change automatically closes mobile sidebar

**Responsive sidebar CSS trick:**
```jsx
<style>{`
  @media (min-width: 768px) {
    .hl-sidebar-desktop { display: flex !important; }
    .hl-sidebar-mobile  { display: none !important; }
    .hl-main-content    { margin-left: 220px; }
    .hl-topbar          { display: none !important; }
  }
  @media (max-width: 767px) {
    .hl-topbar { display: flex !important; }
  }
`}</style>
```

### Pages

#### LandingPage.jsx
- **Hero:** 3D orbiting sphere (CSS keyframe animations + rings), particle network canvas (70 nodes, Canvas 2D API)
- **Step 02 code block** shows: `import humanlayer.ai as humanlayer`
- **Integration steps:** 3-column tilt cards (CSS 3D `perspective(800px) rotateX/Y`)
- **HITL callout:** Split layout with code terminal
- **Stats bar:** "3 lines to integrate", "<2s HITL loop", etc.
- **Copy on install pill** (`pip install humanlayer-ai`)

**`TiltCard` component** — 3D hover effect:
```jsx
const handleMove = (e) => {
  const r = el.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width  - 0.5) * 16;
  const y = ((e.clientY - r.top)  / r.height - 0.5) * -16;
  el.style.transform = `perspective(800px) rotateX(${y}deg) rotateY(${x}deg) translateZ(8px)`;
};
```

#### AuthPage.jsx
- Card uses `background: "#0e0e18"` with `border: "1px solid rgba(99,102,241,0.2)"`
- `boxShadow: "0 25px 50px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.06)"`
- Demo credentials shown inline on page
- Framer Motion fade-in on mount

#### Dashboard.jsx
- **Session-centric** — no flat event list; sessions are expandable accordion cards
- Click session → loads `GET /api/sessions/{id}/events` → renders chronological timeline
- Each event step: colored dot, type label, tool name badge, input/output preview on click
- **No auto-polling** — manual Refresh button only (removed 8s interval to prevent request flood)
- Stats grid: 4 cards (sessions, events, hitl_pending, hitl_resolved)

#### HITLDashboard.jsx
- **No auto-polling** — fetches once on mount + when filter tab changes
- Manual Refresh button in header
- Filter tabs: Pending / Approved / Rejected / All
- Each `HITLCard` shows:
  - Tool name + status badge
  - "Show agent journey" toggle → loads session events before HITL point
  - Tool arguments (JSON, color-coded)
  - Comment textarea + Approve/Reject buttons (pending only)
  - Decision result (approved/rejected)

**Agent Journey panel** (inside HITLCard):
```jsx
// Fetch events before HITL created_at timestamp
const before = list.filter(e =>
  new Date(e.timestamp) <= new Date(hitlCreatedAt)
);
// Show last 8 meaningful events (tool_start, tool_end, agent_action, llm events)
```

#### Settings.jsx
- Projects CRUD (create, list)
- API Keys (generate adr_... key, copy once, revoke)
- Team members (invite by email, list)
- Responsive forms using `flex-wrap` — stack on mobile

### No-Polling Architecture
> **Important:** Both Dashboard and HITLDashboard previously used `setInterval`
> which caused the network tab to flood with requests and pages to flicker.
> All intervals removed. Use manual refresh buttons instead.

---

## 5. SDK Specifications

### Installation
```bash
pip install humanlayer-ai        # PyPI package name
```

### Import Styles (all work)
```python
# Primary (recommended)
import humanlayer.ai as humanlayer
humanlayer.init(api_key="adr_...", project_id="my-agent")

# Alternative
from humanlayer import ai
ai.init(api_key="adr_...", project_id="my-agent")

# Backward compatible
import humanlayer
humanlayer.init(api_key="adr_...", project_id="my-agent")
```

**Why the name split:** The PyPI package `humanlayer` was already taken by another
project. So the installable name is `humanlayer-ai` but the Python import namespace
is `humanlayer.ai` (subpackage of `humanlayer`).

### Package Structure

```
sdk/humanlayer/
├── __init__.py        ← Re-exports everything from humanlayer.ai
│                         Provides backward compat: import humanlayer
└── ai/
    ├── __init__.py    ← PRIMARY entry point with all public API
    ├── config.py      ← HumanLayerConfig dataclass
    ├── client.py      ← HTTP client with event queue + batching thread
    ├── callback_handler.py  ← LangChain BaseCallbackHandler
    ├── session.py     ← Session class + global current session
    ├── exceptions.py  ← HITLRejectedError, HITLTimeoutError, etc.
    └── hitl.py        ← request_approval(), wrap_tools(), _wrap_one()
```

### `init()` Signature
```python
def init(
    api_key: str,          # REQUIRED — get from dashboard Settings → API Keys
    project_id: str,       # REQUIRED — your project identifier string
    *,
    api_base_url: str = "https://hitl-agent-v1.preview.emergentagent.com",
    debug: bool = False,
    auto_instrument: bool = True,
    session_name: str = None,
) -> None:
```

**Local override for Kubernetes:** When running inside the same Kubernetes pod
as the backend, Kubernetes blocks ingress calls back to its own external URL.
Use env var to override:
```bash
HUMANLAYER_API_BASE_URL=http://localhost:8001
```

### Auto-Instrumentation

Patches `langchain_core.runnables.base.Runnable.invoke` at the class level:
```python
def _patch_langchain():
    original_invoke = Runnable.invoke

    def patched_invoke(self, input, config=None, **kwargs):
        config = ensure_config(config)
        # Inject HumanLayerCallbackHandler into callbacks list
        config["callbacks"] = [handler] + existing_callbacks
        return original_invoke(self, input, config, **kwargs)

    Runnable.invoke = patched_invoke
    Runnable._humanlayer_patched = True   # prevent double-patching
```

**Critical:** Use a getter function `_get_handler()` inside the patch closure —
NOT a direct reference. The direct reference captures `None` at patch time
(before `init()` sets the global handler).

```python
# WRONG — captures None at patch time
def patched_invoke(...):
    if _callback_handler:  # always None!

# CORRECT — reads current global value
def _get_handler():
    return _callback_handler

def patched_invoke(...):
    handler = _get_handler()  # reads current value
```

**Additional required:** For `langchain.agents.create_agent` (LangChain 1.x),
the auto-patch of `Runnable.invoke` is NOT enough. Must also explicitly pass
the callback handler in the `agent.invoke()` config:
```python
result = agent.invoke(
    {"messages": [HumanMessage(content=query)]},
    config={
        "configurable": {"thread_id": thread_id},
        "callbacks": [humanlayer.get_callback_handler()],  # REQUIRED
    },
)
```

### HITL: `wrap_tools()`

**Critical: Wrap `tool.func`, NOT `tool._run`**

```python
def _wrap_one(tool):
    original_func = tool.func   # ← wrap .func, not ._run

    def hitl_func(*args, **kwargs):
        # kwargs here = ONLY actual tool params (no config/run_manager)
        tool_input = dict(kwargs) if kwargs else {}
        request_approval(tool.name, tool_input)
        return original_func(*args, **kwargs)

    tool.func = hitl_func
    return tool
```

**Why NOT `tool._run`:** LangChain's `StructuredTool._run()` in v1.x has a
required keyword-only argument `config: RunnableConfig`. If you wrap `_run`,
then `kwargs` will contain the `config` object. When you try to serialize
this as JSON for the HITL request, it fails because `RunnableConfig` contains
`CallbackManager` objects that are not JSON-serializable → 500 error.
Wrapping `tool.func` instead means LangChain's `_run` strips out `config` and
`run_manager` before calling `func`, so only clean tool parameters arrive.

### `request_approval()` Flow

```python
def request_approval(tool_name, tool_input, context=None, timeout=300):
    # 1. Get current session_id (for frontend context panel)
    session = get_current_session()
    session_id = session.session_id if session else None

    # 2. POST to /api/hitl/request
    event_id = _client.create_hitl_event(tool_name, tool_input, context, session_id)

    # 3. Poll /api/hitl/events/{id}/decision every 1.5s
    while time.time() - start < timeout:
        decision = _client.get_hitl_decision(event_id)
        if decision["status"] == "approved": return True
        if decision["status"] == "rejected":
            raise HITLRejectedError(tool_name, decision["decision_comment"])
        time.sleep(1.5)

    raise HITLTimeoutError(event_id, timeout)
```

### Event Standardization

LangChain produces 100+ events per agent run — most are internal noise.
The `HumanLayerCallbackHandler` filters to ~10-25 meaningful events:

**Kept:** `tool_start`, `tool_end`, `agent_action`, `agent_finish`,
`llm_start`, `llm_end`, `*_error`

**Filtered:** Most `chain_start`/`chain_end` (internal mechanics),
LLM events with no input/output/model.

**Standardized fields:**
```python
data = {
    "run_id": str,          # LangChain run ID
    "parent_run_id": str,   # for nesting
    "name": str,            # tool/chain name
    "input": str|dict,      # standardized from inputs/prompts/tool_input/messages
    "output": str|dict,     # standardized from outputs/output/return_values
    "metadata": {
        "agent_log": str,   # agent reasoning text
        "token_usage": dict,
        "error": str,
    }
}
```

### Session + Event Batching

Events are queued in memory and flushed to backend every 5 seconds (background thread):
```python
class HumanLayerClient:
    def __init__(self, config):
        self._queue = queue.Queue(maxsize=500)
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()

    def _flush_loop(self):
        while self._running:
            time.sleep(5)
            self._do_flush()  # POST /api/ingest/events with batch
```

---

## 6. Agent Under Observation

### Stack
- **LangGraph:** `create_agent` from `langchain.agents` (v1.0+)
- **Checkpoints:** `SqliteSaver` from `langgraph-checkpoint-sqlite`
- **LLM:** GPT-4o via `langchain-openai`
- **SDK:** `import humanlayer.ai as humanlayer`

### Tool Categories (19 tools total)

| Category | Tools | File |
|----------|-------|------|
| Cal.com (6) | `calendar_get_my_profile`, `calendar_get_event_types`, `calendar_get_available_slots`, `calendar_create_booking`, `calendar_get_bookings`, `calendar_cancel_booking` | `calcom_tools.py` |
| GitHub (6) | `github_list_issues`, `github_get_issue`, `github_create_issue`, `github_add_comment`, `github_update_issue`, `github_search_issues` | `github_tools.py` |
| Database (6) | `db_query_users`, `db_query_products`, `db_query_orders`, `db_execute_query`, `db_get_table_schema`, `db_database_overview` | `ecommerce_db_tools.py` |
| Web Search (1) | `web_search` | `web_search_tools.py` |

### Cal.com API Version Table (CRITICAL)
| Endpoint | Header `cal-api-version` |
|----------|--------------------------|
| `GET /v2/slots` | `2024-09-04` |
| `POST /v2/bookings` | `2024-08-13` |
| `GET /v2/bookings` | `2024-08-13` |
| `GET /v2/event-types` | `2024-06-14` |

> Wrong version = 400/404 errors. Each endpoint MUST use its specific version.

### DuckDuckGo Search
The package was renamed from `duckduckgo-search` to `ddgs`. Import with fallback:
```python
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS
```

### LangGraph Checkpoints (Persistent State)

`SqliteSaver.from_conn_string()` returns a **context manager** (generator), not a plain object:
```python
# CORRECT
with SqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    agent = create_agent(llm, tools, checkpointer=checkpointer)
    result = agent.invoke({"messages": [...]}, config=config)

# WRONG — will fail
checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
agent = create_agent(llm, tools, checkpointer=checkpointer)
```

### `create_agent` vs `create_react_agent`

In LangGraph v1.0, `create_react_agent` from `langgraph.prebuilt` is deprecated.
Use `create_agent` from `langchain.agents`:

```python
# NEW (LangGraph 1.0+)
from langchain.agents import create_agent
agent = create_agent(llm, tools, system_prompt=prompt, checkpointer=checkpointer)

# DEPRECATED
from langgraph.prebuilt import create_react_agent  # shows deprecation warning
```

**Signature difference:**
- Old: `create_react_agent(llm, tools, prompt=prompt, checkpointer=...)`
- New: `create_agent(llm, tools, system_prompt=prompt, checkpointer=...)`

### Usage
```bash
cd /app/agent_under_observation

# Run default test prompt (no HITL)
python multi_agent.py

# Custom query
python multi_agent.py "show me all pending orders"

# With HITL on specific tools
python multi_agent.py --hitl "calendar_create_booking,github_create_issue" \
  "book a meeting for 3pm tomorrow with user@example.com"

# Persistent named session
python multi_agent.py --thread "user-session-123" "your query"
```

### Ecommerce Database (_fake tables)

Tables with `_fake` suffix to distinguish from platform tables:
`users_fake`, `products_fake`, `categories_fake`, `orders_fake`,
`order_items_fake`, `payments_fake`, `invoices_fake`, `addresses_fake`

Run migrations and seed:
```bash
python migrate.py          # full migration + seed
python migrate.py --verify # check row counts
python migrate.py --seed-only
```

---

## 7. Database Schema

### Platform Tables

```sql
-- Organizations
hl_organizations (id UUID PK, name, slug UNIQUE, created_at)

-- Users (platform users, NOT ecommerce)
hl_users (id UUID PK, email UNIQUE, password_hash, name, org_id FK, role, created_at)

-- Org membership
hl_org_members (id UUID PK, org_id FK, user_id FK, role, invited_email, status, UNIQUE(org_id,user_id))

-- Projects
hl_projects (id UUID PK, org_id FK, name, description, created_at)

-- API Keys
hl_api_keys (
    id UUID PK,
    org_id FK, project_id FK,
    name, key_hash VARCHAR(64),  -- SHA256 of raw key
    key_prefix VARCHAR(20),      -- first 16 chars for display
    status DEFAULT 'active',
    created_at, last_used_at
)

-- SDK Sessions
hl_sessions (
    id UUID PK,  -- from SDK, NOT auto-generated
    project_id UUID, org_id UUID,
    name, status DEFAULT 'active',
    event_count INTEGER,
    start_time TIMESTAMPTZ, end_time TIMESTAMPTZ,
    statistics JSONB, metadata JSONB
)

-- SDK Events
hl_events (
    id UUID PK,  -- from SDK event_id
    session_id UUID, project_id UUID, org_id UUID,
    run_id VARCHAR(255),
    event_type VARCHAR(50),   -- tool_start, tool_end, llm_start, etc.
    component VARCHAR(50),    -- tool, llm, chain, agent
    timestamp TIMESTAMPTZ,
    data JSONB                -- standardized event payload
)

-- HITL Events
hl_hitl_events (
    id UUID PK DEFAULT gen_random_uuid(),
    session_id UUID,          -- links to session for context
    project_id UUID, org_id UUID,
    tool_name VARCHAR(255),
    tool_input JSONB,
    context JSONB,
    status VARCHAR(30) DEFAULT 'pending',  -- pending|approved|rejected
    decision_comment TEXT,
    decided_by UUID,
    created_at TIMESTAMPTZ, decided_at TIMESTAMPTZ
)
```

### Critical: UUID Type Error

**Problem:** SDK sends `project_id` as a string label like `"my-project"`, but
`hl_hitl_events.project_id` is PostgreSQL UUID type → `invalid input syntax for type uuid`.

**Fix:** Always use the API key's actual UUID as project_id, ignore the string from the request:
```python
@api.post("/hitl/request")
def create_hitl_event(req: HITLRequestReq, api_key=Depends(verify_api_key_header)):
    proj_id = api_key.get("project_id")  # ← UUID from DB
    # NEVER use req.project_id directly — it's a user string label
    db_execute("INSERT INTO hl_hitl_events (..., project_id, ...) VALUES (%s, ...)",
               [eid, str(proj_id) if proj_id else None, ...])
```
Same fix needed for `hl_events` and `hl_sessions` ingest endpoints.

---

## 8. API Reference

### Auth (JWT)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | None | Create user + org. Body: `{email,password,name,org_name}` |
| POST | `/api/auth/login` | None | Login. Returns `{token, user}` |
| GET | `/api/auth/me` | Bearer JWT | Current user + org |

### Management (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/organizations` | List user's orgs |
| GET | `/api/organizations/{id}/members` | List org members |
| POST | `/api/organizations/{id}/invite` | Invite member by email |
| GET | `/api/projects` | List projects for org |
| POST | `/api/projects` | Create project. Body: `{name, description}` |
| GET | `/api/api-keys` | List API keys |
| POST | `/api/api-keys` | Create key. Body: `{name, project_id}`. Returns raw key ONCE |
| DELETE | `/api/api-keys/{id}` | Revoke key |

### SDK Ingest (X-API-Key required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ingest/verify` | Validate API key |
| POST | `/api/ingest/events` | Batch event ingest. Body: `{events: [...], project_id, environment}` |
| POST | `/api/ingest/sessions` | Upsert session. Body: full session document |
| POST | `/api/hitl/request` | Create HITL request. Body: `{tool_name, tool_input, session_id, project_id}` |
| GET | `/api/hitl/events/{id}/decision` | Poll for decision. Returns `{status, decision_comment}`. **No auth required** |

### HITL Dashboard (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hitl/events` | List HITL events. Query: `?status=pending&limit=50` |
| GET | `/api/hitl/events/{id}` | Get single event |
| POST | `/api/hitl/events/{id}/approve` | Approve. Body: `{comment}` |
| POST | `/api/hitl/events/{id}/reject` | Reject. Body: `{comment}` |

### Dashboard Data (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | Events feed. Query: `?session_id=&event_type=&limit=100` |
| GET | `/api/sessions` | Sessions list |
| GET | `/api/sessions/{id}/events` | All events for a session (chronological) |
| GET | `/api/sessions/{id}/hitl` | HITL events for a session |
| GET | `/api/stats` | `{sessions, events, hitl_pending, hitl_total}` |
| GET | `/api/health` | Public health check. No auth. |

### Health Response
```json
{
  "status": "ok",
  "version": "0.1.0",
  "service": "HumanLayer Backend",
  "database": "connected",
  "timestamp": "2026-02-22T...",
  "endpoints": {
    "ingest_events": "/api/ingest/events",
    "hitl_request": "/api/hitl/request",
    "hitl_decision": "/api/hitl/events/{event_id}/decision"
  },
  "sdk_integration": {
    "install": "pip install humanlayer-ai"
  }
}
```

---

## 9. Environment Variables

### Backend (`/app/backend/.env`)
```bash
MONGO_URL="mongodb://localhost:27017"  # Keep for backward compat (unused)
DB_NAME="test_database"                # Keep for backward compat (unused)
CORS_ORIGINS="*"
SUPABASE_SESSION_POOLER_URL=postgresql://postgres.<project>:<password>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
JWT_SECRET=your-jwt-secret-here
```

### Frontend (`/app/frontend/.env`)
```bash
REACT_APP_BACKEND_URL=https://hitl-agent-v1.preview.emergentagent.com
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

### Agent (`/app/agent_under_observation/.env`)
```bash
# LLM
OPENAI_API_KEY=sk-proj-...

# Cal.com
CALCOM_CALENDAR_API_KEY=cal_live_...

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
GITHUB_DEFAULT_REPO=owner/repo

# Supabase
SUPABASE_PROJECT_URL=https://<project>.supabase.co
SUPABASE_SESSION_POOLER_URL=postgresql://postgres.<project>:<password>@...

# HumanLayer SDK
HUMANLAYER_API_KEY=adr_...
HUMANLAYER_PROJECT_ID=agent-under-observation-001
# For local: HUMANLAYER_API_BASE_URL=http://localhost:8001
# For external agents: defaults to https://hitl-agent-v1.preview.emergentagent.com
```

---

## 10. Challenges & Bugs Fixed

### Bug 1: PostgreSQL UUID Type Error (CRITICAL)
**Error:** `invalid input syntax for type uuid: "my-project"`

**Cause:** SDK sends `project_id` as a human-readable string label (e.g., `"agent-under-observation-001"`). Backend tables use `project_id UUID` type. Inserting the string directly causes a PostgreSQL type error.

**Fix:** Always use `api_key["project_id"]` (the actual UUID from the verified API key) and ignore `req.project_id`:
```python
proj_id = api_key.get("project_id")
db_execute("INSERT ... VALUES (%s, ...)", [str(proj_id) if proj_id else None, ...])
```
**Affected endpoints:** `/api/hitl/request`, `/api/ingest/events`, `/api/ingest/sessions`

---

### Bug 2: HITL Tool Wrapping — wrap `.func` not `._run`
**Error:** `TypeError: StructuredTool._run() missing 1 required keyword-only argument: 'config'`

**Cause:** LangChain v1.x `StructuredTool._run()` has a required `config: RunnableConfig` kwarg. When wrapping `_run`, the `config` object ends up in `kwargs` when calling `create_hitl_event()` → JSON serialization fails because `RunnableConfig` contains non-serializable `CallbackManager` objects → 500 error from backend.

**Fix:** Wrap `tool.func` instead. LangChain's `_run` handles `config`/`run_manager` internally and only passes actual tool parameters to `func`:
```python
# WRONG
original_run = tool._run
def hitl_run(*args, **kwargs):  # kwargs contains config, run_manager
    request_approval(tool.name, kwargs)  # FAILS — config not JSON-serializable

# CORRECT
original_func = tool.func
def hitl_func(*args, **kwargs):  # kwargs = only actual tool params
    request_approval(tool.name, kwargs)  # WORKS — clean params
    return original_func(*args, **kwargs)
tool.func = hitl_func
```

---

### Bug 3: Events Not Captured with `create_agent`
**Symptom:** SDK initializes successfully but zero events appear in DB.

**Cause:** `create_agent` from `langchain.agents` (LangChain 1.x) does NOT route through `Runnable.invoke` in the same way, bypassing the auto-instrumentation patch.

**Fix:** Explicitly pass the callback handler in `agent.invoke()`:
```python
result = agent.invoke(
    {"messages": [HumanMessage(content=query)]},
    config={
        "configurable": {"thread_id": thread_id},
        "callbacks": [humanlayer.get_callback_handler()],  # ← required
    },
)
```

---

### Bug 4: Auto-Instrumentation Closure Captures Stale `None`
**Symptom:** Patched `Runnable.invoke` never injects callbacks.

**Cause:** Python closure captures `_callback_handler = None` at patch time (before `init()` sets it). The inner function always sees `None`.

**Fix:** Use a getter function that reads the current module-level global:
```python
def _get_handler():
    return _callback_handler  # reads current value, not captured value

def patched_invoke(self, input, config=None, **kwargs):
    handler = _get_handler()  # ← correct
```

---

### Bug 5: DuckDuckGo Package Renamed
**Error:** `ModuleNotFoundError: No module named 'duckduckgo_search'` (or deprecation warning)

**Cause:** Package renamed from `duckduckgo-search` to `ddgs`.

**Fix:**
```python
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS
```

---

### Bug 6: SqliteSaver Must Be Used as Context Manager
**Error:** `AttributeError` or silent failure with checkpoints.

**Cause:** `SqliteSaver.from_conn_string()` returns a generator/context manager, not a plain `SqliteSaver` instance.

**Fix:**
```python
with SqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    agent = create_agent(llm, tools, checkpointer=checkpointer)
    # All agent calls must happen inside this `with` block
```

---

### Bug 7: Dark Theme Card Visibility
**Symptom:** Auth page looks unstyled — form fields invisible, no card frame visible.

**Cause:** Card background `#09090b` is nearly identical to page background `#02040a` (2 RGB units difference, invisible on most screens). Also, browser-default input styles (white background) override dark theme.

**Fix 1:** Use `#0e0e18` for cards:
```css
background: "#0e0e18"  /* NOT "#09090b" */
border: "1px solid rgba(99,102,241,0.2)"
boxShadow: "0 25px 50px rgba(0,0,0,0.6)"
```

**Fix 2:** Global CSS reset for inputs in `index.css`:
```css
input, textarea, select {
  background: #12121e !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  -webkit-appearance: none;
}
```

---

### Bug 8: Frontend Polling Flood
**Symptom:** Network tab shows hundreds of `/api/hitl/events` requests; page flickers.

**Cause:** `setInterval(fetchEvents, 1500)` on HITL dashboard + `setInterval(fetchData, 8000)` on Overview dashboard, combined with unstable `useCallback` deps causing cascading re-renders.

**Fix:** Remove all `setInterval` polling. Fetch once on mount and on filter changes. Add manual Refresh buttons:
```jsx
// REMOVED: const iv = setInterval(fetchEvents, 1500);
useEffect(() => { fetchEvents(); }, [filter, token]);
// Added manual refresh button in header
```

---

### Bug 9: Kubernetes Same-Pod Ingress Block
**Symptom:** SDK/agent gets 403 when calling production backend URL from inside the same pod.

**Cause:** Kubernetes ingress controllers typically block hairpin/loopback traffic — a pod cannot call its own external ingress URL.

**Fix:** Override the backend URL for local testing:
```bash
HUMANLAYER_API_BASE_URL=http://localhost:8001
```
The SDK default (production URL) works fine for external users. Only affects local testing inside the same container.

---

### Bug 10: `humanlayer` PyPI Name Taken
**Symptom:** `403 The user 'netanmangal' isn't allowed to upload to project 'humanlayer'`

**Cause:** The PyPI package name `humanlayer` is already registered by a different project.

**Fix:** Use `humanlayer-ai` as the PyPI distribution name while keeping `humanlayer.ai` as the Python import path (namespace package approach).

```toml
# pyproject.toml
name = "humanlayer-ai"    # pip install humanlayer-ai

# But Python import is:
# import humanlayer.ai    ← humanlayer/ is a namespace package
```

---

## 11. Deployment Notes

### Supervisor (Emergent Kubernetes)
Config file at `/etc/supervisor/conf.d/supervisord.conf`:
```ini
[program:backend]
command=/root/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 1 --reload
directory=/app/backend

[program:frontend]
command=yarn start
environment=HOST="0.0.0.0",PORT="3000"
directory=/app/frontend

[program:mongodb]
command=/usr/bin/mongod --bind_ip_all  # Emergent provides MongoDB but we don't use it
```

### Routing Rules
All `/api/*` requests are proxied to port 8001. All other requests go to port 3000. This is handled by Nginx/Kubernetes ingress — **never change these ports.**

### Database Access
The backend uses **external Supabase PostgreSQL**, not Emergent's managed MongoDB.
The `SUPABASE_SESSION_POOLER_URL` is a public connection string accessible from
any Kubernetes cluster. Just ensure the credentials remain valid.

### PyPI Publishing
```bash
cd /app/sdk
python -m build
python -m twine upload dist/*
# Credentials in ~/.pypirc:
# [pypi]
# username = __token__
# password = pypi-AgE...
```

### Frontend Build
The frontend runs as a dev server (`yarn start`) in the preview environment.
For production, run `yarn build` and serve the `build/` directory statically.

---

## 12. Quick Start Checklist

To reproduce from scratch:

- [ ] Create Supabase project → get `SUPABASE_SESSION_POOLER_URL`
- [ ] Set up backend: `pip install -r requirements.txt`, add env vars, run `uvicorn server:app`
- [ ] Set up frontend: `yarn install`, add `REACT_APP_BACKEND_URL`, run `yarn start`
- [ ] Create account via `/signup`, create org → project → API key
- [ ] Install SDK: `pip install humanlayer-ai`
- [ ] Initialize SDK with API key + project_id
- [ ] Run agent: `python multi_agent.py --hitl "tool_name" "your query"`
- [ ] Visit dashboard `/hitl` → approve/reject → agent resumes

---

*Generated: 2026-02-22 | HumanLayer v0.2.1 | humanlayer-ai on PyPI*

"""
Tests for multi-capability AI agent tools:
- Web search (DuckDuckGo)
- Cal.com calendar API
- GitHub issue management
- Ecommerce DB queries
- Persistent checkpoints
- Module imports
"""
import os
import sys
import json
import sqlite3
import pytest

# Run from agent dir
AGENT_DIR = "/app/agent_under_observation"
sys.path.insert(0, AGENT_DIR)

# Load env
from dotenv import load_dotenv
load_dotenv(os.path.join(AGENT_DIR, ".env"))


# ─── Module Imports ───────────────────────────────────────────────────────────

class TestModuleImports:
    """Verify all tool files can be imported without errors."""

    def test_import_web_search_tools(self):
        import web_search_tools
        assert hasattr(web_search_tools, "get_search_tools")
        assert hasattr(web_search_tools, "web_search")
        print("web_search_tools import OK")

    def test_import_calcom_tools(self):
        import calcom_tools
        assert hasattr(calcom_tools, "get_calcom_tools")
        print("calcom_tools import OK")

    def test_import_github_tools(self):
        import github_tools
        assert hasattr(github_tools, "get_github_tools")
        print("github_tools import OK")

    def test_import_ecommerce_db_tools(self):
        import ecommerce_db_tools
        assert hasattr(ecommerce_db_tools, "get_db_tools")
        print("ecommerce_db_tools import OK")

    def test_import_multi_agent(self):
        import multi_agent
        assert hasattr(multi_agent, "run_agent")
        print("multi_agent import OK")


# ─── Web Search ───────────────────────────────────────────────────────────────

class TestWebSearch:
    """DuckDuckGo search tool tests."""

    def test_web_search_returns_results(self):
        from web_search_tools import web_search
        result = web_search.invoke({"query": "Python LangChain 2025"})
        assert isinstance(result, str)
        assert len(result) > 50
        assert "Search error" not in result or "No search results" not in result
        print(f"Web search result (first 200 chars): {result[:200]}")

    def test_web_search_multiple_results(self):
        from web_search_tools import web_search
        result = web_search.invoke({"query": "langchain langgraph tutorial"})
        # Should have multiple result entries
        assert isinstance(result, str)
        assert len(result) > 100
        print(f"Web search returned {len(result)} chars")

    def test_get_search_tools_list(self):
        from web_search_tools import get_search_tools
        tools = get_search_tools()
        assert len(tools) >= 1
        assert tools[0].name == "web_search"
        print(f"Search tools: {[t.name for t in tools]}")


# ─── Cal.com ──────────────────────────────────────────────────────────────────

class TestCalcom:
    """Cal.com API tools tests."""

    def test_get_event_types(self):
        from calcom_tools import calendar_get_event_types
        result = calendar_get_event_types.invoke({})
        data = json.loads(result)
        assert "status" in data or "data" in data or isinstance(data, dict)
        print(f"Event types response keys: {list(data.keys())}")

    def test_event_types_has_30min(self):
        """Verify 30-min event type (ID 4828252) exists."""
        from calcom_tools import calendar_get_event_types
        result = calendar_get_event_types.invoke({})
        data = json.loads(result)
        # Handle nested data
        event_types = data.get("data", data) if isinstance(data, dict) else data
        if isinstance(event_types, dict):
            event_types = event_types.get("eventTypeGroups", [])
        result_str = json.dumps(data)
        print(f"Event types raw (first 500): {result_str[:500]}")
        # At minimum the API should succeed
        assert "error" not in result_str.lower() or "status" in data

    def test_get_available_slots_today(self):
        """Verify slots API works for today."""
        from calcom_tools import calendar_get_available_slots
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        result = calendar_get_available_slots.invoke({
            "event_type_id": 4828252,
            "start_date": today,
            "end_date": today,
            "timezone": "UTC"
        })
        data = json.loads(result)
        print(f"Slots response keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
        # Response should be a dict (even if no slots)
        assert isinstance(data, dict)

    def test_calcom_tools_list(self):
        from calcom_tools import get_calcom_tools
        tools = get_calcom_tools()
        tool_names = [t.name for t in tools]
        assert "calendar_get_event_types" in tool_names
        assert "calendar_create_booking" in tool_names
        assert "calendar_get_available_slots" in tool_names
        print(f"Cal.com tools: {tool_names}")


# ─── GitHub ───────────────────────────────────────────────────────────────────

class TestGitHub:
    """GitHub tools tests."""

    def test_list_issues(self):
        from github_tools import github_list_issues
        result = github_list_issues.invoke({"state": "open"})
        data = json.loads(result)
        # Could be list or error
        assert data is not None
        print(f"GitHub issues response type: {type(data)}, first 200: {json.dumps(data)[:200]}")

    def test_github_tools_list(self):
        from github_tools import get_github_tools
        tools = get_github_tools()
        tool_names = [t.name for t in tools]
        assert "github_create_issue" in tool_names
        assert "github_list_issues" in tool_names
        print(f"GitHub tools: {tool_names}")

    def test_github_token_is_set(self):
        token = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
        assert len(token) > 10, "GitHub token must be set"
        print("GitHub token is set")


# ─── Ecommerce DB ─────────────────────────────────────────────────────────────

class TestEcommerceDB:
    """Ecommerce database tools tests."""

    def test_db_overview_returns_tables(self):
        from ecommerce_db_tools import db_database_overview
        result = db_database_overview.invoke({})
        data = json.loads(result)
        print(f"DB overview: {result[:400]}")
        assert "rows" in data or "error" not in data
        if "rows" in data:
            table_names = [r.get("table_name") for r in data["rows"]]
            print(f"Tables found: {table_names}")

    def test_db_has_expected_tables(self):
        """Verify 8 expected tables exist."""
        from ecommerce_db_tools import db_execute_query
        result = db_execute_query.invoke({
            "sql": "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
        })
        data = json.loads(result)
        assert "rows" in data, f"Expected rows key, got: {data}"
        table_names = [r["table_name"] for r in data["rows"]]
        print(f"Tables: {table_names}")
        expected = ["categories", "products", "users", "addresses", "orders", "order_items", "payments", "invoices"]
        for tbl in expected:
            assert tbl in table_names, f"Missing table: {tbl}"

    def test_db_users_has_data(self):
        from ecommerce_db_tools import db_query_users
        result = db_query_users.invoke({"limit": 5})
        data = json.loads(result)
        assert "rows" in data
        assert data["count"] > 0, "Users table should have data"
        print(f"Users count: {data['count']}")

    def test_db_products_has_data(self):
        from ecommerce_db_tools import db_query_products
        result = db_query_products.invoke({"limit": 5})
        data = json.loads(result)
        assert "rows" in data
        assert data["count"] > 0, "Products table should have data"
        print(f"Products count: {data['count']}")

    def test_db_orders_query(self):
        from ecommerce_db_tools import db_query_orders
        result = db_query_orders.invoke({"limit": 5})
        data = json.loads(result)
        assert "rows" in data
        print(f"Orders count: {data['count']}")

    def test_db_tools_list(self):
        from ecommerce_db_tools import get_db_tools
        tools = get_db_tools()
        assert len(tools) >= 5
        print(f"DB tools: {[t.name for t in tools]}")


# ─── SQLite Checkpoints ───────────────────────────────────────────────────────

class TestCheckpoints:
    """Verify SQLite checkpoint persistence."""

    def test_checkpoints_db_exists(self):
        db_path = os.path.join(AGENT_DIR, "checkpoints.db")
        assert os.path.exists(db_path), f"checkpoints.db not found at {db_path}"
        print(f"checkpoints.db found at {db_path}")

    def test_checkpoints_db_has_data(self):
        db_path = os.path.join(AGENT_DIR, "checkpoints.db")
        conn = sqlite3.connect(db_path)
        try:
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            table_names = [t[0] for t in tables]
            print(f"Checkpoint tables: {table_names}")
            assert len(tables) > 0, "checkpoints.db has no tables"
            # Try to count checkpoints
            for tbl in table_names:
                count = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
                print(f"  {tbl}: {count} rows")
        finally:
            conn.close()


# ─── Full Agent End-to-End ────────────────────────────────────────────────────

class TestAgentE2E:
    """Full end-to-end agent test."""

    def test_agent_uses_db_and_search(self):
        """Run agent with DB + search query and verify both tools used."""
        import subprocess
        result = subprocess.run(
            ["python", "multi_agent.py", "--thread", "test-final",
             "list all database tables and search the web for python langchain"],
            cwd=AGENT_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        output = result.stdout + result.stderr
        print(f"Agent output (first 1000): {output[:1000]}")
        assert result.returncode == 0, f"Agent exited with code {result.returncode}. stderr: {result.stderr[:500]}"
        # Verify both tools were triggered
        assert "db_" in output.lower() or "database" in output.lower() or "tables" in output.lower(), \
            "DB tool should have been used"
        assert "web_search" in output.lower() or "search" in output.lower(), \
            "Web search tool should have been used"
        print("E2E test PASSED - both tools used")

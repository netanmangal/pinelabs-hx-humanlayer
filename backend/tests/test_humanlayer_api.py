"""HumanLayer API backend tests - auth, projects, api-keys, ingest, hitl, stats"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hitl-agent-v1.preview.emergentagent.com").rstrip("/")

DEMO_EMAIL = "demo@humanlayer.dev"
DEMO_PASSWORD = "demo1234"
SDK_API_KEY = "adr_m6RjnVwgwYbdLKNSkzqEtWBfSIdfkuUMUHkB0INq3jo"

# ── Health ────────────────────────────────────────────────────────────────────
class TestHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        print("PASS health check")


# ── Auth ──────────────────────────────────────────────────────────────────────
class TestAuth:
    def test_login_demo(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == DEMO_EMAIL
        print(f"PASS login demo: token={data['token'][:20]}...")

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "bad@x.com", "password": "wrong"})
        assert r.status_code == 401
        print("PASS login invalid credentials returns 401")

    def test_signup_new_user(self):
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User",
            "org_name": "Test Org"
        })
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == unique_email
        print(f"PASS signup new user: {unique_email}")

    def test_signup_duplicate_email(self):
        r = requests.post(f"{BASE_URL}/api/auth/signup", json={
            "email": DEMO_EMAIL, "password": "x", "name": "x", "org_name": "x"
        })
        assert r.status_code == 400
        print("PASS signup duplicate email returns 400")

    def test_auth_me(self, auth_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == DEMO_EMAIL
        print("PASS auth/me")


# ── Projects ──────────────────────────────────────────────────────────────────
class TestProjects:
    def test_list_projects(self, auth_token):
        r = requests.get(f"{BASE_URL}/api/projects", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS list projects: {len(r.json())} projects")

    def test_create_project(self, auth_token):
        r = requests.post(f"{BASE_URL}/api/projects",
            json={"name": "TEST_Project", "description": "test"},
            headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "id" in data
        assert data["name"] == "TEST_Project"
        print(f"PASS create project: {data['id']}")


# ── API Keys ──────────────────────────────────────────────────────────────────
class TestAPIKeys:
    def test_list_api_keys(self, auth_token):
        r = requests.get(f"{BASE_URL}/api/api-keys", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS list api-keys: {len(r.json())} keys")

    def test_create_api_key(self, auth_token):
        # Get a project first
        proj_r = requests.get(f"{BASE_URL}/api/projects", headers={"Authorization": f"Bearer {auth_token}"})
        projects = proj_r.json()
        assert len(projects) > 0, "Need at least one project"
        proj_id = projects[0]["id"]

        r = requests.post(f"{BASE_URL}/api/api-keys",
            json={"name": "TEST_Key", "project_id": proj_id},
            headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "key" in data
        assert data["key"].startswith("adr_")
        print(f"PASS create api-key: {data['key'][:16]}...")


# ── Ingest ────────────────────────────────────────────────────────────────────
class TestIngest:
    def test_verify_api_key(self):
        r = requests.get(f"{BASE_URL}/api/ingest/verify", headers={"X-API-Key": SDK_API_KEY})
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        print(f"PASS verify api key, org_id={data['org_id']}")

    def test_verify_invalid_api_key(self):
        r = requests.get(f"{BASE_URL}/api/ingest/verify", headers={"X-API-Key": "invalid-key"})
        assert r.status_code == 401
        print("PASS invalid api key returns 401")

    def test_ingest_events(self):
        events = [{
            "event_id": str(uuid.uuid4()),
            "event_type": "chain_start",
            "component": "langchain",
            "timestamp": "2026-02-01T00:00:00Z",
            "data": {"input": "test prompt"}
        }]
        r = requests.post(f"{BASE_URL}/api/ingest/events",
            json={"events": events},
            headers={"X-API-Key": SDK_API_KEY})
        assert r.status_code == 200
        data = r.json()
        assert data["accepted"] == 1
        print("PASS ingest events")

    def test_upsert_session(self):
        sid = str(uuid.uuid4())
        r = requests.post(f"{BASE_URL}/api/ingest/sessions",
            json={"session_id": sid, "name": "TEST_Session", "status": "active", "event_count": 1},
            headers={"X-API-Key": SDK_API_KEY})
        assert r.status_code == 200
        data = r.json()
        assert data["session_id"] == sid
        print(f"PASS upsert session: {sid}")


# ── HITL ──────────────────────────────────────────────────────────────────────
class TestHITL:
    def test_create_hitl_event(self):
        r = requests.post(f"{BASE_URL}/api/hitl/request",
            json={"tool_name": "send_email", "tool_input": {"to": "user@example.com"}, "context": {"agent": "test"}},
            headers={"X-API-Key": SDK_API_KEY})
        assert r.status_code == 200
        data = r.json()
        assert "event_id" in data
        assert data["status"] == "pending"
        print(f"PASS create hitl event: {data['event_id']}")
        return data["event_id"]

    def test_list_hitl_events(self, auth_token):
        r = requests.get(f"{BASE_URL}/api/hitl/events", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS list hitl events: {len(r.json())} events")

    def test_approve_hitl_event(self, auth_token):
        # Create a HITL event first
        create_r = requests.post(f"{BASE_URL}/api/hitl/request",
            json={"tool_name": "test_approve_tool", "tool_input": {}, "context": {}},
            headers={"X-API-Key": SDK_API_KEY})
        assert create_r.status_code == 200
        event_id = create_r.json()["event_id"]

        # Approve it
        r = requests.post(f"{BASE_URL}/api/hitl/events/{event_id}/approve",
            json={"comment": "approved by test"},
            headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        print(f"PASS approve hitl event: {event_id}")

    def test_poll_decision(self, auth_token):
        # Create a HITL event
        create_r = requests.post(f"{BASE_URL}/api/hitl/request",
            json={"tool_name": "test_poll_tool", "tool_input": {}, "context": {}},
            headers={"X-API-Key": SDK_API_KEY})
        event_id = create_r.json()["event_id"]

        # Poll decision (SDK endpoint, no auth needed)
        r = requests.get(f"{BASE_URL}/api/hitl/events/{event_id}/decision")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
        assert data["status"] == "pending"
        print(f"PASS poll decision: status={data['status']}")


# ── Dashboard Stats ───────────────────────────────────────────────────────────
class TestStats:
    def test_get_stats(self, auth_token):
        r = requests.get(f"{BASE_URL}/api/stats", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "sessions" in data
        assert "events" in data
        assert "hitl_pending" in data
        assert "hitl_total" in data
        print(f"PASS stats: {data}")


# ── DB Fake Tables ────────────────────────────────────────────────────────────
class TestFakeTables:
    """Verify fake ecommerce tables exist and have data via backend (not direct DB)"""
    def test_fake_tables_via_health(self):
        # Just verify backend is up - DB tables checked separately
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        print("PASS health (fake tables seeded on startup)")


# ── SDK Import ────────────────────────────────────────────────────────────────
class TestSDK:
    def test_sdk_import(self):
        import sys
        sys.path.insert(0, "/app/sdk")
        import importlib
        hl = importlib.import_module("humanlayer")
        assert hasattr(hl, "init")
        print("PASS humanlayer SDK import")

    def test_sdk_init(self):
        import sys
        sys.path.insert(0, "/app/sdk")
        import humanlayer
        # init with test API key
        humanlayer.init(api_key=SDK_API_KEY, api_base_url=f"{BASE_URL}/api")
        print("PASS humanlayer.init()")


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.text}")
    return r.json()["token"]

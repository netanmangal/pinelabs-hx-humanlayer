"""HumanLayer Backend — FastAPI server for SDK event ingestion and HITL management."""
import os
import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_SESSION_POOLER_URL"]
JWT_SECRET = os.environ.get("JWT_SECRET", "humanlayer-secret-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── DB ────────────────────────────────────────────────────────────────────────
def get_conn():
    conn = psycopg2.connect(SUPABASE_URL, connect_timeout=10)
    conn.autocommit = False
    return conn


def db_execute(sql: str, params=None, fetch: bool = True, many: bool = False):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            if fetch:
                return [dict(r) for r in cur.fetchall()]
            conn.commit()
            return cur.rowcount
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def db_one(sql: str, params=None):
    rows = db_execute(sql, params)
    return rows[0] if rows else None


# ── Schema Bootstrap ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS hl_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hl_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    org_id UUID REFERENCES hl_organizations(id),
    role VARCHAR(50) DEFAULT 'owner',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hl_org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES hl_organizations(id),
    user_id UUID REFERENCES hl_users(id),
    role VARCHAR(50) DEFAULT 'member',
    invited_email VARCHAR(255),
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);
CREATE TABLE IF NOT EXISTS hl_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES hl_organizations(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hl_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES hl_organizations(id),
    project_id UUID REFERENCES hl_projects(id),
    name VARCHAR(255),
    key_hash VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS hl_sessions (
    id UUID PRIMARY KEY,
    project_id UUID,
    org_id UUID,
    name VARCHAR(255),
    status VARCHAR(30) DEFAULT 'active',
    event_count INTEGER DEFAULT 0,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    statistics JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hl_events (
    id UUID PRIMARY KEY,
    session_id UUID,
    project_id UUID,
    org_id UUID,
    run_id VARCHAR(255),
    event_type VARCHAR(50),
    component VARCHAR(50),
    timestamp TIMESTAMPTZ,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hl_hitl_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID,
    project_id UUID,
    org_id UUID,
    tool_name VARCHAR(255),
    tool_input JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    status VARCHAR(30) DEFAULT 'pending',
    decision_comment TEXT,
    decided_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

-- Fake ecommerce tables
CREATE TABLE IF NOT EXISTS categories_fake (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products_fake (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL,
    description TEXT, price DECIMAL(10,2), stock INTEGER DEFAULT 0,
    category_id INTEGER REFERENCES categories_fake(id),
    sku VARCHAR(50) UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users_fake (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL, phone VARCHAR(50),
    gender VARCHAR(20), status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS addresses_fake (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users_fake(id),
    type VARCHAR(20), street VARCHAR(255), city VARCHAR(100),
    state VARCHAR(100), country VARCHAR(100), zip_code VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders_fake (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users_fake(id),
    total DECIMAL(10,2), status VARCHAR(30) DEFAULT 'pending',
    notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items_fake (
    id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders_fake(id),
    product_id INTEGER REFERENCES products_fake(id),
    quantity INTEGER DEFAULT 1, unit_price DECIMAL(10,2),
    total_price DECIMAL(10,2), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payments_fake (
    id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders_fake(id),
    amount DECIMAL(10,2), method VARCHAR(50), status VARCHAR(30),
    transaction_id VARCHAR(255), gateway VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoices_fake (
    id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders_fake(id),
    invoice_number VARCHAR(50) UNIQUE, amount DECIMAL(10,2),
    tax_amount DECIMAL(10,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'issued',
    issued_at TIMESTAMPTZ DEFAULT NOW(), due_at TIMESTAMPTZ
);
"""

def seed_fake_data():
    """Seed fake ecommerce data if tables are empty."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users_fake")
            if cur.fetchone()[0] > 0:
                return

            cats = ["Electronics","Clothing","Books","Home","Sports","Beauty","Toys","Food"]
            cat_ids = []
            for c in cats:
                cur.execute("INSERT INTO categories_fake (name, description) VALUES (%s, %s) ON CONFLICT(name) DO NOTHING RETURNING id", (c, f"All {c} products"))
                r = cur.fetchone()
                if r: cat_ids.append(r[0])

            import random
            for i in range(15):
                cur.execute("INSERT INTO products_fake (name, description, price, stock, category_id, sku) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(sku) DO NOTHING",
                    (f"Product {i+1}", f"Description for product {i+1}", round(random.uniform(9.99,299.99),2),
                     random.randint(0,100), random.choice(cat_ids) if cat_ids else None, f"SKU-{i+1:04d}"))

            emails = [f"user{i}@example.com" for i in range(1,11)]
            user_ids = []
            for i, email in enumerate(emails):
                cur.execute("INSERT INTO users_fake (name, email, phone, gender, status) VALUES (%s,%s,%s,%s,%s) ON CONFLICT(email) DO NOTHING RETURNING id",
                    (f"User {i+1}", email, f"+1-555-{i+1:04d}", random.choice(["Male","Female"]), "active"))
                r = cur.fetchone()
                if r: user_ids.append(r[0])

            for uid in user_ids:
                cur.execute("INSERT INTO addresses_fake (user_id, type, street, city, state, country, zip_code, is_default) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                    (uid, "shipping", f"{uid*100} Main St", "San Francisco", "CA", "USA", f"9{uid:04d}", True))

            statuses = ["pending","processing","completed","cancelled"]
            order_ids = []
            for i in range(10):
                uid = random.choice(user_ids) if user_ids else 1
                total = round(random.uniform(50, 500), 2)
                cur.execute("INSERT INTO orders_fake (user_id, total, status) VALUES (%s,%s,%s) RETURNING id",
                    (uid, total, random.choice(statuses)))
                r = cur.fetchone()
                if r: order_ids.append(r[0])

            for oid in order_ids:
                cur.execute("SELECT id FROM products_fake LIMIT 20")
                pids = [r[0] for r in cur.fetchall()]
                for _ in range(random.randint(1,3)):
                    pid = random.choice(pids) if pids else 1
                    qty = random.randint(1,4)
                    price = round(random.uniform(9.99,99.99), 2)
                    cur.execute("INSERT INTO order_items_fake (order_id,product_id,quantity,unit_price,total_price) VALUES (%s,%s,%s,%s,%s)",
                        (oid, pid, qty, price, round(qty*price,2)))

            methods = ["credit_card","paypal","bank_transfer"]
            for oid in order_ids:
                cur.execute("SELECT total FROM orders_fake WHERE id=%s", (oid,))
                row = cur.fetchone()
                total = row[0] if row else 100.00
                cur.execute("INSERT INTO payments_fake (order_id,amount,method,status,transaction_id,gateway) VALUES (%s,%s,%s,%s,%s,%s)",
                    (oid, total, random.choice(methods), "completed", str(uuid.uuid4()), "stripe"))
                cur.execute("INSERT INTO invoices_fake (order_id,invoice_number,amount,tax_amount,status) VALUES (%s,%s,%s,%s,%s) ON CONFLICT(invoice_number) DO NOTHING",
                    (oid, f"INV-{oid:04d}", total, round(float(total)*0.1,2), "issued"))

        conn.commit()
        logger.info("Fake ecommerce data seeded.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Seed error: {e}")
    finally:
        conn.close()


# ── JWT Utils ─────────────────────────────────────────────────────────────────
def create_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "email": email, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    payload = decode_token(authorization.split(" ", 1)[1])
    user = db_one("SELECT * FROM hl_users WHERE id=%s", [payload["sub"]])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def verify_api_key_header(x_api_key: str = Header(None)) -> dict:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    key = db_one("SELECT * FROM hl_api_keys WHERE key_hash=%s AND status='active'", [key_hash])
    if not key:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    db_execute("UPDATE hl_api_keys SET last_used_at=%s WHERE id=%s",
               [datetime.now(timezone.utc), str(key["id"])], fetch=False)
    return key


# ── Pydantic Models ───────────────────────────────────────────────────────────
class SignupReq(BaseModel):
    email: str
    password: str
    name: str
    org_name: str

class LoginReq(BaseModel):
    email: str
    password: str

class CreateProjectReq(BaseModel):
    name: str
    description: str = ""

class CreateAPIKeyReq(BaseModel):
    name: str
    project_id: str

class InviteMemberReq(BaseModel):
    email: str
    role: str = "member"

class IngestEventsReq(BaseModel):
    events: List[dict]
    project_id: Optional[str] = None
    environment: str = "development"
    metadata: dict = Field(default_factory=dict)

class SessionUpsertReq(BaseModel):
    session_id: str
    name: Optional[str] = None
    status: str = "active"
    event_count: int = 0
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    statistics: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)

class HITLRequestReq(BaseModel):
    tool_name: str
    tool_input: dict = Field(default_factory=dict)
    context: dict = Field(default_factory=dict)
    project_id: Optional[str] = None

class HITLDecisionReq(BaseModel):
    comment: str = ""


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="HumanLayer Backend", version="0.1.0")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()
        logger.info("Schema bootstrapped.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Schema bootstrap error: {e}")
    finally:
        conn.close()
    seed_fake_data()


# ── Auth ──────────────────────────────────────────────────────────────────────
@api.post("/auth/signup")
def signup(req: SignupReq):
    if db_one("SELECT id FROM hl_users WHERE email=%s", [req.email]):
        raise HTTPException(400, "Email already registered")
    slug = req.org_name.lower().replace(" ", "-")[:50] + "-" + secrets.token_hex(3)
    org_id = str(uuid.uuid4())
    db_execute("INSERT INTO hl_organizations (id,name,slug) VALUES (%s,%s,%s)",
               [org_id, req.org_name, slug], fetch=False)
    user_id = str(uuid.uuid4())
    hashed = pwd_ctx.hash(req.password)
    db_execute("INSERT INTO hl_users (id,email,password_hash,name,org_id,role) VALUES (%s,%s,%s,%s,%s,'owner')",
               [user_id, req.email, hashed, req.name, org_id], fetch=False)
    db_execute("INSERT INTO hl_org_members (org_id,user_id,role) VALUES (%s,%s,'owner')",
               [org_id, user_id], fetch=False)
    token = create_token(user_id, req.email)
    return {"token": token, "user": {"id": user_id, "email": req.email, "name": req.name, "org_id": org_id}}


@api.post("/auth/login")
def login(req: LoginReq):
    user = db_one("SELECT * FROM hl_users WHERE email=%s", [req.email])
    if not user or not pwd_ctx.verify(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(str(user["id"]), user["email"])
    return {"token": token, "user": {"id": str(user["id"]), "email": user["email"], "name": user["name"], "org_id": str(user["org_id"])}}


@api.get("/auth/me")
def me(user=Depends(get_current_user)):
    org = db_one("SELECT * FROM hl_organizations WHERE id=%s", [str(user["org_id"])]) if user.get("org_id") else None
    return {
        "id": str(user["id"]), "email": user["email"], "name": user["name"],
        "org_id": str(user["org_id"]) if user.get("org_id") else None,
        "role": user["role"],
        "organization": {"id": str(org["id"]), "name": org["name"], "slug": org["slug"]} if org else None,
    }


# ── Organizations ─────────────────────────────────────────────────────────────
@api.get("/organizations")
def list_orgs(user=Depends(get_current_user)):
    orgs = db_execute(
        "SELECT o.* FROM hl_organizations o JOIN hl_org_members m ON o.id=m.org_id WHERE m.user_id=%s",
        [str(user["id"])]
    )
    return [{"id": str(o["id"]), "name": o["name"], "slug": o["slug"]} for o in orgs]


@api.get("/organizations/{org_id}/members")
def list_members(org_id: str, user=Depends(get_current_user)):
    rows = db_execute(
        "SELECT u.id,u.email,u.name,m.role FROM hl_org_members m JOIN hl_users u ON m.user_id=u.id WHERE m.org_id=%s",
        [org_id]
    )
    return [{"id": str(r["id"]), "email": r["email"], "name": r["name"], "role": r["role"]} for r in rows]


@api.post("/organizations/{org_id}/invite")
def invite_member(org_id: str, req: InviteMemberReq, user=Depends(get_current_user)):
    existing = db_one("SELECT id FROM hl_users WHERE email=%s", [req.email])
    if existing:
        db_execute("INSERT INTO hl_org_members (org_id,user_id,role) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                   [org_id, str(existing["id"]), req.role], fetch=False)
    return {"status": "invited", "email": req.email}


# ── Projects ──────────────────────────────────────────────────────────────────
@api.get("/projects")
def list_projects(user=Depends(get_current_user)):
    rows = db_execute("SELECT * FROM hl_projects WHERE org_id=%s ORDER BY created_at DESC", [str(user["org_id"])])
    return [{"id": str(r["id"]), "name": r["name"], "description": r["description"],
             "created_at": r["created_at"].isoformat() if r.get("created_at") else None} for r in rows]


@api.post("/projects")
def create_project(req: CreateProjectReq, user=Depends(get_current_user)):
    pid = str(uuid.uuid4())
    db_execute("INSERT INTO hl_projects (id,org_id,name,description) VALUES (%s,%s,%s,%s)",
               [pid, str(user["org_id"]), req.name, req.description], fetch=False)
    return {"id": pid, "name": req.name, "description": req.description}


# ── API Keys ──────────────────────────────────────────────────────────────────
@api.get("/api-keys")
def list_api_keys(user=Depends(get_current_user)):
    rows = db_execute("SELECT * FROM hl_api_keys WHERE org_id=%s ORDER BY created_at DESC", [str(user["org_id"])])
    return [{"id": str(r["id"]), "name": r["name"], "key_prefix": r["key_prefix"],
             "status": r["status"], "project_id": str(r["project_id"]) if r.get("project_id") else None,
             "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
             "last_used_at": r["last_used_at"].isoformat() if r.get("last_used_at") else None} for r in rows]


@api.post("/api-keys")
def create_api_key(req: CreateAPIKeyReq, user=Depends(get_current_user)):
    raw_key = "adr_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:16]
    kid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO hl_api_keys (id,org_id,project_id,name,key_hash,key_prefix) VALUES (%s,%s,%s,%s,%s,%s)",
        [kid, str(user["org_id"]), req.project_id, req.name, key_hash, key_prefix], fetch=False
    )
    return {"id": kid, "key": raw_key, "key_prefix": key_prefix, "name": req.name,
            "note": "Save this key — it won't be shown again."}


@api.delete("/api-keys/{key_id}")
def revoke_api_key(key_id: str, user=Depends(get_current_user)):
    db_execute("UPDATE hl_api_keys SET status='revoked' WHERE id=%s AND org_id=%s",
               [key_id, str(user["org_id"])], fetch=False)
    return {"status": "revoked"}


# ── Ingest (SDK Endpoints) ────────────────────────────────────────────────────
@api.get("/ingest/verify")
def verify_key(api_key=Depends(verify_api_key_header)):
    return {"valid": True, "org_id": str(api_key["org_id"]), "project_id": str(api_key.get("project_id") or "")}


@api.post("/ingest/events")
def ingest_events(req: IngestEventsReq, api_key=Depends(verify_api_key_header)):
    if not req.events:
        return {"accepted": 0}
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            for evt in req.events:
                eid = evt.get("event_id") or str(uuid.uuid4())
                ts = evt.get("timestamp") or datetime.now(timezone.utc).isoformat()
                # Always use the UUID from the API key to avoid type errors
                proj_key = api_key.get("project_id")
                project_id = str(proj_key) if proj_key else None
                session_id = evt.get("session_id") or evt.get("data", {}).get("session_id")
                cur.execute(
                    """INSERT INTO hl_events (id,session_id,project_id,org_id,run_id,event_type,component,timestamp,data)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO NOTHING""",
                    [eid, session_id, project_id, str(api_key["org_id"]),
                     evt.get("run_id"), evt.get("event_type"), evt.get("component"),
                     ts, psycopg2.extras.Json(evt.get("data", {}))]
                )
        conn.commit()
        return {"accepted": len(req.events)}
    except Exception as e:
        conn.rollback()
        logger.error(f"Event ingest error: {e}")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@api.post("/ingest/sessions")
def upsert_session(req: SessionUpsertReq, api_key=Depends(verify_api_key_header)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            proj_key = api_key.get("project_id")
            cur.execute(
                """INSERT INTO hl_sessions (id,project_id,org_id,name,status,event_count,start_time,end_time,statistics,metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(id) DO UPDATE SET
                    status=EXCLUDED.status, event_count=EXCLUDED.event_count,
                    end_time=EXCLUDED.end_time, statistics=EXCLUDED.statistics""",
                [req.session_id, str(proj_key) if proj_key else None, str(api_key["org_id"]),
                 req.name, req.status, req.event_count, req.start_time, req.end_time,
                 psycopg2.extras.Json(req.statistics), psycopg2.extras.Json(req.metadata)]
            )
        conn.commit()
        return {"session_id": req.session_id}
    finally:
        conn.close()


# ── HITL ──────────────────────────────────────────────────────────────────────
@api.post("/hitl/request")
def create_hitl_event(req: HITLRequestReq, api_key=Depends(verify_api_key_header)):
    eid = str(uuid.uuid4())
    # Always use the validated UUID from the API key; ignore string project_id from SDK
    proj_id = api_key.get("project_id")
    db_execute(
        "INSERT INTO hl_hitl_events (id,project_id,org_id,tool_name,tool_input,context) VALUES (%s,%s,%s,%s,%s,%s)",
        [eid, str(proj_id) if proj_id else None,
         str(api_key["org_id"]), req.tool_name,
         psycopg2.extras.Json(req.tool_input), psycopg2.extras.Json(req.context)], fetch=False
    )
    return {"event_id": eid, "status": "pending"}


@api.get("/hitl/events")
def list_hitl_events(status: str = None, limit: int = 50, user=Depends(get_current_user)):
    sql = "SELECT * FROM hl_hitl_events WHERE org_id=%s"
    params = [str(user["org_id"])]
    if status:
        sql += " AND status=%s"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    rows = db_execute(sql, params)
    return [_fmt_hitl(r) for r in rows]


@api.get("/hitl/events/{event_id}")
def get_hitl_event(event_id: str, user=Depends(get_current_user)):
    row = db_one("SELECT * FROM hl_hitl_events WHERE id=%s AND org_id=%s",
                 [event_id, str(user["org_id"])])
    if not row:
        raise HTTPException(404, "Event not found")
    return _fmt_hitl(row)


@api.get("/hitl/events/{event_id}/decision")
def get_decision(event_id: str, x_api_key: str = Header(None)):
    """SDK polls this endpoint for human decision."""
    row = db_one("SELECT status,decision_comment FROM hl_hitl_events WHERE id=%s", [event_id])
    if not row:
        raise HTTPException(404, "HITL event not found")
    return {"status": row["status"], "decision_comment": row.get("decision_comment") or ""}


@api.post("/hitl/events/{event_id}/approve")
def approve_event(event_id: str, req: HITLDecisionReq, user=Depends(get_current_user)):
    db_execute(
        "UPDATE hl_hitl_events SET status='approved',decision_comment=%s,decided_by=%s,decided_at=%s WHERE id=%s AND org_id=%s",
        [req.comment, str(user["id"]), datetime.now(timezone.utc), event_id, str(user["org_id"])], fetch=False
    )
    return {"status": "approved"}


@api.post("/hitl/events/{event_id}/reject")
def reject_event(event_id: str, req: HITLDecisionReq, user=Depends(get_current_user)):
    db_execute(
        "UPDATE hl_hitl_events SET status='rejected',decision_comment=%s,decided_by=%s,decided_at=%s WHERE id=%s AND org_id=%s",
        [req.comment, str(user["id"]), datetime.now(timezone.utc), event_id, str(user["org_id"])], fetch=False
    )
    return {"status": "rejected"}


# ── Dashboard Data ────────────────────────────────────────────────────────────
@api.get("/events")
def list_events(limit: int = 100, session_id: str = None, event_type: str = None, user=Depends(get_current_user)):
    sql = "SELECT * FROM hl_events WHERE org_id=%s"
    params: list = [str(user["org_id"])]
    if session_id:
        sql += " AND session_id=%s"
        params.append(session_id)
    if event_type:
        sql += " AND event_type=%s"
        params.append(event_type)
    sql += " ORDER BY timestamp DESC LIMIT %s"
    params.append(limit)
    rows = db_execute(sql, params)
    return [_fmt_event(r) for r in rows]


@api.get("/sessions")
def list_sessions(limit: int = 50, user=Depends(get_current_user)):
    rows = db_execute(
        "SELECT * FROM hl_sessions WHERE org_id=%s ORDER BY created_at DESC LIMIT %s",
        [str(user["org_id"]), limit]
    )
    return [_fmt_session(r) for r in rows]


@api.get("/stats")
def get_stats(user=Depends(get_current_user)):
    org_id = str(user["org_id"])
    sessions_total = db_one("SELECT COUNT(*) as c FROM hl_sessions WHERE org_id=%s", [org_id])
    events_total = db_one("SELECT COUNT(*) as c FROM hl_events WHERE org_id=%s", [org_id])
    hitl_pending = db_one("SELECT COUNT(*) as c FROM hl_hitl_events WHERE org_id=%s AND status='pending'", [org_id])
    hitl_total = db_one("SELECT COUNT(*) as c FROM hl_hitl_events WHERE org_id=%s", [org_id])
    return {
        "sessions": sessions_total["c"] if sessions_total else 0,
        "events": events_total["c"] if events_total else 0,
        "hitl_pending": hitl_pending["c"] if hitl_pending else 0,
        "hitl_total": hitl_total["c"] if hitl_total else 0,
    }


@api.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _fmt_hitl(r: dict) -> dict:
    return {
        "id": str(r["id"]), "tool_name": r["tool_name"],
        "tool_input": r["tool_input"] or {}, "context": r["context"] or {},
        "status": r["status"], "decision_comment": r.get("decision_comment") or "",
        "project_id": str(r["project_id"]) if r.get("project_id") else None,
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "decided_at": r["decided_at"].isoformat() if r.get("decided_at") else None,
    }


def _fmt_event(r: dict) -> dict:
    return {
        "id": str(r["id"]), "session_id": str(r["session_id"]) if r.get("session_id") else None,
        "event_type": r["event_type"], "component": r["component"],
        "timestamp": r["timestamp"].isoformat() if r.get("timestamp") else None,
        "data": r.get("data") or {},
    }


def _fmt_session(r: dict) -> dict:
    return {
        "id": str(r["id"]), "name": r["name"], "status": r["status"],
        "event_count": r["event_count"],
        "start_time": r["start_time"].isoformat() if r.get("start_time") else None,
        "end_time": r["end_time"].isoformat() if r.get("end_time") else None,
        "statistics": r.get("statistics") or {},
    }


# ── Mount ─────────────────────────────────────────────────────────────────────
app.include_router(api)

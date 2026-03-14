"""Database migration and seeding script for the ecommerce database."""
import os
import sys
import random
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta, timezone
from faker import Faker
from dotenv import load_dotenv

load_dotenv()
fake = Faker()

SCHEMA_SQL = """
-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    category_id INTEGER REFERENCES categories(id),
    sku VARCHAR(50) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    gender VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Addresses
CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'shipping',
    street VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    zip_code VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    shipping_address_id INTEGER REFERENCES addresses(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    amount DECIMAL(10, 2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    transaction_id VARCHAR(255),
    gateway VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'issued',
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    due_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ
);
"""


def get_conn():
    url = os.environ.get("SUPABASE_SESSION_POOLER_URL", "")
    return psycopg2.connect(url, connect_timeout=10)


def run_migration():
    print("Running schema migration...")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()
        print("Schema created successfully.")
    except Exception as e:
        conn.rollback()
        print(f"Migration error: {e}")
        raise
    finally:
        conn.close()


def seed_data():
    print("\nSeeding ecommerce data...")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # --- Categories (10) ---
            category_names = [
                "Electronics", "Clothing", "Books", "Home & Garden",
                "Sports", "Beauty", "Toys", "Automotive", "Food", "Office"
            ]
            category_ids = []
            for cname in category_names:
                cur.execute(
                    "INSERT INTO categories (name, description) VALUES (%s, %s) "
                    "ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                    (cname, fake.sentence())
                )
                row = cur.fetchone()
                if row:
                    category_ids.append(row[0])
            print(f"  Inserted {len(category_ids)} categories")

            # --- Products (20) ---
            product_ids = []
            for _ in range(20):
                cur.execute(
                    """INSERT INTO products (name, description, price, stock, category_id, sku)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                    (
                        fake.catch_phrase(),
                        fake.text(max_nb_chars=150),
                        round(random.uniform(9.99, 499.99), 2),
                        random.randint(0, 200),
                        random.choice(category_ids),
                        fake.uuid4()[:12].upper(),
                    ),
                )
                row = cur.fetchone()
                if row:
                    product_ids.append(row[0])
            print(f"  Inserted {len(product_ids)} products")

            # --- Users (15) ---
            user_ids = []
            for _ in range(15):
                try:
                    cur.execute(
                        """INSERT INTO users (name, email, phone, gender, status)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                        (
                            fake.name(),
                            fake.unique.email(),
                            fake.phone_number()[:20],
                            random.choice(["Male", "Female", "Other"]),
                            random.choice(["active", "active", "active", "inactive"]),
                        ),
                    )
                    row = cur.fetchone()
                    if row:
                        user_ids.append(row[0])
                except psycopg2.errors.UniqueViolation:
                    conn.rollback()
                    continue
            conn.commit()
            print(f"  Inserted {len(user_ids)} users")

            # --- Addresses (15) ---
            address_ids = []
            for uid in user_ids:
                cur.execute(
                    """INSERT INTO addresses (user_id, type, street, city, state, country, zip_code, is_default)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (
                        uid,
                        random.choice(["shipping", "billing"]),
                        fake.street_address(),
                        fake.city(),
                        fake.state(),
                        fake.country(),
                        fake.postcode(),
                        True,
                    ),
                )
                row = cur.fetchone()
                if row:
                    address_ids.append(row[0])
            conn.commit()
            print(f"  Inserted {len(address_ids)} addresses")

            # --- Orders (15) ---
            statuses = ["pending", "processing", "completed", "cancelled", "refunded"]
            order_ids = []
            for i in range(15):
                uid = random.choice(user_ids)
                addr_id = random.choice(address_ids) if address_ids else None
                total = round(random.uniform(20, 800), 2)
                days_ago = random.randint(0, 90)
                created = datetime.now(timezone.utc) - timedelta(days=days_ago)
                cur.execute(
                    """INSERT INTO orders (user_id, total, status, shipping_address_id, notes, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                    (uid, total, random.choice(statuses), addr_id, fake.sentence(), created),
                )
                row = cur.fetchone()
                if row:
                    order_ids.append(row[0])
            conn.commit()
            print(f"  Inserted {len(order_ids)} orders")

            # --- Order Items (2 per order) ---
            for oid in order_ids:
                for _ in range(random.randint(1, 3)):
                    qty = random.randint(1, 5)
                    price = round(random.uniform(9.99, 299.99), 2)
                    cur.execute(
                        """INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                        VALUES (%s, %s, %s, %s, %s)""",
                        (oid, random.choice(product_ids), qty, price, round(qty * price, 2)),
                    )
            conn.commit()
            print(f"  Inserted order items")

            # --- Payments (one per order) ---
            methods = ["credit_card", "debit_card", "paypal", "bank_transfer", "crypto"]
            pay_statuses = ["completed", "completed", "completed", "pending", "failed"]
            gateways = ["stripe", "paypal", "square", "braintree"]
            for oid in order_ids:
                cur.execute("SELECT total FROM orders WHERE id = %s", (oid,))
                row = cur.fetchone()
                total = row[0] if row else 100.00
                cur.execute(
                    """INSERT INTO payments (order_id, amount, method, status, transaction_id, gateway)
                    VALUES (%s, %s, %s, %s, %s, %s)""",
                    (
                        oid, total,
                        random.choice(methods),
                        random.choice(pay_statuses),
                        fake.uuid4(),
                        random.choice(gateways),
                    ),
                )
            conn.commit()
            print(f"  Inserted {len(order_ids)} payments")

            # --- Invoices (one per order) ---
            inv_statuses = ["issued", "paid", "overdue", "cancelled"]
            for i, oid in enumerate(order_ids):
                cur.execute("SELECT total, created_at FROM orders WHERE id = %s", (oid,))
                row = cur.fetchone()
                total = row[0] if row else 100.00
                created = row[1] if row else datetime.now(timezone.utc)
                tax = round(float(total) * 0.1, 2)
                due = created + timedelta(days=30)
                inv_number = f"INV-{2026}{str(i+1).zfill(4)}"
                cur.execute(
                    """INSERT INTO invoices (order_id, invoice_number, amount, tax_amount, status, issued_at, due_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (invoice_number) DO NOTHING""",
                    (oid, inv_number, total, tax, random.choice(inv_statuses), created, due),
                )
            conn.commit()
            print(f"  Inserted {len(order_ids)} invoices")

        print("\nSeeding complete!")

    except Exception as e:
        conn.rollback()
        print(f"Seeding error: {e}")
        raise
    finally:
        conn.close()


def verify_schema():
    """Verify tables exist and show row counts."""
    conn = get_conn()
    tables = ["categories", "products", "users", "addresses", "orders", "order_items", "payments", "invoices"]
    try:
        with conn.cursor() as cur:
            print("\n=== Database Schema Verification ===")
            for tbl in tables:
                try:
                    cur.execute(f"SELECT COUNT(*) FROM {tbl}")
                    count = cur.fetchone()[0]
                    print(f"  {tbl:20s}: {count} rows")
                except Exception as e:
                    print(f"  {tbl:20s}: ERROR - {e}")
    finally:
        conn.close()


def show_info():
    """Show table column info."""
    conn = get_conn()
    tables = ["users", "products", "orders"]
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for tbl in tables:
                cur.execute(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",
                    (tbl,)
                )
                cols = cur.fetchall()
                print(f"\n{tbl}: {[c['column_name'] for c in cols]}")
    finally:
        conn.close()


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--verify" in args:
        verify_schema()
    elif "--info" in args:
        show_info()
    elif "--seed-only" in args:
        seed_data()
        verify_schema()
    else:
        # Default: full migration + seed
        run_migration()
        seed_data()
        verify_schema()

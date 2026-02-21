"""Supabase/PostgreSQL ecommerce database tools."""
import os
import json
import psycopg2
import psycopg2.extras
from typing import Optional
from dotenv import load_dotenv
from langchain_core.tools import tool

load_dotenv()


def _get_conn():
    """Create a new database connection."""
    url = os.environ.get("SUPABASE_SESSION_POOLER_URL", "")
    conn = psycopg2.connect(url, connect_timeout=10)
    return conn


def _execute(sql: str, params=None, fetch: bool = True) -> dict:
    """Execute a SQL query and return results as dict."""
    conn = None
    try:
        conn = _get_conn()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            if fetch:
                rows = cur.fetchall()
                return {"rows": [dict(r) for r in rows], "count": len(rows)}
            else:
                conn.commit()
                return {"affected_rows": cur.rowcount, "status": "success"}
    except Exception as e:
        if conn:
            conn.rollback()
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()


@tool
def db_query_users(
    user_id: Optional[int] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    limit: int = 10,
) -> str:
    """Query users from the ecommerce database.

    Args:
        user_id: Filter by specific user ID.
        email: Filter by email (partial match).
        name: Filter by name (partial match).
        limit: Maximum rows to return (default 10).

    Returns:
        JSON with matching user records.
    """
    conditions = []
    params = []

    if user_id:
        conditions.append("id = %s")
        params.append(user_id)
    if email:
        conditions.append("email ILIKE %s")
        params.append(f"%{email}%")
    if name:
        conditions.append("name ILIKE %s")
        params.append(f"%{name}%")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"SELECT * FROM users {where} ORDER BY id LIMIT %s"
    params.append(limit)

    result = _execute(sql, params)
    return json.dumps(result, indent=2, default=str)


@tool
def db_query_products(
    product_id: Optional[int] = None,
    name: Optional[str] = None,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    limit: int = 10,
) -> str:
    """Query products from the ecommerce database.

    Args:
        product_id: Filter by specific product ID.
        name: Filter by product name (partial match).
        category: Filter by category name (partial match).
        max_price: Filter by maximum price.
        limit: Maximum rows to return (default 10).

    Returns:
        JSON with matching product records.
    """
    conditions = []
    params = []

    if product_id:
        conditions.append("p.id = %s")
        params.append(product_id)
    if name:
        conditions.append("p.name ILIKE %s")
        params.append(f"%{name}%")
    if category:
        conditions.append("c.name ILIKE %s")
        params.append(f"%{category}%")
    if max_price:
        conditions.append("p.price <= %s")
        params.append(max_price)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        {where}
        ORDER BY p.id LIMIT %s
    """
    params.append(limit)

    result = _execute(sql, params)
    return json.dumps(result, indent=2, default=str)


@tool
def db_query_orders(
    order_id: Optional[int] = None,
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 10,
) -> str:
    """Query orders from the ecommerce database.

    Args:
        order_id: Filter by specific order ID.
        user_id: Filter by user ID.
        status: Filter by order status (e.g., "pending", "completed", "cancelled").
        limit: Maximum rows to return (default 10).

    Returns:
        JSON with matching order records including user name.
    """
    conditions = []
    params = []

    if order_id:
        conditions.append("o.id = %s")
        params.append(order_id)
    if user_id:
        conditions.append("o.user_id = %s")
        params.append(user_id)
    if status:
        conditions.append("o.status ILIKE %s")
        params.append(f"%{status}%")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT o.*, u.name as user_name, u.email as user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        {where}
        ORDER BY o.created_at DESC LIMIT %s
    """
    params.append(limit)

    result = _execute(sql, params)
    return json.dumps(result, indent=2, default=str)


@tool
def db_execute_query(sql: str) -> str:
    """Execute a custom read-only SELECT SQL query against the ecommerce database.

    Args:
        sql: A SELECT SQL query (read-only). Tables available:
             users, products, categories, orders, order_items,
             payments, invoices, addresses.

    Returns:
        JSON with query results.
    """
    sql_clean = sql.strip()
    if not sql_clean.upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed"})

    result = _execute(sql_clean)
    return json.dumps(result, indent=2, default=str)


@tool
def db_get_table_schema(table_name: str) -> str:
    """Get the schema/columns of a database table.

    Args:
        table_name: Table name (users, products, categories, orders,
                    order_items, payments, invoices, addresses).

    Returns:
        JSON with column names and data types.
    """
    sql = """
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """
    result = _execute(sql, [table_name])
    return json.dumps(result, indent=2, default=str)


@tool
def db_database_overview() -> str:
    """Get an overview of all tables in the ecommerce database with row counts.

    Returns:
        JSON with table names and approximate row counts.
    """
    sql = """
        SELECT
            t.table_name,
            (SELECT COUNT(*) FROM information_schema.columns c
             WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
    """
    result = _execute(sql)
    return json.dumps(result, indent=2, default=str)


def get_db_tools():
    """Return list of all database tools."""
    return [
        db_query_users,
        db_query_products,
        db_query_orders,
        db_execute_query,
        db_get_table_schema,
        db_database_overview,
    ]


if __name__ == "__main__":
    print("=== Testing Database Tools ===\n")

    print("1. Database overview:")
    print(db_database_overview.invoke({}))

    print("\n2. Query users (first 5):")
    print(db_query_users.invoke({"limit": 5}))

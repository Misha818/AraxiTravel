import os
import time
import threading
from mysql.connector.pooling import MySQLConnectionPool, PoolError
from flask import g, current_app
from dotenv import load_dotenv

load_dotenv()

# Connections per process. Every gunicorn worker is its own process with its own
# pool, so the server opens up to  workers x MYSQL_POOL_SIZE  connections in total,
# which must stay below MySQL's max_connections (151 by default).
# A request holds at most one connection (see get_db), and a sync gunicorn worker
# serves one request at a time, so a small pool is enough.
POOL_SIZE = int(os.getenv("MYSQL_POOL_SIZE", "5"))

# How long a request waits for a free connection before giving up with
# "server busy" (HTTP 503) instead of hanging the worker forever.
POOL_TIMEOUT = float(os.getenv("MYSQL_POOL_TIMEOUT", "10"))


class WaitingMySQLConnectionPool(MySQLConnectionPool):
    """
    A pool whose get_connection() waits up to POOL_TIMEOUT seconds for a free
    connection (the base class fails immediately when all are in use).
    """
    def get_connection(self, *args, **kwargs):
        deadline = time.monotonic() + POOL_TIMEOUT
        while True:
            try:
                return super().get_connection(*args, **kwargs)
            except PoolError:
                if time.monotonic() >= deadline:
                    current_app.logger.error(
                        "No free database connection after %ss (pool size %s)", POOL_TIMEOUT, POOL_SIZE
                    )
                    raise
                time.sleep(0.05)


_pool = None
_pool_lock = threading.Lock()


def get_pool():
    # Created on first use rather than at import: the pool opens all its
    # connections at once, and processes that never serve a request (e.g. the
    # Flask reloader's parent process) should not hold any.
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = WaitingMySQLConnectionPool(
                    pool_name="mypool",
                    pool_size=POOL_SIZE,
                    pool_reset_session=True,
                    host=os.getenv("MYSQL_HOST"),
                    port=int(os.getenv("MYSQL_PORT", "3306")),
                    charset="utf8mb4",
                    user=os.getenv("MYSQL_USER"),
                    password=os.getenv("MYSQL_PASSWORD"),
                    database=os.getenv("MYSQL_DATABASE"),
                )
    return _pool


def get_db():
    # One connection per request, returned to the pool by close_db()
    if "db_conn" not in g:
        g.db_conn = get_pool().get_connection()
    return g.db_conn


def close_db(exc=None):
    conn = g.pop("db_conn", None)
    if conn is not None:
        try:
            conn.close()
            current_app.logger.debug("Returned connection to pool")
        except PoolError:
            # we already returned it (or the pool is full) — ignore
            current_app.logger.debug("PoolError on close() ignored")

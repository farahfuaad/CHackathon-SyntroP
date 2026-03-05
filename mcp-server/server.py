import os
from typing import Any

import pymssql
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="SyntroP Azure SQL MCP", version="1.0.0")

class SqlQueryRequest(BaseModel):
    query: str = Field(..., description="Use SELECT-only query")
    params: list[Any] = Field(default_factory=list)

def get_conn() -> pymssql.Connection:
    server = os.getenv("AZURE_SQL_SERVER")
    database = os.getenv("AZURE_SQL_DATABASE")
    username = os.getenv("AZURE_SQL_USERNAME")
    password = os.getenv("AZURE_SQL_PASSWORD")

    if not all([server, database, username, password]):
        raise RuntimeError("Missing Azure SQL env vars")

    # All values are str, port as int (pymssql expects int)
    return pymssql.connect(
        server=str(server),
        user=str(username),
        password=str(password),
        database=str(database),
        port=1433, # type: ignore
        login_timeout=30,
        timeout=30,
    )

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/sql/query")
def sql_query(req: SqlQueryRequest):
    q = req.query.strip().lower()
    if not q.startswith("select"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")

    try:
        with get_conn() as conn:
            with conn.cursor(as_dict=True) as cur:
                cur.execute(req.query, tuple(req.params))
                rows = cur.fetchall()
                cols = list(rows[0].keys()) if rows else []
                return {"columns": cols, "rows": rows, "count": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
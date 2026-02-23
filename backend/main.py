from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from auth import verify_maya_auth
from config import settings
from database import close_db_pool, init_db_pool, run_migrations
from routers import broadcasts, segments, sync, users

app = FastAPI(title="Maya Email Analytics Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

auth_dep = [Depends(verify_maya_auth)]

app.include_router(sync.router, prefix="/api", tags=["sync"], dependencies=auth_dep)
app.include_router(broadcasts.router, prefix="/api", tags=["broadcasts"], dependencies=auth_dep)
app.include_router(users.router, prefix="/api", tags=["users"], dependencies=auth_dep)
app.include_router(segments.router, prefix="/api", tags=["segments"], dependencies=auth_dep)


@app.on_event("startup")
def on_startup() -> None:
    init_db_pool()
    run_migrations()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_db_pool()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/check")
def auth_check(user: dict = Depends(verify_maya_auth)) -> dict:
    return {"authenticated": True, "user": user}


@app.get("/api/auth/portal-url")
def portal_url() -> dict:
    return {"portal_url": settings.portal_url}


def _frontend_index() -> Path:
    return settings.frontend_dist_dir / "index.html"


@app.get("/{full_path:path}", response_model=None)
def serve_frontend(full_path: str) -> Response:
    dist_dir = settings.frontend_dist_dir
    requested_path = dist_dir / full_path

    if full_path and requested_path.exists() and requested_path.is_file():
        return FileResponse(requested_path)

    index_path = _frontend_index()
    if index_path.exists():
        return FileResponse(index_path)

    return JSONResponse(
        status_code=503,
        content={
            "message": "Frontend build not found. Run `npm run build` inside frontend/."
        },
    )

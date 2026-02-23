from __future__ import annotations

import jwt
from fastapi import HTTPException, Request

from config import settings

COOKIE_NAME = "maya_auth_token"


def verify_maya_auth(request: Request) -> dict:
    if not settings.shared_jwt_secret:
        return {"sub": "dev", "mode": "no_auth"}

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        return jwt.decode(token, settings.shared_jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication")

"""Shared FastAPI dependencies.

`get_current_user` handles authentication. In development, it uses a mock user. 
In production, it enforces HTTP Basic Authentication using the ADMIN_PASSWORD.
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import secrets

from app.core.config import settings
from app.db.models import User
from app.db.session import get_db

DEV_USER_EMAIL = "dev@localhost"

security = HTTPBasic(auto_error=False)


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPBasicCredentials | None = Depends(security)
) -> User:
    if settings.ENVIRONMENT == "production":
        if not settings.ADMIN_PASSWORD:
            raise RuntimeError("ADMIN_PASSWORD must be set in production")
        
        is_valid = credentials and secrets.compare_digest(credentials.password, settings.ADMIN_PASSWORD)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Basic"},
            )
        email = credentials.username
        display_name = credentials.username
    else:
        email = DEV_USER_EMAIL
        display_name = "Development User"

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(email=email, display_name=display_name)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def require_demo_token(x_demo_token: str | None = Header(default=None)) -> None:
    """Optional gate for uploads/analysis when DEMO_UPLOAD_TOKEN is set."""
    expected = settings.DEMO_UPLOAD_TOKEN
    if expected and x_demo_token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Uploads are gated in this demo.")
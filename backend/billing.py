from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import Campaign, Profile

FREE_CAMPAIGN_LIMIT = 3
UNLOCK_PRICE_CENTS = 500


def billing_enabled() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY", "").strip())


def count_sent_campaigns(session: Session, owner_id: uuid.UUID) -> int:
    count = session.scalar(
        select(func.count())
        .select_from(Campaign)
        .where(
            Campaign.owner_id == owner_id,
            Campaign.status == "sent",
            Campaign.sent_at.isnot(None),
        )
    )
    return int(count or 0)


def is_profile_unlocked(session: Session, owner_id: uuid.UUID) -> bool:
    profile = session.get(Profile, owner_id)
    return bool(profile and profile.campaigns_unlocked)


def billing_status_for_user(session: Session, owner_id: uuid.UUID) -> dict:
    sent_count = count_sent_campaigns(session, owner_id)
    if not billing_enabled():
        return {
            "billing_enabled": False,
            "unlocked": True,
            "sent_count": sent_count,
            "can_send": True,
            "free_remaining": None,
            "price_label": "$5",
        }

    unlocked = is_profile_unlocked(session, owner_id)
    can_send = unlocked or sent_count < FREE_CAMPAIGN_LIMIT
    free_remaining = (
        None if unlocked else max(0, FREE_CAMPAIGN_LIMIT - sent_count)
    )
    return {
        "billing_enabled": True,
        "unlocked": unlocked,
        "sent_count": sent_count,
        "can_send": can_send,
        "free_remaining": free_remaining,
        "price_label": "$5",
    }


def require_can_send(session: Session, owner_id: uuid.UUID) -> dict | None:
    status = billing_status_for_user(session, owner_id)
    if status["can_send"]:
        return None
    return status


def unlock_profile(
    session: Session,
    owner_id: uuid.UUID,
    *,
    stripe_customer_id: str | None = None,
    email: str | None = None,
) -> None:
    profile = session.get(Profile, owner_id)
    if profile is None:
        profile = Profile(id=owner_id, email=email)
        session.add(profile)
    profile.campaigns_unlocked = True
    profile.unlocked_at = datetime.now(UTC)
    if stripe_customer_id:
        profile.stripe_customer_id = stripe_customer_id
    if email and not profile.email:
        profile.email = email
    session.commit()

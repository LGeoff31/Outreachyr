"""Stripe checkout + billing status for campaign unlock."""

from __future__ import annotations

import logging
import os
import uuid

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from billing import UNLOCK_PRICE_CENTS, billing_enabled, unlock_profile
from config import frontend_base_url
from supabase_jwt import verify_supabase_access_token
from user_resume_api import get_db_session, require_supabase_user

router = APIRouter(prefix="/api", tags=["billing"])
logger = logging.getLogger(__name__)


class ConfirmCheckoutBody(BaseModel):
    session_id: str


def _session_field(session, key: str):
    if isinstance(session, dict):
        return session.get(key)
    return getattr(session, key, None)


def _optional_supabase_user(request: Request) -> dict | None:
    auth = request.headers.get("authorization") or request.headers.get(
        "Authorization", ""
    )
    if not auth.startswith("Bearer "):
        return None
    token = auth.removeprefix("Bearer ").strip()
    try:
        return verify_supabase_access_token(token)
    except RuntimeError:
        return None


def _unlock_from_checkout_session(db: Session, session) -> bool:
    user_id_raw = _session_field(session, "client_reference_id")
    if not user_id_raw:
        logger.warning("Stripe checkout session missing client_reference_id")
        return False
    try:
        owner_id = uuid.UUID(str(user_id_raw))
    except ValueError:
        logger.warning("Stripe checkout client_reference_id is not a UUID: %s", user_id_raw)
        return False
    customer = _session_field(session, "customer")
    customer_id = str(customer) if customer else None
    details = _session_field(session, "customer_details") or {}
    customer_email = None
    if details:
        customer_email = (
            details.get("email")
            if isinstance(details, dict)
            else getattr(details, "email", None)
        )
    unlock_profile(
        db,
        owner_id,
        stripe_customer_id=customer_id,
        email=customer_email,
    )
    logger.info("Unlocked campaigns for owner %s", owner_id)
    return True


def _configure_stripe() -> None:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="Billing is not configured.")
    stripe.api_key = key


@router.get("/billing/status")
def billing_status(
    user: dict = Depends(require_supabase_user),
    db: Session = Depends(get_db_session),
):
    from billing import billing_status_for_user

    owner_id = uuid.UUID(str(user["id"]))
    return billing_status_for_user(db, owner_id, email=user.get("email"))


@router.post("/billing/checkout")
def create_checkout(user: dict = Depends(require_supabase_user)):
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Billing is not configured.")

    _configure_stripe()
    base = frontend_base_url()
    email = user.get("email")
    if isinstance(email, str):
        email = email.strip() or None
    else:
        email = None

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            client_reference_id=str(user["id"]),
            customer_email=email,
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": "Outreachyr — unlimited campaigns",
                        },
                        "unit_amount": UNLOCK_PRICE_CENTS,
                    },
                    "quantity": 1,
                }
            ],
            success_url=(
                f"{base}/billing/success"
                "?session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{base}/?checkout=cancelled",
        )
    except stripe.StripeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    url = session.url
    if not url:
        raise HTTPException(status_code=502, detail="Could not start checkout.")
    return {"url": url}


@router.post("/billing/confirm")
def confirm_checkout(
    body: ConfirmCheckoutBody,
    request: Request,
    db: Session = Depends(get_db_session),
):
    """Unlock after Stripe redirect. Auth is optional — session_id proves payment."""
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Billing is not configured.")

    session_id = body.session_id.strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id.")

    _configure_stripe()
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.StripeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if session.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Payment not completed.")

    ref = session.client_reference_id
    if not ref:
        raise HTTPException(
            status_code=400,
            detail="Checkout session is missing the user reference.",
        )

    user = _optional_supabase_user(request)
    if user and str(ref) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Checkout session mismatch.")

    if not _unlock_from_checkout_session(db, session):
        raise HTTPException(status_code=400, detail="Could not unlock account.")

    from billing import billing_status_for_user

    owner_id = uuid.UUID(str(ref))
    details = session.customer_details or {}
    checkout_email = getattr(details, "email", None) if details else None
    email = user.get("email") if user else checkout_email
    return billing_status_for_user(
        db, owner_id, email=email if isinstance(email, str) else None
    )


@router.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db_session),
):
    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Billing is not configured.")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured.")

    _configure_stripe()
    try:
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except (ValueError, stripe.SignatureVerificationError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if event["type"] == "checkout.session.completed":
        session_obj = event["data"]["object"]
        session_id = _session_field(session_obj, "id")
        if _unlock_from_checkout_session(db, session_obj):
            logger.info("Webhook unlocked checkout session %s", session_id)
        else:
            logger.warning("Webhook could not unlock checkout session %s", session_id)

    return {"received": True}

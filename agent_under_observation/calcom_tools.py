"""Cal.com API v2 calendar integration tools."""
import os
import json
import requests
from typing import Optional
from dotenv import load_dotenv
from langchain_core.tools import tool

load_dotenv()

CALCOM_API_BASE = "https://api.cal.com/v2"
CALCOM_BOOKING_VERSION = "2024-08-13"
CALCOM_EVENT_TYPES_VERSION = "2024-06-14"
CALCOM_SLOTS_VERSION = "2024-09-04"


def _headers(api_version: str) -> dict:
    key = os.environ.get("CALCOM_CALENDAR_API_KEY", "")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "cal-api-version": api_version,
    }


def _req(method: str, path: str, api_version: str, **kwargs) -> dict:
    url = f"{CALCOM_API_BASE}{path}"
    resp = requests.request(method, url, headers=_headers(api_version), **kwargs)
    try:
        return resp.json()
    except Exception:
        return {"error": resp.text, "status": resp.status_code}


@tool
def calendar_get_my_profile() -> str:
    """Get the current Cal.com user profile and account details."""
    result = _req("GET", "/me", CALCOM_EVENT_TYPES_VERSION)
    return json.dumps(result, indent=2)


@tool
def calendar_get_event_types() -> str:
    """Get all available Cal.com event types with their IDs, titles, and durations.
    Always call this first before booking to get the correct eventTypeId.

    Returns:
        JSON with event types including id, title, duration in minutes.
    """
    result = _req("GET", "/event-types", CALCOM_EVENT_TYPES_VERSION)
    return json.dumps(result, indent=2)


@tool
def calendar_get_available_slots(
    event_type_id: int,
    start_date: str,
    end_date: str,
    timezone: str = "UTC",
) -> str:
    """Get available time slots for a Cal.com event type on given dates.

    Args:
        event_type_id: The event type ID (get from calendar_get_event_types).
        start_date: Start date in YYYY-MM-DD format (e.g., "2026-02-03").
        end_date: End date in YYYY-MM-DD format (e.g., "2026-02-03").
        timezone: IANA timezone string (e.g., "UTC", "Asia/Kolkata", "America/New_York").

    Returns:
        JSON with available slots grouped by date.
    """
    params = {
        "eventTypeId": event_type_id,
        "start": start_date,
        "end": end_date,
        "timeZone": timezone,
    }
    result = _req("GET", "/slots", CALCOM_SLOTS_VERSION, params=params)
    return json.dumps(result, indent=2)


@tool
def calendar_create_booking(
    event_type_id: int,
    start: str,
    attendee_name: str,
    attendee_email: str,
    attendee_timezone: str = "UTC",
) -> str:
    """Book a meeting/appointment on Cal.com.

    Args:
        event_type_id: Event type ID from calendar_get_event_types.
        start: ISO 8601 UTC datetime string (e.g., "2026-02-03T14:00:00Z").
        attendee_name: Full name of the attendee.
        attendee_email: Email address of the attendee.
        attendee_timezone: IANA timezone (e.g., "UTC", "Asia/Kolkata").

    Returns:
        JSON with booking confirmation including uid, meetingUrl.
    """
    data = {
        "eventTypeId": event_type_id,
        "start": start,
        "attendee": {
            "name": attendee_name,
            "email": attendee_email,
            "timeZone": attendee_timezone,
        },
    }
    result = _req("POST", "/bookings", CALCOM_BOOKING_VERSION, json=data)
    return json.dumps(result, indent=2)


@tool
def calendar_get_bookings(status: Optional[str] = None) -> str:
    """Get all Cal.com bookings.

    Args:
        status: Optional filter - "upcoming", "recurring", "past", "cancelled", "unconfirmed".

    Returns:
        JSON list of bookings.
    """
    params = {}
    if status:
        params["status"] = status
    result = _req("GET", "/bookings", CALCOM_BOOKING_VERSION, params=params)
    return json.dumps(result, indent=2)


@tool
def calendar_cancel_booking(booking_uid: str, reason: str = "Cancelled by user") -> str:
    """Cancel a Cal.com booking.

    Args:
        booking_uid: The unique booking UID to cancel.
        reason: Cancellation reason.

    Returns:
        JSON with cancellation confirmation.
    """
    data = {"cancellationReason": reason}
    result = _req("POST", f"/bookings/{booking_uid}/cancel", CALCOM_BOOKING_VERSION, json=data)
    return json.dumps(result, indent=2)


def get_calcom_tools():
    """Return list of all Cal.com tools."""
    return [
        calendar_get_my_profile,
        calendar_get_event_types,
        calendar_get_available_slots,
        calendar_create_booking,
        calendar_get_bookings,
        calendar_cancel_booking,
    ]


if __name__ == "__main__":
    print("=== Testing Cal.com Tools ===\n")

    print("1. Get profile:")
    print(calendar_get_my_profile.invoke({}))

    print("\n2. Get event types:")
    print(calendar_get_event_types.invoke({}))

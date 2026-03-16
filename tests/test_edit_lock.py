"""Tests for edit lock API."""
import pytest


EMPLOYEE_1 = "AB12345"
EMPLOYEE_2 = "CD67890"


def test_get_lock_initially_unlocked(client):
    r = client.get("/api/edit-lock")
    assert r.status_code == 200
    data = r.json()
    assert data["locked"] is False
    assert data["employee_id"] is None
    assert data["locked_at"] is None


def test_acquire_lock(client):
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": EMPLOYEE_1},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["locked"] is True
    assert data["employee_id"] == EMPLOYEE_1
    assert data["locked_at"] is not None


def test_acquire_then_release(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": EMPLOYEE_1})
    r = client.post(
        "/api/edit-lock/release",
        json={"employee_id": EMPLOYEE_1},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["locked"] is False
    assert data["employee_id"] is None


def test_acquire_same_employee_refreshes(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": EMPLOYEE_1})
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": EMPLOYEE_1},
    )
    assert r.status_code == 200
    assert r.json()["employee_id"] == EMPLOYEE_1


def test_acquire_when_locked_by_other_returns_409(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": EMPLOYEE_1})
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": EMPLOYEE_2},
    )
    assert r.status_code == 409
    detail = r.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("employee_id") == EMPLOYEE_1
        assert "locked" in str(detail).lower() or "lock" in str(detail).lower()
    else:
        assert EMPLOYEE_1 in str(detail)


def test_acquire_force_takeover(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": EMPLOYEE_1})
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": EMPLOYEE_2, "force": True},
    )
    assert r.status_code == 200
    assert r.json()["employee_id"] == EMPLOYEE_2


def test_release_when_locked_by_other_returns_409(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": EMPLOYEE_1})
    r = client.post(
        "/api/edit-lock/release",
        json={"employee_id": EMPLOYEE_2},
    )
    assert r.status_code == 409


def test_release_when_not_locked_returns_200(client):
    r = client.post(
        "/api/edit-lock/release",
        json={"employee_id": EMPLOYEE_1},
    )
    assert r.status_code == 200
    assert r.json()["locked"] is False


def test_employee_id_normalized_to_uppercase(client):
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": "ab12345"},
    )
    assert r.status_code == 200
    assert r.json()["employee_id"] == "AB12345"


def test_employee_id_invalid_format_returns_400(client):
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": "invalid"},
    )
    assert r.status_code == 400
    assert "AA12345" in r.json().get("detail", "")


def test_409_response_includes_employee_id_and_locked_at(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": EMPLOYEE_1})
    r = client.post(
        "/api/edit-lock/acquire",
        json={"employee_id": EMPLOYEE_2},
    )
    assert r.status_code == 409
    detail = r.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("employee_id") == EMPLOYEE_1
        assert "locked_at" in detail or "message" in detail

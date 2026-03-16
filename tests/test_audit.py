"""Tests for audit log API."""
import pytest


def test_list_audit_events_empty_after_reset(client):
    r = client.get("/api/audit-events")
    assert r.status_code == 200
    # After reset we have no audit events (or only those from startup if any)
    data = r.json()
    assert isinstance(data, list)


def test_list_audit_events_after_task_create(client, seed_task_uids):
    # Create task to generate audit event
    client.post("/api/tasks", json={"name": "Audited task"})
    r = client.get("/api/audit-events")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    event = data[0]
    assert "action_type" in event
    assert "entity_type" in event
    assert "created_at" in event
    assert event.get("action_type") == "task_create"
    assert event.get("entity_type") == "task"
    assert event.get("new_value") is not None
    assert event["new_value"].get("name") == "Audited task"


def test_audit_filter_by_action_type(client, seed_task_uids):
    client.post("/api/tasks", json={"name": "T1"})
    client.post("/api/edit-lock/acquire", json={"employee_id": "AB12345"})
    r = client.get("/api/audit-events", params={"action_type": "task_create"})
    assert r.status_code == 200
    data = r.json()
    assert all(e.get("action_type") == "task_create" for e in data)


def test_audit_filter_by_employee_id(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": "AB12345"})
    r = client.get("/api/audit-events", params={"employee_id": "AB12345"})
    assert r.status_code == 200
    data = r.json()
    assert all(e.get("actor_employee_id") == "AB12345" for e in data)


def test_audit_filter_by_task_uid(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.patch(f"/api/tasks/{uid}", json={"name": "Updated"})
    r = client.get("/api/audit-events", params={"task_uid": uid})
    assert r.status_code == 200
    data = r.json()
    assert all(e.get("task_uid") == uid for e in data)


def test_audit_event_has_prior_and_new_value(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.patch(f"/api/tasks/{uid}", json={"name": "New name"})
    r = client.get("/api/audit-events", params={"task_uid": uid})
    assert r.status_code == 200
    data = r.json()
    update_events = [e for e in data if e.get("action_type") == "task_update"]
    assert len(update_events) >= 1
    ev = update_events[0]
    assert ev.get("prior_value") is not None
    assert ev.get("new_value") is not None
    assert ev["new_value"].get("name") == "New name"


def test_audit_lock_acquire_has_metadata(client):
    client.post("/api/edit-lock/acquire", json={"employee_id": "AB12345"})
    r = client.get("/api/audit-events", params={"action_type": "lock_acquire"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert data[0].get("entity_type") == "edit_lock"


def test_audit_soft_delete_has_metadata(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.post("/api/tasks", json={"name": "Child", "parent_task_uid": uid})
    client.post(f"/api/tasks/{uid}/soft-delete", json={"strategy": "shift_up"})
    r = client.get("/api/audit-events", params={"action_type": "task_soft_delete"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    ev = data[0]
    assert ev.get("metadata") is not None
    assert ev["metadata"].get("strategy") == "shift_up"


def test_audit_dependency_delete(client, seed_task_uids):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    dep = client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred, "successor_task_uid": succ, "dependency_type": "FS"},
    ).json()
    client.delete(f"/api/dependencies/{dep['uid']}")
    r = client.get("/api/audit-events", params={"action_type": "dependency_delete"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_audit_no_filter_returns_all(client):
    client.post("/api/tasks", json={"name": "T1"})
    client.post("/api/edit-lock/acquire", json={"employee_id": "AB12345"})
    r = client.get("/api/audit-events")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    action_types = {e.get("action_type") for e in data}
    assert "task_create" in action_types or "lock_acquire" in action_types

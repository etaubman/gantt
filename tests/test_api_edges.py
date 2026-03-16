"""Tests for API edge cases: headers, status values, and request/response shape."""
import pytest


def test_audit_uses_employee_id_header(client, seed_task_uids):
    """X-Employee-Id header is recorded in audit as actor."""
    uid = seed_task_uids[0]
    client.patch(
        f"/api/tasks/{uid}",
        json={"name": "Changed"},
        headers={"X-Employee-Id": "XY99999"},
    )
    r = client.get("/api/audit-events", params={"task_uid": uid})
    assert r.status_code == 200
    update_events = [e for e in r.json() if e.get("action_type") == "task_update"]
    assert len(update_events) >= 1
    assert update_events[0].get("actor_employee_id") == "XY99999"


def test_task_status_values(client, seed_task_uids):
    """All valid task statuses can be set via PATCH."""
    uid = seed_task_uids[0]
    for status in ("not_started", "in_progress", "complete", "blocked", "cancelled"):
        r = client.patch(f"/api/tasks/{uid}", json={"status": status})
        assert r.status_code == 200
        assert r.json()["status"] == status


def test_task_create_all_statuses(client, project_uid):
    """Create task with each valid status."""
    for status in ("not_started", "in_progress", "complete", "blocked", "cancelled"):
        r = client.post(
            "/api/tasks",
            json={"name": f"Task {status}", "status": status},
        )
        assert r.status_code == 200
        assert r.json()["status"] == status


def test_task_progress_validation_upper(client, seed_task_uids):
    """Progress > 100 rejected by validation."""
    r = client.patch(
        f"/api/tasks/{seed_task_uids[0]}",
        json={"progress": 101},
    )
    assert r.status_code == 422


def test_task_progress_validation_negative(client, seed_task_uids):
    """Progress < 0 rejected by validation."""
    r = client.patch(
        f"/api/tasks/{seed_task_uids[0]}",
        json={"progress": -1},
    )
    assert r.status_code == 422


def test_get_task_returns_all_fields(client, seed_task_uids):
    """GET /api/tasks/{uid} returns expected top-level fields."""
    r = client.get(f"/api/tasks/{seed_task_uids[0]}")
    assert r.status_code == 200
    data = r.json()
    for key in ("uid", "project_uid", "name", "description", "accountable_person",
                "responsible_party", "start_date", "end_date", "is_milestone",
                "status", "progress", "sort_order", "is_deleted", "created_at", "updated_at"):
        assert key in data


def test_list_tasks_ordered_by_sort_order(client, project_uid):
    """Tasks list order respects sort_order then created_at."""
    client.post("/api/tasks", json={"name": "Last", "sort_order": 100})
    client.post("/api/tasks", json={"name": "First", "sort_order": 0})
    r = client.get("/api/tasks")
    assert r.status_code == 200
    names = [t["name"] for t in r.json()]
    first_idx = names.index("First") if "First" in names else -1
    last_idx = names.index("Last") if "Last" in names else -1
    if first_idx >= 0 and last_idx >= 0:
        assert first_idx < last_idx


def test_rag_list_ordered_by_created_at(client, seed_task_uids):
    """RAG history is ascending by created_at."""
    uid = seed_task_uids[0]
    client.post(f"/api/tasks/{uid}/rag", json={"status": "green"})
    client.post(f"/api/tasks/{uid}/rag", json={"status": "amber", "rationale": "R"})
    r = client.get(f"/api/tasks/{uid}/rag")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["status"] == "green"
    assert data[1]["status"] == "amber"


def test_comment_author_stored(client, seed_task_uids):
    """Comment author is stored and returned."""
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/comments",
        json={"author": "Jane Doe", "comment_text": "Hello"},
    )
    assert r.status_code == 200
    assert r.json()["author"] == "Jane Doe"
    r2 = client.get(f"/api/tasks/{seed_task_uids[0]}/comments")
    assert r2.json()[0]["author"] == "Jane Doe"


def test_risk_mitigation_plan_stored(client, seed_task_uids):
    """Risk mitigation_plan is stored and returned."""
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/risks",
        json={"title": "R", "mitigation_plan": "Do X and Y"},
    )
    assert r.status_code == 200
    assert r.json()["mitigation_plan"] == "Do X and Y"


def test_dependency_uid_returned(client, seed_task_uids):
    """Create dependency returns uid for later delete."""
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    r = client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred, "successor_task_uid": succ, "dependency_type": "FS"},
    )
    assert r.status_code == 200
    assert "uid" in r.json()
    dep_uid = r.json()["uid"]
    r2 = client.delete(f"/api/dependencies/{dep_uid}")
    assert r2.status_code == 204


def test_export_response_has_content_disposition(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    cd = r.headers.get("content-disposition", "")
    assert "export" in cd.lower() or "attachment" in cd.lower() or ".xlsx" in cd.lower()


def test_edit_lock_release_force(client):
    """Force release by another employee after takeover."""
    client.post("/api/edit-lock/acquire", json={"employee_id": "AB12345"})
    client.post("/api/edit-lock/acquire", json={"employee_id": "CD67890", "force": True})
    r = client.post("/api/edit-lock/release", json={"employee_id": "AB12345", "force": True})
    assert r.status_code == 200
    assert r.json()["locked"] is False


def test_soft_delete_removes_dependencies(client, seed_task_uids):
    """Soft-delete removes dependencies involving the task."""
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred, "successor_task_uid": succ, "dependency_type": "FS"},
    )
    deps_before = client.get("/api/dependencies").json()
    assert len(deps_before) == 1
    client.post(f"/api/tasks/{pred}/soft-delete", json={"strategy": "shift_up"})
    deps_after = client.get("/api/dependencies").json()
    assert len(deps_after) == 0


def test_get_project_returns_created_at(client, project_uid):
    r = client.get(f"/api/projects/{project_uid}")
    assert r.status_code == 200
    assert "created_at" in r.json()
    assert r.json()["created_at"]


def test_list_projects_single_item(client):
    r = client.get("/api/projects")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["uid"] == "markets-data-governance"

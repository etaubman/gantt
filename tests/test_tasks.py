"""Tests for task API."""
import pytest


def test_list_tasks(client):
    r = client.get("/api/tasks")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 8  # seed tasks
    for t in data:
        assert "uid" in t and "name" in t and "project_uid" in t
        assert t.get("is_deleted") is False


def test_list_tasks_excludes_soft_deleted(client, project_uid):
    r = client.get("/api/tasks")
    assert r.status_code == 200
    tasks = r.json()
    uid = tasks[0]["uid"]
    client.post(f"/api/tasks/{uid}/soft-delete", json={"strategy": "shift_up"})
    r2 = client.get("/api/tasks")
    assert r2.status_code == 200
    uids = [t["uid"] for t in r2.json()]
    assert uid not in uids


def test_get_task(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.get(f"/api/tasks/{uid}")
    assert r.status_code == 200
    data = r.json()
    assert data["uid"] == uid
    assert "name" in data
    assert data.get("is_milestone") is False
    assert "created_at" in data


def test_get_task_not_found(client):
    r = client.get("/api/tasks/nonexistent-uid")
    assert r.status_code == 404


def test_create_task_root(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={
            "name": "New root task",
            "status": "not_started",
            "progress": 0,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "New root task"
    assert data["project_uid"] == project_uid
    assert data["parent_task_uid"] is None
    assert data["status"] == "not_started"
    assert "uid" in data
    assert "created_at" in data


def test_create_task_with_dates(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={
            "name": "Scheduled task",
            "start_date": "2025-01-01",
            "end_date": "2025-01-15",
            "status": "in_progress",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["start_date"] == "2025-01-01"
    assert data["end_date"] == "2025-01-15"


def test_create_task_child_inherits_dates(client, seed_task_uids, project_uid):
    parent_uid = seed_task_uids[0]
    client.patch(
        f"/api/tasks/{parent_uid}",
        json={"start_date": "2025-02-01", "end_date": "2025-02-28"},
    )
    r = client.post(
        "/api/tasks",
        json={
            "name": "Child task",
            "parent_task_uid": parent_uid,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["parent_task_uid"] == parent_uid
    assert data.get("start_date") is not None
    assert data.get("end_date") is not None


def test_create_task_invalid_status(client):
    r = client.post(
        "/api/tasks",
        json={"name": "X", "status": "invalid_status"},
    )
    # API validates status and returns 400
    assert r.status_code in (400, 422)
    assert "status" in r.json().get("detail", "").lower() or "invalid" in r.json().get("detail", "").lower()


def test_create_task_parent_wrong_project(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={
            "name": "Child",
            "parent_task_uid": "other-project-1",
        },
    )
    assert r.status_code == 400
    assert "parent" in r.json().get("detail", "").lower()


def test_patch_task(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.patch(
        f"/api/tasks/{uid}",
        json={"name": "Updated name", "status": "in_progress", "progress": 50},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Updated name"
    assert data["status"] == "in_progress"
    assert data["progress"] == 50


def test_patch_task_empty_body_returns_task(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.patch(f"/api/tasks/{uid}", json={})
    assert r.status_code == 200
    assert r.json()["uid"] == uid


def test_patch_task_invalid_status(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.patch(f"/api/tasks/{uid}", json={"status": "invalid"})
    assert r.status_code in (400, 422)
    assert "status" in r.json().get("detail", "").lower() or "invalid" in r.json().get("detail", "").lower()


def test_patch_task_not_found(client):
    r = client.patch("/api/tasks/nonexistent", json={"name": "X"})
    assert r.status_code == 404


def test_soft_delete_shift_up(client, seed_task_uids):
    parent_uid = seed_task_uids[0]
    child = client.post(
        "/api/tasks",
        json={"name": "Child", "parent_task_uid": parent_uid},
    ).json()
    child_uid = child["uid"]
    r = client.post(
        f"/api/tasks/{parent_uid}/soft-delete",
        json={"strategy": "shift_up"},
    )
    assert r.status_code == 200
    tasks = client.get("/api/tasks").json()
    uids = [t["uid"] for t in tasks]
    assert parent_uid not in uids
    assert child_uid in uids
    # Child should now have parent_task_uid = None (reparented to root)
    child_task = next(t for t in tasks if t["uid"] == child_uid)
    assert child_task["parent_task_uid"] is None


def test_soft_delete_delete_subtasks(client, seed_task_uids):
    parent_uid = seed_task_uids[0]
    child = client.post(
        "/api/tasks",
        json={"name": "Child", "parent_task_uid": parent_uid},
    ).json()
    child_uid = child["uid"]
    r = client.post(
        f"/api/tasks/{parent_uid}/soft-delete",
        json={"strategy": "delete_subtasks"},
    )
    assert r.status_code == 200
    tasks = client.get("/api/tasks").json()
    uids = [t["uid"] for t in tasks]
    assert parent_uid not in uids
    assert child_uid not in uids


def test_soft_delete_invalid_strategy(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/soft-delete",
        json={"strategy": "invalid"},
    )
    assert r.status_code == 400


def test_soft_delete_not_found(client):
    r = client.post(
        "/api/tasks/nonexistent/soft-delete",
        json={"strategy": "shift_up"},
    )
    assert r.status_code == 404


def test_hard_delete_task(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.delete(f"/api/tasks/{uid}")
    assert r.status_code == 204
    r2 = client.get(f"/api/tasks/{uid}")
    assert r2.status_code == 404


def test_hard_delete_cascades_to_children(client, seed_task_uids):
    parent_uid = seed_task_uids[0]
    child = client.post(
        "/api/tasks",
        json={"name": "Child", "parent_task_uid": parent_uid},
    ).json()
    client.delete(f"/api/tasks/{parent_uid}")
    assert client.get(f"/api/tasks/{child['uid']}").status_code == 404


def test_hard_delete_not_found(client):
    r = client.delete("/api/tasks/nonexistent")
    assert r.status_code == 404


def test_create_task_with_description_and_ownership(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={
            "name": "Owned task",
            "description": "A longer description",
            "accountable_person": "Alice",
            "responsible_party": "Bob",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["description"] == "A longer description"
    assert data["accountable_person"] == "Alice"
    assert data["responsible_party"] == "Bob"


def test_create_task_milestone(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={
            "name": "Go-live",
            "is_milestone": True,
            "start_date": "2025-06-01",
            "end_date": "2025-06-01",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_milestone"] is True
    assert data["start_date"] == data["end_date"] == "2025-06-01"


def test_create_task_sort_order(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={"name": "Ordered", "sort_order": 99},
    )
    assert r.status_code == 200
    assert r.json()["sort_order"] == 99


def test_patch_task_milestone(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.patch(f"/api/tasks/{uid}", json={"is_milestone": True})
    assert r.status_code == 200
    assert r.json()["is_milestone"] is True


def test_patch_task_description_and_dates(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.patch(
        f"/api/tasks/{uid}",
        json={
            "description": "Updated desc",
            "start_date": "2025-03-01",
            "end_date": "2025-03-31",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["description"] == "Updated desc"
    assert data["start_date"] == "2025-03-01"
    assert data["end_date"] == "2025-03-31"


def test_patch_task_progress_boundaries(client, seed_task_uids):
    uid = seed_task_uids[0]
    for val in (0, 100):
        r = client.patch(f"/api/tasks/{uid}", json={"progress": val})
        assert r.status_code == 200
        assert r.json()["progress"] == val


def test_soft_delete_already_deleted_returns_task(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.post(f"/api/tasks/{uid}/soft-delete", json={"strategy": "shift_up"})
    r = client.post(f"/api/tasks/{uid}/soft-delete", json={"strategy": "shift_up"})
    assert r.status_code == 200
    assert r.json()["uid"] == uid


def test_list_tasks_by_project_uid(client, project_uid):
    r = client.get(f"/api/projects/{project_uid}/tasks")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 8
    assert all(t["project_uid"] == project_uid for t in data)


def test_list_tasks_by_project_uid_not_found(client):
    r = client.get("/api/projects/nonexistent/tasks")
    assert r.status_code == 404


def test_create_task_via_project_uid(client, project_uid):
    r = client.post(
        f"/api/projects/{project_uid}/tasks",
        json={"name": "Via project URL"},
    )
    assert r.status_code == 200
    assert r.json()["project_uid"] == project_uid
    assert r.json()["name"] == "Via project URL"


def test_create_task_via_project_uid_not_found(client):
    r = client.post(
        "/api/projects/nonexistent/tasks",
        json={"name": "X"},
    )
    assert r.status_code == 404


def test_get_task_returns_is_milestone_bool(client, project_uid):
    r = client.post(
        "/api/tasks",
        json={"name": "M", "is_milestone": True, "start_date": "2025-01-01", "end_date": "2025-01-01"},
    )
    uid = r.json()["uid"]
    r2 = client.get(f"/api/tasks/{uid}")
    assert r2.status_code == 200
    assert r2.json()["is_milestone"] is True
    assert type(r2.json()["is_milestone"]) is bool

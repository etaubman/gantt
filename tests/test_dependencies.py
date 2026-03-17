"""Tests for dependencies API."""
import pytest


def test_list_dependencies_empty(client):
    r = client.get("/api/dependencies")
    assert r.status_code == 200
    assert r.json() == []


def test_create_dependency(client, seed_task_uids):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    r = client.post(
        "/api/dependencies",
        json={
            "predecessor_task_uid": pred,
            "successor_task_uid": succ,
            "dependency_type": "FS",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["predecessor_task_uid"] == pred
    assert data["successor_task_uid"] == succ
    assert data["dependency_type"] == "FS"
    assert "uid" in data
    assert "created_at" in data


def test_create_dependency_types_ss_ff_sf(client, seed_task_uids):
    """SS, FF, SF are valid types (same as FS)."""
    # Use different task pairs so we don't duplicate
    tasks = client.get("/api/tasks").json()
    assert len(tasks) >= 4
    for i, dep_type in enumerate(("SS", "FF", "SF")):
        pred, succ = tasks[i]["uid"], tasks[i + 1]["uid"]
        r = client.post(
            "/api/dependencies",
            json={
                "predecessor_task_uid": pred,
                "successor_task_uid": succ,
                "dependency_type": dep_type,
            },
        )
        assert r.status_code == 200, r.json()
        assert r.json()["dependency_type"] == dep_type


def test_create_dependency_same_task_rejected(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.post(
        "/api/dependencies",
        json={
            "predecessor_task_uid": uid,
            "successor_task_uid": uid,
            "dependency_type": "FS",
        },
    )
    assert r.status_code == 400
    assert "differ" in r.json().get("detail", "").lower() or "predecessor" in r.json().get("detail", "").lower()


def test_create_dependency_invalid_type(client, seed_task_uids):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    r = client.post(
        "/api/dependencies",
        json={
            "predecessor_task_uid": pred,
            "successor_task_uid": succ,
            "dependency_type": "XX",
        },
    )
    assert r.status_code == 400
    assert "FS" in r.json().get("detail", "") or "dependency" in r.json().get("detail", "").lower()


def test_list_dependencies_after_create(client, seed_task_uids):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    client.post(
        "/api/dependencies",
        json={
            "predecessor_task_uid": pred,
            "successor_task_uid": succ,
            "dependency_type": "FS",
        },
    )
    r = client.get("/api/dependencies")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["predecessor_task_uid"] == pred
    assert data[0]["successor_task_uid"] == succ


def test_delete_dependency(client, seed_task_uids):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    create = client.post(
        "/api/dependencies",
        json={
            "predecessor_task_uid": pred,
            "successor_task_uid": succ,
            "dependency_type": "FS",
        },
    ).json()
    dep_uid = create["uid"]
    r = client.delete(f"/api/dependencies/{dep_uid}")
    assert r.status_code == 204
    r2 = client.get("/api/dependencies")
    assert len(r2.json()) == 0


def test_delete_dependency_not_found(client):
    r = client.delete("/api/dependencies/nonexistent-uid")
    assert r.status_code == 404


def test_list_dependencies_by_project_uid(client, seed_task_uids, project_uid):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred, "successor_task_uid": succ, "dependency_type": "FS"},
    )
    r = client.get(f"/api/projects/{project_uid}/dependencies")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_list_dependencies_project_not_found(client):
    r = client.get("/api/projects/nonexistent/dependencies")
    assert r.status_code == 404


def test_auto_task_reschedules_from_multiple_dependencies(client, project_uid):
    pred_one = client.post(
        "/api/tasks",
        json={"name": "Pred one", "start_date": "2025-01-01", "end_date": "2025-01-05"},
    ).json()
    pred_two = client.post(
        "/api/tasks",
        json={"name": "Pred two", "start_date": "2025-01-03", "end_date": "2025-01-08"},
    ).json()
    succ = client.post(
        "/api/tasks",
        json={"name": "Auto successor", "scheduling_mode": "auto", "duration_days": 3},
    ).json()

    client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred_one["uid"], "successor_task_uid": succ["uid"], "dependency_type": "FS"},
    )
    client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred_two["uid"], "successor_task_uid": succ["uid"], "dependency_type": "FS"},
    )

    scheduled = client.get(f"/api/tasks/{succ['uid']}").json()
    assert scheduled["start_date"] == "2025-01-08"
    assert scheduled["end_date"] == "2025-01-10"
    assert scheduled["duration_days"] == 3

    client.patch(f"/api/tasks/{pred_one['uid']}", json={"end_date": "2025-01-12"})
    rescheduled = client.get(f"/api/tasks/{succ['uid']}").json()
    assert rescheduled["start_date"] == "2025-01-12"
    assert rescheduled["end_date"] == "2025-01-14"


def test_delete_dependency_reschedules_auto_successor(client, project_uid):
    pred_one = client.post(
        "/api/tasks",
        json={"name": "Pred one", "start_date": "2025-02-01", "end_date": "2025-02-10"},
    ).json()
    pred_two = client.post(
        "/api/tasks",
        json={"name": "Pred two", "start_date": "2025-02-01", "end_date": "2025-02-05"},
    ).json()
    succ = client.post(
        "/api/tasks",
        json={"name": "Auto successor", "scheduling_mode": "auto", "duration_days": 2},
    ).json()

    dep_one = client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred_one["uid"], "successor_task_uid": succ["uid"], "dependency_type": "FS"},
    ).json()
    client.post(
        "/api/dependencies",
        json={"predecessor_task_uid": pred_two["uid"], "successor_task_uid": succ["uid"], "dependency_type": "FS"},
    )

    before_delete = client.get(f"/api/tasks/{succ['uid']}").json()
    assert before_delete["start_date"] == "2025-02-10"
    assert before_delete["end_date"] == "2025-02-11"

    r = client.delete(f"/api/dependencies/{dep_one['uid']}")
    assert r.status_code == 204

    after_delete = client.get(f"/api/tasks/{succ['uid']}").json()
    assert after_delete["start_date"] == "2025-02-05"
    assert after_delete["end_date"] == "2025-02-06"


def test_create_dependency_via_project_uid(client, seed_task_uids, project_uid):
    pred, succ = seed_task_uids[0], seed_task_uids[1]
    r = client.post(
        f"/api/projects/{project_uid}/dependencies",
        json={"predecessor_task_uid": pred, "successor_task_uid": succ, "dependency_type": "FS"},
    )
    assert r.status_code == 200
    assert r.json()["project_uid"] == project_uid


def test_create_dependency_project_not_found(client, seed_task_uids):
    r = client.post(
        "/api/projects/nonexistent/dependencies",
        json={
            "predecessor_task_uid": seed_task_uids[0],
            "successor_task_uid": seed_task_uids[1],
            "dependency_type": "FS",
        },
    )
    assert r.status_code == 404

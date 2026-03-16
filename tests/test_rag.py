"""Tests for RAG status API."""
import pytest


def test_list_rag_empty(client, seed_task_uids):
    r = client.get(f"/api/tasks/{seed_task_uids[0]}/rag")
    assert r.status_code == 200
    assert r.json() == []


def test_create_rag_green(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.post(
        f"/api/tasks/{uid}/rag",
        json={"status": "green"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["task_uid"] == uid
    assert data["status"] == "green"
    assert "uid" in data
    assert "created_at" in data


def test_create_rag_amber_requires_rationale(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/rag",
        json={"status": "amber"},
    )
    assert r.status_code == 400
    assert "rationale" in r.json().get("detail", "").lower()


def test_create_rag_amber_with_rationale(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/rag",
        json={"status": "amber", "rationale": "Behind schedule"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "amber"
    assert r.json()["rationale"] == "Behind schedule"


def test_create_rag_red_with_rationale_and_path(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/rag",
        json={
            "status": "red",
            "rationale": "Blocked",
            "path_to_green": "Unblock by Friday",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "red"
    assert data["path_to_green"] == "Unblock by Friday"


def test_create_rag_invalid_status(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/rag",
        json={"status": "yellow"},
    )
    assert r.status_code == 400
    assert "green" in r.json().get("detail", "").lower()


def test_list_rag_after_create(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.post(f"/api/tasks/{uid}/rag", json={"status": "green"})
    client.post(
        f"/api/tasks/{uid}/rag",
        json={"status": "amber", "rationale": "Update"},
    )
    r = client.get(f"/api/tasks/{uid}/rag")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["status"] == "green"
    assert data[1]["status"] == "amber"


def test_rag_task_not_found(client):
    r = client.get("/api/tasks/nonexistent/rag")
    assert r.status_code == 404
    r2 = client.post(
        "/api/tasks/nonexistent/rag",
        json={"status": "green"},
    )
    assert r2.status_code == 404


def test_rag_path_to_green_stored(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.post(
        f"/api/tasks/{uid}/rag",
        json={
            "status": "red",
            "rationale": "Blocked",
            "path_to_green": "Unblock by Q2",
        },
    )
    r = client.get(f"/api/tasks/{uid}/rag")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["path_to_green"] == "Unblock by Q2"


def test_rag_green_no_rationale_required(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/rag",
        json={"status": "green", "rationale": ""},
    )
    assert r.status_code == 200

"""Tests for risks API."""
import pytest


def test_list_risks_empty(client, seed_task_uids):
    r = client.get(f"/api/tasks/{seed_task_uids[0]}/risks")
    assert r.status_code == 200
    assert r.json() == []


def test_create_risk(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.post(
        f"/api/tasks/{uid}/risks",
        json={
            "title": "Delivery risk",
            "description": "Might slip",
            "severity": "high",
            "status": "open",
            "owner": "AB12345",
            "mitigation_plan": "Add buffer",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["task_uid"] == uid
    assert data["title"] == "Delivery risk"
    assert data["severity"] == "high"
    assert data["status"] == "open"
    assert "uid" in data
    assert "created_at" in data


def test_create_risk_minimal(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/risks",
        json={"title": "Minimal risk"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Minimal risk"
    assert r.json()["severity"] == "medium"
    assert r.json()["status"] == "open"


def test_create_risk_invalid_severity(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/risks",
        json={"title": "X", "severity": "critical+"},
    )
    assert r.status_code == 400
    assert "severity" in r.json().get("detail", "").lower()


def test_create_risk_invalid_status(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/risks",
        json={"title": "X", "status": "resolved"},
    )
    assert r.status_code == 400
    assert "status" in r.json().get("detail", "").lower()


def test_patch_risk(client, seed_task_uids):
    uid = seed_task_uids[0]
    create = client.post(
        f"/api/tasks/{uid}/risks",
        json={"title": "Original", "severity": "low"},
    ).json()
    risk_uid = create["uid"]
    r = client.patch(
        f"/api/risks/{risk_uid}",
        json={"title": "Updated", "severity": "medium", "status": "mitigated"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Updated"
    assert data["severity"] == "medium"
    assert data["status"] == "mitigated"


def test_patch_risk_empty_body(client, seed_task_uids):
    create = client.post(
        f"/api/tasks/{seed_task_uids[0]}/risks",
        json={"title": "R"},
    ).json()
    r = client.patch(f"/api/risks/{create['uid']}", json={})
    assert r.status_code == 200
    assert r.json()["title"] == "R"


def test_patch_risk_not_found(client):
    r = client.patch(
        "/api/risks/nonexistent-uid",
        json={"title": "X"},
    )
    assert r.status_code == 404


def test_risks_task_not_found(client):
    r = client.get("/api/tasks/nonexistent/risks")
    assert r.status_code == 404
    r2 = client.post(
        "/api/tasks/nonexistent/risks",
        json={"title": "X"},
    )
    assert r2.status_code == 404


def test_create_risk_all_severities(client, seed_task_uids):
    uid = seed_task_uids[0]
    for sev in ("low", "medium", "high", "critical"):
        r = client.post(
            f"/api/tasks/{uid}/risks",
            json={"title": f"Risk {sev}", "severity": sev},
        )
        assert r.status_code == 200
        assert r.json()["severity"] == sev


def test_create_risk_all_statuses(client, seed_task_uids):
    uid = seed_task_uids[0]
    for status in ("open", "mitigated", "closed"):
        r = client.post(
            f"/api/tasks/{uid}/risks",
            json={"title": f"Risk {status}", "status": status},
        )
        assert r.status_code == 200
        assert r.json()["status"] == status


def test_patch_risk_partial(client, seed_task_uids):
    create = client.post(
        f"/api/tasks/{seed_task_uids[0]}/risks",
        json={"title": "Original", "description": "Desc", "severity": "low"},
    ).json()
    r = client.patch(
        f"/api/risks/{create['uid']}",
        json={"title": "Only title updated"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Only title updated"
    assert r.json()["description"] == "Desc"
    assert r.json()["severity"] == "low"

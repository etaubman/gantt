"""Tests for comments API."""
import pytest


def test_list_comments_empty(client, seed_task_uids):
    r = client.get(f"/api/tasks/{seed_task_uids[0]}/comments")
    assert r.status_code == 200
    assert r.json() == []


def test_create_comment(client, seed_task_uids):
    uid = seed_task_uids[0]
    r = client.post(
        f"/api/tasks/{uid}/comments",
        json={"author": "AB12345", "comment_text": "First comment"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["task_uid"] == uid
    assert data["author"] == "AB12345"
    assert data["comment_text"] == "First comment"
    assert "uid" in data
    assert "created_at" in data


def test_list_comments_after_create(client, seed_task_uids):
    uid = seed_task_uids[0]
    client.post(
        f"/api/tasks/{uid}/comments",
        json={"author": "A", "comment_text": "One"},
    )
    client.post(
        f"/api/tasks/{uid}/comments",
        json={"author": "B", "comment_text": "Two"},
    )
    r = client.get(f"/api/tasks/{uid}/comments")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    texts = [c["comment_text"] for c in data]
    assert "One" in texts and "Two" in texts


def test_comments_task_not_found(client):
    r = client.get("/api/tasks/nonexistent/comments")
    assert r.status_code == 404
    r2 = client.post(
        "/api/tasks/nonexistent/comments",
        json={"author": "X", "comment_text": "Y"},
    )
    assert r2.status_code == 404


def test_create_comment_empty_author_allowed(client, seed_task_uids):
    r = client.post(
        f"/api/tasks/{seed_task_uids[0]}/comments",
        json={"author": "", "comment_text": "Note"},
    )
    assert r.status_code == 200
    assert r.json()["comment_text"] == "Note"

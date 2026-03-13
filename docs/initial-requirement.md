# System Requirements

This project is a lightweight internal web application for managing projects and tracking work using a Gantt chart–based interface. The system allows users to define projects, create hierarchical tasks and subtasks, assign accountability and responsibility, and visualize schedules across time. Tasks can include dependencies with common scheduling relationships (FS, SS, FF, SF), enabling teams to model how work flows across phases of a project. The primary interface combines a task table with a timeline visualization so users can understand both detailed task data and overall project progress.

Beyond basic scheduling, the application provides structured mechanisms for tracking project health and operational context. Each task supports RAG (Red–Amber–Green) status updates with a rationale and maintains a full history of those updates. Tasks can also accumulate comments for chronological discussion or updates, and risks that capture potential issues, their severity, ownership, mitigation plans, and current status. These features allow the system to function not only as a timeline planner but also as a central place to document delivery status, issues, and operational notes tied directly to the relevant work items.

A core design principle of the system is portability and resilience without requiring complex infrastructure. All project data can be exported into a structured Excel workbook that contains the full state of the system, including tasks, hierarchy, dependencies, RAG history, comments, and risks. The same workbook can later be imported to reconstruct the entire project state in a fresh instance of the application. This approach allows the tool to function as a simple, deployable internal utility where Excel files act as a portable backup and restore format, compensating for the absence of a more sophisticated persistent database or enterprise project management platform.

## Technology Stack

Backend:

* Python **3.12**
* **FastAPI**

Database:

* **SQLite3**

Frontend:

* Plain **HTML**
* Plain **CSS**
* Plain **JavaScript**

File Processing:

* **XLSX** import and export

Deployment:

* **Docker**
* Single container deployment

---

# Core System Capabilities

The system must support:

* Project management
* Hierarchical task management
* Task scheduling visualization via a Gantt chart
* Task dependencies
* RAG status tracking with history
* Task comments
* Task risks
* Full data export to Excel
* Full data restore from Excel

The Excel file must function as a **complete portable representation of the system state**.

---

# Projects

Projects are the top-level container for all data.

### Project Fields

| Field      | Type     | Description                |
| ---------- | -------- | -------------------------- |
| uid        | string   | globally unique identifier |
| name       | string   | project name               |
| created_at | datetime | creation timestamp         |

### Project Capabilities

Users must be able to:

* create projects
* view projects
* delete projects
* export project data
* import project data

---

# Tasks

Tasks represent work items within a project.

Tasks belong to exactly one project.

Tasks may have **parent tasks**, allowing hierarchical structures.

---

## Task Fields

| Field              | Type     | Description                              |
| ------------------ | -------- | ---------------------------------------- |
| uid                | string   | globally unique identifier               |
| project_uid        | string   | owning project                           |
| parent_task_uid    | string   | optional parent task                     |
| name               | string   | task title                               |
| description        | text     | detailed description                     |
| accountable_person | string   | person accountable for the outcome       |
| responsible_party  | string   | person or team responsible for execution |
| start_date         | date     | planned start                            |
| end_date           | date     | planned end                              |
| status             | string   | task state                               |
| progress           | integer  | percent complete (0–100)                 |
| sort_order         | integer  | display order                            |
| created_at         | datetime | creation timestamp                       |
| updated_at         | datetime | last update                              |

---

## Task Status Values

Allowed values:

```
not_started
in_progress
complete
blocked
```

---

# Task Hierarchy

Tasks may reference a parent task.

Rules:

* a task may have **zero or one parent**
* parent and child must belong to the same project
* deleting a parent deletes all subtasks

---

# Task Dependencies

Tasks may depend on other tasks.

Dependencies represent schedule relationships.

---

## Dependency Types

Supported dependency types:

```
FS
SS
FF
SF
```

Meaning:

| Type | Meaning          |
| ---- | ---------------- |
| FS   | Finish to Start  |
| SS   | Start to Start   |
| FF   | Finish to Finish |
| SF   | Start to Finish  |

---

## Dependency Fields

| Field                | Type     | Description       |
| -------------------- | -------- | ----------------- |
| uid                  | string   | unique identifier |
| project_uid          | string   | project           |
| predecessor_task_uid | string   | upstream task     |
| successor_task_uid   | string   | dependent task    |
| dependency_type      | string   | FS, SS, FF, SF    |
| created_at           | datetime | timestamp         |

---

# RAG Status Tracking

Each task has a **RAG status history**.

The latest entry represents the current status.

---

## RAG Status Values

```
green
amber
red
```

---

## RAG Fields

| Field      | Type     | Description         |
| ---------- | -------- | ------------------- |
| uid        | string   | unique identifier   |
| task_uid   | string   | associated task     |
| status     | string   | green / amber / red |
| rationale  | text     | explanation         |
| created_at | datetime | timestamp           |

---

## RAG Rules

If status is:

**green**

* rationale optional

If status is:

**amber**
**red**

* rationale required

---

# Task Comments

Tasks may contain comments.

Comments are chronological notes or updates.

---

## Comment Fields

| Field        | Type     | Description       |
| ------------ | -------- | ----------------- |
| uid          | string   | unique identifier |
| task_uid     | string   | associated task   |
| author       | string   | comment author    |
| comment_text | text     | comment body      |
| created_at   | datetime | timestamp         |

---

## Comment Rules

Comments are **append-only**.

Users may add comments but cannot edit existing comments.

---

# Task Risks

Tasks may contain risks.

Risks represent structured potential issues.

---

## Risk Fields

| Field           | Type     | Description         |
| --------------- | -------- | ------------------- |
| uid             | string   | unique identifier   |
| task_uid        | string   | associated task     |
| title           | string   | risk title          |
| description     | text     | explanation         |
| severity        | string   | severity level      |
| status          | string   | risk state          |
| owner           | string   | responsible person  |
| mitigation_plan | text     | mitigation strategy |
| created_at      | datetime | timestamp           |
| updated_at      | datetime | timestamp           |

---

## Risk Severity Values

```
low
medium
high
critical
```

---

## Risk Status Values

```
open
mitigated
closed
```

---

# Gantt Chart

Each project must display a Gantt chart.

---

## Chart Requirements

The chart must:

* render tasks on rows
* display time horizontally
* display task bars from start_date to end_date
* align subtasks beneath parent tasks
* display task progress
* visually indicate RAG status

---

# Task Detail View

Selecting a task must display detailed information.

The task detail panel must display:

* task metadata
* latest RAG status
* RAG history
* comments
* risks
* dependencies

Users must be able to:

* add comments
* add risks
* update risks
* update RAG status
* create dependencies
* remove dependencies

---

# Excel Export

The system must export **complete project state** to a single Excel workbook.

The workbook must allow reconstruction of the entire system state.

Export must include:

* all projects
* all tasks
* task hierarchy
* dependencies
* RAG history
* comments
* risks

---

# Excel Workbook Structure

The workbook must contain the following sheets.

---

## Metadata

| Field               | Description             |
| ------------------- | ----------------------- |
| schema_version      | workbook format version |
| exported_at         | timestamp               |
| application_version | application version     |

---

## Projects

```
Project UID
Project Name
Created At
```

---

## Tasks

```
Task UID
Project UID
Parent Task UID
Name
Description
Accountable Person
Responsible Party
Start Date
End Date
Status
Progress
Sort Order
Created At
Updated At
```

---

## Dependencies

```
Dependency UID
Project UID
Predecessor Task UID
Successor Task UID
Dependency Type
Created At
```

---

## RAG Status History

```
RAG UID
Task UID
Status
Rationale
Created At
```

---

## Comments

```
Comment UID
Task UID
Author
Comment Text
Created At
```

---

## Risks

```
Risk UID
Task UID
Title
Description
Severity
Status
Owner
Mitigation Plan
Created At
Updated At
```

---

# Excel Import

The system must support importing a workbook exported from the system.

Import must restore:

* projects
* tasks
* hierarchy
* dependencies
* RAG history
* comments
* risks
* ordering

Import must use **UIDs** to rebuild relationships.

---

# Import Behavior

Import must support:

* creating a new project from workbook data
* optionally replacing an existing project with the same UID

Import process order:

1. projects
2. tasks
3. dependencies
4. RAG statuses
5. comments
6. risks

---

# Persistence Strategy

SQLite is used as the working data store.

Excel workbooks function as a **portable backup and restore format**.

Exported workbooks must contain sufficient information to fully reconstruct project state in a new environment.

---

# User Interface

The UI must include the following views.

---

## Project List

Displays all projects.

Users can:

* create project
* open project
* delete project

---

## Project Workspace

Displays:

* task table
* Gantt chart
* import Excel button
* export Excel button

---

## Task Detail Panel

Displays:

* task information
* RAG history
* comments
* risks
* dependencies

Users can create and update associated records.

---

# Non-Functional Requirements

The system must be:

* simple
* lightweight
* easy to deploy
* maintainable
* readable codebase

---

# Deployment

The application must run using:

```
docker-compose up
```

SQLite database must persist on disk.

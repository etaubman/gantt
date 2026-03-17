Feature: Workspace
  As a user I can open the app and see the project plan and task list.

  Scenario: Home page loads and shows project title
    Given I am on the workspace
    Then the page title contains "Gantt"
    And the project heading is visible
    And the mode indicator is visible

  Scenario: Task list loads after opening the app
    Given I am on the workspace
    When the workspace has finished loading
    Then the task table has at least 1 row
    And the task count badge shows a number
    And the project meta shows task count

  Scenario: Timeline panel is visible
    Given I am on the workspace
    When the workspace has finished loading
    Then the timeline panel is visible
    And the zoom select is visible
    And the "Reset view" button is visible

  Scenario: Header actions are present
    Given I am on the workspace
    When the workspace has finished loading
    Then the "Lock for editing" button is visible
    And the "Audit log" button is visible
    And the "Export Excel" button is visible
    And the "Export Report" button is visible

  Scenario: Server indicator is visible after load
    Given I am on the workspace
    When the workspace has finished loading
    Then the server indicator is visible

  Scenario: Project meta shows task count after load
    Given I am on the workspace
    When the workspace has finished loading
    Then the project meta shows task count
    And the project heading is visible

  Scenario: Tasks panel label is visible
    Given I am on the workspace
    When the workspace has finished loading
    Then the tasks panel label is visible
    And the task count badge shows a number

  Scenario: Timeline panel label and badge are visible
    Given I am on the workspace
    When the workspace has finished loading
    Then the timeline panel is visible
    And the timeline badge is visible

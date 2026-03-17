Feature: Task detail
  As a user I can open and close the task detail modal.

  Scenario: Open task detail by double-clicking a task row
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    And the modal has a "Task" or "Health" tab

  Scenario: Close task detail with close button
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    When I click the task detail modal close button
    Then the task detail modal is not visible

  Scenario: Close task detail with Escape
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    When I press the "Escape" key
    Then the task detail modal is not visible

  Scenario: Task detail shows a title
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal title is not empty

  Scenario: Task detail modal has all main tabs
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    And the modal has a "Task" tab
    And the modal has a "Health" tab
    And the modal has a "Comments" tab
    And the modal has a "Risks" tab
    And the modal has a "Dependencies" tab

  Scenario: Task detail close button is visible when modal is open
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    And the task detail modal close button is visible

  Scenario: Task tab is active when modal opens
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    And the "Task" tab is active

  Scenario: Switch to Health tab in task detail
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    When I click the "Health" tab
    Then the "Health" tab is active
    And the task detail modal is visible

  Scenario: Switch to Comments tab in task detail
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    When I click the "Comments" tab
    Then the "Comments" tab is active

  Scenario: Switch to Risks tab in task detail
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    When I click the "Risks" tab
    Then the "Risks" tab is active

  Scenario: Switch to Dependencies tab in task detail
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I double-click the first task row
    Then the task detail modal is visible
    When I click the "Dependencies" tab
    Then the "Dependencies" tab is active
    And the task detail modal is visible

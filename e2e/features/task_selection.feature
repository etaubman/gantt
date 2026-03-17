Feature: Task selection
  As a user I can select a task row and see selection state.

  Scenario: Clicking a task row selects it
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I click the first task row
    Then a task row is selected

  Scenario: Task table shows status column
    Given I am on the workspace
    When the workspace has finished loading
    Then the task table header contains "Status"
    And the task table is visible

  Scenario: Task table shows RAG column
    Given I am on the workspace
    When the workspace has finished loading
    Then the task table header contains "RAG"
    And the task table has at least 1 row

  Scenario: Task table shows Accountable column
    Given I am on the workspace
    When the workspace has finished loading
    Then the task table header contains "Accountable"
    And the task table is visible

  Scenario: Task table shows Start and End columns
    Given I am on the workspace
    When the workspace has finished loading
    Then the task table header contains "Start"
    And the task table header contains "End"
    And the task table has at least 1 row

  Scenario: Clicking the second task row selects it
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 2 row
    When I click the second task row
    Then a task row is selected
    And the task table is visible

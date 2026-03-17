Feature: Task filters
  As a user I can filter tasks by domain and clear filters.

  Scenario: Domain filter is present and has options after load
    Given I am on the workspace
    When the workspace has finished loading
    Then the domain filter select is visible
    And the domain filter has at least "All domains" option

  Scenario: Expand all and collapse all buttons work
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Expand all"
    Then the task table is visible
    When I click "Collapse all"
    Then the task table is visible

  Scenario: Clear filters button is present
    Given I am on the workspace
    When the workspace has finished loading
    Then the "Clear filters" button is visible
    And the filter summary text is visible

  Scenario: Focus selected and filter summary
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    Then the "Focus selected" button is visible
    And the task filter summary element is visible

  Scenario: Focus selected narrows view to task and lineage
    Given I am on the workspace
    When the workspace has finished loading
    And the task table has at least 1 row
    When I click the first task row
    Then a task row is selected
    When I click "Focus selected"
    Then the focus button shows "Exit focus"
    And the task table has at least 1 row
    When I click "Exit focus"
    Then the focus button shows "Focus selected"

  Scenario: Domain filter filters task list by root task
    Given I am on the workspace
    When the workspace has finished loading
    And the domain filter has at least "All domains" option
    When I select the domain "Equities"
    Then the domain filter shows "Equities"
    And the task table has at least 1 row
    When I select the domain "All domains"
    Then the domain filter shows "All domains"

  Scenario: Clear filters button is visible and table is visible
    Given I am on the workspace
    When the workspace has finished loading
    Then the "Clear filters" button is visible
    And the task table is visible
    And the task filter summary element is visible

  Scenario: Filter summary shows default when no filters
    Given I am on the workspace
    When the workspace has finished loading
    Then the task filter summary element is visible
    And the filter summary shows "All filters off"

  Scenario: Domain filter can switch to Commodities then back
    Given I am on the workspace
    When the workspace has finished loading
    When I select the domain "Commodities"
    Then the domain filter shows "Commodities"
    And the task table has at least 1 row
    When I select the domain "All domains"
    Then the domain filter shows "All domains"

  Scenario: Accountable filter is present
    Given I am on the workspace
    When the workspace has finished loading
    Then the accountable filter is visible
    And the task table is visible

  Scenario: Responsible filter is present
    Given I am on the workspace
    When the workspace has finished loading
    Then the responsible filter is visible
    And the task table is visible

  Scenario: Status filter is present
    Given I am on the workspace
    When the workspace has finished loading
    Then the status filter is visible
    And the task table has at least 1 row

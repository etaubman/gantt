Feature: Zoom and timeline
  As a user I can change the timeline zoom and use timeline controls.

  Scenario: Zoom dropdown can be changed
    Given I am on the workspace
    When the workspace has finished loading
    Then the zoom select is visible
    When I select zoom "Weeks"
    Then the timeline panel is visible
    And the zoom select has value "weeks"

  Scenario: Reset view button is clickable
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Reset view"
    Then the timeline panel is visible

  Scenario: Pan buttons are visible
    Given I am on the workspace
    When the workspace has finished loading
    Then the timeline pan controls are visible

  Scenario: Zoom can be set to Days
    Given I am on the workspace
    When the workspace has finished loading
    Then the zoom select is visible
    When I select zoom "Days"
    Then the timeline panel is visible
    And the zoom select has value "days"

  Scenario: Zoom can be set to Months
    Given I am on the workspace
    When the workspace has finished loading
    Then the zoom select is visible
    When I select zoom "Months"
    Then the timeline panel is visible
    And the zoom select has value "months"

  Scenario: Timeline date range is visible after load
    Given I am on the workspace
    When the workspace has finished loading
    Then the timeline panel is visible
    And the timeline date range is visible

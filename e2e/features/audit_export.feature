Feature: Audit log and export
  As a user I can open the audit log and trigger export.

  Scenario: Open audit log modal
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Audit log"
    Then the audit log modal is visible
    And the audit log has a list or summary

  Scenario: Close audit log modal
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Audit log"
    Then the audit log modal is visible
    When I close the audit log modal
    Then the audit log modal is not visible

  Scenario: Export Excel button triggers action
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Export Excel"
    Then either a download started or the URL contains "export" within 5 seconds

  Scenario: Export Report button is clickable
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Export Report"
    Then the "Export Report" button is still visible or a download started

  Scenario: Audit log modal has close button
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Audit log"
    Then the audit log modal is visible
    And the audit log close button is visible

  Scenario: Audit log shows list or summary after open
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Audit log"
    Then the audit log modal is visible
    And the audit log has a list or summary
    When I close the audit log modal
    Then the audit log modal is not visible

  Scenario: Export Excel and Export Report both visible
    Given I am on the workspace
    When the workspace has finished loading
    Then the "Export Excel" button is visible
    And the "Export Report" button is visible
    And the task table is visible

  Scenario: Open audit log twice and close
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Audit log"
    Then the audit log modal is visible
    When I close the audit log modal
    Then the audit log modal is not visible
    When I click "Audit log"
    Then the audit log modal is visible
    When I close the audit log modal
    Then the audit log modal is not visible

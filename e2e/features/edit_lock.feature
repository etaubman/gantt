@edit-lock
Feature: Edit lock
  As a user I can lock the workspace for editing by entering my employee ID.

  Scenario: Lock for editing prompts for employee ID
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Lock for editing"
    Then an employee ID modal is visible
    And the employee ID input is visible

  Scenario: Enter employee ID and acquire lock
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Lock for editing"
    And I enter employee ID "AB12345"
    And I click the modal "Continue" button
    Then the employee ID modal is closed
    And the mode indicator shows "Editing" or "AB12345"
    And the lock button text is "Release Lock" or "Resume editing"

  Scenario: Cancel employee ID modal
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Lock for editing"
    Then an employee ID modal is visible
    When I click the modal "Cancel" button
    Then the employee ID modal is closed
    And the mode indicator shows "Read only" or "Locked by"

  Scenario: Invalid employee ID shows message
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Lock for editing"
    And I enter employee ID "invalid"
    And I click the modal "Continue" button
    Then a toast or message mentions "AA12345" or "format"

  Scenario: Release lock after acquiring
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Lock for editing"
    And I enter employee ID "AB12345"
    And I click the modal "Continue" button
    Then the employee ID modal is closed
    And the mode indicator shows "Editing" or "AB12345"
    When I click "Release Lock"
    Then the mode indicator shows "Read only" or "Locked by"
    And the lock button text is "Lock for editing" or "Lock for Editing"

  Scenario: Employee ID modal has Continue and Cancel
    Given I am on the workspace
    When the workspace has finished loading
    When I click "Lock for editing"
    Then an employee ID modal is visible
    When I click the modal "Cancel" button
    Then the employee ID modal is closed

  Scenario: Mode indicator visible in read-only
    Given I am on the workspace
    When the workspace has finished loading
    Then the mode indicator is visible
    And the mode indicator shows "Read only" or "Locked by"

  Scenario: Lock button visible when read-only
    Given I am on the workspace
    When the workspace has finished loading
    Then the "Lock for editing" button is visible
    And the lock button text is "Lock for editing" or "Lock for Editing"

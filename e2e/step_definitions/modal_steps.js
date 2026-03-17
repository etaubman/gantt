const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

Then('an employee ID modal is visible', async function () {
  const modal = this.page.locator('.modal-overlay').filter({ has: this.page.locator('#employee-id-input') });
  await expect(modal).toBeVisible({ timeout: 5000 });
});

Then('the employee ID input is visible', async function () {
  await expect(this.page.locator('#employee-id-input')).toBeVisible();
});

Then('the employee ID modal is closed', async function () {
  await expect(this.page.locator('.modal-overlay').filter({ has: this.page.locator('#employee-id-input') })).not.toBeVisible({ timeout: 5000 });
});

function normalizeAlt(s) {
  return (s || '').replace(/"/g, '').trim().toLowerCase();
}

Then('the mode indicator shows {string}', async function (expected) {
  const indicator = this.page.locator('#workspace-mode-indicator');
  await expect(indicator).toBeVisible();
  const text = (await indicator.textContent()).toLowerCase();
  const alternatives = expected.split(' or ').map(normalizeAlt);
  expect(alternatives.some(alt => text.includes(alt))).toBeTruthy();
});

Then('the mode indicator shows {string} or {string}', async function (s1, s2) {
  const indicator = this.page.locator('#workspace-mode-indicator');
  await expect(indicator).toBeVisible();
  const alt1 = normalizeAlt(s1);
  const alt2 = normalizeAlt(s2);
  await expect(indicator).toContainText(new RegExp(alt1 + '|' + alt2, 'i'), { timeout: 5000 });
});

Then('the lock button text is {string}', async function (expected) {
  const btn = this.page.locator('#workspace-mode-toggle');
  await expect(btn).toBeVisible();
  const text = (await btn.textContent()).toLowerCase();
  const alternatives = expected.split(' or ').map(normalizeAlt);
  expect(alternatives.some(alt => text.includes(alt))).toBeTruthy();
});

Then('the lock button text is {string} or {string}', async function (s1, s2) {
  const btn = this.page.locator('#workspace-mode-toggle');
  await expect(btn).toBeVisible();
  const text = (await btn.textContent()).toLowerCase();
  const alt1 = normalizeAlt(s1);
  const alt2 = normalizeAlt(s2);
  expect(text.includes(alt1) || text.includes(alt2)).toBeTruthy();
});

Then('a toast or message mentions {string}', async function (substring) {
  await this.page.waitForTimeout(800);
  const toast = this.page.locator('.toast');
  const modal = this.page.locator('.modal');
  const toastText = (await toast.textContent().catch(() => '')) || '';
  const modalText = (await modal.textContent().catch(() => '')) || '';
  const combined = (toastText + ' ' + modalText).toLowerCase();
  const alternatives = substring.replace(/"/g, '').split(/\s+or\s+/).map(s => s.trim().toLowerCase());
  const matches = alternatives.some(alt => combined.includes(alt));
  expect(matches).toBeTruthy();
});

Then('a toast or message mentions {string} or {string}', async function (s1, s2) {
  await this.page.waitForTimeout(800);
  const toast = this.page.locator('.toast');
  const modal = this.page.locator('.modal');
  const toastText = (await toast.textContent().catch(() => '')) || '';
  const modalText = (await modal.textContent().catch(() => '')) || '';
  const combined = (toastText + ' ' + modalText).toLowerCase();
  const alt1 = normalizeAlt(s1);
  const alt2 = normalizeAlt(s2);
  expect(combined.includes(alt1) || combined.includes(alt2)).toBeTruthy();
});

Then('the task detail modal is visible', async function () {
  const modal = this.page.locator('#task-detail-modal.visible');
  await expect(modal).toBeVisible({ timeout: 5000 });
});

Then('the task detail modal is not visible', async function () {
  const modal = this.page.locator('#task-detail-modal');
  await expect(modal).not.toHaveClass(/visible/);
});

Then('the modal has a {string} tab', async function (tabName) {
  const name = tabName.replace(/"/g, '').trim();
  const tab = this.page.locator('.detail-tab').filter({ hasText: new RegExp(name, 'i') });
  await expect(tab.first()).toBeVisible();
});

Then('the modal has a {string} or {string} tab', async function (name1, name2) {
  const n1 = (name1 || '').replace(/"/g, '').trim();
  const n2 = (name2 || '').replace(/"/g, '').trim();
  const tab1 = this.page.locator('.detail-tab').filter({ hasText: new RegExp(n1, 'i') });
  const tab2 = this.page.locator('.detail-tab').filter({ hasText: new RegExp(n2, 'i') });
  const count1 = await tab1.count();
  const count2 = await tab2.count();
  expect(count1 > 0 || count2 > 0).toBeTruthy();
});

Then('the task detail modal title is not empty', async function () {
  const title = this.page.locator('#task-detail-modal-title');
  await expect(title).toBeVisible();
  const text = await title.textContent();
  expect(text.trim().length).toBeGreaterThan(0);
});

Then('the audit log modal is visible', async function () {
  const modal = this.page.locator('.audit-log-modal.visible').first();
  await expect(modal).toBeVisible({ timeout: 5000 });
});

Then('the audit log has a list or summary', async function () {
  const list = this.page.locator('#audit-log-list, .audit-log-summary');
  await expect(list.first()).toBeVisible({ timeout: 5000 });
});

Then('the audit log modal is not visible', async function () {
  const modal = this.page.locator('.audit-log-modal');
  await expect(modal).not.toBeVisible();
});

When('I click the {string} tab', async function (tabName) {
  const name = tabName.replace(/"/g, '').trim();
  const tab = this.page.locator('.detail-tab').filter({ hasText: new RegExp(name, 'i') });
  await tab.first().click();
});

Then('the task detail modal close button is visible', async function () {
  await expect(this.page.locator('#task-detail-modal-close')).toBeVisible();
});

Then('the {string} tab is active', async function (tabName) {
  const name = tabName.replace(/"/g, '').trim();
  const tab = this.page.locator('.detail-tab.is-active').filter({ hasText: new RegExp(name, 'i') });
  await expect(tab.first()).toBeVisible();
});

When('I click the task detail modal backdrop', async function () {
  const backdrop = this.page.locator('.task-detail-modal-backdrop').first();
  await backdrop.click({ force: true });
});

Then('the audit log close button is visible', async function () {
  await expect(this.page.locator('.audit-log-close')).toBeVisible();
});

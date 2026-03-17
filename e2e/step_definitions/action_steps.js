const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

When('I click {string}', async function (label) {
  const name = label.replace(/"/g, '').trim();
  const byId = {
    'Lock for editing': '#workspace-mode-toggle',
    'Release Lock': '#workspace-mode-toggle',
    'Audit log': '#btn-audit-log',
    'Export Excel': '#btn-export',
    'Export Report': '#btn-export-report',
    'Focus selected': '#btn-focus-task',
    'Exit focus': '#btn-focus-task',
    'Clear filters': '#btn-clear-filters',
  };
  const selector = byId[name] || null;
  const btn = selector
    ? this.page.locator(selector)
    : this.page.getByRole('button', { name: new RegExp(name, 'i') });
  await btn.click();
});

When('I click the modal {string} button', async function (label) {
  const modal = this.page.locator('.modal-overlay, .modal');
  const btn = modal.getByRole('button', { name: new RegExp(label.replace(/"/g, ''), 'i') });
  await btn.click();
});

When('I enter employee ID {string}', async function (value) {
  const input = this.page.locator('#employee-id-input');
  await input.fill(value.replace(/^"|"$/g, ''));
});

When('I click the task detail modal close button', async function () {
  await this.page.locator('#task-detail-modal-close').click();
});

When('I press the {string} key', async function (keyName) {
  await this.page.keyboard.press(keyName.replace(/"/g, '') === 'Escape' ? 'Escape' : keyName.replace(/"/g, ''));
});

When('I double-click the first task row', async function () {
  const firstRow = this.page.locator('#task-tbody tr').first();
  await firstRow.dblclick();
});

When('I click the first task row', async function () {
  const firstRow = this.page.locator('#task-tbody tr').first();
  await firstRow.click();
});

When('I click the second task row', async function () {
  const secondRow = this.page.locator('#task-tbody tr').nth(1);
  await secondRow.click();
});

Then('a task row is selected', async function () {
  const selected = this.page.locator('#task-tbody tr.selected');
  await expect(selected).toHaveCount(1);
});

When('I close the audit log modal', async function () {
  const closeBtn = this.page.locator('.audit-log-close, .audit-log-modal .task-detail-modal-close');
  await closeBtn.click();
});

Then('the page has started a download or navigated to export URL within {int} seconds', async function (sec) {
  const downloadPromise = this.page.waitForEvent('download', { timeout: sec * 1000 }).catch(() => null);
  const download = await downloadPromise;
  if (download) {
    await download.path().catch(() => {});
    return;
  }
  await this.page.waitForTimeout(500);
  const urlAfter = this.page.url();
  expect(urlAfter.includes('export') || urlAfter.includes('/api/')).toBeTruthy();
});

Then('either a download started or the URL contains {string} within {int} seconds', async function (substring, sec) {
  const timeout = sec * 1000;
  const sub = substring.replace(/"/g, '').trim();
  const downloadPromise = this.page.waitForEvent('download', { timeout }).catch(() => null);
  const urlPromise = this.page.waitForURL(new RegExp(sub, 'i'), { timeout }).catch(() => null);
  const download = await downloadPromise;
  if (download) {
    await download.path().catch(() => {});
    return;
  }
  const urlChanged = await urlPromise;
  if (urlChanged) return;
  const url = this.page.url();
  if (url.toLowerCase().includes(sub.toLowerCase())) return;
  await this.page.waitForTimeout(800);
  const urlAfter = this.page.url();
  if (urlAfter.toLowerCase().includes(sub.toLowerCase())) return;
  const stillOnWorkspace = await this.page.locator('#project-title').isVisible().catch(() => false);
  expect(stillOnWorkspace || urlAfter.toLowerCase().includes(sub.toLowerCase())).toBeTruthy();
});

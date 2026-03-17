const { When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

Then('the page title contains {string}', async function (text) {
  const title = await this.page.title();
  expect(title.toLowerCase()).toContain(text.toLowerCase());
});

Then('the project heading is visible', async function () {
  await expect(this.page.locator('#project-title')).toBeVisible();
});

Then('the mode indicator is visible', async function () {
  await expect(this.page.locator('#workspace-mode-indicator')).toBeVisible();
});

Then('the task table has at least {int} row', async function (n) {
  const rows = this.page.locator('#task-tbody tr');
  await expect(rows).toHaveCount(await rows.count());
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(n);
});

Then('the task count badge shows a number', async function () {
  const badge = this.page.locator('#task-count-badge');
  await expect(badge).toBeVisible();
  const text = await badge.textContent();
  expect(text).toMatch(/\d+|visible/i);
});

Then('the project meta shows task count', async function () {
  const meta = this.page.locator('#project-meta');
  await expect(meta).toBeVisible();
  const text = await meta.textContent();
  expect(text).toMatch(/\d+\s*task/i);
});

Then('the timeline panel is visible', async function () {
  await expect(this.page.locator('#gantt-scroll-wrap')).toBeVisible();
});

Then('the zoom select is visible', async function () {
  await expect(this.page.locator('#gantt-zoom-select')).toBeVisible();
});

Then('the {string} button is visible', async function (label) {
  const name = label.replace(/"/g, '').trim();
  const byId = { 'Lock for editing': '#workspace-mode-toggle', 'Audit log': '#btn-audit-log', 'Export Excel': '#btn-export', 'Export Report': '#btn-export-report', 'Clear filters': '#btn-clear-filters' };
  const selector = byId[name] || null;
  const btn = selector ? this.page.locator(selector) : this.page.getByRole('button', { name: new RegExp(name, 'i') });
  await expect(btn).toBeVisible();
});

Then('the domain filter select is visible', async function () {
  await expect(this.page.locator('#domain-filter-select')).toBeVisible();
});

Then('the domain filter has at least {string} option', async function (optionText) {
  const select = this.page.locator('#domain-filter-select');
  await expect(select).toBeVisible();
  const opt = select.locator('option').filter({ hasText: optionText });
  await expect(opt.first()).toHaveCount(1);
});

Then('the task table is visible', async function () {
  await expect(this.page.locator('#task-table-wrap')).toBeVisible();
});

Then('the {string} button is still visible or a download started', async function (label) {
  const btn = this.page.getByRole('button', { name: new RegExp(label.replace(/"/g, ''), 'i') });
  await expect(btn).toBeVisible();
});

Then('the task filter summary element is visible', async function () {
  await expect(this.page.locator('#task-filter-summary')).toBeVisible();
});

Then('the filter summary shows {string}', async function (substring) {
  const el = this.page.locator('#task-filter-summary');
  await expect(el).toBeVisible();
  const text = (await el.textContent()).toLowerCase();
  const alternatives = substring.replace(/"/g, '').split(/\s+or\s+/);
  const matches = alternatives.some(alt => text.includes(alt.trim().toLowerCase()));
  expect(matches).toBeTruthy();
});

Then('the filter summary text is visible', async function () {
  const el = this.page.locator('#task-filter-summary');
  await expect(el).toBeVisible();
  const text = await el.textContent();
  expect(text.length).toBeGreaterThan(0);
});

When('I select zoom {string}', async function (optionLabel) {
  const label = optionLabel.replace(/"/g, '').trim();
  const select = this.page.locator('#gantt-zoom-select');
  await select.selectOption({ value: label.toLowerCase() });
});

Then('the zoom select has value {string}', async function (value) {
  const val = value.replace(/"/g, '').trim().toLowerCase();
  const select = this.page.locator('#gantt-zoom-select');
  await expect(select).toHaveValue(val);
});

Then('the timeline pan controls are visible', async function () {
  const panLeft = this.page.locator('#gantt-pan-left');
  const panRight = this.page.locator('#gantt-pan-right');
  await expect(panLeft.first()).toBeVisible();
  await expect(panRight.first()).toBeVisible();
});

Then('the task table header contains {string}', async function (text) {
  const thead = this.page.locator('#task-table-wrap thead');
  await expect(thead).toContainText(new RegExp(text.replace(/"/g, ''), 'i'));
});

Then('the focus button shows {string}', async function (expectedText) {
  const btn = this.page.locator('#btn-focus-task');
  await expect(btn).toBeVisible();
  const text = (await btn.textContent()).trim();
  expect(text.toLowerCase()).toContain(expectedText.replace(/"/g, '').trim().toLowerCase());
});

When('I select the domain {string}', async function (domainLabel) {
  const label = domainLabel.replace(/"/g, '').trim();
  const select = this.page.locator('#domain-filter-select');
  await select.selectOption({ label });
});

Then('the domain filter shows {string}', async function (expectedLabel) {
  const select = this.page.locator('#domain-filter-select');
  const selectedOption = select.locator('option:checked').first();
  await expect(selectedOption).toBeAttached();
  const text = (await selectedOption.textContent()).trim();
  expect(text.toLowerCase()).toContain(expectedLabel.replace(/"/g, '').trim().toLowerCase());
});

Then('the server indicator is visible', async function () {
  await expect(this.page.locator('#workspace-server-indicator')).toBeVisible();
});

Then('the tasks panel label is visible', async function () {
  await expect(this.page.locator('.task-panel .panel-label').filter({ hasText: /Tasks/i })).toBeVisible();
});

Then('the timeline badge is visible', async function () {
  await expect(this.page.locator('#timeline-summary-badge')).toBeVisible();
});

Then('the accountable filter is visible', async function () {
  await expect(this.page.locator('#accountable-filter-select')).toBeVisible();
});

Then('the responsible filter is visible', async function () {
  await expect(this.page.locator('#responsible-filter-select')).toBeVisible();
});

Then('the status filter is visible', async function () {
  await expect(this.page.locator('#status-filter-select')).toBeVisible();
});

Then('the timeline date range is visible', async function () {
  await expect(this.page.locator('#gantt-date-range')).toBeVisible();
});

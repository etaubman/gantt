const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

Given('I am on the workspace', async function () {
  await this.page.goto('/');
});

When('the workspace has finished loading', async function () {
  await this.page.waitForSelector('#project-meta:not(:empty)', { timeout: 15000 });
  await this.page.waitForFunction(
    () => !document.querySelector('#workspace-loading')?.classList?.contains('visible'),
    { timeout: 10000 }
  ).catch(() => {});
  await this.page.waitForTimeout(500);
});

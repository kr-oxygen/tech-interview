import { expect, test } from '@playwright/test';

test('Go task: language choice, Go highlighting, live sync to the monitor', async ({ browser }) => {
  const iv = await (await browser.newContext()).newPage();

  // --- Interviewer: register, interview, Go task
  await iv.goto('/register');
  await iv.getByLabel('Name').fill('Go Interviewer');
  await iv.getByLabel('Email').fill(`e2e-go-${Date.now()}@example.com`);
  await iv.getByLabel('Password').fill('password123');
  await iv.getByRole('button', { name: 'Create account' }).click();
  await iv.getByRole('button', { name: 'New interview' }).click();
  await iv.getByLabel('Title').fill('Backend interview');
  await iv.getByRole('button', { name: 'Create' }).click();
  await expect(iv.getByLabel('Interview title')).toHaveValue('Backend interview');

  await iv.getByRole('button', { name: 'Add task' }).click();
  const dialog = iv.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Reverse a string');
  await dialog.getByRole('combobox', { name: 'Language' }).click();
  await iv.getByRole('option', { name: 'Go', exact: true }).click();
  // The starter-code editor switches to Go.
  await expect(dialog.locator('[data-mode-id="go"]')).toBeVisible();
  await dialog.locator('.monaco-editor .view-lines').click();
  await iv.keyboard.type('package main');
  await iv.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(iv.getByText('1. Reverse a string')).toBeVisible();
  await expect(iv.getByText('Go', { exact: true })).toBeVisible(); // language chip

  await iv.getByRole('button', { name: 'Invite candidate' }).click();
  await iv.getByRole('button', { name: 'New candidate' }).click();
  await iv.getByLabel('Candidate name').fill('Gopher Candidate');
  await iv.getByRole('button', { name: 'Create link' }).click();
  const inviteUrl = await iv.getByRole('dialog').filter({ hasText: 'Send this link' }).locator('input').inputValue();
  await iv.getByRole('button', { name: 'Done' }).click();
  await iv.getByRole('cell', { name: 'Gopher Candidate' }).click();
  await expect(iv.locator('[data-mode-id="go"] .view-lines')).toContainText('package main');

  // --- Candidate
  const cand = await (await browser.newContext()).newPage();
  await cand.goto(new URL(inviteUrl).pathname);
  await cand.getByLabel('I have read and agree').check();
  await cand.getByRole('button', { name: 'Continue' }).click();
  await cand.getByRole('button', { name: 'Start interview' }).click();
  await expect(cand.getByText('Connected')).toBeVisible();
  await expect(cand.getByText('Language: Go')).toBeVisible();
  await expect(cand.locator('[data-mode-id="go"]')).toBeVisible();
  // Monaco has no Go formatter, so "Format document" is not offered.
  await expect(cand.getByRole('button', { name: 'Format document' })).toHaveCount(0);

  await cand.locator('.monaco-editor .view-lines').click();
  await cand.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await cand.keyboard.type('func main() {');
  await cand.keyboard.press('Enter');
  await cand.keyboard.type('println("hi")');

  // --- Interviewer sees the Go code live, highlighted as Go.
  await expect(iv.locator('[data-mode-id="go"] .view-lines')).toContainText('println("hi")');
  await expect
    .poll(async () => iv.locator('.monaco-editor .view-lines').innerText())
    .toBe(await cand.locator('.monaco-editor .view-lines').innerText());
  // `func` is tokenised as a keyword, not plain text.
  const funcToken = iv.locator('.monaco-editor .view-line span span', { hasText: /^func$/ });
  await expect(funcToken).toHaveCount(1);
  // Whitespace merges into neighbouring tokens, so match loosely for the identifier.
  const plain = iv.locator('.monaco-editor .view-line span span', { hasText: /println/ }).first();
  expect(await funcToken.getAttribute('class')).not.toBe(await plain.getAttribute('class'));
});

import { expect, test, type Page } from '@playwright/test';

/** Types into the Monaco editor on the page. */
async function typeInEditor(page: Page, text: string) {
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.type(text);
}

/** Paste of text that comes from outside the editor (synthetic clipboard event). */
async function pasteExternal(page: Page, text: string) {
  await page.evaluate((t) => {
    const ta = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement;
    ta.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

async function setTabHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('interviewer invites, candidate solves, interviewer monitors, pause and return, finish', async ({ browser }) => {
  const interviewerCtx = await browser.newContext();
  const iv = await interviewerCtx.newPage();

  // --- Interviewer: register, create interview + task + session
  await iv.goto('/register');
  await iv.getByLabel('Name').fill('E2E Interviewer');
  await iv.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await iv.getByLabel('Password').fill('password123');
  await iv.getByRole('button', { name: 'Create account' }).click();
  await expect(iv.getByRole('heading', { name: 'Interviews' })).toBeVisible();

  await iv.getByRole('button', { name: 'New interview' }).click();
  await iv.getByLabel('Title').fill('Frontend interview');
  await iv.getByRole('button', { name: 'Create' }).click();
  await expect(iv.getByLabel('Interview title')).toHaveValue('Frontend interview');

  await iv.getByRole('button', { name: 'Add task' }).click();
  const taskDialog = iv.getByRole('dialog');
  await taskDialog.getByLabel('Title').fill('Sum numbers');
  await taskDialog.getByLabel('Description (Markdown)').fill('Implement `sum(xs)`.');
  await taskDialog.locator('.monaco-editor .view-lines').click();
  await iv.keyboard.type('// starter code');
  await iv.keyboard.press('Enter');
  await taskDialog.getByRole('button', { name: 'Save' }).click();
  await expect(iv.getByText('1. Sum numbers')).toBeVisible();

  await iv.getByRole('button', { name: 'Invite candidate' }).click();
  await iv.getByRole('button', { name: 'New candidate' }).click();
  await iv.getByLabel('Candidate name').fill('Jane Candidate');
  await iv.getByRole('button', { name: 'Create link' }).click();
  const inviteUrl = await iv.getByRole('dialog').filter({ hasText: 'Send this link' }).locator('input').inputValue();
  expect(inviteUrl).toContain('/candidate/session/');
  await iv.getByRole('button', { name: 'Done' }).click();

  // --- Interviewer opens the monitor before the candidate opens the link:
  // the starter code is visible straight away and "Follow candidate" is on by default.
  await iv.getByRole('cell', { name: 'Jane Candidate' }).click();
  await expect(iv.getByRole('heading', { name: 'Jane Candidate' })).toBeVisible();
  await expect(iv.locator('.monaco-editor .view-lines')).toContainText('// starter code');
  await expect(iv.getByRole('checkbox', { name: 'Follow candidate' })).toBeChecked();

  // --- Candidate: consent and start
  const candidateCtx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  let cand = await candidateCtx.newPage();
  await cand.goto(new URL(inviteUrl).pathname);
  await expect(cand.getByText('Hello, Jane Candidate')).toBeVisible();
  await expect(cand.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await cand.getByLabel('I have read and agree').check();
  await cand.getByRole('button', { name: 'Continue' }).click();
  await cand.getByRole('button', { name: 'Start interview' }).click();
  await expect(cand.getByText('Connected')).toBeVisible();

  // --- The monitor (opened earlier) picks up the start
  await expect(iv.getByText('In progress').first()).toBeVisible();

  // --- Candidate works
  await typeInEditor(cand, 'function sum(xs) { return 0; }');
  // Select the typed line (triple click; Monaco's select-all shortcut depends on the emulated OS).
  await cand.locator('.monaco-editor .view-line', { hasText: 'function sum' }).click({ clickCount: 3 });
  await cand.waitForTimeout(1_000); // selection is recorded after a short debounce
  await cand.keyboard.press('ControlOrMeta+c');
  // Cursor to the end of the document (collapses the selection).
  await cand.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await cand.keyboard.press('Enter');
  await pasteExternal(cand, 'const answer = [1, 2, 3].reduce((a, b) => a + b, 0); // '.padEnd(260, 'x'));
  await setTabHidden(cand, true);
  await setTabHidden(cand, false);
  // Copy from the task description (outside the editor)
  await cand.getByText('Implement').click({ clickCount: 3 });
  await cand.keyboard.press('ControlOrMeta+c');

  // --- Interviewer sees live code and activity
  await expect(iv.locator('.monaco-editor .view-lines')).toContainText('function sum(xs)');
  await expect(iv.locator('.monaco-editor .view-lines')).toContainText('const answer');
  const timeline = iv.getByRole('listbox', { name: /Activity timeline/ });
  // Monitor shows exactly the candidate's code.
  await expect
    .poll(async () => iv.locator('.monaco-editor .view-lines').innerText())
    .toBe(await cand.locator('.monaco-editor .view-lines').innerText());
  await expect(timeline.getByText('Copy', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Paste', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Tab hidden', { exact: true })).toBeVisible();
  await expect(iv.getByText(/no matching copy recorded/)).toBeVisible();

  await expect(timeline.getByText('Copy outside editor', { exact: true })).toBeVisible();
  await expect(timeline.getByText(/from task description/)).toBeVisible();

  // Event details: exact pasted and selected text
  await timeline.getByText('Paste', { exact: true }).click();
  await expect(iv.getByText(/#\d+ · Paste/)).toBeVisible();
  await timeline.getByText('Selection', { exact: true }).click();
  await expect(iv.getByText(/#\d+ · Selection/)).toBeVisible();
  await expect(iv.locator('pre', { hasText: 'function sum(xs) { return 0; }' })).toBeVisible();

  // --- Candidate presses Back: blocked, warned, recorded
  await cand.goBack();
  await expect(cand.getByText('Leaving this page pauses your session')).toBeVisible();
  await expect(timeline.getByText('Pressed Back', { exact: true })).toBeVisible();

  // --- Candidate closes the tab → session paused
  await cand.close({ runBeforeUnload: false });
  await expect(iv.getByText('Paused', { exact: true }).first()).toBeVisible();
  await expect(timeline.getByText('Left the page', { exact: true })).toBeVisible();

  // Re-opening the old link shows the paused screen
  cand = await candidateCtx.newPage();
  await cand.goto(new URL(inviteUrl).pathname);
  await expect(cand.getByRole('heading', { name: 'Session paused' })).toBeVisible();

  // --- Interviewer allows return; the paused page lets the candidate back in through the same link
  await iv.getByRole('button', { name: 'Allow return' }).click();
  await expect(iv.getByText(/Return allowed until/)).toBeVisible();
  await cand.getByRole('button', { name: 'Continue interview' }).click({ timeout: 15_000 });
  await expect(iv.getByText('In progress').first()).toBeVisible();
  await expect(cand.locator('.monaco-editor .view-lines')).toContainText('function sum(xs)');
  await expect(cand.locator('.monaco-editor .view-lines')).toContainText('const answer');
  await typeInEditor(cand, ' // done');
  await expect(iv.locator('.monaco-editor .view-lines')).toContainText('// done');

  // --- Candidate finishes
  await cand.getByRole('button', { name: 'Finish' }).click();
  await cand.getByRole('dialog').getByRole('button', { name: 'Finish' }).click();
  await expect(cand.getByRole('heading', { name: 'Interview finished' })).toBeVisible();
  await expect(iv.getByText('Completed').first()).toBeVisible();

  // --- Review after the fact: reload shows persisted state
  await iv.reload();
  await expect(iv.locator('.monaco-editor .view-lines')).toContainText('// done');
  await expect(timeline.getByText('Session ended', { exact: true })).toBeVisible();
});

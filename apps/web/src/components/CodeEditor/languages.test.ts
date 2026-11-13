import { describe, expect, it } from 'vitest';
import { canFormat, modelPath } from './languages';

describe('modelPath', () => {
  it('uses .tsx/.jsx for TypeScript/JavaScript so JSX type-checks', () => {
    expect(modelPath('task', 'a', 'typescript')).toBe('file:///task-a.tsx');
    expect(modelPath('task', 'a', 'javascript')).toBe('file:///task-a.jsx');
  });

  it('uses .go for Go', () => {
    expect(modelPath('monitor', 'b', 'go')).toBe('file:///monitor-b.go');
  });
});

describe('canFormat', () => {
  it('offers Monaco formatting only where Monaco has a formatter', () => {
    expect(canFormat('typescript')).toBe(true);
    expect(canFormat('javascript')).toBe(true);
    expect(canFormat('go')).toBe(false);
  });
});

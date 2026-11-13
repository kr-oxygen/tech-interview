import { similarityPercent } from './similarity';

describe('similarityPercent', () => {
  it('scores exact, whitespace-only and different texts', () => {
    expect(similarityPercent('const a = 1;', 'const a = 1;')).toBe(100);
    expect(similarityPercent('const  a =\n1;', 'const a = 1;')).toBe(99);
    expect(
      similarityPercent('function sum(xs) { return 0 }', 'function sum(ys) { return 0 }'),
    ).toBeGreaterThan(80);
    expect(similarityPercent('hello world', 'completely different')).toBeLessThan(40);
    expect(similarityPercent('', 'x')).toBe(0);
  });
});

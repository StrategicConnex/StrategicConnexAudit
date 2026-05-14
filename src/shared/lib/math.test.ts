import { describe, it, expect } from 'vitest';

// Función básica a testear
export const add = (a: number, b: number): number => a + b;

describe('Basic Math Operations', () => {
  it('should correctly add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});

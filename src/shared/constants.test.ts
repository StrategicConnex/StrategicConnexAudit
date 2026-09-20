import { describe, it, expect } from 'vitest';
import {
  FETCH_TIMEOUT_MS,
  HEAVY_FETCH_TIMEOUT_MS,
  CLIPBOARD_TOAST_MS,
  SUCCESS_TOAST_MS,
  SYNC_SIMULATION_MS,
  INVESTIGATIONS_PAGE_SIZE,
  FINDINGS_PAGE_SIZE,
  ASSETS_PAGE_SIZE,
  EVENTS_PAGE_SIZE,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
} from './constants';

describe('Shared Constants', () => {
  describe('Timeouts', () => {
    it('FETCH_TIMEOUT_MS is 10 seconds', () => {
      expect(FETCH_TIMEOUT_MS).toBe(10_000);
    });

    it('HEAVY_FETCH_TIMEOUT_MS is 30 seconds', () => {
      expect(HEAVY_FETCH_TIMEOUT_MS).toBe(30_000);
    });

    it('CLIPBOARD_TOAST_MS is 2 seconds', () => {
      expect(CLIPBOARD_TOAST_MS).toBe(2_000);
    });

    it('SUCCESS_TOAST_MS is 3 seconds', () => {
      expect(SUCCESS_TOAST_MS).toBe(3_000);
    });

    it('SYNC_SIMULATION_MS is 1.2 seconds', () => {
      expect(SYNC_SIMULATION_MS).toBe(1_200);
    });
  });

  describe('Pagination', () => {
    it('INVESTIGATIONS_PAGE_SIZE is 50', () => {
      expect(INVESTIGATIONS_PAGE_SIZE).toBe(50);
    });

    it('FINDINGS_PAGE_SIZE is 500', () => {
      expect(FINDINGS_PAGE_SIZE).toBe(500);
    });

    it('ASSETS_PAGE_SIZE is 100', () => {
      expect(ASSETS_PAGE_SIZE).toBe(100);
    });

    it('EVENTS_PAGE_SIZE is 500', () => {
      expect(EVENTS_PAGE_SIZE).toBe(500);
    });
  });

  describe('Security', () => {
    it('MAX_LOGIN_ATTEMPTS is 5', () => {
      expect(MAX_LOGIN_ATTEMPTS).toBe(5);
    });

    it('LOGIN_LOCKOUT_MINUTES is 15', () => {
      expect(LOGIN_LOCKOUT_MINUTES).toBe(15);
    });
  });

  describe('Constants are positive numbers', () => {
    it('all timeout constants are positive', () => {
      expect(FETCH_TIMEOUT_MS).toBeGreaterThan(0);
      expect(HEAVY_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
      expect(CLIPBOARD_TOAST_MS).toBeGreaterThan(0);
      expect(SUCCESS_TOAST_MS).toBeGreaterThan(0);
      expect(SYNC_SIMULATION_MS).toBeGreaterThan(0);
    });

    it('all page sizes are positive', () => {
      expect(INVESTIGATIONS_PAGE_SIZE).toBeGreaterThan(0);
      expect(FINDINGS_PAGE_SIZE).toBeGreaterThan(0);
      expect(ASSETS_PAGE_SIZE).toBeGreaterThan(0);
      expect(EVENTS_PAGE_SIZE).toBeGreaterThan(0);
    });
  });
});

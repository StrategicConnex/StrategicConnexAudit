'use client';

import { Toaster } from 'sonner';

/**
 * Client wrapper for sonner's Toaster.
 * Must be a Client Component because sonner uses React context and browser APIs.
 * Styled to match the SCAUDIT dark design system.
 */
export function ToasterProvider() {
  return (
    <Toaster
      position="bottom-right"
      gap={12}
      toastOptions={{
        style: {
          background: '#131722',
          border: '1px solid #1E293B',
          borderRadius: '16px',
          color: '#F1F5F9',
          fontSize: '13px',
          padding: '16px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08)',
        },
      }}
      icons={{
        success: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A3E635" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ),
        error: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        ),
        loading: (
          <svg style={{ animation: 'spin 1s linear infinite' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ),
      }}
      duration={4000}
    />
  );
}

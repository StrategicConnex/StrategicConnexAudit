import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetricCard } from './MetricCard';

afterEach(() => cleanup());

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(
      <MetricCard
        icon={<span>📊</span>}
        label="Projects"
        value="12"
      />,
    );

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders hint when provided', () => {
    render(
      <MetricCard
        icon={<span>📊</span>}
        label="Uptime"
        value="99.9%"
        hint="Active"
      />,
    );

    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders dash for no data', () => {
    render(
      <MetricCard
        icon={<span>📊</span>}
        label="Alerts"
        value="—"
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

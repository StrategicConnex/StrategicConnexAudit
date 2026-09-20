import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    const { unmount } = render(
      <EmptyState
        icon={<span>📭</span>}
        title="No data found"
        description="There are no items to display"
      />,
    );

    expect(screen.getByText('No data found')).toBeInTheDocument();
    expect(screen.getByText('There are no items to display')).toBeInTheDocument();
    unmount();
  });

  it('renders icon', () => {
    const { container } = render(
      <EmptyState
        icon={<span>📭</span>}
        title="Empty"
      />,
    );

    expect(container.querySelector('span')).toBeTruthy();
  });

  it('renders action when provided', () => {
    const { unmount } = render(
      <EmptyState
        icon={<span>📭</span>}
        title="Empty"
        action={<button>Create new</button>}
      />,
    );

    expect(screen.getByText('Create new')).toBeInTheDocument();
    unmount();
  });

  it('renders without description', () => {
    render(<EmptyState icon={<span>📭</span>} title="Just title" />);
    expect(screen.getByText('Just title')).toBeInTheDocument();
  });
});

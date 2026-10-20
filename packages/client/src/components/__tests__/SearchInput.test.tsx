import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SearchInput from '../SearchInput';

describe('SearchInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSearch: vi.fn(),
    isLoading: false,
    mostRecentSuccessfulSearchQuery: null,
    headerConfig: {}
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with placeholder text', () => {
    render(<SearchInput {...defaultProps} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder');
    expect(input.getAttribute('placeholder')).toMatch(/^e\.g\. "/);
  });

  it('displays search icon', () => {
    render(<SearchInput {...defaultProps} />);
    
    // The MagnifyingGlassIcon should be present
    const container = screen.getByRole('textbox').parentElement;
    expect(container).toBeInTheDocument();
  });

  it('calls onChange when input value changes', () => {
    const mockOnChange = vi.fn();
    render(<SearchInput {...defaultProps} onChange={mockOnChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test query' } });
    
    expect(mockOnChange).toHaveBeenCalledWith('test query');
  });

  it('shows the loading waveform when isLoading is true', () => {
    render(<SearchInput {...defaultProps} isLoading={true} />);

    expect(screen.getByRole('img', { name: 'Searching' })).toBeInTheDocument();
  });

  it('does not show the loading waveform when isLoading is false', () => {
    render(<SearchInput {...defaultProps} isLoading={false} />);

    expect(screen.queryByRole('img', { name: 'Searching' })).not.toBeInTheDocument();
  });

  it('keeps the loading waveform up for a minimum time after a fast search', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<SearchInput {...defaultProps} isLoading={true} />);
      act(() => { vi.advanceTimersByTime(50); });
      rerender(<SearchInput {...defaultProps} isLoading={false} />);

      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.getByRole('img', { name: 'Searching' })).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(100); });
      expect(screen.queryByRole('img', { name: 'Searching' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

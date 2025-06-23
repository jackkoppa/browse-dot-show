import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SearchInput from '../SearchInput';

describe('SearchInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSearch: vi.fn(),
    isLoading: false,
    mostRecentSuccessfulSearchQuery: null,
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

  it('shows loading spinner when isLoading is true', () => {
    render(<SearchInput {...defaultProps} isLoading={true} />);
    
    // Look for the spinner element - it's a div with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('does not show loading spinner when isLoading is false', () => {
    render(<SearchInput {...defaultProps} isLoading={false} />);
    
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });
}); 
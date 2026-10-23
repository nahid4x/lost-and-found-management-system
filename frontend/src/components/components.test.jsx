import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemCard, MatchRing, Timeline } from './ItemParts.jsx';
import { Modal, Field, Button, Empty } from './ui.jsx';
import { validateStep } from '../pages/ReportPage.jsx';

const item = { id: 'a1', type: 'found', status: 'open', title: '<img src=x onerror=alert(1)>Wallet', category: 'wallet', images: [], area: { label: 'Dhaka' }, createdAt: new Date().toISOString() };

describe('components', () => {
  it('ItemCard renders hostile titles as text, never as HTML', () => {
    const { container } = render(<MemoryRouter><ItemCard item={item} /></MemoryRouter>);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>Wallet/)).toBeInTheDocument();
    expect(container.querySelector('a').getAttribute('href')).toBe('/items/a1');
  });
  it('MatchRing and Timeline expose accessible names/current step', () => {
    render(<><MatchRing score={82.4} /><Timeline status="claimed" /></>);
    expect(screen.getByRole('img', { name: '82 percent match' })).toBeInTheDocument();
    expect(screen.getByText('claimed').closest('li')).toHaveAttribute('aria-current', 'step');
  });
  it('Modal traps Escape, labels itself and restores state', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Confirm"><button>OK</button></Modal>);
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
  it('Field wires label, error and aria-invalid; Button shows busy state', () => {
    render(<><Field label="Title" error="Required" /><Button loading>Save</Button><Empty title="Nothing">x</Empty></>);
    const input = screen.getByLabelText('Title');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
  it('report wizard validation mirrors server rules', () => {
    const d = { title: 'ab', description: 'short', category: '', date: '2999-01-01', pin: null, areaLabel: '', questions: [''] };
    expect(Object.keys(validateStep('basics', d, 'lost')).sort()).toEqual(['category', 'date', 'description', 'title']);
    expect(Object.keys(validateStep('where', d, 'lost')).sort()).toEqual(['areaLabel', 'pin']);
    expect(validateStep('questions', d, 'found').questions).toBeTruthy();
    expect(validateStep('questions', d, 'lost')).toEqual({});
    const ok = { title: 'Black wallet', description: 'Leather with a scratch on it', category: 'wallet', date: '2026-01-01', pin: { lat: 1, lng: 1 }, areaLabel: 'Dhaka', questions: ['What is inside?'] };
    for (const s of ['basics', 'where', 'questions']) expect(validateStep(s, ok, 'found')).toEqual({});
  });
});

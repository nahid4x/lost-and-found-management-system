import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemCard, MatchRing, Timeline } from './ItemParts.jsx';
import { Modal, Field, Button, Empty } from './ui.jsx';
import { validateStep } from '../pages/ReportPage.jsx';
import { VerificationCard } from './VerificationParts.jsx';
import { validateEntries, toPayload, looksNumeric, templatesFor } from '../lib/verification.js';

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
    const d = { title: 'ab', description: 'short', category: '', date: '2999-01-01', pin: null, areaLabel: '', verification: [{ question: '', answer: '', type: 'text', weight: 1, tolerance: '' }] };
    expect(Object.keys(validateStep('basics', d, 'lost')).sort()).toEqual(['category', 'date', 'description', 'title']);
    expect(Object.keys(validateStep('where', d, 'lost')).sort()).toEqual(['areaLabel', 'pin']);
    expect(validateStep('verification', d, 'found')).toEqual({}); // the section is optional: blank rows are fine
    expect(validateStep('verification', { verification: [{ question: 'Wallpaper?', answer: '', type: 'text', weight: 1, tolerance: '' }] }, 'found').verification[0].answer).toBeTruthy();
    expect(validateStep('verification', { verification: [{ question: 'How many?', answer: 'five', type: 'number', weight: 1, tolerance: '' }] }, 'found').verification[0].answer).toMatch(/number/);
    const ok = { title: 'Black wallet', description: 'Leather with a scratch on it', category: 'wallet', date: '2026-01-01', pin: { lat: 1, lng: 1 }, areaLabel: 'Dhaka', verification: [{ question: 'What is inside?', answer: 'two cards', type: 'descriptive', weight: 2, tolerance: '' }] };
    for (const s of ['basics', 'where', 'verification']) expect(validateStep(s, ok, 'found')).toEqual({});
  });

  it('verification helpers: validation, payload (blank rows dropped, answers trimmed) and templates', () => {
    const rows = [
      { question: 'How much money was inside?', answer: ' ৳2,500 ', type: 'number', weight: 3, tolerance: '' },
      { question: '', answer: '', type: 'text', weight: 1, tolerance: '' },
      { question: 'How much money was inside?', answer: '9', type: 'number', weight: 1, tolerance: '' },
    ];
    expect(validateEntries(rows)[2].question).toMatch(/Duplicate/);
    expect(validateEntries([rows[0], rows[1]])).toEqual({});
    expect(toPayload([rows[0], rows[1]])).toEqual([{ question: 'How much money was inside?', answer: '৳2,500', type: 'number', weight: 3 }]);
    expect(looksNumeric('১২৩')).toBe(true); expect(looksNumeric('12 notes')).toBe(false);
    expect(templatesFor('wallet').length).toBeGreaterThan(5); expect(templatesFor('nonsense')).toBeTruthy();
  });
  it('AI Verification card shows the score, counts and a per-answer table; unscored claims say so', () => {
    const v = { scored: true, score: 80, level: 'high', matched: 4, approximate: 0, total: 5, answered: 5, perQuestion: [{ id: 'a', question: 'Wallpaper?', claimed: 'blue sea', result: 'match' }, { id: 'b', question: 'Case?', claimed: 'red', result: 'no_match' }] };
    const { rerender } = render(<VerificationCard v={v} thresholds={{ high: 80, medium: 50 }} reviewState="pending_review" />);
    expect(screen.getByText(/80% Match/)).toBeInTheDocument();
    expect(screen.getByText('4 of 5 answers matched', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Review recommended', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Matched')).toBeInTheDocument(); expect(screen.getByLabelText('Did not match')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '80 percent match' })).toBeInTheDocument();
    rerender(<VerificationCard v={{ scored: false, level: 'unscored' }} reviewState="pending_review" />);
    expect(screen.getByText(/No automatic score/)).toBeInTheDocument();
  });
});

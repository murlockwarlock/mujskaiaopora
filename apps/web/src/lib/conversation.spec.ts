import { getConversationTitle } from './conversation';
import { formatMessageDate, formatMessageTime } from './date-time';

describe('getConversationTitle', () => {
  it('uses the other participant for a direct conversation', () => {
    expect(getConversationTitle({ title: null, members: [{ user: { id: 'current', displayName: 'Иван' } }, { user: { id: 'other', displayName: 'Алексей' } }] }, 'current')).toBe('Алексей');
  });

  it('does not fail when a member has no nested user', () => {
    expect(getConversationTitle({ title: null, members: [{}, { user: { id: 'other', displayName: 'Алексей' } }] }, 'current')).toBe('Алексей');
  });

  it('falls back to a neutral title when no participant is available', () => {
    expect(getConversationTitle({ title: null, members: [{}] }, 'current')).toBe('Диалог');
  });

  it('formats a message time separately from its date', () => {
    expect(formatMessageDate('2026-07-16T12:51:00.000Z', 'Asia/Almaty')).toBe('16 июля 2026');
    expect(formatMessageTime('2026-07-16T12:51:00.000Z', 'Asia/Almaty')).toBe('17:51');
  });
});

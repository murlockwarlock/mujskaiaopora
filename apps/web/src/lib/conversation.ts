export type ConversationMember = {
  user?: {
    id: string;
    displayName: string;
  };
};

export function getConversationTitle(conversation: { title: string | null; members: ConversationMember[] }, currentUserId: string): string {
  if (conversation.title) return conversation.title;
  return conversation.members
    .filter((member) => member.user && member.user.id !== currentUserId)
    .map((member) => member.user?.displayName)
    .filter((displayName): displayName is string => Boolean(displayName))
    .join(', ') || 'Диалог';
}

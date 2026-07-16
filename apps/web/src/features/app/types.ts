import { ConversationMember } from '@/lib/conversation';

export type Profile = {
  id: string;
  bio: string;
  city: string | null;
  timeZone: string;
  languages: string[];
  interests: string[];
  avatarUrl: string | null;
  messageSoundEnabled: boolean;
  callSoundEnabled: boolean;
  browserNotificationsEnabled: boolean;
  user: { id: string; displayName: string };
};

export type Recommendation = {
  id: string;
  displayName: string;
  profile: { city: string | null; bio: string; languages: string[]; interests: string[]; avatarUrl: string | null } | null;
};

export type Conversation = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  members: ConversationMember[];
  messages: { body: string; sender: { displayName: string } }[];
};

export type Message = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string };
};

export type View = 'home' | 'messages' | 'calls' | 'call' | 'profile' | 'admin';

export type IncomingCall = {
  roomId: string;
  title: string;
  callerId: string;
};

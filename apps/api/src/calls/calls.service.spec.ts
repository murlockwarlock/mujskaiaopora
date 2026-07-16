import { CallsService } from './calls.service';

describe('CallsService', () => {
  it('creates a conversation room and returns its connection in one operation', async () => {
    const service = new CallsService({} as never, { getOrThrow: jest.fn().mockReturnValue('10') } as never, {} as never);
    jest.spyOn(service, 'createRoom').mockResolvedValue({ id: 'room' } as never);
    jest.spyOn(service, 'joinRoom').mockResolvedValue({ token: 'token', url: 'ws://localhost:7880', roomName: 'call_room' });

    await expect(service.startConversationCall('user', 'conversation')).resolves.toEqual({ roomId: 'room', token: 'token', url: 'ws://localhost:7880', roomName: 'call_room' });
    expect(service.createRoom).toHaveBeenCalledWith('user', expect.objectContaining({ conversationId: 'conversation' }));
    expect(service.joinRoom).toHaveBeenCalledWith('user', 'room');
  });
});

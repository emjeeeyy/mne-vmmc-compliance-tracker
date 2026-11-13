import type { ConfigService } from '@nestjs/config';
import { EmailChannel } from './email.channel';

describe('EmailChannel', () => {
  it('reports LOGGED and does not log the message when Brevo is not configured', async () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const channel = new EmailChannel(configService);
    const warning = jest.spyOn(channel['logger'], 'warn').mockImplementation();

    const result = await channel.send('staff@example.com', 'Account ready', 'Default password: secret', '<p>secret</p>');

    expect(result.status).toBe('LOGGED');
    expect(warning).toHaveBeenCalledWith('Email delivery is disabled. Configure BREVO_API_KEY and EMAIL_FROM.');
    expect(warning.mock.calls.flat().join(' ')).not.toContain('secret');
  });
});
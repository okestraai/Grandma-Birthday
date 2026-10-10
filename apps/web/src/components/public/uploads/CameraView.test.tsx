import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraView } from './CameraView';

function fakeStream(kind: 'video' | 'audio'): MediaStream {
  const track = { kind, readyState: 'live', stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({ width: 1920, height: 1080 }) };
  return {
    getTracks: () => [track],
    getVideoTracks: () => (kind === 'video' ? [track] : []),
    getAudioTracks: () => (kind === 'audio' ? [track] : []),
  } as unknown as MediaStream;
}

describe('CameraView microphone', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMedia = vi.fn(async (c: MediaStreamConstraints) => fakeStream(c.video ? 'video' : 'audio'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  });

  const renderCamera = () =>
    render(
      <CameraView videoEnabled maxVideoBytes={100 * 1024 * 1024} count={0} onCapture={vi.fn()} onClose={vi.fn()} onOpenShots={vi.fn()} fallback={null} />,
    );

  it('asks for the microphone as soon as Video is tapped', async () => {
    renderCamera();
    await act(async () => {});
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Video' }));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0]).toMatchObject({ video: false });
    expect(getUserMedia.mock.calls[1][0].audio).toBeTruthy();
  });

  it('explains a blocked microphone and asks again from "Allow microphone"', async () => {
    getUserMedia.mockImplementation(async (c: MediaStreamConstraints) => {
      if (c.audio) throw new DOMException('denied', 'NotAllowedError');
      return fakeStream('video');
    });
    const user = userEvent.setup();
    renderCamera();
    await act(async () => {});
    await user.click(screen.getByRole('radio', { name: 'Video' }));
    expect(await screen.findByText(/microphone is blocked, so videos will be silent/i)).toBeInTheDocument();

    getUserMedia.mockImplementation(async (c: MediaStreamConstraints) => fakeStream(c.video ? 'video' : 'audio'));
    await user.click(screen.getByRole('button', { name: 'Allow microphone' }));
    expect(screen.queryByText(/microphone is blocked/i)).not.toBeInTheDocument();
  });
});

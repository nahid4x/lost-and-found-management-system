import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLive } from './Live.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../lib/api.js';
import { initials } from '../lib/util.js';

const Ctx = createContext(null);
export const useCall = () => useContext(Ctx);

const emit = (socket, ev, payload) => new Promise((res) => socket.timeout(8000).emit(ev, payload, (err, r) => res(err ? { error: 'timeout' } : r)));

/** WebRTC audio/video calls. Media is peer-to-peer (TURN relay if needed); the server only relays signalling. */
export function CallProvider({ children }) {
  const { socket } = useLive();
  const toast = useToast();
  const [call, setCall] = useState(null); // {phase, callId, peer, callType, conversationId, muted, camOff, reconnecting}
  const pc = useRef(null); const lk = useRef(null); const local = useRef(null); const pendingIce = useRef([]); const callRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null); const [localStream, setLocalStream] = useState(null);
  callRef.current = call;

  const cleanup = useCallback(() => {
    const room = lk.current; lk.current = null;
    try { room?.disconnect(); } catch { /* already closed */ }
    pc.current?.close(); pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null;
    pendingIce.current = []; setRemoteStream(null); setLocalStream(null);
  }, []);
  const finish = useCallback((message) => {
    cleanup(); setCall(null);
    if (message) toast.info(message);
  }, [cleanup, toast]);

  // Asks the browser for the microphone/camera. Called BEFORE we ring the other person, so a denied permission never makes their phone ring.
  const getMedia = useCallback(async (callType) => {
    try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' }); }
    catch { throw new Error('Microphone/camera permission was denied. Allow access in your browser and try again.'); }
  }, []);

  // LiveKit path: media goes through the LiveKit server, so it also works when the two people are on different networks.
  const joinLiveKit = useCallback(async (callId, stream) => {
    const [{ url, token }, { Room, RoomEvent, Track }] = await Promise.all([api.post(`/realtime/calls/${callId}/token`), import('livekit-client')]);
    const room = new Room({ adaptiveStream: true, dynacast: true });
    lk.current = room;
    const remote = new MediaStream();
    const show = () => setRemoteStream(new MediaStream(remote.getTracks()));
    room.on(RoomEvent.TrackSubscribed, (track) => {
      remote.addTrack(track.mediaStreamTrack); show();
      setCall((c) => (c ? { ...c, phase: 'active', reconnecting: false } : c));
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => { remote.removeTrack(track.mediaStreamTrack); show(); });
    room.on(RoomEvent.Reconnecting, () => setCall((c) => (c ? { ...c, reconnecting: true } : c)));
    room.on(RoomEvent.Reconnected, () => setCall((c) => (c ? { ...c, reconnecting: false } : c)));
    room.on(RoomEvent.Disconnected, () => { if (lk.current === room && callRef.current) finish('Call connection lost'); });
    await room.connect(url, token);
    for (const track of stream.getTracks()) {
      await room.localParticipant.publishTrack(track, { source: track.kind === 'audio' ? Track.Source.Microphone : Track.Source.Camera });
    }
  }, [finish]);

  const prepare = useCallback(async (callId, callType, ready) => {
    const stream = ready ?? (await getMedia(callType));
    local.current = stream; setLocalStream(stream);
    const { iceServers, livekit } = await api.get('/realtime/calls/ice');
    if (livekit) { await joinLiveKit(callId, stream); return null; }
    const conn = new RTCPeerConnection({ iceServers });
    pc.current = conn;
    stream.getTracks().forEach((t) => conn.addTrack(t, stream));
    conn.ontrack = (e) => setRemoteStream(e.streams[0]);
    conn.onicecandidate = (e) => { if (e.candidate) socket.emit('call:ice', { callId, data: e.candidate.toJSON() }, () => {}); };
    conn.oniceconnectionstatechange = () => {
      const st = conn.iceConnectionState;
      setCall((c) => (c ? { ...c, reconnecting: st === 'disconnected' || (st === 'checking' && c.phase === 'active'), phase: st === 'connected' || st === 'completed' ? 'active' : c.phase } : c));
      if (st === 'failed') finish('Call connection failed');
    };
    return conn;
  }, [socket, finish, getMedia, joinLiveKit]);

  const start = useCallback(async (conversation, callType = 'audio') => {
    if (!socket || callRef.current) return;
    let stream;
    try { stream = await getMedia(callType); } catch (e) { toast.error(e.message); return; } // no permission: stop here, nobody is rung
    const ack = await emit(socket, 'call:invite', { conversationId: conversation.id, callType });
    if (ack.error) {
      stream.getTracks().forEach((t) => t.stop());
      toast.error(ack.error === 'offline' ? `${conversation.other.name} is offline right now.` : ack.error === 'busy' ? 'A call is already in progress.' : 'Could not start the call.');
      return;
    }
    const next = { phase: 'calling', callId: ack.callId, peer: conversation.other, callType, conversationId: conversation.id, offline: ack.online === false };
    callRef.current = next; setCall(next);
    try { await prepare(ack.callId, callType, stream); } catch (e) { callRef.current = null; socket.emit('call:end', { callId: ack.callId }, () => {}); finish(); toast.error(e.message); }
  }, [socket, prepare, finish, toast, getMedia]);

  const accept = useCallback(async () => {
    const c = callRef.current; if (!c) return;
    try {
      setCall({ ...c, phase: 'connecting' });
      await prepare(c.callId, c.callType);
      const ack = await emit(socket, 'call:accept', { callId: c.callId });
      if (ack.error) finish('Call is no longer available');
    } catch (e) { socket.emit('call:reject', { callId: c.callId }, () => {}); finish(); toast.error(e.message); }
  }, [socket, prepare, finish, toast]);

  const hangup = useCallback(() => {
    const c = callRef.current; if (!c) return;
    callRef.current = null; // ignore the "missed"/"ended" echo caused by my own hang-up
    socket.emit(c.phase === 'ringing' ? 'call:reject' : 'call:end', { callId: c.callId }, () => {});
    finish();
  }, [socket, finish]);

  // End screen helpers (shown to the caller after "No answer" / "Call declined").
  const dismiss = useCallback(() => { callRef.current = null; setCall(null); }, []);
  const callAgain = useCallback(() => {
    const c = callRef.current; if (!c) return;
    callRef.current = null; setCall(null);
    start({ id: c.conversationId, other: c.peer }, c.callType);
  }, [start]);

  const toggleMute = () => { local.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; }); setCall((c) => ({ ...c, muted: !c.muted })); };
  const toggleCam = () => { local.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; }); setCall((c) => ({ ...c, camOff: !c.camOff })); };
    useEffect(() => {
    if (!socket) return undefined;
    const flush = async () => { for (const c of pendingIce.current.splice(0)) await pc.current?.addIceCandidate(c).catch(() => {}); };
    const h = {
      'call:incoming': (d) => { if (callRef.current) return; setCall({ phase: 'ringing', callId: d.callId, peer: d.from, callType: d.callType, conversationId: d.conversationId }); },
      'call:ringing': ({ callId }) => setCall((c) => (c && c.callId === callId && c.offline ? { ...c, offline: false } : c)),
      'call:accepted': async ({ callId }) => {
        if (!pc.current || callRef.current?.callId !== callId) return;
        const offer = await pc.current.createOffer(); await pc.current.setLocalDescription(offer);
        socket.emit('call:offer', { callId, data: offer }, () => {});
      },
      'call:offer': async ({ callId, data }) => {
        if (!pc.current) return;
        await pc.current.setRemoteDescription(data); await flush();
        const answer = await pc.current.createAnswer(); await pc.current.setLocalDescription(answer);
        socket.emit('call:answer', { callId, data: answer }, () => {});
      },
      'call:answer': async ({ data }) => { if (pc.current) { await pc.current.setRemoteDescription(data); await flush(); } },
      'call:ice': async ({ data }) => { if (pc.current?.remoteDescription) await pc.current.addIceCandidate(data).catch(() => {}); else pendingIce.current.push(data); },
      'call:ended': () => finish('Call ended'),
      // The caller gets a proper end screen with "Call again"; the person being called just gets a short note.
      'call:rejected': () => { const c = callRef.current; if (!c) return; cleanup(); const e = { ...c, phase: 'ended', outcome: 'declined' }; callRef.current = e; setCall(e); },
      'call:missed': () => {
        const c = callRef.current; if (!c) return;
        if (c.phase === 'calling') { cleanup(); const e = { ...c, phase: 'ended', outcome: 'noanswer' }; callRef.current = e; setCall(e); }
        else finish('Missed call');
      },
    };
    for (const [ev, fn] of Object.entries(h)) socket.on(ev, fn);
    return () => { for (const [ev, fn] of Object.entries(h)) socket.off(ev, fn); };
  }, [socket, finish, cleanup]);

  const value = useMemo(() => ({ start, busy: Boolean(call) }), [start, call]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {call && <CallOverlay call={call} remote={remoteStream} localStream={localStream} onAccept={accept} onHangup={hangup} onMute={toggleMute} onCam={toggleCam} onDismiss={dismiss} onAgain={callAgain} />}
    </Ctx.Provider>
  );
}

// Plays a media stream. If the browser blocks autoplay with sound, a "Tap to hear" button appears.
function Stream({ stream, className, muted, kind = 'video' }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream && !muted) el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [stream, muted]);
  const Tag = kind === 'audio' ? 'audio' : 'video';
  const extra = kind === 'audio' ? {} : { playsInline: true };
  return (
    <>
      <Tag ref={ref} className={className} autoPlay muted={muted} {...extra} />
      {blocked && <button className="btn primary" style={{ position: 'absolute', top: 16, left: 16, zIndex: 5 }} onClick={() => ref.current?.play().then(() => setBlocked(false)).catch(() => {})}>🔊 Tap to hear</button>}
    </>
  );
}

// Soft repeating beep while a call is ringing (generated in the browser, no audio file needed).
function useRingtone(active) {
  useEffect(() => {
    if (!active) return undefined;
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return undefined; }
    const beep = () => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 440; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.4);
    };
    beep();
    const id = setInterval(beep, 1500);
    return () => { clearInterval(id); ctx.close().catch(() => {}); };
  }, [active]);
}

const fmtTime = (t) => {
  const h = Math.floor(t / 3600); const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0'); const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
};

/** Seconds since the call became active (0 until then). */
function useCallTimer(active) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) { setSecs(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}
// WhatsApp-style round call buttons with clean line icons (no emoji).
const Svg = ({ children, fill }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const PHONE = 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z';
const IcoPhone = () => <Svg fill><path d={PHONE} /></Svg>;
const IcoHangup = () => <span style={{ display: 'inline-flex', transform: 'rotate(135deg)' }}><Svg fill><path d={PHONE} /></Svg></span>;
const IcoMic = ({ off }) => <Svg><rect x="9" y="2.5" width="6" height="12" rx="3" fill="currentColor" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />{off && <path d="M4 4l16 16" />}</Svg>;
const IcoCam = ({ off }) => <Svg><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h7A2.5 2.5 0 0 1 15 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 3 16.5z" /><path d="M15 10l6-3.5v11L15 14" />{off && <path d="M4 4l16 16" />}</Svg>;
const IcoClose = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;

const GLASS = 'rgba(255,255,255,0.16)';
function Round({ label, caption, onClick, bg = GLASS, color = '#fff', pressed, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={pressed}
        style={{ width: 64, height: 64, borderRadius: '50%', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', background: bg, color, transition: 'transform .12s' }}>
        {children}
      </button>
      <span style={{ fontSize: 12, opacity: 0.85 }}>{caption}</span>
    </div>
  );
}

const GREEN = '#25d366'; const RED = '#ef4444';

function CallOverlay({ call, remote, localStream, onAccept, onHangup, onMute, onCam, onDismiss, onAgain }) {
  const video = call.callType === 'video';
  const ended = call.phase === 'ended';
  useRingtone(call.phase === 'calling' || call.phase === 'ringing');
  const secs = useCallTimer(call.phase === 'active'); // call length once connected
  const label = ended
    ? (call.outcome === 'declined' ? 'Call declined' : 'No answer')
    : { calling: call.offline ? 'Calling…' : 'Ringing…', ringing: 'Incoming call', connecting: 'Connecting…', active: call.reconnecting ? 'Reconnecting…' : fmtTime(secs) }[call.phase];
  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Audio'} call with ${call.peer.name}`}>
      <div className="call-stage">
        {remote && !ended && <Stream stream={remote} kind={video ? 'video' : 'audio'} className={video ? 'remote' : undefined} />}
        {(!video || !remote || ended) && (
          <div className="call-who"><div className="col" style={{ alignItems: 'center' }}>
            <div className="avatar" style={{ width: 96, height: 96, fontSize: 32 }}>{initials(call.peer.name)}</div>
            <h2 style={{ margin: 0 }}>{call.peer.name}</h2>
            <p className="muted" aria-live="polite" style={{ fontVariantNumeric: 'tabular-nums', fontSize: ended ? '1.15rem' : undefined }}>{label}</p>
          </div></div>
        )}
        {video && remote && !ended && call.phase === 'active' && (
          <div style={{ position: 'absolute', top: 14, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
            <span style={{ background: 'rgba(0,0,0,0.45)', padding: '4px 12px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>{call.reconnecting ? 'Reconnecting…' : fmtTime(secs)}</span>
          </div>
        )}
        {video && localStream && !ended && <Stream stream={localStream} className="local" muted />}
        <div className="call-controls" style={{ alignItems: 'flex-start', gap: 28 }}>
          {ended ? (
            <>
              <Round label="Cancel" caption="Cancel" onClick={onDismiss}><IcoClose /></Round>
              <Round label="Call again" caption="Call again" onClick={onAgain} bg={GREEN}><IcoPhone /></Round>
            </>
          ) : call.phase === 'ringing' ? (
            <>
              <Round label="Decline call" caption="Decline" onClick={onHangup} bg={RED}><IcoHangup /></Round>
              <Round label="Accept call" caption="Accept" onClick={onAccept} bg={GREEN}><IcoPhone /></Round>
            </>
          ) : (
            <>
              <Round label={call.muted ? 'Unmute microphone' : 'Mute microphone'} caption={call.muted ? 'Unmute' : 'Mute'} onClick={onMute} pressed={Boolean(call.muted)} bg={call.muted ? '#fff' : GLASS} color={call.muted ? '#111' : '#fff'}><IcoMic off={call.muted} /></Round>
              {video && <Round label={call.camOff ? 'Turn camera on' : 'Turn camera off'} caption="Camera" onClick={onCam} pressed={Boolean(call.camOff)} bg={call.camOff ? '#fff' : GLASS} color={call.camOff ? '#111' : '#fff'}><IcoCam off={call.camOff} /></Round>}
              <Round label="End call" caption="End" onClick={onHangup} bg={RED}><IcoHangup /></Round>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
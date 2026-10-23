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
  const pc = useRef(null); const local = useRef(null); const pendingIce = useRef([]); const callRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null); const [localStream, setLocalStream] = useState(null);
  callRef.current = call;

  const cleanup = useCallback(() => {
    pc.current?.close(); pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null;
    pendingIce.current = []; setRemoteStream(null); setLocalStream(null);
  }, []);
  const finish = useCallback((message) => {
    cleanup(); setCall(null);
    if (message) toast.info(message);
  }, [cleanup, toast]);

  const prepare = useCallback(async (callId, callType) => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' }); }
    catch { throw new Error('Microphone/camera permission was denied. Allow access in your browser and try again.'); }
    local.current = stream; setLocalStream(stream);
    const { iceServers } = await api.get('/realtime/calls/ice');
    const conn = new RTCPeerConnection({ iceServers });
    pc.current = conn;
    stream.getTracks().forEach((t) => conn.addTrack(t, stream));
    conn.ontrack = (e) => setRemoteStream(e.streams[0]);
    conn.onicecandidate = (e) => { if (e.candidate) socket.emit('call:ice', { callId, data: e.candidate.toJSON() }, () => {}); };
    conn.oniceconnectionstatechange = () => {
      const st = conn.iceConnectionState;
      setCall((c) => (c ? { ...c, reconnecting: st === 'disconnected' || st === 'checking' && c.phase === 'active', phase: st === 'connected' || st === 'completed' ? 'active' : c.phase } : c));
      if (st === 'failed') finish('Call connection failed');
    };
    return conn;
  }, [socket, finish]);

  const start = useCallback(async (conversation, callType = 'audio') => {
    if (!socket || callRef.current) return;
    const ack = await emit(socket, 'call:invite', { conversationId: conversation.id, callType });
    if (ack.error) { toast.error(ack.error === 'offline' ? `${conversation.other.name} is offline right now.` : ack.error === 'busy' ? 'A call is already in progress.' : 'Could not start the call.'); return; }
    setCall({ phase: 'calling', callId: ack.callId, peer: conversation.other, callType, conversationId: conversation.id });
    try { await prepare(ack.callId, callType); } catch (e) { socket.emit('call:end', { callId: ack.callId }, () => {}); finish(); toast.error(e.message); }
  }, [socket, prepare, finish, toast]);

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
    socket.emit(c.phase === 'ringing' ? 'call:reject' : 'call:end', { callId: c.callId }, () => {});
    finish();
  }, [socket, finish]);

  const toggleMute = () => { local.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; }); setCall((c) => ({ ...c, muted: !c.muted })); };
  const toggleCam = () => { local.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; }); setCall((c) => ({ ...c, camOff: !c.camOff })); };

  useEffect(() => {
    if (!socket) return undefined;
    const flush = async () => { for (const c of pendingIce.current.splice(0)) await pc.current?.addIceCandidate(c).catch(() => {}); };
    const h = {
      'call:incoming': (d) => { if (callRef.current) return; setCall({ phase: 'ringing', callId: d.callId, peer: d.from, callType: d.callType, conversationId: d.conversationId }); },
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
      'call:rejected': () => finish('Call declined'),
      'call:missed': () => finish('No answer'),
    };
    for (const [ev, fn] of Object.entries(h)) socket.on(ev, fn);
    return () => { for (const [ev, fn] of Object.entries(h)) socket.off(ev, fn); };
  }, [socket, finish]);

  const value = useMemo(() => ({ start, busy: Boolean(call) }), [start, call]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {call && <CallOverlay call={call} remote={remoteStream} localStream={localStream} onAccept={accept} onHangup={hangup} onMute={toggleMute} onCam={toggleCam} />}
    </Ctx.Provider>
  );
}

function Stream({ stream, className, muted }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream ?? null; }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

function CallOverlay({ call, remote, localStream, onAccept, onHangup, onMute, onCam }) {
  const video = call.callType === 'video';
  const label = { calling: 'Calling…', ringing: 'Incoming call', connecting: 'Connecting…', active: call.reconnecting ? 'Reconnecting…' : 'Connected' }[call.phase];
  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Audio'} call with ${call.peer.name}`}>
      <div className="call-stage">
        {video && remote && <Stream stream={remote} className="remote" />}
        {!video && remote && <Stream stream={remote} className="remote" />}
        {(!video || !remote) && (
          <div className="call-who"><div className="col" style={{ alignItems: 'center' }}>
            <div className="avatar" style={{ width: 96, height: 96, fontSize: 32 }}>{initials(call.peer.name)}</div>
            <h2 style={{ margin: 0 }}>{call.peer.name}</h2><p className="muted" aria-live="polite">{label}</p>
          </div></div>
        )}
        {video && localStream && <Stream stream={localStream} className="local" muted />}
        <div className="call-controls">
          {call.phase === 'ringing' ? (
            <>
              <button className="btn ok" onClick={onAccept}>📞 Accept</button>
              <button className="btn danger" onClick={onHangup}>Decline</button>
            </>
          ) : (
            <>
              <button className="btn icon" onClick={onMute} aria-pressed={Boolean(call.muted)} aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}>{call.muted ? '🔇' : '🎤'}</button>
              {video && <button className="btn icon" onClick={onCam} aria-pressed={Boolean(call.camOff)} aria-label={call.camOff ? 'Turn camera on' : 'Turn camera off'}>{call.camOff ? '🚫' : '📷'}</button>}
              <button className="btn danger" onClick={onHangup}>End call</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

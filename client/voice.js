// Voice chat in the match: player to player over WebRTC, the server only passes the handshake
// (shared/room.js voice()). Everyone hears everyone they may talk to (team modes: their team)
// unless voice is off in Settings; K (or the 🎙 button) turns your own microphone on and off.
// The lower player id makes the offer, so each pair connects once.
import { t } from './i18n.js';
import { settings } from './settings.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createVoice({ send, app, game, toast }) {
  const st = { on: false, pid: null, mic: false, track: null, stream: null, peers: new Map(), ctx: null, timer: null };

  const allowed = () => typeof RTCPeerConnection !== 'undefined' && settings.vchat !== false && app.mode === 'online';

  function hud() {
    const el = $('vc');
    if (!el) return;
    el.hidden = !st.on;
    if (!st.on) return;
    const talking = [...st.peers.values()].filter((p) => p.speaking).map((p) => esc(p.name));
    el.innerHTML = `<button type="button" class="vc-mic${st.mic ? ' on' : ''}" data-mic aria-pressed="${st.mic}" title="${esc(t('vc.toggle'))}">${st.mic ? '🎙' : '🔇'}<small>K</small></button>${talking.length ? `<span class="vc-talk">🔊 ${talking.join(', ')}</span>` : st.peers.size ? `<span class="vc-n">${t('vc.peers', { n: [...st.peers.values()].filter((p) => p.live).length })}</span>` : ''}`;
    el.querySelector('[data-mic]').onclick = toggle;
  }

  function peer(pid, name, offer) {
    let p = st.peers.get(pid);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (st.track) tr.sender.replaceTrack(st.track).catch(() => {});
    p = { pc, tr, name: name ?? '', live: false, speaking: false, audio: null, an: null };
    st.peers.set(pid, p);
    pc.onicecandidate = (e) => e.candidate && send({ t: 'vc', op: 'sig', to: pid, data: { c: e.candidate.toJSON() } });
    pc.onconnectionstatechange = () => {
      p.live = pc.connectionState === 'connected';
      if (['failed', 'closed'].includes(pc.connectionState)) drop(pid);
      hud();
    };
    pc.ontrack = (e) => {
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      audio.play().catch(() => {});
      p.audio = audio;
      // a level meter: who is speaking
      try {
        st.ctx ??= new AudioContext();
        const src = st.ctx.createMediaStreamSource(audio.srcObject);
        const an = st.ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        p.an = an;
      } catch {
        /* no meter, the voice still plays */
      }
    };
    if (offer)
      (async () => {
        const o = await pc.createOffer();
        await pc.setLocalDescription(o);
        send({ t: 'vc', op: 'sig', to: pid, data: { sdp: pc.localDescription.toJSON() } });
      })().catch(() => drop(pid));
    return p;
  }

  function drop(pid) {
    const p = st.peers.get(pid);
    if (!p) return;
    st.peers.delete(pid);
    try {
      p.pc.close();
    } catch {
      /* closed */
    }
    if (p.audio) p.audio.srcObject = null;
    hud();
  }

  async function onSig(from, data) {
    const p = st.peers.get(from) ?? peer(from, null, false);
    try {
      if (data.sdp) {
        await p.pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const a = await p.pc.createAnswer();
          await p.pc.setLocalDescription(a);
          send({ t: 'vc', op: 'sig', to: from, data: { sdp: p.pc.localDescription.toJSON() } });
        }
        for (const c of p.pending ?? []) await p.pc.addIceCandidate(c).catch(() => {});
        p.pending = null;
      } else if (data.c) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.c).catch(() => {});
        else (p.pending ??= []).push(data.c);
      }
    } catch {
      drop(from);
    }
  }

  function onMessage(m) {
    if (m.t !== 'vc' || !st.on) return;
    if (m.op === 'hello') {
      if (st.peers.has(m.from)) return;
      // the lower id offers; the other answers the hello so the lower one knows to
      if (st.pid < m.from) peer(m.from, m.n, true);
      else if (!m.ack) send({ t: 'vc', op: 'hello', to: m.from });
      const p = st.peers.get(m.from);
      if (p && m.n) p.name = m.n;
    } else if (m.op === 'bye') drop(m.from);
    else if (m.op === 'sig') onSig(m.from, m.data);
    hud();
  }

  async function toggle() {
    if (!st.on) return;
    if (st.mic) {
      st.mic = false;
      if (st.track) st.track.enabled = false;
      hud();
      return;
    }
    try {
      if (!st.track) {
        st.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        st.track = st.stream.getAudioTracks()[0];
        for (const p of st.peers.values()) p.tr.sender.replaceTrack(st.track).catch(() => {});
      }
      st.track.enabled = true;
      st.mic = true;
      toast?.(t('vc.micOn'));
    } catch {
      toast?.(t('vc.noMic'));
    }
    hud();
  }

  // the match begins: say hello to everyone we may talk to
  function begin(pid) {
    end();
    if (!allowed()) return;
    st.on = true;
    st.pid = pid;
    send({ t: 'vc', op: 'hello' });
    st.timer = setInterval(() => {
      // who is speaking (a short look at each voice's level)
      let changed = false;
      const buf = new Uint8Array(128);
      for (const p of st.peers.values()) {
        if (!p.an) continue;
        p.an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const sp = peak > 10;
        if (sp !== p.speaking) {
          p.speaking = sp;
          changed = true;
        }
      }
      if (changed) hud();
    }, 200);
    hud();
  }

  function end() {
    if (st.on) send({ t: 'vc', op: 'bye' });
    clearInterval(st.timer);
    for (const pid of [...st.peers.keys()]) drop(pid);
    if (st.track) st.track.stop();
    st.track = null;
    st.stream = null;
    st.mic = false;
    st.on = false;
    hud();
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyK' || !st.on || !game.active || e.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    toggle();
  });

  return { begin, end, onMessage, toggle };
}

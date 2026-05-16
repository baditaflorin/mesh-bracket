import { useEffect, useState } from "react";
import {
  QRExchange,
  makeScanPayload,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Participant = { name: string };
type Match = { p1: string | null; p2: string | null; winner: string | null; round: number };

const NAME_KEY = (p: string) => `${p}:displayName`;

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="viral-screen">
        <h1>bracket</h1>
        <p className="viral-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    const ps = room.doc.getMap<Participant>("participants");
    const ms = room.doc.getMap<Match>("matches");
    const cb = () => rerender((n) => n + 1);
    ps.observe(cb);
    ms.observe(cb);
    return () => {
      ps.unobserve(cb);
      ms.unobserve(cb);
    };
  }, [room]);

  const participants = room.doc.getMap<Participant>("participants");
  const matches = room.doc.getMap<Match>("matches");

  const joinTournament = () => {
    if (!name.trim()) return;
    participants.set(room.peerId, { name: name.trim() });
  };

  const leaveTournament = () => participants.delete(room.peerId);

  const buildBracket = () => {
    const ids = Array.from(participants.keys());
    if (ids.length < 2) return;
    // simple shuffle by id sort + reverse
    const order = ids.slice().sort();
    const slots = nextPowerOfTwo(order.length);
    const padded: Array<string | null> = order.slice();
    while (padded.length < slots) padded.push(null);
    room.doc.transact(() => {
      matches.forEach((_v, k) => matches.delete(k));
      // Round 1
      for (let i = 0; i < slots / 2; i++) {
        const p1 = padded[i * 2] ?? null;
        const p2 = padded[i * 2 + 1] ?? null;
        const winner: string | null = p1 && !p2 ? p1 : !p1 && p2 ? p2 : null;
        matches.set(`r1-${i}`, { p1, p2, winner, round: 1 });
      }
    });
  };

  const matchList: Array<Match & { id: string }> = [];
  matches.forEach((m, k) => matchList.push({ ...m, id: k }));
  matchList.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));

  const reportWin = (matchId: string, winnerId: string) => {
    const m = matches.get(matchId);
    if (!m) return;
    if (m.winner) return;
    if (winnerId !== m.p1 && winnerId !== m.p2) return;
    room.doc.transact(() => {
      matches.set(matchId, { ...m, winner: winnerId });
      // Advance: find or create next round match
      const m_idx = parseInt(matchId.split("-")[1] ?? "0", 10);
      const nextRound = m.round + 1;
      const nextIdx = Math.floor(m_idx / 2);
      const nextKey = `r${nextRound}-${nextIdx}`;
      const slot: "p1" | "p2" = m_idx % 2 === 0 ? "p1" : "p2";
      const existing = matches.get(nextKey) ?? {
        p1: null,
        p2: null,
        winner: null,
        round: nextRound,
      };
      const updated = { ...existing, [slot]: winnerId };
      // auto-advance byes
      if (updated.p1 && !updated.p2 && countRound(nextRound) <= 1) updated.winner = updated.p1;
      matches.set(nextKey, updated);
    });
  };

  function countRound(round: number) {
    let n = 0;
    matches.forEach((m) => {
      if (m.round === round) n++;
    });
    return n;
  }

  const scanResult = (otherId: string) => {
    // when you scan an opponent's QR, find the open match between you and them
    const pending = matchList.find(
      (m) =>
        !m.winner &&
        ((m.p1 === room.peerId && m.p2 === otherId) || (m.p2 === room.peerId && m.p1 === otherId)),
    );
    if (pending) reportWin(pending.id, room.peerId);
  };

  const champion = (() => {
    let maxR = 0;
    matchList.forEach((m) => {
      if (m.winner && m.round > maxR) maxR = m.round;
    });
    const finalMatch = matchList.find(
      (m) => m.round === maxR && m.winner && countRound(maxR) === 1,
    );
    return finalMatch?.winner ?? null;
  })();

  const myPayload = makeScanPayload(room.roomId, room.peerId, name.trim() || "anon");

  return (
    <div className="viral-screen">
      <header>
        <h1>bracket</h1>
        <p className="viral-status">
          {participants.size} entrants · {matchList.length} matches ·{" "}
          {champion ? `🏆 ${participants.get(champion)?.name ?? "?"}` : "in progress"}
        </p>
      </header>

      <input
        className="viral-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        maxLength={48}
      />

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {participants.has(room.peerId) ? (
          <button type="button" className="viral-ghost" onClick={leaveTournament}>
            ✗ leave
          </button>
        ) : (
          <button
            type="button"
            className="viral-primary"
            onClick={joinTournament}
            disabled={!name.trim()}
          >
            ✓ join tournament
          </button>
        )}
        <button
          type="button"
          className="viral-primary"
          onClick={buildBracket}
          disabled={participants.size < 2}
        >
          🎯 build bracket
        </button>
      </div>

      <QRExchange
        myPayload={myPayload}
        showLabel="your QR"
        scanLabel="i beat them — scan their QR"
        onScan={(parsed) => scanResult(parsed.peerId)}
      />

      <section>
        <h2 className="viral-section-title">bracket</h2>
        {matchList.length === 0 ? (
          <p className="viral-empty">click "build bracket" to seed round 1</p>
        ) : (
          <ul className="br-list">
            {matchList.map((m) => {
              const p1n = m.p1 ? (participants.get(m.p1)?.name ?? m.p1.slice(0, 6)) : "—";
              const p2n = m.p2 ? (participants.get(m.p2)?.name ?? m.p2.slice(0, 6)) : "—";
              const isMine = m.p1 === room.peerId || m.p2 === room.peerId;
              return (
                <li key={m.id} className={isMine ? "is-mine" : ""}>
                  <span className="br-round">R{m.round}</span>
                  <span className={m.winner === m.p1 ? "is-winner" : ""}>{p1n}</span>
                  <span className="br-vs">vs</span>
                  <span className={m.winner === m.p2 ? "is-winner" : ""}>{p2n}</span>
                  {m.winner && (
                    <span className="br-result">→ {participants.get(m.winner)?.name ?? "?"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

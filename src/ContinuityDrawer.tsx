import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Drawer } from "./Drawer";

// A live, runnable demonstration of the continuity handshake. Real HMAC crypto
// runs on the backend; this shows the receiving-side value — a counterpart that
// authenticates as the right address but FAILS the forward-secret challenge is
// flagged as a possible takeover. This is the answer to "what if a trusted
// address is impersonated": trust from the channel isn't enough; the agent must
// prove it's STILL the principal that earned trust.

type Result = {
  nonce: string;
  seedFingerprint: string;
  response: string;
  verified: boolean;
  verdict: string;
};

export function ContinuityDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const demo = useAction(api.continuity.demo);
  const [counter, setCounter] = useState(1);
  const [res, setRes] = useState<Result | null>(null);
  const [who, setWho] = useState<"genuine" | "impostor" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(responder: "genuine" | "impostor") {
    setBusy(true);
    setWho(responder);
    try {
      const r = await demo({
        trustSecret: "trust-established-at-first-contact",
        counter,
        responder,
      });
      setRes(r);
      setCounter((c) => c + 1); // ratchet forward each interaction
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} path="agent@warden ~ continuity">
      <p className="drawer-intro">
        Verifying an address is not enough. A counterpart whose address is taken
        over inherits its trust. The continuity handshake proves a counterpart is{" "}
        <b>still the same agent that earned trust</b> — with a forward-secret
        challenge only the holder of the trust-time seed can answer.
      </p>

      <div className="cont-seed">
        <span className="cont-k">shared seed</span>
        <span className="mono cont-v">
          established at first contact · fingerprint{" "}
          {res ? res.seedFingerprint : "········"}
        </span>
      </div>

      <div className="cont-run">
        <span className="cont-k">interaction #{counter}</span>
        <div className="cont-buttons">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run("genuine")}
          >
            {busy && who === "genuine" ? "…" : "Genuine agent responds"}
          </button>
          <button
            className="btn btn-ghost cont-attack"
            disabled={busy}
            onClick={() => void run("impostor")}
          >
            {busy && who === "impostor" ? "…" : "Impostor (has address, no seed)"}
          </button>
        </div>
      </div>

      {res && (
        <div className={`cont-result ${res.verified ? "is-ok" : "is-bad"}`}>
          <div className="cont-trace">
            <div className="cont-step">
              <span className="cont-k">challenge</span>
              <span className="mono cont-v">{res.nonce}</span>
            </div>
            <div className="cont-step">
              <span className="cont-k">response</span>
              <span className="mono cont-v">{res.response}</span>
            </div>
            <div className="cont-step">
              <span className="cont-k">check</span>
              <span className="cont-v">
                <span
                  className={`cont-verdict ${res.verified ? "ok" : "bad"}`}
                >
                  {res.verified ? "PASS" : "FAIL"}
                </span>
                <span className="cont-det">HMAC · forward-secret · 0 LLM</span>
              </span>
            </div>
          </div>
          <div className="cont-verdict-line">{res.verdict}</div>
        </div>
      )}

      <p className="drawer-intro cont-note">
        The impostor holds the address and can read past traffic, but never held
        the trust-time seed — so it cannot produce the rotating response, and the
        takeover is exposed at interaction time. It does not defend against theft
        of the seed itself; it raises the bar from spoofing an address to
        exfiltrating a rotating secret.
      </p>
    </Drawer>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import seed from './data/seed-streams.json';
import { STEPS, newAssessment, elapsedSeconds } from './core/assessment.js';
import { buildContext, fetchRecentRain } from './core/context.js';
import { scoreAssessment } from './core/biotic-index.js';
import { loadUserHistory, saveAssessment, mergedHistory } from './core/history.js';
import { Stepper2 } from './ui/primitives.jsx';
import StepStream from './steps/StepStream.jsx';
import StepAssess from './steps/StepAssess.jsx';
import StepResult from './steps/StepResult.jsx';
import StepOneHealth from './steps/StepOneHealth.jsx';
import StepFhir from './steps/StepFhir.jsx';

// Bahari — guided assessment flow.
// Step machine: stream -> assess -> result -> onehealth -> fhir.

export default function App() {
  const streams = seed.streams || [];
  const [stepIndex, setStepIndex] = useState(0);
  const [assessment, setAssessment] = useState(() => newAssessment(streams[0]?.id ?? null));
  const [landUse, setLandUse] = useState('mixed');
  const [rain, setRain] = useState(null); // filled from Open-Meteo when reaching One Health
  const [userHistory, setUserHistory] = useState({}); // { streamId: entry[] }
  const [saved, setSaved] = useState(false); // has this assessment been persisted?

  useEffect(() => {
    setUserHistory(loadUserHistory());
  }, []);

  const step = STEPS[stepIndex];
  const stream = streams.find((s) => s.id === assessment.streamId) || null;

  const go = (i) => setStepIndex(Math.max(0, Math.min(STEPS.length - 1, i)));
  const update = (patch) => setAssessment((a) => ({ ...a, ...patch }));

  const context = buildContext({ date: new Date(), landUse, rain });

  // Merged (seed + user) history for the selected stream, for StepStream display.
  const historyByStream = useMemo(() => {
    const map = {};
    for (const s of streams) {
      map[s.id] = mergedHistory(s.history || [], userHistory[s.id] || []);
    }
    return map;
  }, [streams, userHistory]);

  // Build the submission passed to the reliability scorer. Seed streams are real
  // GBIF stream locations, so location is present and on-stream.
  function buildSubmission() {
    return {
      counts: assessment.counts,
      photoConfirmed: assessment.photoConfirmed,
      aiAssisted: assessment.aiAssisted,
      location: stream ? { lat: stream.lat, lon: stream.lon } : null,
      locationOnStream: stream ? true : null,
      durationSec: elapsedSeconds(assessment),
    };
  }

  // When moving into One Health, try a live rain lookup (free, keyless), and
  // persist the completed assessment to "your stream" history (once).
  async function goOneHealth() {
    go(3);
    persistAssessment();
    if (stream && rain == null) {
      const r = await fetchRecentRain({ lat: stream.lat, lon: stream.lon });
      setRain(r);
    }
  }

  function persistAssessment() {
    if (saved || !stream) return;
    const biotic = scoreAssessment(assessment.counts);
    if (biotic.score === null) return;
    const entry = {
      date: new Date().toISOString().slice(0, 10),
      score: biotic.score,
      classKey: biotic.classKey,
      counts: assessment.counts,
    };
    setUserHistory(saveAssessment(stream.id, entry));
    setSaved(true);
  }

  function restart() {
    setAssessment(newAssessment(assessment.streamId));
    setRain(null);
    setSaved(false);
    go(0);
  }

  return (
    <div className="min-h-screen font-sans text-snow flex flex-col">
      <header className="bg-ink border-b border-steel px-5 pt-4 pb-3 sticky top-0 z-[500]">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded grid place-items-center bg-accent text-ink font-bold text-sm">
              B
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none">Bahari</h1>
              <p className="eyebrow mt-1">Citizen stream health</p>
            </div>
          </div>
          <Stepper2 steps={STEPS} activeIndex={stepIndex} />
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto p-5">
        {step.key === 'stream' && (
          <StepStream
            streamId={assessment.streamId}
            onPick={(id) => update({ streamId: id })}
            landUse={landUse}
            onLandUse={setLandUse}
            historyByStream={historyByStream}
            onNext={() => go(1)}
          />
        )}

        {step.key === 'assess' && (
          <StepAssess
            counts={assessment.counts}
            onChange={(counts) => update({ counts })}
            onPhotoConfirmed={() => update({ photoConfirmed: true, aiAssisted: true })}
            onBack={() => go(0)}
            onNext={() => go(2)}
          />
        )}

        {step.key === 'result' && (
          <StepResult
            counts={assessment.counts}
            streamName={stream?.name}
            submission={buildSubmission()}
            onBack={() => go(1)}
            onNext={goOneHealth}
            onRestart={restart}
          />
        )}

        {step.key === 'onehealth' && (
          <StepOneHealth
            counts={assessment.counts}
            context={context}
            onBack={() => go(2)}
            onNext={() => go(4)}
          />
        )}

        {step.key === 'fhir' && (
          <StepFhir
            stream={stream}
            counts={assessment.counts}
            submission={buildSubmission()}
            context={context}
            onBack={() => go(3)}
            onRestart={restart}
          />
        )}
      </main>

      <footer className="border-t border-steel text-center py-3 px-5">
        <span className="eyebrow">
          Bahari · IEEE OneAquaHealth 2026 · stream to One Health
        </span>
      </footer>
    </div>
  );
}

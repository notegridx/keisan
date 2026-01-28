(() => {
  "use strict";

  /*
    CALC / ケイサン
    - Simple arithmetic practice with drum-machine style feedback
    - BPM is fixed (no user control)
    - Beat grows with correct answers, resets on mistakes
  */

  // -------------------------
  // Configuration
  // -------------------------
  const FIXED_BPM = 120;

  const SETTINGS = {
    nextDelayMs: 650,

    // Beat unlock thresholds (per stage)
    unlockHihatAt: 10,
    unlockSnareAt: 20,

    // Drum scheduler tuning
    lookaheadMs: 40,
    scheduleAheadSec: 0.15,

    // Pattern structure
    stepsPerBar: 16,
    barsCycle: 64,

    // BGM variation switches every N correct (per stage)
    bgmStageMax: 3,
    bgmSwitchEveryCorrect: 5,

    // Difficulty increases every N correct (global score)
    stageClearEveryCorrect: 20,

    // Mute the next "beat" (quarter note) on wrong when SFX is enabled
    muteOnWrongSteps: 4,
  };

  /** Difficulty presets by stage (0-based). Stage 3+ uses a formula. */
  function difficultyForStage(stage) {
    if (stage <= 0) return { min: 1, max: 20, mode: "sub", allowNegative: false };
    if (stage === 1) return { min: 1, max: 30, mode: "mix", allowNegative: false };
    if (stage === 2) return { min: 2, max: 30, mode: "mix", allowNegative: false };
    return { min: 2, max: 40 + (stage - 3) * 10, mode: "mix", allowNegative: false };
  }

  // -------------------------
  // DOM
  // -------------------------
  const $id = (id) => document.getElementById(id);
  const el = {
    container: document.querySelector(".container"),
    formula: $id("formula"),

    a: $id("a"),
    op: $id("op"),
    b: $id("b"),
    answer: $id("answer"),

    check: $id("check"),
    reset: $id("reset"),

    correctTotal: $id("correctTotal"),
    drumLevelLabel: $id("drumLevelLabel"),

    drumToggle: $id("drumToggle"),
    soundToggle: $id("soundToggle"),

    correctSound: $id("correctSound"),
    wrongSound: $id("wrongSound"),
    bgmSwitchSound: $id("bgmSwitchSound"),
    stageClearSound: $id("stageClearSound"),

    helpBtn: $id("helpBtn"),
    helpModal: $id("helpModal"),
    helpClose: $id("helpClose"),
  };

  const hasCoreDom =
    el.container &&
    el.formula &&
    el.a && el.op && el.b &&
    el.answer &&
    el.check &&
    el.reset;

  if (!hasCoreDom) return;

  // -------------------------
  // State
  // -------------------------
  const state = {
    // Problem
    currentAnswer: 0,

    // Score
    correctTotal: 0,
    stageCorrect: 0,      // per stage
    difficultyStage: 0,   // 0-based

    // Beat
    drumLevel: 0,         // 0=kick, 1=kick+hihat, 2=kick+hihat+snare
    bgmStage: 0,

    // NEW: mute next steps (on wrong)
    muteSteps: 0,

    // Transport
    step: 0,
    barCounter: 0,

    // Sound
    soundEnabled: false,  // SFX default OFF

    // Derived config
    diff: difficultyForStage(0),
  };

  // -------------------------
  // Utilities (pure)
  // -------------------------
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function parseAnswer(raw) {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    if (!/^-?\d+$/.test(s)) return NaN;
    return Number(s);
  }

  function pickMode() {
    if (state.diff.mode !== "mix") return state.diff.mode;

    // Gate operations by difficulty stage (game feel)
    const s = state.difficultyStage;
    const modes =
      s <= 0 ? ["sub"] :
        s === 1 ? ["add", "sub"] :
          s === 2 ? ["add", "sub", "mul"] :
            ["add", "sub", "mul", "div"];

    return modes[randInt(0, modes.length - 1)];
  }

  function buildProblem() {
    const mode = pickMode();
    let a = randInt(state.diff.min, state.diff.max);
    let b = randInt(state.diff.min, state.diff.max);

    if (mode === "add") return { a, b, op: "+", answer: a + b };

    if (mode === "sub") {
      if (!state.diff.allowNegative && a < b) [a, b] = [b, a];
      return { a, b, op: "−", answer: a - b };
    }

    if (mode === "mul") return { a, b, op: "×", answer: a * b };

    if (mode === "div") {
      // Build a divisible pair: a ÷ b = k
      const k = randInt(state.diff.min, state.diff.max);
      b = randInt(state.diff.min, state.diff.max);
      a = b * k;
      return { a, b, op: "÷", answer: k };
    }

    return { a, b, op: "+", answer: a + b };
  }

  function computeDrumLevel(stageCorrect) {
    if (stageCorrect >= SETTINGS.unlockSnareAt) return 2;
    if (stageCorrect >= SETTINGS.unlockHihatAt) return 1;
    return 0;
  }

  function computeBgmStage(stageCorrect) {
    const stage = Math.floor(stageCorrect / SETTINGS.bgmSwitchEveryCorrect);
    return Math.min(stage, SETTINGS.bgmStageMax);
  }

  // -------------------------
  // DOM helpers
  // -------------------------
  // NEW: batch retrigger across multiple elements with a single layout flush
  // entries: Array<[Element, string[]]>
  function retriggerEffectsBatch(entries, flushEl = document.body) {
    // 1) remove all
    for (const [node, classNames] of entries) {
      for (const cn of classNames) node.classList.remove(cn);
    }

    // 2) single forced layout flush (one reflow)
    void flushEl.offsetWidth;

    // 3) add all back
    for (const [node, classNames] of entries) {
      for (const cn of classNames) node.classList.add(cn);
    }
  }

  // NEW: batch retrigger to force reflow only once per event
  function retriggerClasses(target, classNames) {
    // remove first
    for (const cn of classNames) target.classList.remove(cn);

    // Force single reflow
    void target.offsetWidth;

    // add back
    for (const cn of classNames) target.classList.add(cn);
  }

  function focusAnswer({ select = false } = {}) {
    el.answer.focus();
    if (select) el.answer.select();
  }

  function renderStats() {
    if (el.correctTotal) el.correctTotal.textContent = String(state.correctTotal);

    if (el.drumLevelLabel) {
      el.drumLevelLabel.textContent =
        state.drumLevel === 0 ? "KICK" :
          state.drumLevel === 1 ? "K+HAT" :
            "K+H+SNR";
    }
  }

  function renderSoundToggle() {
    if (!el.soundToggle) return;
    // Button label expresses the next action.
    el.soundToggle.textContent = state.soundEnabled ? "SFX OFF" : "SFX ON";
  }

  function renderProblem(p) {
    el.a.textContent = String(p.a);
    el.op.textContent = p.op;
    el.b.textContent = String(p.b);
    el.answer.value = "";
    focusAnswer();
  }

  function showRetryText() {
    let elRetry = el.formula.querySelector(".retry-text");

    if (!elRetry) {
      elRetry = document.createElement("div");
      elRetry.className = "retry-text";
      elRetry.textContent = "try again";
      el.formula.appendChild(elRetry);
    }

    // NOTE: animation retrigger is handled in playWrongFx() as a batch
  }

  // -------------------------
  // Audio helpers (side effects)
  // -------------------------
  function safePlay(audioEl) {
    if (!audioEl) return;
    try {
      audioEl.currentTime = 0;
      const p = audioEl.play();
      if (p && typeof p.catch === "function") p.catch(() => { });
    } catch {
      // Ignore autoplay/platform restrictions.
    }
  }

  function safePlaySfx(audioEl) {
    if (!state.soundEnabled) return;
    safePlay(audioEl);
  }

  function playCorrectFx() {
    retriggerClasses(el.formula, ["flash-ok", "scan"]);
    safePlaySfx(el.correctSound);
  }

  function playWrongFx() {
    showRetryText(); // DOM準備だけ（ここではreflowしない）

    retriggerClasses(el.formula, ["flash-ng", "shake", "show-retry"]);
    safePlaySfx(el.wrongSound);

    // NEW: mute next beat only when SFX is enabled and BGM is running
    if (state.soundEnabled && drum.isRunning()) {
      state.muteSteps = SETTINGS.muteOnWrongSteps;
    }
  }

  function playBgmSwitchSe() {
    safePlaySfx(el.bgmSwitchSound);
  }

  function playStageClearSe() {
    safePlaySfx(el.stageClearSound);
  }

  // -------------------------
  // Low-spec mode (auto)
  // -------------------------
  function applyLowSpecMode() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowCpu = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
    if (reducedMotion || lowCpu) document.body.classList.add("low-spec");
  }

  // -------------------------
  // Drum engine (Web Audio)
  // -------------------------
  function createDrumEngine() {
    let audioCtx = null;
    let timerId = null;
    let running = false;
    let nextTime = 0;

    let noiseHatBuf = null;
    let noiseSnareBuf = null;

    const ensureCtx = () => {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx;
    };

    const isRunning = () => running;

    const makeNoiseBuffer = (durationSec) => {
      const ctx = ensureCtx();
      const sr = ctx.sampleRate;
      const len = Math.max(1, Math.floor(sr * durationSec));
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
      return buf;
    };

    const playKick = (time) => {
      const ctx = ensureCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(55, time + 0.06);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.2);
    };

    const playHihat = (time) => {
      const ctx = ensureCtx();
      const src = ctx.createBufferSource();
      if (!noiseHatBuf) noiseHatBuf = makeNoiseBuffer(0.05);
      src.buffer = noiseHatBuf;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(7000, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.35, time + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

      src.connect(hp);
      hp.connect(gain);
      gain.connect(ctx.destination);

      src.start(time);
      src.stop(time + 0.06);
    };

    const playSnare = (time) => {
      const ctx = ensureCtx();

      const src = ctx.createBufferSource();
      if (!noiseSnareBuf) noiseSnareBuf = makeNoiseBuffer(0.12);
      src.buffer = noiseSnareBuf;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1800, time);
      bp.Q.setValueAtTime(0.7, time);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, time);
      ng.gain.exponentialRampToValueAtTime(0.6, time + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

      src.connect(bp);
      bp.connect(ng);

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, time);

      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.0001, time);
      tg.gain.exponentialRampToValueAtTime(0.25, time + 0.003);
      tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);

      osc.connect(tg);

      const mix = ctx.createGain();
      mix.gain.setValueAtTime(0.8, time);

      ng.connect(mix);
      tg.connect(mix);
      mix.connect(ctx.destination);

      src.start(time);
      src.stop(time + 0.13);

      osc.start(time);
      osc.stop(time + 0.08);
    };

    // UI pulse queue (per step -> single timer)
    let uiPulseTimer = null;
    let uiPulseHits = { kick: false, snare: false };

    function queueUiPulse(time, hits) {
      // Merge hits for this step/time
      uiPulseHits.kick = uiPulseHits.kick || !!hits.kick;
      uiPulseHits.snare = uiPulseHits.snare || !!hits.snare;

      // Ensure only one timer is scheduled
      if (uiPulseTimer != null) return;

      const ctx = ensureCtx();
      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);

      uiPulseTimer = window.setTimeout(() => {
        uiPulseTimer = null;
        if (!running) {
          uiPulseHits = { kick: false, snare: false };
          return;
        }

        const bodyClasses = [];
        const containerClasses = [];

        if (uiPulseHits.kick) {
          bodyClasses.push("bg-kick");
          containerClasses.push("ui-kick");
        }
        if (uiPulseHits.snare) {
          bodyClasses.push("scan-snare");
          containerClasses.push("ui-snare");
        }

        uiPulseHits = { kick: false, snare: false };

        const entries = [];
        if (bodyClasses.length) entries.push([document.body, bodyClasses]);
        if (containerClasses.length) entries.push([el.container, containerClasses]);

        retriggerEffectsBatch(entries, document.body);
      }, delayMs);
    }

    const scheduleStep = (time) => {
      // mute handling (そのままでOK)
      if (state.muteSteps > 0) {
        state.muteSteps -= 1;

        state.step += 1;
        if (state.step >= SETTINGS.stepsPerBar) {
          state.step = 0;
          state.barCounter = (state.barCounter + 1) % SETTINGS.barsCycle;
        }
        return;
      }

      const stage = state.bgmStage;

      const kickHit =
        (state.step % 4 === 0) ||
        (stage >= 1 && (state.step === 10 || state.step === 14)) ||
        (stage >= 2 && state.step === 7) ||
        (stage >= 3 && (state.step === 3 || state.step === 11));

      if (kickHit) playKick(time);

      if (state.drumLevel >= 1) {
        const hatHit = stage >= 3 ? true : (state.step % 2 === 0);
        if (hatHit) playHihat(time);
      }

      let snareHit = false;
      if (state.drumLevel >= 2) {
        snareHit = (state.step === 4 || state.step === 12);
        if (stage >= 3 && state.step === 15 && (state.barCounter % 4 === 3)) snareHit = true;

        if (snareHit) playSnare(time);
      }

      // UI pulses: single timer per step (kick-onlyでも動く)
      if (kickHit || snareHit) {
        queueUiPulse(time, { kick: kickHit, snare: snareHit });
      }

      state.step += 1;
      if (state.step >= SETTINGS.stepsPerBar) {
        state.step = 0;
        state.barCounter = (state.barCounter + 1) % SETTINGS.barsCycle;
      }
    };

    const tick = () => {
      const ctx = ensureCtx();
      const secondsPerBeat = 60 / FIXED_BPM;
      const secondsPerStep = secondsPerBeat / 4;

      while (nextTime < ctx.currentTime + SETTINGS.scheduleAheadSec) {
        scheduleStep(nextTime);
        nextTime += secondsPerStep;
      }
    };

    const start = async () => {
      const ctx = ensureCtx();
      if (ctx.state === "suspended") await ctx.resume();
      if (running) return;

      running = true;
      if (el.drumToggle) el.drumToggle.textContent = "BGM OFF";

      nextTime = ctx.currentTime + 0.05;
      timerId = window.setInterval(tick, SETTINGS.lookaheadMs);
    };

    const stop = () => {
      if (timerId) window.clearInterval(timerId);
      timerId = null;
      running = false;
      if (el.drumToggle) el.drumToggle.textContent = "BGM ON";
      if (uiPulseTimer != null) window.clearTimeout(uiPulseTimer);
      uiPulseTimer = null;
      uiPulseHits = { kick: false, snare: false };

    };

    const resetTransport = () => {
      state.step = 0;
      state.barCounter = 0;
    };

    return { ensureCtx, isRunning, start, stop, resetTransport };
  }

  const drum = createDrumEngine();

  // -------------------------
  // Game logic
  // -------------------------
  function setBgmStageFromStageCorrect() {
    const next = computeBgmStage(state.stageCorrect);
    if (next === state.bgmStage) return;

    state.bgmStage = next;
    playBgmSwitchSe();
    drum.resetTransport();
  }

  function stageClear() {
    // 1) Increase difficulty
    state.difficultyStage += 1;
    state.diff = difficultyForStage(state.difficultyStage);

    // 2) Reset beat growth (kick-only)
    state.stageCorrect = 0;
    state.drumLevel = 0;
    state.bgmStage = 0;
    drum.resetTransport();

    // 3) Cue
    playStageClearSe();
  }

  function updateOnCorrect() {
    state.correctTotal += 1;
    state.stageCorrect += 1;

    // Beat growth within the current stage
    state.drumLevel = computeDrumLevel(state.stageCorrect);
    setBgmStageFromStageCorrect();

    // Stage clear every N correct (global score)
    if (state.correctTotal % SETTINGS.stageClearEveryCorrect === 0) {
      stageClear();
    }

    renderStats();
  }

  function resetProgression() {
    state.correctTotal = 0;
    state.stageCorrect = 0;
    state.difficultyStage = 0;
    state.diff = difficultyForStage(0);

    state.drumLevel = 0;
    state.bgmStage = 0;
    drum.resetTransport();

    document.body.classList.remove("bg-kick", "scan-snare");
    el.container.classList.remove("ui-kick", "ui-snare");

    renderStats();
  }

  function newProblem() {
    const p = buildProblem();
    state.currentAnswer = p.answer;
    renderProblem(p);
  }

  function checkAnswer() {
    const v = parseAnswer(el.answer.value);

    // Empty or invalid input: do not advance.
    if (v === null || Number.isNaN(v)) {
      focusAnswer({ select: true });
      return;
    }

    if (v === state.currentAnswer) {
      updateOnCorrect();
      playCorrectFx();
      window.setTimeout(newProblem, SETTINGS.nextDelayMs);
      return;
    }

    // Wrong: reset progression and keep re-try on the same next problem.
    resetProgression();
    playWrongFx();
    focusAnswer({ select: true });
  }

  function resetAll() {
    resetProgression();
    newProblem();
  }

  // -------------------------
  // Help modal
  // -------------------------
  function openHelp() {
    if (!el.helpModal) return;
    el.helpModal.hidden = false;
    if (el.helpClose) el.helpClose.focus();
  }

  function closeHelp() {
    if (!el.helpModal) return;
    el.helpModal.hidden = true;
    if (el.helpBtn) el.helpBtn.focus();
  }

  // -------------------------
  // Events
  // -------------------------
  el.check.addEventListener("click", checkAnswer);
  el.reset.addEventListener("click", resetAll);

  el.answer.addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkAnswer();
  });

  if (el.drumToggle) {
    el.drumToggle.addEventListener("click", async () => {
      drum.ensureCtx();
      if (!drum.isRunning()) await drum.start();
      else drum.stop();
    });
  }

  if (el.soundToggle) {
    el.soundToggle.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      renderSoundToggle();

      // Prime audio on the first user gesture (Safari/iOS friendly). Failure is harmless.
      if (state.soundEnabled) safePlay(el.bgmSwitchSound);
    });
  }

  if (el.helpBtn && el.helpModal) el.helpBtn.addEventListener("click", openHelp);
  if (el.helpClose) el.helpClose.addEventListener("click", closeHelp);

  if (el.helpModal) {
    // Click outside the panel
    el.helpModal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.matches && t.matches("[data-close='true']")) closeHelp();
    });

    // Esc key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.helpModal.hidden) closeHelp();
    });
  }

  // -------------------------
  // Init
  // -------------------------
  applyLowSpecMode();

  state.drumLevel = computeDrumLevel(state.stageCorrect);
  state.bgmStage = computeBgmStage(state.stageCorrect);

  renderStats();
  renderSoundToggle();
  newProblem();
})();

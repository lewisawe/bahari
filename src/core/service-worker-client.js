const listeners = new Set();
const state = {
  supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  registration: null,
  waiting: null,
  updateReady: false,
  applying: false,
  error: null,
};

let registrationPromise = null;

export function subscribeUpdateState(listener) {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function getUpdateState() {
  return { ...state };
}

export function registerServiceWorker() {
  if (!state.supported) return Promise.resolve({ ...state });
  if (registrationPromise) return registrationPromise;
  registrationPromise = register().catch(() => {
    setState({ error: 'register' });
    return { ...state };
  });
  return registrationPromise;
}

async function register() {
  const appBase = new URL(import.meta.env.BASE_URL, document.baseURI);
  const swUrl = new URL('sw.js', appBase);
  const registration = await navigator.serviceWorker.register(swUrl, { scope: appBase.pathname });
  setState({ registration, waiting: registration.waiting, updateReady: Boolean(registration.waiting), error: null });

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        setState({ waiting: registration.waiting || installing, updateReady: true });
      }
    });
  });

  await announceAppReady();
  return { ...state };
}

export async function applyWaitingUpdate({ flushLatestSnapshot, activeRecordId, isLatestSnapshot } = {}) {
  const worker = state.waiting;
  if (!worker || typeof flushLatestSnapshot !== 'function') return false;
  setState({ applying: true, error: null });

  let flushed;
  try {
    flushed = await flushLatestSnapshot();
  } catch {
    setState({ applying: false, updateReady: true });
    return false;
  }
  if (
    !flushed?.durable ||
    (activeRecordId && (flushed.recordId !== activeRecordId || !flushed.fingerprint)) ||
    (typeof isLatestSnapshot === 'function' && !isLatestSnapshot(flushed))
  ) {
    setState({ applying: false, updateReady: true });
    return false;
  }

  try {
    await waitForActivation(worker);
  } catch {
    setState({ applying: false, updateReady: true, error: 'activate-timeout' });
    return false;
  }

  const appBase = new URL(import.meta.env.BASE_URL, document.baseURI);
  const next = new URL(appBase.href);
  if (flushed.recordId) next.searchParams.set('resume', flushed.recordId);
  location.assign(next.href);
  return true;
}

function waitForActivation(worker) {
  return new Promise((resolve, reject) => {
    if (worker.state === 'activated') return resolve();
    const timeout = setTimeout(() => {
      worker.removeEventListener('statechange', onStateChange);
      reject(new Error('activate-timeout'));
    }, 10_000);
    function onStateChange() {
      if (worker !== state.waiting && state.waiting !== null) return;
      if (worker.state === 'activated') {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', onStateChange);
        resolve();
      }
    }
    worker.addEventListener('statechange', onStateChange);
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
}

async function announceAppReady() {
  const registration = await navigator.serviceWorker.ready;
  const controller = navigator.serviceWorker.controller;
  if (!registration || !controller) return false;
  const buildId = await requestBuildId(controller);
  if (!/^[a-f0-9]{16}$/.test(buildId || '')) return false;
  controller.postMessage({ type: 'APP_READY', buildId });
  return true;
}

function requestBuildId(controller) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(null);
    }, 2_000);
    function onMessage(event) {
      if (event.source !== controller || event.data?.type !== 'BUILD_ID') return;
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(event.data.buildId);
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    controller.postMessage({ type: 'GET_BUILD_ID' });
  });
}

function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener({ ...state });
}

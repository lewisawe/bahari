import React from 'react';
import { useT } from '../i18n/I18n.jsx';

export default function DeviceStatus({ online, durable, unsaved, mode, warning, updateState, updateFailure, onApplyUpdate }) {
  const { t } = useT();
  let message = null;
  let tone = 'text-ash';
  if (!online) { message = t('device.offline'); tone = 'text-health-fair'; }
  else if (updateFailure) { message = t('device.updateFailed'); tone = 'text-health-fair'; }
  else if (warning || mode !== 'indexeddb') { message = t('device.reduced'); tone = 'text-health-fair'; }
  else if (updateState?.updateReady) { message = updateState.applying ? t('device.updating') : t('device.updateReady'); tone = 'text-accent'; }
  else if (unsaved) { message = t('device.unsaved'); tone = 'text-health-fair'; }
  else if (durable) { message = t('device.saved'); tone = 'text-health-good'; }
  if (!message) return null;

  return (
    <div className="border-b border-steel bg-section px-5">
      <div className="mx-auto flex min-h-11 max-w-5xl items-center justify-between gap-3 py-1.5">
        <p className={`font-mono text-[11px] uppercase tracking-code ${tone}`} aria-live="polite" aria-atomic="true">{message}</p>
        {updateState?.updateReady && !updateState.applying && <button type="button" onClick={onApplyUpdate} className="min-h-11 rounded border border-accent/60 px-3 text-xs font-medium text-accent hover:bg-accent/10">{t('device.applyUpdate')}</button>}
      </div>
    </div>
  );
}

export const API_URL = "https://matelogicbd.elmatelogic.workers.dev/";

const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function getCurrentMadridDateShort() {
  const [y, m, d] = LOCAL_DATE_FORMATTER.format(new Date()).split('-');
  return `${d}/${m}/${y.slice(-2)}`;
}

export function showToast(msg, tipus = 'success') {
  const cont = document.getElementById('toast-container');
  if (!cont) return;
  const t = document.createElement('div');
  t.setAttribute('role', 'status');
  t.className = `px-4 py-2 rounded-full text-xs font-bold text-white shadow-lg transition-opacity duration-200 ${
    tipus === 'error' ? 'bg-red-600' : tipus === 'warning' ? 'bg-amber-500' : 'bg-emerald-600'
  }`;
  t.innerText = msg;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

let lastFocusedElement = null;
let activeModalId = null;

function handleModalFocusTrap(e) {
  if (!activeModalId || e.key !== 'Tab') return;
  const modal = document.getElementById(activeModalId);
  if (!modal || modal.classList.contains('hidden')) return;

  const focusables = Array.from(
    modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter(el => el.offsetParent !== null);

  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first || !modal.contains(document.activeElement)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last || !modal.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }
}

document.addEventListener('keydown', handleModalFocusTrap);

export function openAccessibleModal(id, onBeforeOpen = null) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocusedElement = document.activeElement;
  activeModalId = id;
  document.body.classList.add('overflow-hidden');

  if (typeof onBeforeOpen === 'function') {
    onBeforeOpen();
  }

  modal.classList.remove('hidden');

  const focusables = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusables.length > 0) {
    setTimeout(() => focusables[0].focus(), 10);
  }
}

export function closeAccessibleModal(id, keepBodyLocked = false) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  if (!keepBodyLocked) {
    document.body.classList.remove('overflow-hidden');
  }
  if (activeModalId === id) {
    activeModalId = null;
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    setTimeout(() => lastFocusedElement.focus(), 10);
  }
}

export function bindLongPressDelete(buttonId, onSingleDelete, onClearAll) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  let pressTimer = null;
  let isLongPress = false;

  const startPress = () => {
    isLongPress = false;
    pressTimer = setTimeout(() => {
      isLongPress = true;
      onClearAll();
    }, 500);
  };

  const endPress = (e) => {
    clearTimeout(pressTimer);
    if (!isLongPress && e.type !== 'mouseleave') {
      onSingleDelete();
    }
  };

  btn.addEventListener('mousedown', startPress);
  btn.addEventListener('mouseup', endPress);
  btn.addEventListener('mouseleave', () => clearTimeout(pressTimer));
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); startPress(); }, { passive: false });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); endPress(e); }, { passive: false });
}

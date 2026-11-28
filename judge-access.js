/* Общий пароль проверяется только сервером. В браузере хранится временный сеанс. */
(() => {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbxMbD8_jmuw2TusVmS2a4N-enmPLJPehm7N5rsbeVqCEn-9LTCy_rOpANj0YHhU3AZ6lg/exec';
  const key = 'gto_judge_session_v1';
  let session = '', verifiedAt = 0, generation = 0;
  try { session = sessionStorage.getItem(key) || ''; } catch (_) {}
  const dialog = document.getElementById('judgeLogin');
  const form = document.getElementById('judgeLoginForm');
  const password = document.getElementById('judgePassword');
  const message = document.getElementById('judgeLoginMessage');
  const button = form.querySelector('button[type="submit"]');
  const buttonLabel = button.querySelector('span');
  const controls = form.querySelector('.pin-controls');
  const keyboardToggle = document.getElementById('judgeKeyboardToggle');
  const indicators = document.getElementById('judgePasswordIndicators');
  const passwordCount = document.getElementById('judgePasswordCount');
  function updateIndicators() {
    const count = Array.from(password.value).length;
    const dots = Array.from({length: count}, () => {
      const dot = document.createElement('span');
      dot.className = 'pin-dot';
      return dot;
    });
    indicators.replaceChildren(...dots);
    passwordCount.textContent = `Введено символов: ${count}`;
  }
  password.addEventListener('input', updateIndicators);
  password.addEventListener('change', updateIndicators);
  updateIndicators();
  form.querySelector('.pin-keypad').addEventListener('click', event => {
    const key = event.target.closest('button');
    if (!key || controls.disabled) return;
    const start = password.selectionStart ?? password.value.length;
    const end = password.selectionEnd ?? start;
    if (key.dataset.key === 'clear') {
      password.value = '';
      password.setSelectionRange(0, 0);
    } else if (key.dataset.key === 'backspace') {
      password.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
    } else {
      password.setRangeText(key.dataset.digit, start, end, 'end');
    }
    password.dispatchEvent(new Event('input', {bubbles: true}));
    password.focus({preventScroll: true});
  });
  keyboardToggle.addEventListener('click', () => {
    const useKeyboard = password.inputMode === 'none';
    password.inputMode = useKeyboard ? 'text' : 'none';
    form.classList.toggle('use-keyboard', useKeyboard);
    keyboardToggle.setAttribute('aria-pressed', String(useKeyboard));
    keyboardToggle.textContent = useKeyboard ? 'Использовать кнопки на экране' : 'Ввести с клавиатуры';
    password.focus({preventScroll: true});
  });
  const app = document.getElementById('judgeApp');
  function lock(reason, clear = true) {
    generation++;
    verifiedAt = 0;
    if (clear) {
      session = '';
      try { sessionStorage.removeItem(key); } catch (_) {}
    }
    document.body.classList.add('judge-locked');
    app.inert = true;
    dialog.hidden = false;
    message.textContent = reason || 'Введите общий пароль судей';
  }
  function unlock() {
    verifiedAt = Date.now();
    app.inert = false;
    dialog.hidden = true;
    document.body.classList.remove('judge-locked');
  }
  async function request(url, data) {
    if (!navigator.onLine) throw new Error('Нет интернета. Подключитесь к сети.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
        headers: {'Content-Type': 'text/plain;charset=UTF-8'},
        body: JSON.stringify(data), signal: controller.signal
      });
      if (!response.ok) throw new Error('Сервер недоступен. Повторите попытку.');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function check() {
    if (!session) return;
    const current = generation;
    try {
      const result = await request(endpoint, {action: 'check', session});
      if (current !== generation) return;
      if (!result.ok) { lock('Сеанс завершён. Введите действующий пароль.'); return; }
      unlock();
    } catch (_) {
      if (current === generation) lock('Не удалось проверить доступ. Проверьте интернет и войдите снова.');
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!password.value) return;
    controls.disabled = true;
    form.setAttribute('aria-busy', 'true');
    buttonLabel.textContent = 'Проверяем…';
    message.textContent = 'Проверяем пароль…';
    const current = ++generation;
    try {
      const result = await request(endpoint, {action: 'login', password: password.value});
      if (current !== generation) return;
      if (!result.ok || !result.session) { message.textContent = result.error || 'Вход не выполнен'; return; }
      session = result.session;
      password.value = '';
      updateIndicators();
      try { sessionStorage.setItem(key, session); } catch (_) {}
      unlock();
    } catch (_) {
      if (current === generation) message.textContent = 'Не удалось войти. Проверьте интернет и настройку вебхука.';
    } finally {
      controls.disabled = false;
      buttonLabel.textContent = 'Войти';
      form.removeAttribute('aria-busy');
    }
  });
  window.JudgeAccess = {
    async send(url, payload) {
      if (!session || !verifiedAt || Date.now() - verifiedAt > 40000 || !navigator.onLine) {
        lock('Для сохранения войдите с действующим паролем.');
        throw new Error('Нет действующего доступа. Результат сохранён на этом устройстве.');
      }
      const current = generation;
      try {
        const result = await request(url, {...payload, session});
        if (result.code === 'AUTH_REQUIRED') lock('Пароль изменён или сеанс истёк. Войдите снова.');
        if (current !== generation || !(result.ok === true || result.status === 'ok')) {
          throw new Error(result.error || result.message || 'Запись в таблицу не подтверждена');
        }
        return result;
      } catch (error) {
        if (!navigator.onLine) lock('Нет интернета. Подключитесь к сети и войдите снова.');
        throw error;
      }
    }
  };
  // Не допускаем работу со старой проверкой после сна телефона/возврата на вкладку.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && session) { lock('Проверяем доступ…', false); check(); }
  });
  window.addEventListener('offline', () => lock('Нет интернета. Подключитесь к сети и войдите снова.'));
  setInterval(check, 30000);
  setInterval(() => { if (verifiedAt && Date.now() - verifiedAt > 40000) lock('Проверка доступа истекла. Войдите снова.'); }, 1000);
  lock(session ? 'Проверяем доступ…' : '', false);
  if (session) check();
})();

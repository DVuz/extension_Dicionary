/**
 * popup.js — VocabPro Settings
 */

const DEFAULTS = {
  translate_direction:  'en-vi',
  translate_engine:     'google',
  gemini_key:           '',
  tts_mode:             'webspeech',
  elevenlabs_keys:      [],   // [{ apiKey, voiceId }]
  show_vn_def:          'show',
};

const DEFAULT_VOICE = 'pNInz6obpgDQGcFmaJgB';

// ── ElevenLabs key list ───────────────────────────────────────────────────────
function renderKeyList(keys) {
  const list = document.getElementById('el-key-list');
  list.innerHTML = '';
  keys.forEach((k, i) => {
    const item = document.createElement('div');
    item.className = 'p-el-item';
    item.innerHTML = `
      <div class="p-el-item-head">
        <span class="p-el-idx">Key ${i + 1}</span>
        <button class="p-rm-btn" data-i="${i}" title="Xóa">✕</button>
      </div>
      <div class="p-row p-key-row" style="margin-bottom:4px">
        <span class="p-label">API Key</span>
        <div class="p-input-wrap" style="width:100%">
          <input type="password" class="p-input el-apikey" data-i="${i}" placeholder="API key…" autocomplete="off" value="${k.apiKey}" />
          <button class="p-eye el-eye" data-i="${i}">👁</button>
        </div>
      </div>
      <div class="p-row">
        <span class="p-label">Voice ID</span>
        <input type="text" class="p-input-full el-voiceid" data-i="${i}" placeholder="${DEFAULT_VOICE}" value="${k.voiceId}" />
      </div>`;
    list.appendChild(item);
  });

  list.querySelectorAll('.p-rm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      keys.splice(Number(btn.dataset.i), 1);
      renderKeyList(keys);
    });
  });
  list.querySelectorAll('.el-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = list.querySelector(`.el-apikey[data-i="${btn.dataset.i}"]`);
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });
}

function collectKeys() {
  return [...document.querySelectorAll('.p-el-item')].map((_, i) => ({
    apiKey:  document.querySelector(`.el-apikey[data-i="${i}"]`)?.value.trim() ?? '',
    voiceId: document.querySelector(`.el-voiceid[data-i="${i}"]`)?.value.trim() || DEFAULT_VOICE,
  })).filter(k => k.apiKey);
}

// ── Toggle group helpers ──────────────────────────────────────────────────────
function setActive(groupId, value) {
  document.querySelectorAll(`#${groupId} .p-tog`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === value);
  });
}

function getActive(groupId) {
  return document.querySelector(`#${groupId} .p-tog.active`)?.dataset.val ?? null;
}

function onToggle(groupId, cb) {
  document.querySelectorAll(`#${groupId} .p-tog`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${groupId} .p-tog`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cb(btn.dataset.val);
    });
  });
}

// ── Eye toggle ────────────────────────────────────────────────────────────────
function eyeToggle(inputId, eyeId) {
  document.getElementById(eyeId).addEventListener('click', () => {
    const el = document.getElementById(inputId);
    el.type = el.type === 'password' ? 'text' : 'password';
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, res => {
  const badge  = document.getElementById('auth-badge');
  const authIn = document.getElementById('auth-in');
  const authOut= document.getElementById('auth-out');

  if (res?.loggedIn) {
    badge.textContent = '● Đã đăng nhập';
    badge.className = 'p-badge ok';
    authIn.style.display  = '';
    authOut.style.display = 'none';
  } else {
    badge.textContent = '● Chưa đăng nhập';
    badge.className = 'p-badge warn';
    authIn.style.display  = 'none';
    authOut.style.display = '';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  chrome.storage.local.remove(['vocab_token', 'vocab_token_time'], () => location.reload());
});

// ── Load settings & render ────────────────────────────────────────────────────
chrome.storage.local.get(Object.keys(DEFAULTS), stored => {
  const s = { ...DEFAULTS, ...stored };

  setActive('dir-grp',    s.translate_direction);
  setActive('engine-grp', s.translate_engine);
  setActive('tts-grp',    s.tts_mode);
  setActive('vndef-grp',  s.show_vn_def);

  document.getElementById('gemini-key').value = s.gemini_key;
  renderKeyList(s.elevenlabs_keys);

  if (s.translate_engine === 'gemini') document.getElementById('gemini-row').style.display = '';
  if (s.tts_mode === 'elevenlabs')     document.getElementById('el-rows').style.display    = '';
});

document.getElementById('el-add-btn').addEventListener('click', () => {
  const keys = collectKeys();
  keys.push({ apiKey: '', voiceId: DEFAULT_VOICE });
  renderKeyList(keys);
});

// ── Toggle interactions ───────────────────────────────────────────────────────
onToggle('engine-grp', val => {
  document.getElementById('gemini-row').style.display = val === 'gemini' ? '' : 'none';
});

onToggle('tts-grp', val => {
  document.getElementById('el-rows').style.display = val === 'elevenlabs' ? '' : 'none';
});

onToggle('dir-grp',   () => {});  // chỉ cần ghi nhận khi save
onToggle('vndef-grp', () => {});

eyeToggle('gemini-key', 'gemini-eye');

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  const settings = {
    translate_direction:  getActive('dir-grp')    ?? 'en-vi',
    translate_engine:     getActive('engine-grp') ?? 'google',
    tts_mode:             getActive('tts-grp')    ?? 'webspeech',
    show_vn_def:          getActive('vndef-grp')  ?? 'show',
    gemini_key:           document.getElementById('gemini-key').value.trim(),
    elevenlabs_keys:      collectKeys(),
  };

  chrome.storage.local.set(settings, () => {
    const msg = document.getElementById('save-msg');
    msg.textContent = '✓ Đã lưu';
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});

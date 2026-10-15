/**
 * content.js — VocabPro
 *
 * 3 tính năng gộp:
 *  1. Double-click từ        → tra từ điển (card định nghĩa)
 *  2. Bôi đen ≥ 2 từ        → toolbar [🔊 Đọc] [🌐 Dịch]
 *  3. Copy (Ctrl+C) bất kỳ  → auto hiện bản dịch
 */

// ── Hằng số ──────────────────────────────────────────────────────────────────
const TTS_MIN_WORDS = 2;
const TTS_MAX_CHARS = 500;

const CEFR_COLOR = {
  A1: '#16a34a', A2: '#65a30d', B1: '#ca8a04',
  B2: '#ea580c', C1: '#dc2626', C2: '#9333ea',
};
const POS_COLOR = {
  noun: '#2563eb', verb: '#059669', adjective: '#7c3aed',
  adverb: '#d97706', preposition: '#db2777', conjunction: '#0891b2',
  pronoun: '#0d9488', default: '#6b7280',
};

// ── Trạng thái ────────────────────────────────────────────────────────────────
let vpCard     = null; // card tra từ
let vpBar      = null; // toolbar (TTS + Dịch)
let vpTrans    = null; // bubble dịch
let currentAudio = null;
let isPlaying  = false;

// ── DOM helpers ──────────────────────────────────────────────────────────────
const removeCard  = () => { vpCard?.remove();  vpCard  = null; };
const removeBar   = () => { vpBar?.remove();   vpBar   = null; stopTTS(); };
const removeTrans = () => { vpTrans?.remove(); vpTrans = null; };

// Guard chống extension context bị invalidate (tab mở trước khi reload extension)
function safeSend(msg, cb) {
  if (!chrome?.runtime?.sendMessage) { cb?.(null); return; }
  try {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) { cb?.(null); return; }
      cb?.(res);
    });
  } catch (_) { cb?.(null); }
}
function safeStorageGet(defaults, cb) {
  if (!chrome?.storage?.local) { cb?.(defaults); return; }
  try { chrome.storage.local.get(defaults, cb); } catch (_) { cb?.(defaults); }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── TTS helpers ───────────────────────────────────────────────────────────────
function stopTTS() {
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  isPlaying = false;
  syncBarUI();
}

function syncBarUI() {
  if (!vpBar) return;
  vpBar.querySelector('.vp-bar-play')?.style && (vpBar.querySelector('.vp-bar-play').style.display = isPlaying ? 'none' : '');
  vpBar.querySelector('.vp-bar-stop')?.style && (vpBar.querySelector('.vp-bar-stop').style.display = isPlaying ? '' : 'none');
}

function playBase64Audio(base64, mimeType) {
  const bytes = new Uint8Array([...atob(base64)].map(c => c.charCodeAt(0)));
  const url   = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  currentAudio = new Audio(url);
  currentAudio.play();
  currentAudio.onended = () => { URL.revokeObjectURL(url); isPlaying = false; syncBarUI(); };
  currentAudio.onerror = () => { isPlaying = false; syncBarUI(); };
}

function webSpeechFallback(text) {
  const utt   = new SpeechSynthesisUtterance(text);
  utt.lang    = 'en-US';
  utt.rate    = 0.95;
  utt.onend   = () => { isPlaying = false; syncBarUI(); };
  utt.onerror = () => { isPlaying = false; syncBarUI(); };
  window.speechSynthesis.speak(utt);
}

function startTTS(text) {
  stopTTS();
  isPlaying = true;
  syncBarUI();
  safeSend({ type: 'TTS_SPEAK', text: text.substring(0, TTS_MAX_CHARS) }, res => {
    if (!res || res.method === 'webspeech') {
      webSpeechFallback(text);
    } else if (res.audioBase64) {
      playBase64Audio(res.audioBase64, res.mimeType || 'audio/mpeg');
    } else {
      webSpeechFallback(text);
    }
  });
}

// ── Translation bubble ────────────────────────────────────────────────────────
function showTranslateBubble(text, anchorRect) {
  removeTrans();

  vpTrans = document.createElement('div');
  vpTrans.className = 'vp-trans';
  vpTrans.innerHTML = `
    <div class="vp-trans-head">
      <span class="vp-trans-loading">
        <svg class="vp-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Đang dịch…
      </span>
      <button class="vp-trans-close">✕</button>
    </div>
    <div class="vp-trans-body"></div>`;

  document.body.appendChild(vpTrans);
  placeBelow(vpTrans, anchorRect);
  vpTrans.querySelector('.vp-trans-close').addEventListener('click', removeTrans);

  safeSend({ type: 'TRANSLATE', text }, res => {
    if (!vpTrans) return;
    const head = vpTrans.querySelector('.vp-trans-head');
    const body = vpTrans.querySelector('.vp-trans-body');

    if (res?.ok) {
      const engineLabel = res.engine === 'gemini' ? '✦ Gemini AI' : '🌐 Google';
      const fallbackNote = res.fallback ? ' <span class="vp-trans-fallback">(fallback)</span>' : '';
      head.innerHTML = `
        <span class="vp-trans-engine">${engineLabel}${fallbackNote}</span>
        <button class="vp-trans-close">✕</button>`;
      body.innerHTML = `<p class="vp-trans-text">${escHtml(res.translated)}</p>`;
      head.querySelector('.vp-trans-close')?.addEventListener('click', removeTrans);
    } else {
      body.innerHTML = `<p class="vp-trans-err">Lỗi: ${escHtml(res?.error ?? 'không xác định')}</p>`;
    }
    // Reposition sau khi có nội dung
    placeBelow(vpTrans, anchorRect);
  });
}

function placeBelow(el, rect) {
  const W   = 320;
  let top  = rect.bottom + window.scrollY + 6;
  let left = rect.left + window.scrollX;
  if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
  if (left < 6) left = 6;
  el.style.top  = top  + 'px';
  el.style.left = left + 'px';
}

// ── Selection Toolbar ─────────────────────────────────────────────────────────
function showBar(selRect, text) {
  removeBar();
  removeTrans();

  vpBar = document.createElement('div');
  vpBar.className = 'vp-bar';
  vpBar.innerHTML = `
    <button class="vp-bar-btn vp-bar-play" title="Đọc to">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    </button>
    <button class="vp-bar-btn vp-bar-stop" style="display:none" title="Dừng">
      <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
        <rect x="5" y="5" width="14" height="14" rx="2"/>
      </svg>
    </button>
    <div class="vp-bar-sep"></div>
    <button class="vp-bar-btn vp-bar-tr" title="Dịch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
        <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/>
        <path d="M2 5h12"/><path d="M7 2h1"/>
        <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
      </svg>
    </button>`;

  document.body.appendChild(vpBar);

  // Đặt toolbar trên vùng bôi đen
  const bW = 108, bH = 38;
  let top  = selRect.top  + window.scrollY - bH - 8;
  let left = selRect.left + window.scrollX + selRect.width / 2 - bW / 2;
  if (top < window.scrollY + 4)       top  = selRect.bottom + window.scrollY + 6;
  if (left + bW > window.innerWidth - 6) left = window.innerWidth - bW - 6;
  if (left < 6) left = 6;
  vpBar.style.top  = top  + 'px';
  vpBar.style.left = left + 'px';

  vpBar.querySelector('.vp-bar-play').addEventListener('click', () => startTTS(text));
  vpBar.querySelector('.vp-bar-stop').addEventListener('click', stopTTS);
  vpBar.querySelector('.vp-bar-tr').addEventListener('click', function () {
    const active = this.classList.toggle('vp-bar-active');
    if (!active) { removeTrans(); return; }
    const barRect = vpBar.getBoundingClientRect();
    const barAbsRect = {
      bottom: barRect.bottom,
      left:   barRect.left,
      right:  barRect.right,
    };
    showTranslateBubble(text, barAbsRect);
  });
}

// ── Word Lookup Card (UI giống extension cũ, vrl- classes) ──────────────────
function makeAudioBtn(url, label) {
  if (!url) return '';
  return `<button class="vrl-audio-btn" data-url="${url}" title="Nghe ${label}">
    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg> ${label}
  </button>`;
}

function buildCard(wordData, x, y, searchedWord, showVnDef = true) {
  removeCard();
  const { word, meanings } = wordData;
  const showAlias = searchedWord && searchedWord.toLowerCase() !== word.toLowerCase();

  const grouped = {};
  for (const m of meanings) {
    (grouped[m.partOfSpeech] = grouped[m.partOfSpeech] || []).push(m);
  }

  let html = `
    <div class="vrl-header">
      <span class="vrl-word">${escHtml(word)}${showAlias ? `<span class="vrl-redirect"> ← ${escHtml(searchedWord)}</span>` : ''}</span>
      <span class="vrl-count">${meanings.length} nghĩa</span>
      <a class="vrl-open-link" href="https://vocab.vtd26.io.vn/search/${encodeURIComponent(word)}" target="_blank" title="Mở trang đầy đủ">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      <button class="vrl-close" title="Đóng">✕</button>
    </div>
    <div class="vrl-body">`;

  for (const [pos, ms] of Object.entries(grouped)) {
    const c = POS_COLOR[pos] ?? POS_COLOR.default;
    html += `<div class="vrl-pos-section">
      <div class="vrl-pos-label" style="color:${c};border-color:${c}20;background:${c}10">${pos}</div>`;
    for (const m of ms) {
      const cc = CEFR_COLOR[m.cefrLevel] ?? '#6b7280';
      html += `<div class="vrl-meaning">
        <div class="vrl-meaning-meta">
          ${m.cefrLevel ? `<span class="vrl-cefr" style="color:${cc};border-color:${cc}30">${m.cefrLevel}</span>` : ''}
          ${m.ipa?.uk   ? `<span class="vrl-ipa">UK /${escHtml(m.ipa.uk)}/ ${makeAudioBtn(m.audio?.uk,'UK')}</span>` : ''}
          ${m.ipa?.us   ? `<span class="vrl-ipa">US /${escHtml(m.ipa.us)}/ ${makeAudioBtn(m.audio?.us,'US')}</span>` : ''}
        </div>
        <p class="vrl-def">${escHtml(m.definition)}</p>
        ${showVnDef && m.vnDefinition ? `<p class="vrl-vn">${escHtml(m.vnDefinition)}</p>` : ''}
        ${m.examples?.[0] ? `<p class="vrl-example">"${escHtml(m.examples[0])}"</p>` : ''}
        <div class="vrl-actions">
          <button class="vrl-save-btn" data-id="${m.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg> Lưu
          </button>
        </div>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  vpCard = document.createElement('div');
  vpCard.id = 'vrl-card';
  vpCard.innerHTML = html;
  positionCard(vpCard, x, y);
  document.body.appendChild(vpCard);
  attachCardEvents(vpCard);
}

function positionCard(el, x, y) {
  const W = 400, H = 480;
  let left = x + 12, top = y + 12;
  if (left + W > window.innerWidth  - 8) left = x - W - 12;
  if (top  + H > window.innerHeight - 8) top  = y - H - 12;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top  = `${Math.max(8, top + window.scrollY)}px`;
}

function attachCardEvents(card) {
  card.querySelector('.vrl-close').addEventListener('click', removeCard);

  card.querySelectorAll('.vrl-audio-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      new Audio(btn.dataset.url).play();
    })
  );

  card.querySelectorAll('.vrl-save-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = '…';
      safeSend({ type: 'SAVE_WORD', meaningId: +btn.dataset.id }, res => {
        if (!res)                                    { btn.textContent = 'Lỗi'; return; }
        if (res.error === 'NOT_LOGGED_IN')          { btn.textContent = 'Cần đăng nhập'; btn.style.color = '#ef4444'; }
        else if (res.error?.includes('Token'))      { btn.textContent = 'Token hết hạn'; btn.style.color = '#ef4444'; }
        else if (res.alreadySaved)                  { btn.textContent = 'Đã lưu ✓'; btn.style.color = '#16a34a'; btn.style.borderColor = '#16a34a'; }
        else if (res.saved)                         { btn.textContent = 'Đã lưu ✓'; btn.style.color = '#16a34a'; btn.style.borderColor = '#16a34a'; }
        else if (res.ok)                            { btn.textContent = 'Đã lưu ✓'; btn.style.color = '#16a34a'; btn.style.borderColor = '#16a34a'; }
        else                                        { btn.textContent = 'Lỗi: ' + (res.error ?? 'không xác định'); btn.style.color = '#ef4444'; }
      });
    })
  );

}

function showWordLoading(x, y, word) {
  removeCard();
  vpCard = document.createElement('div');
  vpCard.id = 'vrl-card';
  vpCard.innerHTML = `
    <div class="vrl-header">
      <span class="vrl-word">${escHtml(word)}</span>
      <button class="vrl-close">✕</button>
    </div>
    <div class="vrl-loading">
      <div class="vrl-spinner"></div>
      <span>Đang tra…</span>
    </div>`;
  positionCard(vpCard, x, y);
  document.body.appendChild(vpCard);
  vpCard.querySelector('.vrl-close').addEventListener('click', removeCard);
}

// ── Event: double-click → tra từ ─────────────────────────────────────────────
document.addEventListener('dblclick', e => {
  if (vpCard?.contains(e.target) || vpBar?.contains(e.target) || vpTrans?.contains(e.target)) return;

  const sel  = window.getSelection();
  const word = sel?.toString().trim() ?? '';
  if (!word || /\s/.test(word) || word.length > 60) return;

  const x = e.clientX, y = e.clientY;
  showWordLoading(x, y, word);

  safeSend({ type: 'LOOKUP_WORD', word }, res => {
    if (!vpCard) return;
    if (res?.ok) {
      safeStorageGet({ show_vn_def: 'show' }, ({ show_vn_def }) => {
        buildCard(res.data, x, y, word, show_vn_def !== 'hide');
      });
    } else {
      // Không tìm thấy → đề nghị dịch nhanh trong card
      const loading = vpCard.querySelector('.vrl-loading');
      if (!loading) return;
      loading.innerHTML = `
        <div style="text-align:center">
          <p style="margin:0 0 10px;color:#9ca3af;font-size:12px">Không có trong từ điển</p>
          <button class="vrl-quick-tr-btn">🌐 Dịch nhanh</button>
        </div>`;
      loading.querySelector('.vrl-quick-tr-btn').addEventListener('click', () => {
        loading.innerHTML = `<div class="vrl-spinner"></div><span>Đang dịch…</span>`;
        safeSend({ type: 'TRANSLATE', text: word }, r => {
          if (!vpCard) return;
          if (r?.ok) {
            loading.innerHTML = `
              <div style="text-align:center">
                <p style="font-size:15px;color:#111827;margin:0 0 5px;font-weight:600">${escHtml(r.translated)}</p>
                <p style="font-size:11px;color:#9ca3af;margin:0">${r.engine === 'gemini' ? '✦ Gemini AI' : '🌐 Google'}</p>
              </div>`;
          } else {
            loading.innerHTML = `<p style="color:#ef4444;font-size:12px">Lỗi dịch</p>`;
          }
        });
      });
    }
  });
});

// ── Event: mouseup → toolbar TTS + Dịch ────────────────────────────────────
document.addEventListener('mouseup', e => {
  if (vpBar?.contains(e.target) || vpTrans?.contains(e.target) || vpCard?.contains(e.target)) return;
  setTimeout(() => {
    const sel   = window.getSelection();
    const text  = sel?.toString().trim() ?? '';
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (text && words >= TTS_MIN_WORDS) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showBar(rect, text);
    } else if (!text) {
      removeBar();
      removeTrans();
    }
  }, 30);
});

// ── Event: copy (Ctrl+C) → auto dịch ───────────────────────────────────────
document.addEventListener('copy', () => {
  const sel  = window.getSelection();
  const text = sel?.toString().trim() ?? '';
  if (!text || text.length > 2000) return;

  setTimeout(() => {
    if (vpBar) {
      // Toolbar đang hiện → show dịch dưới toolbar
      const rect = vpBar.getBoundingClientRect();
      showTranslateBubble(text, { bottom: rect.bottom, left: rect.left });
      vpBar.querySelector('.vp-bar-tr')?.classList.add('vp-bar-active');
    } else {
      // Không có toolbar → show bubble tại vị trí selection
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (!range) return;
      const rect = range.getBoundingClientRect();
      showTranslateBubble(text, {
        bottom: rect.bottom,
        left:   rect.left,
      });
    }
  }, 50);
});

// ── Event: click ngoài → đóng ────────────────────────────────────────────────
document.addEventListener('mousedown', e => {
  if (vpCard  && !vpCard.contains(e.target))  removeCard();
  if (vpBar   && !vpBar.contains(e.target) && !vpTrans?.contains(e.target)) {
    removeBar();
    removeTrans();
  }
});

window.addEventListener('scroll', () => { removeBar(); removeTrans(); }, { passive: true });

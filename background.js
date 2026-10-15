/**
 * background.js — VocabPro Service Worker (MV3)
 *
 * Message handlers:
 *  LOOKUP_WORD     → tra từ từ API backend
 *  SAVE_WORD       → lưu meaning vào vocab của user
 *  TTS_SPEAK       → ElevenLabs API hoặc fallback WebSpeech
 *  TRANSLATE       → Google Translate hoặc Gemini AI
 *  GET_AUTH_STATUS → kiểm tra token còn hiệu lực không
 */

const API_BASE = 'https://vocabbe.vtd26.io.vn/api';
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam - US Male

// ── Auth ─────────────────────────────────────────────────────────────────────
async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['vocab_token', 'vocab_token_time'], result => {
      const { vocab_token, vocab_token_time } = result;
      if (
        vocab_token &&
        vocab_token_time &&
        Date.now() - vocab_token_time < 30 * 24 * 3600 * 1000
      ) {
        resolve(vocab_token);
      } else {
        resolve(null);
      }
    });
  });
}

// ── Word Lookup ──────────────────────────────────────────────────────────────
async function lookupWord(word) {
  const res = await fetch(`${API_BASE}/words/${encodeURIComponent(word)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message ?? 'Không tìm thấy từ');
  return json.data;
}

// ── Save Word ────────────────────────────────────────────────────────────────
async function saveWord(meaningId, token) {
  const res = await fetch(`${API_BASE}/user-words`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ meaningId }),
  });
  const json = await res.json();
  
  // Handle 401 Unauthorized — token expired or invalid
  if (res.status === 401) {
    throw new Error('Token hết hạn. Vui lòng đăng nhập lại.');
  }
  
  // Handle 409 Conflict — user already saved this word
  if (res.status === 409) {
    return { alreadySaved: true };
  }
  
  // Handle success — status 201 Created
  if (res.status === 201) {
    return { saved: true };
  }
  
  // Handle other errors
  throw new Error(json.message ?? `Lưu thất bại (${res.status})`);
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const TTS_CACHE_TTL  = 30 * 24 * 3600 * 1000; // 30 ngày — audio không đổi
const WORD_CACHE_TTL =  7 * 24 * 3600 * 1000; //  7 ngày — data từ điển có thể cập nhật

function ttsStoreKey(text, voiceId) {
  // Key an toàn cho chrome.storage: prefix + lowercase + cắt 300 ký tự
  return `tts_c::${voiceId}::${text.toLowerCase().trim().slice(0, 300)}`;
}
function wordStoreKey(word) {
  return `word_c::${word.toLowerCase().trim()}`;
}

function getCachedTTS(text, voiceId) {
  return new Promise(resolve => {
    const key = ttsStoreKey(text, voiceId);
    chrome.storage.local.get([key], result => {
      const entry = result[key];
      if (entry && Date.now() - entry.cachedAt < TTS_CACHE_TTL) {
        resolve(entry);
      } else {
        if (entry) chrome.storage.local.remove([key]); // hết hạn → dọn ngay
        resolve(null);
      }
    });
  });
}
function setCachedTTS(text, voiceId, audioData) {
  const key = ttsStoreKey(text, voiceId);
  chrome.storage.local.set({ [key]: { ...audioData, cachedAt: Date.now() } });
}

function getCachedWord(word) {
  return new Promise(resolve => {
    const key = wordStoreKey(word);
    chrome.storage.local.get([key], result => {
      const entry = result[key];
      if (entry && Date.now() - entry.cachedAt < WORD_CACHE_TTL) {
        resolve(entry.data);
      } else {
        if (entry) chrome.storage.local.remove([key]);
        resolve(null);
      }
    });
  });
}
function setCachedWord(word, data) {
  const key = wordStoreKey(word);
  chrome.storage.local.set({ [key]: { data, cachedAt: Date.now() } });
}

// ── TTS — ElevenLabs ─────────────────────────────────────────────────────────
function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function callElevenLabs(text, apiKey, voiceId) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text.substring(0, 500),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs ${resp.status}: ${err.slice(0, 150)}`);
  }
  const buffer = await resp.arrayBuffer();
  return { audioBase64: bufferToBase64(buffer), mimeType: 'audio/mpeg' };
}

// ── Translation — Google Translate (free endpoint) ──────────────────────────
async function translateGoogle(text, from, to) {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);
  const data = await res.json();
  // data[0] = [[translated_chunk, original_chunk], ...]
  return data[0].map(item => item[0]).filter(Boolean).join('');
}

// ── Translation — Gemini AI ──────────────────────────────────────────────────
async function translateGemini(text, from, to, apiKey) {
  const fromLabel = from === 'en' ? 'English' : 'Vietnamese';
  const toLabel   = to   === 'vi' ? 'Vietnamese' : 'English';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text:
              `Translate the following ${fromLabel} text to ${toLabel}.\n` +
              `Return ONLY the translation — no explanation, no quotes, no extra text:\n\n${text}`,
          }],
        }],
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 150)}`);
  }
  const data   = await res.json();
  const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!result) throw new Error('Gemini trả về kết quả rỗng');
  return result;
}

// ── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ── Tra từ ──────────────────────────────────────────────────────────────
  if (msg.type === 'LOOKUP_WORD') {
    (async () => {
      try {
        // Kiểm tra cache trước
        const cached = await getCachedWord(msg.word);
        if (cached) {
          sendResponse({ ok: true, data: cached, fromCache: true });
          return;
        }
        const data = await lookupWord(msg.word);
        setCachedWord(msg.word, data); // lưu cache không chặn
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // ── Lưu từ ──────────────────────────────────────────────────────────────
  if (msg.type === 'SAVE_WORD') {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }
        const result = await saveWord(msg.meaningId, token);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // ── TTS ──────────────────────────────────────────────────────────────────
  if (msg.type === 'TTS_SPEAK') {
    chrome.storage.local.get(
      ['tts_mode', 'elevenlabs_keys'],
      async result => {
        const mode = result.tts_mode      ?? 'webspeech';
        const keys = result.elevenlabs_keys ?? [];

        if (mode === 'webspeech' || !keys.length) {
          sendResponse({ method: 'webspeech' });
          return;
        }

        const start = Math.floor(Date.now() / 86400000) % keys.length;
        // Xác định voiceId đầu tiên sẽ được dùng để tra cache
        const firstVoiceId = keys[start]?.voiceId || DEFAULT_VOICE_ID;

        // ── Kiểm tra TTS cache ─────────────────────────────────────────────
        const cached = await getCachedTTS(msg.text, firstVoiceId);
        if (cached) {
          sendResponse({ method: 'elevenlabs', audioBase64: cached.audioBase64, mimeType: cached.mimeType, fromCache: true });
          return;
        }

        // Xoay vòng theo ngày, nếu lỗi thử key tiếp theo
        for (let i = 0; i < keys.length; i++) {
          const { apiKey, voiceId } = keys[(start + i) % keys.length];
          const vid = voiceId || DEFAULT_VOICE_ID;
          try {
            const audio = await callElevenLabs(msg.text, apiKey, vid);
            setCachedTTS(msg.text, vid, audio); // lưu cache không chặn
            sendResponse({ method: 'elevenlabs', ...audio });
            return;
          } catch (_) { /* thử key tiếp */ }
        }
        // Tất cả key đều lỗi → fallback
        sendResponse({ method: 'webspeech', fallbackReason: 'all ElevenLabs keys failed' });
      }
    );
    return true;
  }

  // ── Dịch ─────────────────────────────────────────────────────────────────
  if (msg.type === 'TRANSLATE') {
    chrome.storage.local.get(
      ['translate_engine', 'translate_direction', 'gemini_key'],
      async result => {
        const engine    = result.translate_engine    ?? 'google';
        const direction = result.translate_direction ?? 'en-vi';
        const [from, to] = direction.split('-');
        const geminiKey  = result.gemini_key ?? '';

        try {
          let translated;
          let usedEngine = engine;

          if (engine === 'gemini' && geminiKey) {
            translated = await translateGemini(msg.text, from, to, geminiKey);
          } else {
            translated = await translateGoogle(msg.text, from, to);
            usedEngine = 'google';
          }
          sendResponse({ ok: true, translated, engine: usedEngine });
        } catch (e) {
          // Fallback: nếu Gemini lỗi → thử Google
          try {
            const fallback = await translateGoogle(msg.text, from, to);
            sendResponse({ ok: true, translated: fallback, engine: 'google', fallback: true });
          } catch (e2) {
            sendResponse({ ok: false, error: e2.message });
          }
        }
      }
    );
    return true;
  }

  // ── Auth status ───────────────────────────────────────────────────────────
  if (msg.type === 'GET_AUTH_STATUS') {
    getToken().then(token => sendResponse({ loggedIn: !!token }));
    return true;
  }

  // ── Quản lý cache ─────────────────────────────────────────────────────────
  if (msg.type === 'GET_CACHE_STATS') {
    chrome.storage.local.get(null, all => {
      const keys = Object.keys(all);
      const ttsKeys  = keys.filter(k => k.startsWith('tts_c::'));
      const wordKeys = keys.filter(k => k.startsWith('word_c::'));
      // Ước tính dung lượng (bytes) từ JSON stringify
      let ttsBytes = 0;
      ttsKeys.forEach(k => { ttsBytes += JSON.stringify(all[k]).length; });
      let wordBytes = 0;
      wordKeys.forEach(k => { wordBytes += JSON.stringify(all[k]).length; });
      sendResponse({
        ttsEntries : ttsKeys.length,
        wordEntries: wordKeys.length,
        ttsSizeKB  : Math.round(ttsBytes  / 1024),
        wordSizeKB : Math.round(wordBytes / 1024),
      });
    });
    return true;
  }

  if (msg.type === 'CLEAR_CACHE') {
    // target: 'tts' | 'word' | 'all'
    const target = msg.target ?? 'all';
    chrome.storage.local.get(null, all => {
      const toRemove = Object.keys(all).filter(k =>
        (target === 'all'  && (k.startsWith('tts_c::') || k.startsWith('word_c::'))) ||
        (target === 'tts'  && k.startsWith('tts_c::')) ||
        (target === 'word' && k.startsWith('word_c::'))
      );
      chrome.storage.local.remove(toRemove, () => {
        sendResponse({ ok: true, removed: toRemove.length });
      });
    });
    return true;
  }
});

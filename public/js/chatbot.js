(function () {
  const lang = () => localStorage.getItem('mahira-lang') || 'id';
  const text = {
    id: {
      title: 'Mahira Assistant', subtitle: 'Online - siap bantu pilih bunga',
      placeholder: 'Tulis pertanyaan Anda...',
      greeting: 'Halo! Saya asisten Mahira Flowers. Lagi cari bunga buat suasana hati atau acara tertentu? Cerita aja, saya bantu rekomendasikan. 🌸',
      suggestions: ['Lagi sedih, cocoknya bunga apa?', 'Rekomendasi buat ulang tahun', 'Ada flower box budget 200rb?', 'Cara merawat bunga potong'],
      error: 'Maaf, chatbot lagi ada kendala. Coba lagi sebentar ya.',
    },
    en: {
      title: 'Mahira Assistant', subtitle: 'Online - happy to help you choose',
      placeholder: 'Type your question...',
      greeting: "Hi! I'm Mahira Flowers' assistant. Looking for flowers for a mood or occasion? Tell me and I'll recommend something. 🌸",
      suggestions: ["I'm feeling down, what flowers help?", 'Recommendation for a birthday', 'Flower box under Rp200k?', 'How to care for cut flowers'],
      error: 'Sorry, the chatbot is having trouble. Please try again shortly.',
    }
  };

  let history = [];
  let panelBuilt = false;

  function build() {
    if (panelBuilt) return;
    panelBuilt = true;
    const t = text[lang()] || text.id;

    const toggle = document.createElement('button');
    toggle.className = 'mahira-chat-toggle';
    toggle.setAttribute('aria-label', 'Buka chat asisten');
    toggle.innerHTML = '<i class="fa-solid fa-comment-dots"></i><span class="badge-dot"></span>';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.className = 'mahira-chat-panel';
    panel.innerHTML = `
      <div class="mahira-chat-header">
        <img src="/images/logo.png" alt="Mahira Flowers">
        <div>
          <div class="title">${t.title}</div>
          <div class="subtitle">${t.subtitle}</div>
        </div>
        <button type="button" class="close-chat" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="mahira-chat-messages" id="mahiraChatMessages"></div>
      <div class="mahira-chat-suggestions" id="mahiraChatSuggestions"></div>
      <form class="mahira-chat-input" id="mahiraChatForm">
        <input type="text" id="mahiraChatInput" placeholder="${t.placeholder}" autocomplete="off">
        <button type="submit" aria-label="Kirim"><i class="fa-solid fa-paper-plane"></i></button>
      </form>`;
    document.body.appendChild(panel);

    const messagesEl = panel.querySelector('#mahiraChatMessages');
    const suggestionsEl = panel.querySelector('#mahiraChatSuggestions');
    const form = panel.querySelector('#mahiraChatForm');
    const input = panel.querySelector('#mahiraChatInput');

    function addMessage(role, content) {
      const bubble = document.createElement('div');
      bubble.className = `mahira-chat-msg ${role === 'user' ? 'user' : 'bot'}`;
      bubble.textContent = content;
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    function addTyping() {
      const bubble = document.createElement('div');
      bubble.className = 'mahira-chat-msg bot typing';
      bubble.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    function renderSuggestions() {
      const dict = text[lang()] || text.id;
      suggestionsEl.innerHTML = dict.suggestions.map(s => `<button type="button">${s}</button>`).join('');
      suggestionsEl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => sendMessage(btn.textContent));
      });
    }

    async function sendMessage(text) {
      const message = (text || input.value).trim();
      if (!message) return;
      input.value = '';
      suggestionsEl.innerHTML = '';
      addMessage('user', message);
      history.push({ role: 'user', content: message });
      const typing = addTyping();
      const sendBtn = form.querySelector('button');
      sendBtn.disabled = true;

      try {
        const res = await fetch('/api/chatbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: history.slice(-10), lang: lang() })
        });
        const data = await res.json();
        typing.remove();
        if (!res.ok || !data.success) throw new Error(data.message || (text[lang()] || text.id).error);
        addMessage('bot', data.reply);
        history.push({ role: 'assistant', content: data.reply });
      } catch (err) {
        typing.remove();
        addMessage('bot', err.message || (text[lang()] || text.id).error);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }

    form.addEventListener('submit', e => { e.preventDefault(); sendMessage(); });

    toggle.addEventListener('click', () => {
      panel.classList.add('open');
      toggle.querySelector('.badge-dot')?.remove();
      if (!messagesEl.childElementCount) {
        addMessage('bot', (text[lang()] || text.id).greeting);
        renderSuggestions();
      }
      input.focus();
    });
    panel.querySelector('.close-chat').addEventListener('click', () => panel.classList.remove('open'));

    document.addEventListener('mahira-lang-changed', () => {
      panel.querySelector('.title').textContent = (text[lang()] || text.id).title;
      panel.querySelector('.subtitle').textContent = (text[lang()] || text.id).subtitle;
      input.placeholder = (text[lang()] || text.id).placeholder;
      if (suggestionsEl.childElementCount) renderSuggestions();
    });
  }

  document.addEventListener('DOMContentLoaded', build);
})();

(function () {
  function stack() {
    let el = document.querySelector('.mahira-toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.className = 'mahira-toast-stack';
      document.body.appendChild(el);
    }
    return el;
  }

  const icons = {
    success: 'fa-solid fa-check',
    error: 'fa-solid fa-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-bell'
  };

  function showToast(message, type = 'info', duration = 3800) {
    if (!message) return;
    const box = stack();
    const toast = document.createElement('div');
    toast.className = `mahira-toast ${type}`;
    toast.innerHTML = `<span class="mahira-toast-icon"><i class="${icons[type] || icons.info}"></i></span><span class="mahira-toast-body"></span><button type="button" class="mahira-toast-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>`;
    toast.querySelector('.mahira-toast-body').textContent = message;
    box.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    let timer;
    function dismiss() {
      clearTimeout(timer);
      toast.classList.remove('show');
      toast.classList.add('hide');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }
    toast.querySelector('.mahira-toast-close').addEventListener('click', dismiss);
    timer = setTimeout(dismiss, duration);
    return toast;
  }

  window.showToast = showToast;
  // Ganti alert() bawaan browser dengan toast bergaya, tanpa perlu ubah tiap pemanggil.
  window.alert = function (message) {
    const text = String(message ?? '');
    const lower = text.toLowerCase();
    let type = 'info';
    if (/gagal|error|tidak (valid|ditemukan|sesuai)|salah|wajib diisi/.test(lower)) type = 'error';
    else if (/berhasil|sukses|ditambahkan|selamat/.test(lower)) type = 'success';
    else if (/peringatan|warning|perhatian/.test(lower)) type = 'warning';
    showToast(text, type);
  };
})();

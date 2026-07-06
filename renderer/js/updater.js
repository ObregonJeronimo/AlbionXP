// Renderer side of the auto-updater: shows a non-blocking toast while an update
// downloads, and a "restart to update" button when it's ready.
export function initUpdater() {
  const toast = document.getElementById('update-toast');
  if (!toast || !window.albion?.onUpdateStatus) return;
  const text = toast.querySelector('.ut-text');
  const btn = toast.querySelector('.ut-btn');

  btn.addEventListener('click', () => window.albion.installUpdate());

  window.albion.onUpdateStatus((p) => {
    switch (p.status) {
      case 'available':
        toast.style.display = 'flex';
        btn.style.display = 'none';
        text.textContent = `Actualización ${p.version || ''} disponible, descargando…`;
        break;
      case 'downloading':
        toast.style.display = 'flex';
        btn.style.display = 'none';
        text.textContent = `Descargando actualización… ${p.percent || 0}%`;
        break;
      case 'ready':
        toast.style.display = 'flex';
        text.textContent = `Actualización ${p.version || ''} lista.`;
        btn.style.display = 'inline-block';
        break;
      // 'checking' | 'none' | 'error' → stay silent (no need to nag)
    }
  });
}

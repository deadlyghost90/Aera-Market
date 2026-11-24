/**
 * Scroll-triggered reveal observer for .reveal elements.
 * Loads after page content is stable; no dependency on framework.
 */
(function () {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    });

    // Also observe after async content loads
    if (window.MutationObserver) {
      const mo = new MutationObserver(mutations => {
        mutations.forEach(m => {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              node.classList.contains('reveal') && io.observe(node);
              node.querySelectorAll('.reveal').forEach(el => io.observe(el));
            }
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  } else {
    // Fallback: show everything immediately
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }
})();

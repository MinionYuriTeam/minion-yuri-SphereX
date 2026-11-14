(function () {
  const menuToggle = document.getElementById('menuToggle');
  const navList = document.getElementById('navList');
  const triggers = Array.from(document.querySelectorAll('.nav-link[aria-haspopup="true"]'));

  function closeDropdown(btn) {
    btn.setAttribute('aria-expanded', 'false');
    document.getElementById(btn.getAttribute('aria-controls')).classList.remove('open');
  }
  function openDropdown(btn) {
    closeAllDropdowns();
    btn.setAttribute('aria-expanded', 'true');
    document.getElementById(btn.getAttribute('aria-controls')).classList.add('open');
    const firstLink = document.getElementById(btn.getAttribute('aria-controls')).querySelector('a');
    if (firstLink && document.activeElement === btn) firstLink.focus();
  }
  function closeAllDropdowns() {
    triggers.forEach(closeDropdown);
  }

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) { closeDropdown(btn); } else { openDropdown(btn); }
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown(btn);
      }
    });
  });

  document.querySelectorAll('.dropdown').forEach(function (menu) {
    const links = Array.from(menu.querySelectorAll('a'));
    const trigger = triggers.find(b => b.getAttribute('aria-controls') === menu.id);

    menu.addEventListener('keydown', function (e) {
      const i = links.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        closeDropdown(trigger);
        trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        links[(i + 1) % links.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        links[(i - 1 + links.length) % links.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        links[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        links[links.length - 1].focus();
      } else if (e.key === 'Tab') {
        closeDropdown(trigger);
      }
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-list')) closeAllDropdowns();
  });

  menuToggle.addEventListener('click', function () {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!open));
    navList.classList.toggle('open', !open);
    menuToggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    if (open) closeAllDropdowns();
  });

  window.matchMedia('(min-width: 761px)').addEventListener('change', function (e) {
    if (e.matches) {
      menuToggle.setAttribute('aria-expanded', 'false');
      navList.classList.remove('open');
    }
  });
})();
// Loaded synchronously in <head> so the saved theme applies before first paint.
(function () {
  var themes = ['marigold', 'indigo', 'gulmohar', 'evening'];
  var theme = 'marigold';
  try {
    var saved = localStorage.getItem('tch-theme');
    if (saved === 'night') saved = 'evening';
    if (themes.indexOf(saved) !== -1) theme = saved;
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
})();

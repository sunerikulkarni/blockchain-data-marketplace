// Apply the saved palette before stylesheets and page content are painted.
try {
  document.documentElement.classList.toggle('dark', localStorage.getItem('dc_theme') === 'dark');
} catch {
  // Storage can be unavailable in private browsing; the default theme is light.
}

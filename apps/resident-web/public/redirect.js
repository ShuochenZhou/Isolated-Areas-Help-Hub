// Phones normally see the entry page first, so visitors learn that this is a web simulation and that
// WeChat users should open the real application. A shared deep link (#/route) still opens the app directly.
if (location.hash.startsWith('#/') &&
    window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px)').matches) {
  location.replace('app.html' + location.hash)
}

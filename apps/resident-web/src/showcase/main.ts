// The entry page: two clearly separated ways in (WeChat application first, web simulation second) and
// the web simulation running live in a phone-sized window.
import './showcase.css'

// The phone window follows the page's #/route, so a shared deep link opens that page.
const frame = document.getElementById('app-frame') as HTMLIFrameElement | null
if (frame && location.hash.startsWith('#/')) frame.src = `app.html?embed=1${location.hash}`

// The app inside is laid out at a real phone's width (an iPhone 12's, as in WeChat DevTools) and the
// whole screen is scaled to fit the frame. Laid out at the frame's own width instead, a short window
// would give a phone narrower than any real one, and fixed-size parts such as the navigation bar's
// capsule would run into the title.
const PHONE_WIDTH = 390
const screen = frame?.parentElement
if (frame && screen) {
  const fit = () => {
    const width = screen.clientWidth
    if (!width) return // The phone is hidden on narrow screens.
    const scale = width / PHONE_WIDTH
    frame.style.width = `${PHONE_WIDTH}px`
    frame.style.height = `${(screen.clientHeight * 0.94) / scale}px`
    frame.style.transform = `scale(${scale})`
  }
  new ResizeObserver(fit).observe(screen)
  fit()
}

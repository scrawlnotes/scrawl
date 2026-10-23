// The boot screen of index.html is drawn before the app's code comes (start.tsx). That code is
// large, and the first time a version opens, reading it takes a while, the page waiting for it
// before it is drawn. iOS takes the colour of the bar above an app on the home screen from the
// page as it opens and keeps it until the app is closed: a page not yet drawn left it white.
// A window that is hidden draws no frame, so the app comes after a moment all the same.

/** Resolves once a frame of the boot screen is drawn, or after a moment when none is. */
const bootDrawn = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve));
    setTimeout(resolve, 100);
  });

void bootDrawn().then(() => import('./start'));

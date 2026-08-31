// Run after the requested screen commits. Export anchors can mount after its
// local data read, so one animation frame alone is insufficient.
export function scrollAfterDesktopNavigation(anchor?: string): () => void {
  let frame = 0;
  let observer: MutationObserver | undefined;
  let timeout: number | undefined;
  let finished = false;

  function cleanup() {
    finished = true;
    window.cancelAnimationFrame(frame);
    observer?.disconnect();
    window.clearTimeout(timeout);
  }
  function scroll() {
    if (finished) return;
    if (!anchor) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      cleanup();
      return;
    }
    const target = document.getElementById(anchor);
    if (target) {
      target.scrollIntoView({ block: "start" });
      cleanup();
    } else if (!observer) {
      observer = new MutationObserver(() => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(scroll);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(cleanup, 10_000);
    }
  }
  frame = window.requestAnimationFrame(scroll);
  return cleanup;
}

/** Shown while a page's code loads. Pages are split out of the main bundle. */
const PageFallback = ({ fullScreen = true }: { fullScreen?: boolean }) => (
  <div className={`${fullScreen ? "min-h-screen" : "min-h-[50vh]"} flex items-center justify-center text-muted-foreground`}>
    Loading…
  </div>
);

export default PageFallback;

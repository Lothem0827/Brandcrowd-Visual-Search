import { preload } from "react-dom";
import { ExplorerLoader } from "@/components/explorer/explorer-loader";
import { ServerIntro } from "@/components/explorer/server-intro";
import { readDataManifest } from "@/lib/data-manifest";

/**
 * The explorer shell, shared by every route (/, /explore, /boards, /boards/<id>, /brief) so
 * moving between pages never reloads the dataset or reseeds the client state. `/` is the
 * infinite-canvas home; `/explore` is the browse/search grid. Each page itself renders nothing:
 * the Explorer takes the screen it is on from the URL (see lib/url-state.ts), which keeps every
 * page a shareable, refreshable address.
 */
export default function ExplorerLayout({ children }: { children: React.ReactNode }) {
  const manifest = readDataManifest();
  // Start downloading the dataset while the JS is still loading.
  preload(manifest.url, { as: "fetch", crossOrigin: "anonymous" });
  return (
    <>
      <ExplorerLoader
        dataUrl={manifest.url}
        detailsUrl={manifest.detailsUrl}
        fallback={<ServerIntro manifest={manifest} />}
      />
      {children}
    </>
  );
}

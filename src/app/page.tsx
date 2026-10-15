import { preload } from "react-dom";
import { ExplorerLoader } from "@/components/explorer/explorer-loader";
import { ServerIntro } from "@/components/explorer/server-intro";
import { readDataManifest } from "@/lib/data-manifest";

export default function Page() {
  const manifest = readDataManifest();
  // Start downloading the dataset while the JS is still loading.
  preload(manifest.url, { as: "fetch", crossOrigin: "anonymous" });
  return (
    <ExplorerLoader
      dataUrl={manifest.url}
      detailsUrl={manifest.detailsUrl}
      fallback={<ServerIntro manifest={manifest} />}
    />
  );
}

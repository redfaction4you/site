import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "RED, the official Red Faction toolkit and community utilities, each with a written guide.",
};

export default function ToolsPage() {
  return (
    <StubPage
      title="Tools"
      phase={2}
      summary="Every editor and utility for building Red Faction content, collected in one place, each with a guide rather than just a download link."
      planned={[
        "RED, the official Volition level editor, with a getting-started guide",
        "The official RF Toolkit: CCrunch, MakeVBM, FontTool2, MVFReduce and the 3ds Max plugins",
        "Community utilities including the Descent Manager Toolkit (VPP Builder and Viewer)",
        "A written guide alongside every tool. Nothing gets listed without one",
        "Guides on packing a level into a .vpp and submitting it here",
      ]}
    />
  );
}

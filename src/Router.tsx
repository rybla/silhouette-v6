import { TextualEmulatorV1 } from "@/pages/TextualEmulatorV1.page";
import { HomePage } from "@/pages/Home.page";
import { StateViewerV1 } from "@/pages/StateViewerV1.page";
import { TraceViewerV1 } from "@/pages/TraceViewer.page";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { GameBundleViewerV1 } from "@/pages/GameBundleViewerV1.page";
import { VisualEmulatorV1 } from "@/pages/VisualEmulatorV1.page";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <HomePage />,
    },
    {
      path: "/TextualEmulatorV1",
      element: <TextualEmulatorV1 />,
    },
    {
      path: "/TraceViewerV1",
      element: <TraceViewerV1 />,
    },
    {
      path: "/StateViewerV1",
      element: <StateViewerV1 />,
    },
    {
      path: "/GameBundleViewerV1",
      element: <GameBundleViewerV1 />,
    },
    {
      path: "/VisualEmulatorV1",
      element: <VisualEmulatorV1 />,
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  }
);

export function Router() {
  return <RouterProvider router={router} />;
}

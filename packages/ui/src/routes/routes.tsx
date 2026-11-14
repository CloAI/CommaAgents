import { Navigate, Route, Routes } from "react-router";
import { NewChat } from "../pages/NewChat";
import { RunPage } from "../pages/RunPage";

/**
 * Choose the page for the route of the enclosing pane's router.
 * @returns {React.ReactElement} The matching page.
 */
export function ChatPaneRoutes() {
  return (
    <Routes>
      <Route path="/" element={<NewChat />} />
      <Route path="/runs/:runId" element={<RunPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

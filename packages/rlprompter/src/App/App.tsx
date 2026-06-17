import { Box } from "ink";
import { Route, Routes } from "react-router";
import {
  ComparePage,
  ExperimentPickerPage,
  FeedbackPage,
  IterationPage,
} from "../pages";
import { useTheme } from "../theme";

/** Root layout + route table. */
export function App() {
  const theme = useTheme();
  return (
    <Box flexDirection="column" padding={theme.spacing.xs}>
      <Routes>
        <Route index element={<ExperimentPickerPage />} />
        <Route path="/experiment" element={<IterationPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </Box>
  );
}

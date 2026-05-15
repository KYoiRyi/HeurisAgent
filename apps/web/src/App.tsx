import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/app-layout";
import HomeRoute from "./routes/home";
import DashboardRoute from "./routes/dashboard";
import ClassroomRoute from "./routes/classroom";
import ErrorsRoute from "./routes/errors";
import ReviewRoute from "./routes/review";
import ResourcesRoute from "./routes/resources";
import MemoryRoute from "./routes/memory";
import SettingsRoute from "./routes/settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRoute />} />
        <Route path="dashboard" element={<DashboardRoute />} />
        <Route path="classroom" element={<ClassroomRoute />} />
        <Route path="errors" element={<ErrorsRoute />} />
        <Route path="review" element={<ReviewRoute />} />
        <Route path="resources" element={<ResourcesRoute />} />
        <Route path="memory" element={<MemoryRoute />} />
        <Route path="settings" element={<SettingsRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

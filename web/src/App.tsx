import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./AppShell";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { CardsPage } from "./pages/CardsPage";
import { NewTemplatePage } from "./pages/NewTemplatePage";
import { TemplateDetailPage } from "./pages/TemplateDetailPage";
import { ComposePage } from "./pages/ComposePage";
import { DraftJobPage } from "./pages/DraftJobPage";
import { DraftsPage } from "./pages/DraftsPage";
import { AdminPage } from "./pages/AdminPage";
import { COMPOSE_ENABLED } from "./features";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/cards/new" element={<NewTemplatePage />} />
            <Route
              path="/cards/:id/compose"
              element={
                COMPOSE_ENABLED ? (
                  <ComposePage />
                ) : (
                  <Navigate to="/cards" replace />
                )
              }
            />
            <Route path="/cards/:id" element={<TemplateDetailPage />} />
            <Route
              path="/drafts"
              element={
                COMPOSE_ENABLED ? <DraftsPage /> : <Navigate to="/" replace />
              }
            />
            <Route
              path="/drafts/:jobId"
              element={
                COMPOSE_ENABLED ? (
                  <DraftJobPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppShell } from "./AppShell";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { CardsPage } from "./pages/CardsPage";
import { NewTemplatePage } from "./pages/NewTemplatePage";
import { TemplateDetailPage } from "./pages/TemplateDetailPage";
import { ComposePage } from "./pages/ComposePage";
import { DraftJobPage } from "./pages/DraftJobPage";
import { DraftsPage } from "./pages/DraftsPage";
import { SentPage } from "./pages/SentPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { MarketplaceDetailPage } from "./pages/MarketplaceDetailPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminPeoplePage } from "./pages/AdminPeoplePage";
import { AdminSendSummaryPage } from "./pages/AdminSendSummaryPage";
import { AdminAuditPage } from "./pages/AdminAuditPage";
import { EmailsHomePage } from "./pages/EmailsHomePage";
import { COMPOSE_ENABLED } from "./features";
import { canManageDesigns, isAdmin } from "./lib/roles";
import type { ReactNode } from "react";

function DesignerRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!canManageDesigns(user)) return <Navigate to="/marketplace" replace />;
  return children;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isAdmin(user)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/emails" element={<EmailsHomePage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/marketplace/:id" element={<MarketplaceDetailPage />} />
            <Route
              path="/cards"
              element={
                <DesignerRoute>
                  <CardsPage />
                </DesignerRoute>
              }
            />
            <Route
              path="/cards/new"
              element={
                <DesignerRoute>
                  <NewTemplatePage />
                </DesignerRoute>
              }
            />
            <Route
              path="/cards/:id/compose"
              element={
                COMPOSE_ENABLED ? (
                  <ComposePage />
                ) : (
                  <Navigate to="/marketplace" replace />
                )
              }
            />
            <Route
              path="/cards/:id"
              element={
                <DesignerRoute>
                  <TemplateDetailPage />
                </DesignerRoute>
              }
            />
            <Route
              path="/sent"
              element={
                COMPOSE_ENABLED ? <SentPage /> : <Navigate to="/" replace />
              }
            />
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
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/summary"
              element={
                <AdminRoute>
                  <AdminSendSummaryPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/people"
              element={
                <AdminRoute>
                  <AdminPeoplePage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <AdminRoute>
                  <AdminAuditPage />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

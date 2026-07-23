import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./AppShell";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { CardsPage } from "./pages/CardsPage";
import { NewTemplatePage } from "./pages/NewTemplatePage";
import { TemplateDetailPage } from "./pages/TemplateDetailPage";
import { DesignerPage } from "./pages/DesignerPage";
import { AdminPage } from "./pages/AdminPage";

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
            <Route path="/cards/:id/designer" element={<DesignerPage />} />
            <Route path="/cards/:id" element={<TemplateDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import RoutinePage from "./pages/RoutinePage";
import ClientsPage from "./pages/ClientsPage";
import WhatsAppPage from "./pages/WhatsAppPage";
import DashboardPage from "./pages/DashboardPage";
import ReportPage from "./pages/ReportPage";
import AdminPage from "./pages/AdminPage";
import PrioritiesPage from "./pages/PrioritiesPage";
import FeedbacksPage from "./pages/FeedbacksPage";
import PlanningPage from "./pages/PlanningPage";
import ContactsPage from "./pages/ContactsPage";
import AgendaClinicaPage from "./pages/AgendaClinicaPage";
import PontoPage from "./pages/PontoPage";
import GestorIAPage from "./pages/GestorIAPage";
import GPTMakerDashboardPage from "./pages/GPTMakerDashboardPage";
import ResumoDiarioPage from "./pages/ResumoDiarioPage";
import Auth from "./pages/Auth";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound.tsx";
import ProtectedRoute from "./components/ProtectedRoute";
import RouteSEO from "./components/RouteSEO";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteSEO />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rotina"
            element={
              <ProtectedRoute>
                <RoutinePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clientes"
            element={
              <ProtectedRoute>
                <ClientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contatos"
            element={
              <ProtectedRoute>
                <ContactsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <ProtectedRoute>
                <WhatsAppPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/relatorio"
            element={
              <ProtectedRoute>
                <ReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prioridades"
            element={
              <ProtectedRoute>
                <PrioritiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feedbacks"
            element={
              <ProtectedRoute>
                <FeedbacksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/planejamento"
            element={
              <ProtectedRoute>
                <PlanningPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agenda-clinica"
            element={
              <ProtectedRoute>
                <AgendaClinicaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ponto"
            element={
              <ProtectedRoute>
                <PontoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gestor-ia"
            element={
              <ProtectedRoute>
                <GestorIAPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gptmaker"
            element={
              <ProtectedRoute>
                <GPTMakerDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resumo-diario"
            element={
              <ProtectedRoute>
                <ResumoDiarioPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

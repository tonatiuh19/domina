import { HelmetProvider } from "react-helmet-async";
import { Navigate, Route, Routes } from "react-router-dom";
import { LanguageSync } from "@/components/i18n/LanguageSync";
import { ScrollToTop } from "@/components/ScrollToTop";
import Home from "@/pages/public/Home";
import { Catalog, CourseDetail } from "@/pages/public/CatalogPages";
import { LegalPage } from "@/pages/public/LegalPage";
import { CompanyLogin, StaffLogin, UserLogin } from "@/pages/auth/LoginPages";
import { AccountHome, AccountProfile, PaySeat, PaymentSuccess } from "@/pages/client/AccountPages";
import {
  AdminCatalog,
  AdminCompanyRequests,
  AdminCourse,
  AdminCourseCreate,
  AdminCourses,
  AdminHome,
  AdminLayout,
  AdminLegalPageEdit,
  AdminLegalPages,
  AdminParticipants,
  AdminPayments,
  AdminTeam,
} from "@/pages/admin/AdminPages";

export default function App() {
  return (
    <HelmetProvider>
      <ScrollToTop />
      <LanguageSync />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cursos" element={<Catalog />} />
        <Route path="/cursos/:slug" element={<CourseDetail />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/login" element={<UserLogin />} />
        <Route path="/acceso/equipo" element={<StaffLogin />} />
        <Route path="/acceso/empresas" element={<CompanyLogin />} />
        <Route path="/cuenta" element={<AccountHome />} />
        <Route path="/cuenta/exito" element={<PaymentSuccess />} />
        <Route path="/cuenta/perfil" element={<AccountProfile />} />
        <Route path="/cuenta/pagar/:enrollmentId" element={<PaySeat />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="cursos" element={<AdminCourses />} />
          <Route path="cursos/nuevo" element={<AdminCourseCreate />} />
          <Route path="cursos/catalogo" element={<AdminCatalog />} />
          <Route path="cursos/:id" element={<AdminCourse />} />
          <Route path="participantes" element={<AdminParticipants />} />
          <Route path="pagos" element={<AdminPayments />} />
          <Route path="legal" element={<AdminLegalPages />} />
          <Route path="legal/:slug" element={<AdminLegalPageEdit />} />
          <Route path="equipo" element={<AdminTeam />} />
          <Route path="empresas" element={<AdminCompanyRequests />} />
        </Route>
        <Route path="/empresas" element={<Navigate to="/admin/empresas" replace />} />
      </Routes>
    </HelmetProvider>
  );
}

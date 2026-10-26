import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './lib/toast';
import { ProtectedLayout } from './auth/ProtectedLayout';
import { LoginPage } from './auth/LoginPage';
import { ForgotPasswordPage } from './auth/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';
import { HomePage } from './routes/HomePage';
import { NewSalePage } from './routes/NewSalePage';
import { SaleDetailPage } from './routes/SaleDetailPage';
import { SalesListPage } from './routes/SalesListPage';
import { ProductsPage } from './routes/ProductsPage';
import { ProductHistoryPage } from './routes/ProductHistoryPage';
import { SettingsPage } from './routes/SettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/sales" element={<SalesListPage />} />
              <Route path="/sales/new" element={<NewSalePage />} />
              <Route path="/sales/:id" element={<SaleDetailPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id/history" element={<ProductHistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
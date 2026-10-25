import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './auth/LoginPage';
import { HomePage } from './routes/HomePage';
import { NewSalePage } from './routes/NewSalePage';
import { SaleDetailPage } from './routes/SaleDetailPage';
import { SalesListPage } from './routes/SalesListPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/sales" element={<RequireAuth><SalesListPage /></RequireAuth>} />
          <Route path="/sales/new" element={<RequireAuth><NewSalePage /></RequireAuth>} />
          <Route path="/sales/:id" element={<RequireAuth><SaleDetailPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

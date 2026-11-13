import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/Layout/AppLayout';
import { LoginPage, RegisterPage, RequireAuth } from '../features/auth/AuthPages';
import { CandidateEntryPage } from '../features/candidate/CandidateEntryPage';
import { CandidateDetailPage, CandidatesPage } from '../features/candidates/CandidatesPages';
import { InterviewDetailPage } from '../features/interviews/InterviewDetailPage';
import { InterviewsPage } from '../features/interviews/InterviewsPage';
import { MonitorPage } from '../features/monitoring/MonitorPage';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/interviewer/interviews" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/candidate/session/:token', element: <CandidateEntryPage /> },
  {
    path: '/interviewer',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="interviews" replace /> },
      { path: 'interviews', element: <InterviewsPage /> },
      { path: 'interviews/:id', element: <InterviewDetailPage /> },
      { path: 'candidates', element: <CandidatesPage /> },
      { path: 'candidates/:id', element: <CandidateDetailPage /> },
      { path: 'sessions/:sessionId', element: <MonitorPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

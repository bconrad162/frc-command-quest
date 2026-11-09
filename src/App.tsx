import { Suspense, type ReactNode } from 'react'
import { lazyPage } from './lib/lazyPage.ts'
import { createHashRouter, Outlet, RouterProvider, useRouteError } from 'react-router-dom'
import { AppShell } from './components/AppShell.tsx'
import { LinkButton, Spinner } from './components/ui.tsx'
import HowToPlayPage from './pages/HowToPlayPage.tsx'
import MissionsPage from './pages/MissionsPage.tsx'
import StartPage from './pages/StartPage.tsx'
import WelcomePage from './pages/WelcomePage.tsx'

// Heavier screens (code editor, simulator, teacher tools) load on demand.
const ChallengePage = lazyPage(() => import('./pages/ChallengePage.tsx'))
const LeaderboardPage = lazyPage(() => import('./pages/LeaderboardPage.tsx'))
const ReferencePage = lazyPage(() => import('./pages/ReferencePage.tsx'))
const LabPage = lazyPage(() => import('./pages/LabPage.tsx'))
const TeacherPage = lazyPage(() => import('./pages/TeacherPage.tsx'))
const PresentPage = lazyPage(() => import('./pages/PresentPage.tsx'))
const RobotLabPage = lazyPage(() => import('./pages/RobotLabPage.tsx'))

function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>
}

function ErrorScreen() {
  const error = useRouteError() as { status?: number; message?: string } | undefined
  const notFound = error?.status === 404
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="mt-3 text-ink-muted">
        {notFound
          ? 'That page does not exist.'
          : 'The game hit an unexpected error. Your progress is saved on this device. Reload the page to continue.'}
      </p>
      {!notFound && error?.message && <pre className="mt-4 overflow-auto rounded bg-pit p-3 text-xs text-ink-faint">{error.message}</pre>}
      <LinkButton to="/" variant="primary" className="mt-6">
        Back to the start
      </LinkButton>
    </div>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl">Page not found</h1>
      <p className="mt-3 text-ink-muted">That page does not exist. Check the link, or head back to the missions.</p>
      <LinkButton to="/missions" variant="primary" className="mt-6">
        Go to missions
      </LinkButton>
    </div>
  )
}

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

// Hash routing works on GitHub Pages without server rewrites (e.g. /frc-command-quest/#/missions).
const router = createHashRouter([
  {
    element: <ShellLayout />,
    errorElement: (
      <AppShell>
        <ErrorScreen />
      </AppShell>
    ),
    children: [
      { path: '/', element: <WelcomePage /> },
      { path: '/start', element: <StartPage /> },
      { path: '/missions', element: <MissionsPage /> },
      { path: '/how-to-play', element: <HowToPlayPage /> },
      { path: '/play/:id', element: <Lazy><ChallengePage /></Lazy> },
      { path: '/practice/:id', element: <Lazy><ChallengePage practice /></Lazy> },
      { path: '/leaderboard', element: <Lazy><LeaderboardPage /></Lazy> },
      { path: '/reference', element: <Lazy><ReferencePage /></Lazy> },
      { path: '/lab', element: <Lazy><LabPage /></Lazy> },
      { path: '/robot-lab', element: <Lazy><RobotLabPage /></Lazy> },
      { path: '/teacher', element: <Lazy><TeacherPage /></Lazy> },
      { path: '*', element: <NotFound /> },
    ],
  },
  // Presentation mode is full-screen, without the app chrome.
  { path: '/present/:classroomId', element: <Lazy><PresentPage /></Lazy>, errorElement: <ErrorScreen /> },
])

export function App() {
  return <RouterProvider router={router} />
}

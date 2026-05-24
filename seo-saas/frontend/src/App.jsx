import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';

function ProtectedRoute({ children }) {
    const token = localStorage.getItem('token');
    return token ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
    const token = localStorage.getItem('token');
    return token ? <Navigate to="/dashboard" replace /> : children;
}

function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route
                    path="/login"
                    element={
                        <PublicRoute>
                            <Login />
                        </PublicRoute>
                    }
                />
                <Route
                    path="/register"
                    element={
                        <PublicRoute>
                            <Register />
                        </PublicRoute>
                    }
                />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </>
    );
}

export default App;

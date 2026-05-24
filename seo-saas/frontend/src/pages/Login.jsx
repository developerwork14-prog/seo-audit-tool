import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

function Login() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        email: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    function updateField(event) {
        setForm({
            ...form,
            [event.target.name]: event.target.value
        });
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await api.post('/auth/login', form);
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <h1>Welcome back</h1>
                <p>Login to run private SEO audits and view your history.</p>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <label>
                        Email
                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={updateField}
                            required
                        />
                    </label>

                    <label>
                        Password
                        <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={updateField}
                            required
                        />
                    </label>

                    <button className="primary-button" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                <p className="auth-switch">
                    New here? <Link to="/register">Create an account</Link>
                </p>
            </section>
        </main>
    );
}

export default Login;

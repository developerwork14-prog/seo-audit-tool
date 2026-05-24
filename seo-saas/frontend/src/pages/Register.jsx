import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

function Register() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
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
            const { data } = await api.post('/auth/register', form);
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <h1>Create account</h1>
                <p>Start saving Lighthouse SEO audits under your own login.</p>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <label>
                        Name
                        <input
                            name="name"
                            value={form.name}
                            onChange={updateField}
                            required
                        />
                    </label>

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
                            minLength="6"
                            required
                        />
                    </label>

                    <button className="primary-button" disabled={loading}>
                        {loading ? 'Creating...' : 'Register'}
                    </button>
                </form>

                <p className="auth-switch">
                    Already have an account? <Link to="/login">Login</Link>
                </p>
            </section>
        </main>
    );
}

export default Register;

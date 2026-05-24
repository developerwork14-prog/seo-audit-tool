import { useNavigate } from 'react-router-dom';

function Navbar() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    }

    return (
        <header className="app-header">
            <div>
                <h1>SEO Audit Console</h1>
                <span>On-page, technical, and crawl export workspace</span>
            </div>

            <div className="header-actions">
                {user && (
                    <button className="header-logout" onClick={logout}>
                        Logout
                    </button>
                )}
                <div className="header-status">
                    <span>Local Audit</span>
                </div>
            </div>
        </header>
    );
}

export default Navbar;

import { COLLEGE_NAME } from "../config/appConfig";

export default function Navbar({ onLogout }) {
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <div className="navbar-title">
          {COLLEGE_NAME}
        </div>

        {onLogout && (
          <button className="nav-logout" onClick={onLogout}>
            Logout
          </button>
        )}
      </div>
    </header>
  );
}


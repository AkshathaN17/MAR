import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { GamificationProvider } from "./context/GamificationContext";
import { BreakoutProvider } from "./context/BreakoutContext";
import "./styles/theme.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GamificationProvider>
      <BreakoutProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BreakoutProvider>
    </GamificationProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { applyCachedTheme } from "./theme";
import "./styles.css";

// Tema cacheado antes del primer render: sin destello de tema equivocado.
applyCachedTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// En local BASE_URL es "/" (sin basename); en producción es "/fisgon/"
// (compilado con --base=/fisgon/) y React Router necesita saberlo, si no
// cualquier ruta que no sea exactamente "/" cae en el catch-all y te manda
// a la raíz del dominio en vez de a "/fisgon/".
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

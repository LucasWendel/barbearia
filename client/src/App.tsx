import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const LoginPage = lazy(() => import("./pages/Login"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const SuperAdminArea = lazy(async () => ({ default: (await import("./pages/StaffArea")).SuperAdminArea }));
const TenantArea = lazy(async () => ({ default: (await import("./pages/StaffArea")).TenantArea }));

function RouteLoading() {
  return <main className="grid min-h-screen place-items-center bg-[#f8f7f3] px-5 text-center" role="status" aria-label="Carregando página">
    <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#b99a67] font-serif text-xl text-[#8f754b]">B</div><p className="mt-4 text-xs tracking-wide text-stone-500">Preparando sua experiência…</p></div>
  </main>;
}

function Router() {
  return <Suspense fallback={<RouteLoading/>}><Switch>
    <Route path="/" component={Home}/>
    <Route path="/login" component={LoginPage}/>
    <Route path="/superadmin" component={SuperAdminArea}/>
    <Route path="/app" component={TenantArea}/>
    <Route path="/app/agenda" component={TenantArea}/>
    <Route path="/app/clientes" component={TenantArea}/>
    <Route path="/app/servicos" component={TenantArea}/>
    <Route path="/app/equipe" component={TenantArea}/>
    <Route path="/app/caixa" component={TenantArea}/>
    <Route path="/app/financeiro" component={TenantArea}/>
    <Route path="/app/comissoes" component={TenantArea}/>
    <Route path="/app/planos" component={TenantArea}/>
    <Route path="/app/promocoes" component={TenantArea}/>
    <Route path="/app/estoque" component={TenantArea}/>
    <Route path="/app/relatorios" component={TenantArea}/>
    <Route path="/app/configuracoes" component={TenantArea}/>
    <Route path="/404" component={NotFound}/>
    <Route path="/:slug">{params => <PublicBooking slug={params.slug}/>}</Route>
    <Route component={NotFound}/>
  </Switch></Suspense>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
